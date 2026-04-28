// ── AI Gateway Response Cache ─────────────────────────────────────────
// In-memory LRU keyed by sha256(model || JSON.stringify(messages)).
// Bun's WebCrypto (crypto.subtle) provides SHA-256 with no extra deps.
//
// v1 layers a semantic cache on top of the exact-match LRU. The
// semantic cache embeds (model, messages) into a unit-length vector
// and finds the closest stored entry by cosine similarity. If the
// similarity exceeds a threshold (default 0.92), the cached response
// is returned instead of falling through to the provider.

import { cosineSimilarity, defaultEmbedder, flattenMessages } from "./embeddings";
import type { Embedder } from "./embeddings";

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  capacity: number;
}

export interface CacheEntry<V> {
  key: string;
  value: V;
}

/**
 * Hash a (model, messages) tuple into a stable cache key. Async because
 * crypto.subtle.digest is async in WebCrypto. Pure: same input → same key.
 */
export async function hashRequest(model: string, messages: unknown): Promise<string> {
  const payload = `${model}||${JSON.stringify(messages)}`;
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i++) {
    const byte = view[i] ?? 0;
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Tiny LRU cache. We use a Map because Map iteration order is insertion
 * order, so `delete + set` moves an entry to the "most recent" tail.
 * Eviction pops the oldest entry (the first key in iteration order).
 */
export class LruCache<V> {
  readonly capacity: number;
  private readonly store = new Map<string, V>();
  private hits = 0;
  private misses = 0;

  constructor(capacity = 1000) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error("LruCache: capacity must be a positive integer");
    }
    this.capacity = Math.floor(capacity);
  }

  get(key: string): V | undefined {
    const value = this.store.get(key);
    if (value === undefined) {
      this.misses += 1;
      return undefined;
    }
    // Refresh recency: re-insert so the entry is moved to tail.
    this.store.delete(key);
    this.store.set(key, value);
    this.hits += 1;
    return value;
  }

  set(key: string, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, value);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
      capacity: this.capacity,
    };
  }
}

// Module-level default cache instance for the running gateway.
export const defaultCache = new LruCache<unknown>(1000);

// ── Semantic cache ───────────────────────────────────────────────────

interface SemanticEntry<V> {
  /** L2-normalised embedding of the (model, messages) tuple. */
  vector: Float32Array;
  /** The cached upstream response. */
  value: V;
  /** Insertion order id, so we can evict oldest at capacity. */
  seq: number;
}

export interface SemanticLookupResult<V> {
  value: V;
  similarity: number;
}

/**
 * Vector-similarity cache. NOT a replacement for the exact-match LRU —
 * meant to be consulted *after* an exact-match miss. If `lookup` returns
 * a hit above the threshold, the gateway returns it directly. If not,
 * the gateway falls through to the provider and `set` writes the new
 * vector into the store.
 */
export class SemanticCache<V> {
  readonly capacity: number;
  readonly threshold: number;
  private readonly embedder: Embedder;
  private readonly entries: SemanticEntry<V>[] = [];
  private nextSeq = 0;
  private hits = 0;
  private misses = 0;

  constructor(opts: {
    capacity?: number;
    threshold?: number;
    embedder?: Embedder;
  } = {}) {
    const capacity = opts.capacity ?? 500;
    const threshold = opts.threshold ?? 0.92;
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error("SemanticCache: capacity must be a positive integer");
    }
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error("SemanticCache: threshold must be in [0, 1]");
    }
    this.capacity = Math.floor(capacity);
    this.threshold = threshold;
    this.embedder = opts.embedder ?? defaultEmbedder;
  }

  /**
   * Embed a (model, messages) tuple. We prefix the model so embeddings
   * for the same prompt against different models don't collide.
   */
  async embedKey(model: string, messages: { role: string; content: string }[]): Promise<Float32Array> {
    const text = `${model}\n${flattenMessages(messages)}`;
    return this.embedder.embed(text);
  }

  /**
   * Find the closest cached entry. Returns the value and similarity if
   * the best match meets the threshold, otherwise `undefined`.
   */
  async lookup(
    model: string,
    messages: { role: string; content: string }[],
  ): Promise<SemanticLookupResult<V> | undefined> {
    if (this.entries.length === 0) {
      this.misses += 1;
      return undefined;
    }
    const queryVec = await this.embedKey(model, messages);
    let best: SemanticEntry<V> | undefined;
    let bestSim = -Infinity;
    for (const e of this.entries) {
      const sim = cosineSimilarity(queryVec, e.vector);
      if (sim > bestSim) {
        bestSim = sim;
        best = e;
      }
    }
    if (best !== undefined && bestSim >= this.threshold) {
      this.hits += 1;
      return { value: best.value, similarity: bestSim };
    }
    this.misses += 1;
    return undefined;
  }

  async set(
    model: string,
    messages: { role: string; content: string }[],
    value: V,
  ): Promise<void> {
    const vec = await this.embedKey(model, messages);
    if (this.entries.length >= this.capacity) {
      // Evict oldest by seq.
      let oldestIdx = 0;
      let oldestSeq = Infinity;
      for (let i = 0; i < this.entries.length; i++) {
        const seq = this.entries[i]?.seq ?? Infinity;
        if (seq < oldestSeq) {
          oldestSeq = seq;
          oldestIdx = i;
        }
      }
      this.entries.splice(oldestIdx, 1);
    }
    this.entries.push({ vector: vec, value, seq: this.nextSeq });
    this.nextSeq += 1;
  }

  clear(): void {
    this.entries.length = 0;
    this.nextSeq = 0;
    this.hits = 0;
    this.misses = 0;
  }

  stats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.entries.length,
      capacity: this.capacity,
    };
  }
}
