import type { NumberType } from "../types.ts";

/**
 * Default per-second send caps by number type. Carriers enforce these
 * upstream — long codes are throttled at ~1 msg/sec by AT&T/T-Mobile,
 * short codes get ~30/sec, toll-free sits in the middle at ~3/sec. We
 * pre-throttle here so we never burn carrier budget on guaranteed
 * rejections.
 */
export const DEFAULT_RATE_PER_SEC: Record<NumberType, number> = {
  "long-code": 1,
  "toll-free": 3,
  "short-code": 30,
};

export interface RateLimiterClock {
  now(): number;
}

const SYSTEM_CLOCK: RateLimiterClock = { now: () => Date.now() };

interface Bucket {
  windowStart: number;
  count: number;
  capacity: number;
}

/**
 * Per-number sliding-window rate limiter. Buckets reset every 1000ms.
 * Override the clock in tests for deterministic behaviour.
 */
export class PerNumberRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly clock: RateLimiterClock;

  constructor(clock: RateLimiterClock = SYSTEM_CLOCK) {
    this.clock = clock;
  }

  /**
   * Attempt to consume a slot for the given E.164 number. Returns true
   * when the send is allowed, false when the per-second cap would be
   * exceeded.
   */
  tryConsume(e164: string, type: NumberType): boolean {
    const capacity = DEFAULT_RATE_PER_SEC[type];
    const now = this.clock.now();
    const existing = this.buckets.get(e164);
    if (!existing || now - existing.windowStart >= 1000) {
      this.buckets.set(e164, { windowStart: now, count: 1, capacity });
      return true;
    }
    if (existing.count >= capacity) return false;
    existing.count += 1;
    existing.capacity = capacity;
    return true;
  }

  /** Test-only: drain the limiter to a fresh state. */
  reset(): void {
    this.buckets.clear();
  }
}
