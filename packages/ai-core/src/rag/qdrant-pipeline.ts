// ── Qdrant RAG Pipeline ─────────────────────────────────────────
// Enhanced RAG pipeline backed by Qdrant vector database.
// Supports indexing, semantic search, hybrid search (semantic +
// keyword), and content deletion. Uses existing chunker and
// embeddings modules for processing.

import { z } from "zod";
import { generateEmbedding, generateEmbeddings, type EmbeddingConfig } from "../embeddings";
import { chunkText, type ChunkOptions } from "../chunker";
import { QdrantStore, type QdrantStoreConfig, type QdrantFilterCondition } from "./qdrant-store";
import type { SearchResult } from "./vector-store";

// ── Schemas ─────────────────────────────────────────────────────

export const ContentMetadataSchema = z.object({
  userId: z.string().optional(),
  contentType: z.string().optional(),
  projectId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  title: z.string().optional(),
  sourceUrl: z.string().optional(),
});

export type ContentMetadata = z.infer<typeof ContentMetadataSchema>;

export const IndexContentInputSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  metadata: ContentMetadataSchema.optional(),
});

export type IndexContentInput = z.infer<typeof IndexContentInputSchema>;

export const SemanticSearchInputSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(100).default(5),
  scoreThreshold: z.number().min(0).max(1).optional(),
  filters: z
    .object({
      userId: z.string().optional(),
      contentType: z.string().optional(),
      projectId: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

export type SemanticSearchInput = z.infer<typeof SemanticSearchInputSchema>;

export const HybridSearchInputSchema = SemanticSearchInputSchema.extend({
  keywordBoost: z.number().min(0).max(2).default(0.3),
});

export type HybridSearchInput = z.infer<typeof HybridSearchInputSchema>;

// ── Pipeline Config ─────────────────────────────────────────────

export interface QdrantPipelineConfig {
  /** Qdrant store configuration. */
  storeConfig?: QdrantStoreConfig;
  /** Embedding model configuration. */
  embeddingConfig?: EmbeddingConfig;
  /** Text chunking options. */
  chunkOptions?: ChunkOptions;
}

// ── Pipeline ────────────────────────────────────────────────────

/**
 * Enhanced RAG pipeline backed by Qdrant.
 *
 * Flow:
 * 1. indexContent: chunk text -> generate embeddings -> upsert to Qdrant
 * 2. semanticSearch: embed query -> search Qdrant with filters
 * 3. hybridSearch: combine semantic scores with keyword matching
 * 4. deleteContent: remove all chunks for a content ID
 */
export class QdrantPipeline {
  private readonly store: QdrantStore;
  private readonly embeddingConfig: EmbeddingConfig | undefined;
  private readonly chunkOptions: ChunkOptions | undefined;

  constructor(config?: QdrantPipelineConfig) {
    this.store = new QdrantStore(config?.storeConfig);
    this.embeddingConfig = config?.embeddingConfig;
    this.chunkOptions = config?.chunkOptions;
  }

  /**
   * Index content into Qdrant.
   * Chunks the text, generates embeddings, and upserts to the collection.
   * Each chunk is stored with the content ID prefix for later deletion.
   *
   * @returns Number of chunks indexed.
   */
  async indexContent(
    input: IndexContentInput,
  ): Promise<{ contentId: string; chunksIndexed: number }> {
    const chunks = chunkText(input.content, this.chunkOptions);
    if (chunks.length === 0) {
      return { contentId: input.id, chunksIndexed: 0 };
    }

    const embeddings = await generateEmbeddings(chunks, this.embeddingConfig);

    const points = chunks.map((chunk, index) => {
      const chunkId =
        chunks.length === 1 ? input.id : `${input.id}::chunk-${String(index)}`;

      return {
        id: chunkId,
        vector: embeddings[index] ?? [],
        payload: {
          content: chunk,
          sourceContentId: input.id,
          chunkIndex: index,
          totalChunks: chunks.length,
          ...(input.metadata ?? {}),
        },
      };
    });

    await this.store.upsert(points);

    return { contentId: input.id, chunksIndexed: chunks.length };
  }

  /**
   * Semantic search: embed the query and search Qdrant.
   * Supports metadata filtering by userId, contentType, projectId, tags.
   */
  async semanticSearch(
    query: string,
    filters?: QdrantFilterCondition,
    topK: number = 5,
    scoreThreshold?: number,
  ): Promise<SearchResult[]> {
    const queryEmbedding = await generateEmbedding(query, this.embeddingConfig);

    return this.store.search(
      queryEmbedding,
      { topK, scoreThreshold },
      filters,
    );
  }

  /**
   * Hybrid search: combine semantic similarity with keyword matching.
   * Performs a semantic search, then re-ranks results by boosting
   * scores for results that contain query keywords.
   */
  async hybridSearch(
    query: string,
    filters?: QdrantFilterCondition,
    topK: number = 5,
    keywordBoost: number = 0.3,
  ): Promise<SearchResult[]> {
    // Fetch more results than needed for re-ranking
    const fetchK = Math.min(topK * 3, 100);
    const semanticResults = await this.semanticSearch(
      query,
      filters,
      fetchK,
    );

    // Extract keywords from query (lowercase, deduplicated, length > 2)
    const keywords = [
      ...new Set(
        query
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2),
      ),
    ];

    if (keywords.length === 0) {
      return semanticResults.slice(0, topK);
    }

    // Re-rank by boosting semantic score with keyword overlap
    const reranked = semanticResults.map((result) => {
      const contentLower = result.content.toLowerCase();
      const matchingKeywords = keywords.filter((kw) =>
        contentLower.includes(kw),
      );
      const keywordScore =
        keywords.length > 0 ? matchingKeywords.length / keywords.length : 0;
      const hybridScore = result.score + keywordBoost * keywordScore;

      return { ...result, score: hybridScore };
    });

    reranked.sort((a, b) => b.score - a.score);
    return reranked.slice(0, topK);
  }

  /**
   * Delete all indexed chunks for a given content ID.
   * Handles both single-chunk (id) and multi-chunk (id::chunk-N) formats.
   */
  async deleteContent(contentId: string): Promise<{ deleted: number }> {
    // Scroll through all points matching this content ID
    const matchingIds: string[] = [];

    // Check for direct ID match
    matchingIds.push(contentId);

    // Scroll for chunked entries (sourceContentId in payload)
    let offset: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await this.store.scroll(
        { limit: 100, offset },
        // We can't filter on sourceContentId directly through QdrantFilterCondition,
        // so we scroll and filter client-side. For production scale, add a
        // sourceContentId payload index.
      );

      for (const point of result.points) {
        if (point.payload["sourceContentId"] === contentId) {
          matchingIds.push(point.id);
        }
      }

      if (result.nextOffset !== null) {
        offset = result.nextOffset;
      } else {
        hasMore = false;
      }
    }

    // Deduplicate IDs
    const uniqueIds = [...new Set(matchingIds)];

    if (uniqueIds.length > 0) {
      await this.store.delete(uniqueIds);
    }

    return { deleted: uniqueIds.length };
  }

  /**
   * Get the underlying QdrantStore for advanced operations.
   */
  getStore(): QdrantStore {
    return this.store;
  }
}
