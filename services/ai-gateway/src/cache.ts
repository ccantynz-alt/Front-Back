// ── AI Gateway Response Cache ─────────────────────────────────────────
// In-memory LRU keyed by sha256(model || JSON.stringify(messages)).
// Bun's WebCrypto (crypto.subtle) provides SHA-256 with no extra deps.

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
