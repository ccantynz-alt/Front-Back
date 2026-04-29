// ── Idempotency / replay dedup store ────────────────────────────────────
//
// GitHub may retry a webhook delivery if it does not get a 2xx response
// quickly enough. We dedupe on `X-GitHub-Delivery` (a UUID per delivery
// attempt; retries reuse the same id) so the same push never enqueues
// two builds.
//
// v1 implementation is in-memory with a TTL ring. v2 will move to Turso
// keyed by `(tenant_id, delivery_id)` so dedup survives process restarts
// and multi-region deploys.

export interface DedupStore {
  /**
   * Record a delivery id. Returns true if this is the first time we've
   * seen it (caller should proceed), false if it has been seen within
   * the TTL window (caller should reject as duplicate).
   */
  recordIfFirst(deliveryId: string): boolean;
  /** For tests: how many entries are tracked right now. */
  size(): number;
}

export interface InMemoryDedupOptions {
  // How long to remember a delivery id. Defaults to 1 hour. GitHub
  // retries within the first ~30 seconds so 1h is more than enough.
  ttlMs?: number;
  // Override the clock for tests.
  now?: () => number;
}

export class InMemoryDedupStore implements DedupStore {
  private readonly entries: Map<string, number> = new Map();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(opts: InMemoryDedupOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 60 * 60 * 1000;
    this.now = opts.now ?? Date.now;
  }

  recordIfFirst(deliveryId: string): boolean {
    this.evictExpired();
    if (this.entries.has(deliveryId)) {
      return false;
    }
    this.entries.set(deliveryId, this.now());
    return true;
  }

  size(): number {
    this.evictExpired();
    return this.entries.size;
  }

  private evictExpired(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, ts] of this.entries) {
      if (ts < cutoff) {
        this.entries.delete(id);
      }
    }
  }
}
