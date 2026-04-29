// ── Token-Bucket Rate Limiter ─────────────────────────────────────────
// Per-API-key request rate limiting. Token bucket because it allows
// short bursts (good for human-typed completions) while bounding
// long-run throughput (protects upstream providers + our wallet).
//
// Each bucket has:
//   - capacity (burst): max tokens the bucket can hold
//   - refillRate (rps): tokens added per second
// A request consumes 1 token. If the bucket is empty, the request is
// rejected with 429.

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds the caller should wait before retrying (only meaningful when !allowed). */
  retryAfterSec: number;
  /** Tokens remaining in the bucket *after* this decision. */
  remaining: number;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
  capacity: number;
  refillRate: number; // tokens per second
}

export interface RateLimiterOptions {
  /** Default token-bucket capacity if a key has no per-key override. */
  defaultBurst?: number;
  /** Default refill rate (tokens / second) if a key has no per-key override. */
  defaultRps?: number;
  /** Clock source — injectable so tests can advance time deterministically. */
  now?: () => number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly defaultBurst: number;
  private readonly defaultRps: number;
  private readonly now: () => number;

  constructor(opts: RateLimiterOptions = {}) {
    this.defaultBurst = opts.defaultBurst ?? 60;
    this.defaultRps = opts.defaultRps ?? 10;
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Decide whether a request from `keyId` is allowed. Mutates the bucket
   * as a side-effect (the standard token-bucket "consume on success"
   * semantic). If `cfg` is omitted we use the limiter defaults.
   */
  consume(
    keyId: string,
    cfg?: { burst?: number; rps?: number },
  ): RateLimitDecision {
    const capacity = cfg?.burst ?? this.defaultBurst;
    const refillRate = cfg?.rps ?? this.defaultRps;
    const nowMs = this.now();

    let bucket = this.buckets.get(keyId);
    if (!bucket) {
      bucket = {
        tokens: capacity,
        lastRefillMs: nowMs,
        capacity,
        refillRate,
      };
      this.buckets.set(keyId, bucket);
    } else {
      // Reflect any config drift on the existing bucket.
      bucket.capacity = capacity;
      bucket.refillRate = refillRate;
      const elapsedSec = Math.max(0, (nowMs - bucket.lastRefillMs) / 1000);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillRate);
      bucket.lastRefillMs = nowMs;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        retryAfterSec: 0,
        remaining: Math.floor(bucket.tokens),
      };
    }

    const deficit = 1 - bucket.tokens;
    const retryAfterSec = refillRate > 0 ? deficit / refillRate : Number.POSITIVE_INFINITY;
    return {
      allowed: false,
      retryAfterSec,
      remaining: 0,
    };
  }

  reset(): void {
    this.buckets.clear();
  }

  /** For diagnostics + tests: peek at a bucket's current state. */
  inspect(keyId: string): { tokens: number; capacity: number; refillRate: number } | undefined {
    const b = this.buckets.get(keyId);
    if (!b) {
      return undefined;
    }
    return {
      tokens: b.tokens,
      capacity: b.capacity,
      refillRate: b.refillRate,
    };
  }
}
