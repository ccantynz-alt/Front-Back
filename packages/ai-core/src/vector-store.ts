// ── Qdrant Vector Store ──────────────────────────────────────────
// Vector database client for semantic search, RAG pipelines,
// and AI-native content retrieval via Qdrant.

import { QdrantClient } from "@qdrant/js-client-rest";

export interface VectorPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
}

export interface VectorFilter {
  must?: Array<{ key: string; match: { value: string | number | boolean } }>;
  should?: Array<{ key: string; match: { value: string | number | boolean } }>;
  must_not?: Array<{ key: string; match: { value: string | number | boolean } }>;
}

function getQdrantClient(): QdrantClient {
  const url = process.env["QDRANT_URL"];
  const apiKey = process.env["QDRANT_API_KEY"];

  if (!url) {
    throw new Error("QDRANT_URL environment variable is not set");
  }

  return new QdrantClient({
    url,
    ...(apiKey ? { apiKey } : {}),
  });
}

// Lazy singleton — created on first use
let _client: QdrantClient | null = null;

function client(): QdrantClient {
  if (!_client) {
    _client = getQdrantClient();
  }
  return _client;
}

/**
 * Initialize a Qdrant collection with the given vector size.
 * Uses cosine distance by default (best for normalized embeddings).
 * No-ops if the collection already exists.
 */
export async function initCollection(
  name: string,
  vectorSize: number,
): Promise<void> {
  const qdrant = client();

  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === name);

  if (!exists) {
    await qdrant.createCollection(name, {
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
    });
  }
}

/**
 * Upsert vectors into a Qdrant collection.
 * Each point must have an id, vector, and optional payload.
 */
export async function upsertVectors(
  collection: string,
  points: VectorPoint[],
): Promise<void> {
  const qdrant = client();

  await qdrant.upsert(collection, {
    wait: true,
    points: points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload ?? {},
    })),
  });
}

/**
 * Search for similar vectors in a Qdrant collection.
 * Returns results sorted by similarity score (descending).
 */
export async function searchVectors(
  collection: string,
  queryVector: number[],
  limit: number = 10,
  filter?: VectorFilter,
): Promise<VectorSearchResult[]> {
  const qdrant = client();

  const results = await qdrant.search(collection, {
    vector: queryVector,
    limit,
    with_payload: true,
    ...(filter ? { filter } : {}),
  });

  return results.map((r) => ({
    id: r.id,
    score: r.score,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}
