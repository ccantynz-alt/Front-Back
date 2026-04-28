// ── Lightweight Embedding Backend ─────────────────────────────────────
// The semantic cache needs SOME way to vectorise prompts. In production
// we can hot-swap this for Transformers.js `all-MiniLM-L6-v2` — it
// produces 384-dim embeddings entirely in-process (CPU or WebGPU), no
// API call, no rate limit, no cost. CLAUDE.md §3 calls this out as the
// "free tier that actually works".
//
// For now (and for tests) we ship a deterministic hashed bag-of-words
// embedding so the gateway is dependency-free in the v1 cut. The
// `Embedder` interface is what the cache actually consumes — swap the
// implementation, the rest of the system is unaffected.

const DEFAULT_DIM = 256;

export interface Embedder {
  /** Vector dimensionality. */
  readonly dim: number;
  /** Embed a chunk of text into a unit-length f32 vector. */
  embed(text: string): Promise<Float32Array>;
}

/**
 * Tokenise on whitespace + punctuation. Unicode-aware enough for English/
 * European prompts; the production Transformers.js swap uses a real BPE.
 */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/**
 * FNV-1a 32-bit hash. Stable across runs and platforms; we use it as a
 * cheap, deterministic feature hasher for the bag-of-words embedding.
 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Hashed bag-of-words embedder. Each token is hashed twice into the
 * vector (sign-aware) à la Weinberger et al. (2009) "Feature Hashing
 * for Large Scale Multitask Learning". The vector is L2-normalised so
 * the cache can use cosine similarity = dot product.
 */
export class HashedBagOfWordsEmbedder implements Embedder {
  readonly dim: number;
  constructor(dim = DEFAULT_DIM) {
    if (!Number.isFinite(dim) || dim <= 0) {
      throw new Error("HashedBagOfWordsEmbedder: dim must be a positive integer");
    }
    this.dim = Math.floor(dim);
  }

  async embed(text: string): Promise<Float32Array> {
    const tokens = tokenise(text);
    const v = new Float32Array(this.dim);
    for (const tok of tokens) {
      const h1 = fnv1a(tok);
      const h2 = fnv1a(`${tok}#sign`);
      const idx = h1 % this.dim;
      const sign = h2 & 1 ? 1 : -1;
      const slot = v[idx];
      if (slot !== undefined) {
        v[idx] = slot + sign;
      }
    }
    // L2 normalise.
    let norm = 0;
    for (let i = 0; i < v.length; i++) {
      const x = v[i] ?? 0;
      norm += x * x;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < v.length; i++) {
        const x = v[i] ?? 0;
        v[i] = x / norm;
      }
    }
    return v;
  }
}

/**
 * Cosine similarity for two L2-normalised vectors.
 * (Reduces to a dot product when both are unit length.)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: dim mismatch ${a.length} vs ${b.length}`,
    );
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return dot;
}

/** Concatenate the user-visible content of a message array into one string. */
export function flattenMessages(
  messages: { role: string; content: string }[],
): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}

export const defaultEmbedder: Embedder = new HashedBagOfWordsEmbedder();
