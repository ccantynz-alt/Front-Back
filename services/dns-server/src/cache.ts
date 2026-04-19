// ── LRU Response Cache with TTL eviction ─────────────────────────────
// Keyed by "<name>|<type>|<class>". Values are raw encoded DNS response
// bytes paired with an absolute expiry timestamp (ms since epoch).
// Uses Map insertion-order for LRU semantics — touching a key reinserts.

export interface CacheEntry {
  response: Uint8Array;
  expiresAt: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
}

export interface ResponseCacheOptions {
  /** Maximum number of entries before LRU eviction kicks in. */
  maxEntries?: number;
  /** Clock override for tests. Must return ms since epoch. */
  now?: () => number;
}

export class ResponseCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly clock: () => number;

  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(options: ResponseCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10_000;
    this.clock = options.now ?? Date.now;
  }

  static key(name: string, type: number, klass: number): string {
    return `${name.toLowerCase()}|${type}|${klass}`;
  }

  get(key: string): Uint8Array | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      this.expirations += 1;
      this.misses += 1;
      return undefined;
    }
    // Refresh LRU position.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits += 1;
    return entry.response;
  }

  /** Set an entry with TTL in seconds. A TTL of 0 bypasses caching. */
  set(key: string, response: Uint8Array, ttlSeconds: number): void {
    if (ttlSeconds <= 0) return;
    const expiresAt = this.clock() + ttlSeconds * 1000;
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, { response, expiresAt });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
        this.evictions += 1;
      }
    }
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  stats(): CacheStats {
    return {
      size: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
    };
  }
}
