/**
 * Token-bucket + sliding-window rate limiters.
 *
 * Both implementations are in-memory and deterministic — every method takes
 * a `now` argument so tests can advance time without timers. A single
 * RateLimiter instance handles both algorithms; pick which one via the
 * RateLimitConfig.algorithm field.
 *
 * Storage layout:
 *   - token-bucket:  Map<key, { tokens, lastRefill }>
 *   - sliding-window: Map<key, number[]>  // recent hit timestamps
 *
 * Keys are namespaced "<scope>:<id>" to avoid IP/tenant collisions.
 */
import type { RateLimitConfig } from "./types";

interface BucketState {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until next allowed request when blocked. 0 when allowed. */
  retryAfter: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly windows = new Map<string, number[]>();

  /**
   * Check + consume one slot. Returns `{ allowed: false, retryAfter }` when
   * blocked. `now` is required; tests pass a controlled clock.
   */
  check(key: string, cfg: RateLimitConfig, now: number): RateLimitResult {
    if (cfg.algorithm === "sliding-window") {
      return this.checkSlidingWindow(key, cfg, now);
    }
    return this.checkTokenBucket(key, cfg, now);
  }

  private checkTokenBucket(key: string, cfg: RateLimitConfig, now: number): RateLimitResult {
    const refillRate = cfg.limit / cfg.windowMs; // tokens per ms
    const existing = this.buckets.get(key);
    const state: BucketState = existing ?? { tokens: cfg.limit, lastRefill: now };
    if (existing) {
      const elapsed = Math.max(0, now - existing.lastRefill);
      state.tokens = Math.min(cfg.limit, existing.tokens + elapsed * refillRate);
      state.lastRefill = now;
    }
    if (state.tokens >= 1) {
      state.tokens -= 1;
      this.buckets.set(key, state);
      return { allowed: true, retryAfter: 0 };
    }
    this.buckets.set(key, state);
    const tokensNeeded = 1 - state.tokens;
    const msUntilToken = tokensNeeded / refillRate;
    return { allowed: false, retryAfter: Math.max(1, Math.ceil(msUntilToken / 1000)) };
  }

  private checkSlidingWindow(key: string, cfg: RateLimitConfig, now: number): RateLimitResult {
    const cutoff = now - cfg.windowMs;
    const arr = this.windows.get(key);
    const hits = arr ? arr.filter((ts) => ts > cutoff) : [];
    if (hits.length >= cfg.limit) {
      this.windows.set(key, hits);
      const oldest = hits[0] ?? now;
      const msUntilFree = oldest + cfg.windowMs - now;
      return { allowed: false, retryAfter: Math.max(1, Math.ceil(msUntilFree / 1000)) };
    }
    hits.push(now);
    this.windows.set(key, hits);
    return { allowed: true, retryAfter: 0 };
  }

  /** Test-only: reset all state. */
  reset(): void {
    this.buckets.clear();
    this.windows.clear();
  }
}

export function buildKey(scope: "ip" | "tenant", tenantId: string, ip: string): string {
  return scope === "tenant" ? `tenant:${tenantId}` : `ip:${tenantId}:${ip}`;
}
