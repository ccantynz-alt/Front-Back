// ── In-Memory Vector Store ───────────────────────────────────────
// Development vector store using cosine similarity search.
// Production replacement: Qdrant or Turso native vector search.

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${String(a.length)} vs ${String(b.length)}`,
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * In-memory vector store for development and testing.
 * Stores documents with embeddings and supports cosine similarity search.
 *
 * Thread-safe for single-process use. Will be replaced with Qdrant
 * or Turso vector search in production.
 */
export class VectorStore {
  private documents: Map<string, VectorDocument> = new Map();

  /** Store a document with its embedding. */
  add(
    id: string,
    content: string,
    embedding: number[],
    metadata?: Record<string, unknown>,
  ): void {
    this.documents.set(id, {
      id,
      content,
      embedding,
      metadata: metadata ?? {},
    });
  }

  /**
   * Search for the most similar documents to a query embedding.
   * Returns results sorted by descending similarity score.
   *
   * @param queryEmbedding - The query vector to search against
   * @param topK - Maximum number of results to return (default 5)
   * @param filter - Optional metadata filter (all keys must match)
   */
  search(
    queryEmbedding: number[],
    topK: number = 5,
    filter?: Record<string, unknown>,
  ): SearchResult[] {
    const scored: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      // Apply metadata filter if provided
      if (filter) {
        let matches = true;
        for (const [key, value] of Object.entries(filter)) {
          if (doc.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      const score = cosineSimilarity(queryEmbedding, doc.embedding);
      scored.push({
        id: doc.id,
        content: doc.content,
        score,
        metadata: doc.metadata,
      });
    }

    // Sort by score descending, take topK
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Remove a document by ID. */
  delete(id: string): boolean {
    return this.documents.delete(id);
  }

  /** Remove all documents. */
  clear(): void {
    this.documents.clear();
  }

  /** Number of stored documents. */
  get size(): number {
    return this.documents.size;
  }

  /** Check if a document exists. */
  has(id: string): boolean {
    return this.documents.has(id);
  }
}
