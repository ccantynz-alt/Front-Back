// ── Qdrant Client ───────────────────────────────────────────────
// Typed Qdrant client initialized from environment variables.
// Production vector database: Rust-built, ACORN algorithm for
// filtered HNSW — the fastest filtered vector search that exists.

import { QdrantClient } from "@qdrant/js-client-rest";

/** Read an environment variable safely across runtimes (Bun, Node, Workers). */
function env(key: string): string | undefined {
  try {
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    return proc?.env[key] ?? undefined;
  } catch {
    return undefined;
  }
}

export interface QdrantConfig {
  /** Qdrant server URL. Falls back to QDRANT_URL env var. */
  url?: string;
  /** Qdrant API key. Falls back to QDRANT_API_KEY env var. */
  apiKey?: string;
  /** Request timeout in milliseconds. Default 30000. */
  timeout?: number;
}

let _client: QdrantClient | null = null;

/**
 * Get or create the singleton Qdrant client.
 * Lazily initialized on first call.
 */
export function getQdrantClient(config?: QdrantConfig): QdrantClient {
  if (_client !== null) {
    return _client;
  }

  const url = config?.url ?? env("QDRANT_URL");
  const apiKey = config?.apiKey ?? env("QDRANT_API_KEY");

  if (!url) {
    throw new Error(
      "Qdrant URL is required. Set QDRANT_URL env var or pass url in config.",
    );
  }

  const clientParams: Record<string, unknown> = {
    url,
    timeout: config?.timeout ?? 30_000,
  };
  if (apiKey) {
    clientParams["apiKey"] = apiKey;
  }
  _client = new QdrantClient(clientParams as ConstructorParameters<typeof QdrantClient>[0]);

  return _client;
}

/**
 * Reset the singleton client (useful for testing).
 */
export function resetQdrantClient(): void {
  _client = null;
}

/**
 * Ensure a collection exists with the given vector size.
 * Creates the collection if it does not exist.
 * Uses cosine distance (optimal for normalized embeddings).
 */
export async function ensureCollection(
  name: string,
  vectorSize: number,
  config?: QdrantConfig,
): Promise<void> {
  const client = getQdrantClient(config);

  try {
    const { exists } = await client.collectionExists(name);
    if (exists) {
      return;
    }
  } catch {
    // Collection doesn't exist or error checking — proceed to create
  }

  await client.createCollection(name, {
    vectors: {
      size: vectorSize,
      distance: "Cosine",
    },
    // Optimized indexing thresholds for production
    optimizers_config: {
      default_segment_number: 2,
      indexing_threshold: 20_000,
    },
    // Enable on-disk payload storage for large datasets
    on_disk_payload: true,
  });

  // Create payload indexes for common filter fields
  const indexFields = ["userId", "contentType", "projectId"];
  for (const field of indexFields) {
    await client.createPayloadIndex(name, {
      field_name: field,
      field_schema: "keyword",
    });
  }
}
