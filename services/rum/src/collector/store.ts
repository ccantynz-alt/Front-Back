import type { Batch, MetricName, TimeseriesBucket } from "./schema";
import { type Percentiles, percentiles } from "./percentile";

/**
 * One persisted sample — what we'd actually write to Turso in production.
 * The in-memory ring buffer below mirrors that schema exactly so swap-in
 * is mechanical.
 */
export interface Sample {
  tenant: string;
  route: string;
  metric: MetricName;
  value: number;
  receivedAt: number;
}

export interface StoreOptions {
  /** Hard cap on retained samples per tenant. */
  capacity: number;
}

const DEFAULT_CAPACITY = 100_000;

export class RumStore {
  private readonly capacity: number;
  // tenant -> ring of samples
  private readonly rings = new Map<string, Sample[]>();
  // tenant -> cursor (next slot in the ring)
  private readonly cursors = new Map<string, number>();

  constructor(opts: Partial<StoreOptions> = {}) {
    this.capacity = opts.capacity ?? DEFAULT_CAPACITY;
  }

  ingest(batch: Batch, receivedAt: number): void {
    let ring = this.rings.get(batch.tenant);
    if (!ring) {
      ring = [];
      this.rings.set(batch.tenant, ring);
      this.cursors.set(batch.tenant, 0);
    }
    let cursor = this.cursors.get(batch.tenant) ?? 0;
    for (const m of batch.metrics) {
      const sample: Sample = {
        tenant: batch.tenant,
        route: batch.route,
        metric: m.n,
        value: m.v,
        receivedAt,
      };
      if (ring.length < this.capacity) {
        ring.push(sample);
      } else {
        ring[cursor] = sample;
      }
      cursor = (cursor + 1) % this.capacity;
    }
    this.cursors.set(batch.tenant, cursor);
  }

  /** Read samples scoped to a tenant, optionally filtered. */
  query(
    tenant: string,
    filter: { route?: string; metric?: MetricName; since?: number } = {},
  ): Sample[] {
    const ring = this.rings.get(tenant);
    if (!ring) return [];
    const out: Sample[] = [];
    for (const s of ring) {
      if (filter.route && s.route !== filter.route) continue;
      if (filter.metric && s.metric !== filter.metric) continue;
      if (typeof filter.since === "number" && s.receivedAt < filter.since) continue;
      out.push(s);
    }
    return out;
  }

  /** Per-metric percentile aggregates for a tenant. */
  stats(
    tenant: string,
    filter: { route?: string; metric?: MetricName; since?: number } = {},
  ): Record<MetricName, Percentiles> {
    const samples = this.query(tenant, filter);
    const buckets: Partial<Record<MetricName, number[]>> = {};
    for (const s of samples) {
      const arr = buckets[s.metric] ?? [];
      arr.push(s.value);
      buckets[s.metric] = arr;
    }
    const result = {} as Record<MetricName, Percentiles>;
    const names: MetricName[] = ["LCP", "CLS", "INP", "FCP", "TTFB"];
    for (const n of names) {
      result[n] = percentiles(buckets[n] ?? []);
    }
    return result;
  }

  /** Bucketed time series for one metric. */
  timeseries(
    tenant: string,
    metric: MetricName,
    bucket: TimeseriesBucket,
    filter: { route?: string; since?: number } = {},
  ): Array<{ bucketStart: number; p50: number; p75: number; p95: number; p99: number; count: number }> {
    const ms = bucket === "1m" ? 60_000 : bucket === "5m" ? 300_000 : 3_600_000;
    const filterArg: { route?: string; metric: MetricName; since?: number } = { metric };
    if (typeof filter.route === "string") filterArg.route = filter.route;
    if (typeof filter.since === "number") filterArg.since = filter.since;
    const samples = this.query(tenant, filterArg);
    const groups = new Map<number, number[]>();
    for (const s of samples) {
      const key = Math.floor(s.receivedAt / ms) * ms;
      const arr = groups.get(key) ?? [];
      arr.push(s.value);
      groups.set(key, arr);
    }
    const out: Array<{ bucketStart: number; p50: number; p75: number; p95: number; p99: number; count: number }> = [];
    const keys = [...groups.keys()].sort((a, b) => a - b);
    for (const k of keys) {
      const values = groups.get(k);
      if (!values) continue;
      const p = percentiles(values);
      out.push({ bucketStart: k, ...p });
    }
    return out;
  }

  /** Total sample count across tenants — used for diagnostics + tests. */
  size(): number {
    let n = 0;
    for (const ring of this.rings.values()) n += ring.length;
    return n;
  }
}

/**
 * Token-bucket per-IP rate limiter. Default: 60 batches / minute / IP.
 * Refill is continuous (not per tick) so bursts above the burst limit get
 * smoothed correctly without needing a background timer.
 */
export class RateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(opts: { perMinute: number; burst?: number } = { perMinute: 60 }) {
    this.capacity = opts.burst ?? opts.perMinute;
    this.refillPerMs = opts.perMinute / 60_000;
  }

  consume(key: string, now: number): boolean {
    const b = this.buckets.get(key);
    if (!b) {
      this.buckets.set(key, { tokens: this.capacity - 1, updated: now });
      return true;
    }
    const elapsed = Math.max(0, now - b.updated);
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerMs);
    b.updated = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}
