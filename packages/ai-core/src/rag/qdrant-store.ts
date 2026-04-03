// ── Qdrant Vector Store ─────────────────────────────────────────
// Production vector store implementation backed by Qdrant.
// Supports batch upsert, filtered search (ACORN algorithm),
// deletion, and paginated scroll. Replaces in-memory VectorStore.

import { z } from "zod";
import { getQdrantClient, ensureCollection, type QdrantConfig } from "./qdrant-client";
import type { SearchResult } from "./vector-store";

// ── Schemas ─────────────────────────────────────────────────────

export const QdrantPointSchema = z.object({
  id: z.string().min(1),
  vector: z.array(z.number()),
  payload: z.record(z.unknown()).optional(),
});

export type QdrantPoint = z.infer<typeof QdrantPointSchema>;

export const QdrantSearchOptionsSchema = z.object({
  topK: z.number().int().min(1).max(1000).default(5),
  scoreThreshold: z.number().min(0).max(1).optional(),
  filter: z.record(z.unknown()).optional(),
});

export type QdrantSearchOptions = z.infer<typeof QdrantSearchOptionsSchema>;

export const QdrantScrollOptionsSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.string().optional(),
  filter: z.record(z.unknown()).optional(),
});

export type QdrantScrollOptions = z.infer<typeof QdrantScrollOptionsSchema>;

// ── Filter Builder ──────────────────────────────────────────────

export interface QdrantFilterCondition {
  userId?: string;
  contentType?: string;
  projectId?: string;
  tags?: string[];
}

/**
 * Build a Qdrant filter object from typed filter conditions.
 * Supports exact match on userId, contentType, projectId,
 * and "any" match on tags array.
 */
function buildFilter(conditions: QdrantFilterCondition): Record<string, unknown> {
  const must: Record<string, unknown>[] = [];

  if (conditions.userId !== undefined) {
    must.push({
      key: "userId",
      match: { value: conditions.userId },
    });
  }

  if (conditions.contentType !== undefined) {
    must.push({
      key: "contentType",
      match: { value: conditions.contentType },
    });
  }

  if (conditions.projectId !== undefined) {
    must.push({
      key: "projectId",
      match: { value: conditions.projectId },
    });
  }

  if (conditions.tags !== undefined && conditions.tags.length > 0) {
    must.push({
      key: "tags",
      match: { any: conditions.tags },
    });
  }

  if (must.length === 0) {
    return {};
  }

  return { must };
}

// ── Qdrant Store ────────────────────────────────────────────────

/** Default embedding dimension for OpenAI text-embedding-3-small. */
const DEFAULT_VECTOR_SIZE = 1536;

export interface QdrantStoreConfig {
  /** Collection name. Default "documents". */
  collectionName?: string;
  /** Vector dimension size. Default 1536 (OpenAI text-embedding-3-small). */
  vectorSize?: number;
  /** Qdrant connection config. */
  qdrantConfig?: QdrantConfig;
}

/**
 * Production vector store backed by Qdrant.
 * Drop-in replacement for the in-memory VectorStore with
 * filtered search, batch upsert, and paginated scroll.
 */
export class QdrantStore {
  private readonly collectionName: string;
  private readonly vectorSize: number;
  private readonly config: QdrantConfig | undefined;
  private initialized = false;

  constructor(storeConfig?: QdrantStoreConfig) {
    this.collectionName = storeConfig?.collectionName ?? "documents";
    this.vectorSize = storeConfig?.vectorSize ?? DEFAULT_VECTOR_SIZE;
    this.config = storeConfig?.qdrantConfig;
  }

  /** Ensure the collection exists before any operation. */
  private async ensureInit(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await ensureCollection(this.collectionName, this.vectorSize, this.config);
    this.initialized = true;
  }

  /**
   * Batch upsert points into the collection.
   * Each point has an id, vector, and optional payload (metadata).
   */
  async upsert(points: QdrantPoint[]): Promise<void> {
    await this.ensureInit();
    const client = getQdrantClient(this.config);

    // Qdrant supports batch sizes up to ~1000; chunk larger batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE);
      await client.upsert(this.collectionName, {
        wait: true,
        points: batch.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload ?? {},
        })),
      });
    }
  }

  /**
   * Search for the most similar vectors with optional metadata filtering.
   * Uses Qdrant's ACORN algorithm for filtered HNSW search.
   * Returns results compatible with the SearchResult interface.
   */
  async search(
    vector: number[],
    options?: QdrantSearchOptions,
    filterConditions?: QdrantFilterCondition,
  ): Promise<SearchResult[]> {
    await this.ensureInit();
    const client = getQdrantClient(this.config);

    const topK = options?.topK ?? 5;
    const filter = filterConditions ? buildFilter(filterConditions) : undefined;

    const searchParams: Record<string, unknown> = {
      vector,
      limit: topK,
      with_payload: true,
    };
    if (options?.scoreThreshold !== undefined) {
      searchParams["score_threshold"] = options.scoreThreshold;
    }
    if (filter && Object.keys(filter).length > 0) {
      searchParams["filter"] = filter;
    }
    const results = await client.search(this.collectionName, searchParams as Parameters<typeof client.search>[1]);

    return results.map((result) => ({
      id: String(result.id),
      content: String((result.payload?.["content"] as string) ?? ""),
      score: result.score,
      metadata: (result.payload ?? {}) as Record<string, unknown>,
    }));
  }

  /**
   * Delete points by IDs from the collection.
   */
  async delete(ids: string[]): Promise<void> {
    await this.ensureInit();
    const client = getQdrantClient(this.config);

    await client.delete(this.collectionName, {
      wait: true,
      points: ids,
    });
  }

  /**
   * Paginated scroll through points with optional filtering.
   * Returns points and an optional next offset for pagination.
   */
  async scroll(
    options?: QdrantScrollOptions,
    filterConditions?: QdrantFilterCondition,
  ): Promise<{
    points: Array<{ id: string; payload: Record<string, unknown> }>;
    nextOffset: string | null;
  }> {
    await this.ensureInit();
    const client = getQdrantClient(this.config);

    const limit = options?.limit ?? 100;
    const filter = filterConditions ? buildFilter(filterConditions) : undefined;

    const scrollParams: Record<string, unknown> = {
      limit,
      with_payload: true,
    };
    if (options?.offset !== undefined) {
      scrollParams["offset"] = options.offset;
    }
    if (filter && Object.keys(filter).length > 0) {
      scrollParams["filter"] = filter;
    }
    const result = await client.scroll(this.collectionName, scrollParams as Parameters<typeof client.scroll>[1]);

    return {
      points: result.points.map((p) => ({
        id: String(p.id),
        payload: (p.payload ?? {}) as Record<string, unknown>,
      })),
      nextOffset: result.next_page_offset != null ? String(result.next_page_offset) : null,
    };
  }

  /**
   * Get collection info including point count.
   */
  async getCollectionInfo(): Promise<{
    pointCount: number;
    status: string;
  }> {
    await this.ensureInit();
    const client = getQdrantClient(this.config);

    const info = await client.getCollection(this.collectionName);
    return {
      pointCount: info.points_count ?? 0,
      status: info.status,
    };
  }
}
