import { QdrantClient } from "@qdrant/js-client-rest";

// ── Qdrant Vector Database Client ────────────────────────────────────
// Rust-built vector database for AI-native search, RAG pipelines,
// semantic search, recommendations, and similarity matching.

export interface QdrantConfig {
  url?: string;
  apiKey?: string;
  collectionName?: string;
}

const DEFAULT_COLLECTION = "content_embeddings";
const VECTOR_SIZE = 1536; // OpenAI text-embedding-3-small dimensions

// ── Client Factory ───────────────────────────────────────────────────

export function createQdrantClient(config?: QdrantConfig): QdrantClient {
  return new QdrantClient({
    url: config?.url ?? process.env["QDRANT_URL"] ?? "http://localhost:6333",
    apiKey: config?.apiKey ?? process.env["QDRANT_API_KEY"],
  });
}

// ── Collection Management ────────────────────────────────────────────

export async function ensureCollection(
  client: QdrantClient,
  name: string = DEFAULT_COLLECTION,
  vectorSize: number = VECTOR_SIZE,
): Promise<void> {
  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === name);

  if (!exists) {
    await client.createCollection(name, {
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      replication_factor: 1,
    });

    // Create payload indices for filtered search
    await client.createPayloadIndex(name, {
      field_name: "type",
      field_schema: "keyword",
    });
    await client.createPayloadIndex(name, {
      field_name: "source",
      field_schema: "keyword",
    });
  }
}

// ── Vector Operations ────────────────────────────────────────────────

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export async function upsertVectors(
  client: QdrantClient,
  points: VectorPoint[],
  collection: string = DEFAULT_COLLECTION,
): Promise<void> {
  await client.upsert(collection, {
    wait: true,
    points: points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    })),
  });
}

export interface SearchOptions {
  collection?: string;
  limit?: number;
  scoreThreshold?: number;
  filter?: Record<string, unknown>;
}

export interface SearchHit {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
}

export async function searchSimilar(
  client: QdrantClient,
  queryVector: number[],
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const {
    collection = DEFAULT_COLLECTION,
    limit = 10,
    scoreThreshold = 0.7,
    filter,
  } = options;

  const results = await client.search(collection, {
    vector: queryVector,
    limit,
    score_threshold: scoreThreshold,
    with_payload: true,
    ...(filter ? { filter: { must: Object.entries(filter).map(([key, value]) => ({
      key,
      match: { value },
    })) } } : {}),
  });

  return results.map((r) => ({
    id: r.id,
    score: r.score,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}

export async function deleteVectors(
  client: QdrantClient,
  ids: string[],
  collection: string = DEFAULT_COLLECTION,
): Promise<void> {
  await client.delete(collection, {
    wait: true,
    points: ids,
  });
}

// ── Health Check ─────────────────────────────────────────────────────

export async function checkQdrantHealth(config?: QdrantConfig): Promise<{
  status: "ok" | "error";
  latencyMs: number;
  collections?: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const client = createQdrantClient(config);
    const collections = await client.getCollections();
    return {
      status: "ok",
      latencyMs: Math.round(performance.now() - start),
      collections: collections.collections.length,
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
