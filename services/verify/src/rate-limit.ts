export interface RateLimiterOptions {
  /** Max attempts per window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Optional now() injection for tests. */
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(private readonly opts: RateLimiterOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Returns true if the action is allowed; counts the attempt as consumed.
   */
  allow(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const t = this.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= t) {
      const fresh: Bucket = { count: 1, resetAt: t + this.opts.windowMs };
      this.buckets.set(key, fresh);
      return { allowed: true, remaining: this.opts.max - 1, resetAt: fresh.resetAt };
    }
    if (existing.count >= this.opts.max) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }
    existing.count += 1;
    return {
      allowed: true,
      remaining: this.opts.max - existing.count,
      resetAt: existing.resetAt,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** For tests / introspection. */
  size(): number {
    return this.buckets.size;
  }
}
