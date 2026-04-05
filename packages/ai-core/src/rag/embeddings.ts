// ── Embedding Utilities ──────────────────────────────────────────────
// Provides embedding functions for the RAG pipeline.
// Uses AI SDK embed() when an API key is available,
// falls back to deterministic hash-based embeddings otherwise.

import type { EmbedFunction } from "./pipeline";

/**
 * Deterministic hash-based embedding fallback.
 * Produces a consistent vector for the same input text.
 * NOT semantically meaningful -- but deterministic and functional
 * for development/demo mode when no AI provider key is set.
 *
 * Uses a simple hash-spreading algorithm across the vector dimensions.
 */
export function hashEmbedding(text: string, dimensions: number = 1536): number[] {
  const vector = new Float64Array(dimensions);

  // Seed from text content using a simple hash
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  // Fill vector with deterministic pseudo-random values
  for (let i = 0; i < dimensions; i++) {
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 = Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    h1 ^= h1 >>> 16;

    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 ^= h2 >>> 16;

    // Combine both hashes, normalize to [-1, 1]
    vector[i] = ((h1 + h2 * i) & 0xffffffff) / 0x7fffffff - 1;
  }

  // Normalize to unit vector (cosine similarity works best with unit vectors)
  let magnitude = 0;
  for (let i = 0; i < dimensions; i++) {
    magnitude += vector[i]! * vector[i]!;
  }
  magnitude = Math.sqrt(magnitude);
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] = vector[i]! / magnitude;
    }
  }

  return Array.from(vector);
}

/**
 * Creates an embed function that uses the AI SDK when an API key is available,
 * falling back to hash-based embeddings for demo/development mode.
 */
export function createEmbedFunction(options?: {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimensions?: number;
}): EmbedFunction {
  const apiKey = options?.apiKey ?? getEnvVar("OPENAI_API_KEY");
  const dimensions = options?.dimensions ?? 1536;

  if (apiKey) {
    // Use AI SDK embed() with real embeddings
    return async (text: string): Promise<number[]> => {
      try {
        const { embed } = await import("ai");
        const { createOpenAI } = await import("@ai-sdk/openai");

        const provider = createOpenAI({
          apiKey,
          ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
        });

        const result = await embed({
          model: provider.embedding(options?.model ?? "text-embedding-3-small"),
          value: text,
        });

        return result.embedding;
      } catch (error) {
        // If the API call fails, fall back to hash embeddings
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[embeddings] AI SDK embed() failed, using hash fallback: ${message}`);
        return hashEmbedding(text, dimensions);
      }
    };
  }

  // No API key -- use hash-based fallback
  return async (text: string): Promise<number[]> => {
    return hashEmbedding(text, dimensions);
  };
}

/**
 * Reads an environment variable safely across runtimes.
 */
function getEnvVar(key: string): string | undefined {
  try {
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    return proc?.env[key] ?? undefined;
  } catch {
    return undefined;
  }
}
