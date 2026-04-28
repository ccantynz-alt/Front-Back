// ── Per-Tenant Rate Limiter ───────────────────────────────────────────
// Sliding-window counter keyed by tenantId. Default: 600 requests per
// 60s per tenant. Time source is injectable so tests can advance the
// clock deterministically.

import type { Clock } from "./types";

export interface RateLimitOptions {
  readonly windowMs?: number;
  readonly maxRequests?: number;
  readonly clock?: Clock;
}

interface Bucket {
  windowStart: number;
  count: number;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly clock: Clock;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimitOptions = {}) {
    this.windowMs = options.windowMs ?? 60_000;
    this.maxRequests = options.maxRequests ?? 600;
    this.clock = options.clock ?? Date.now;
  }

  /**
   * Returns true if the request is allowed. Consumes one token from the
   * tenant's bucket. If the bucket is full within the current window,
   * returns false and the caller should reject with 429.
   */
  check(tenantId: string): boolean {
    const now = this.clock();
    const bucket = this.buckets.get(tenantId);
    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(tenantId, { windowStart: now, count: 1 });
      return true;
    }
    if (bucket.count >= this.maxRequests) {
      return false;
    }
    bucket.count += 1;
    return true;
  }

  /** Test/diagnostic helper — current count for a tenant. */
  remaining(tenantId: string): number {
    const bucket = this.buckets.get(tenantId);
    if (!bucket) return this.maxRequests;
    const now = this.clock();
    if (now - bucket.windowStart >= this.windowMs) return this.maxRequests;
    return Math.max(0, this.maxRequests - bucket.count);
  }

  /** Test helper. Wipes all buckets. */
  reset(): void {
    this.buckets.clear();
  }
}
