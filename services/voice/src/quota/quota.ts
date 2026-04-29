/**
 * Per-tenant call quota. Sliding-window counter — for production use a
 * Durable Object or Redis with proper accounting; the in-memory map is
 * sufficient for the control-plane test surface and for single-region
 * dev runs.
 */
export interface QuotaConfig {
  windowMs: number;
  maxCallsPerWindow: number;
}

export const DEFAULT_QUOTA: QuotaConfig = {
  windowMs: 60_000,
  maxCallsPerWindow: 60,
};

export class CallQuota {
  private buckets = new Map<string, number[]>();

  constructor(private config: QuotaConfig = DEFAULT_QUOTA) {}

  /** Returns true if the tenant is within quota; consumes a slot if so. */
  consume(tenantId: string, now: number = Date.now()): boolean {
    const cutoff = now - this.config.windowMs;
    const arr = (this.buckets.get(tenantId) ?? []).filter((ts) => ts > cutoff);
    if (arr.length >= this.config.maxCallsPerWindow) {
      this.buckets.set(tenantId, arr);
      return false;
    }
    arr.push(now);
    this.buckets.set(tenantId, arr);
    return true;
  }

  remaining(tenantId: string, now: number = Date.now()): number {
    const cutoff = now - this.config.windowMs;
    const arr = (this.buckets.get(tenantId) ?? []).filter((ts) => ts > cutoff);
    return Math.max(0, this.config.maxCallsPerWindow - arr.length);
  }
}
