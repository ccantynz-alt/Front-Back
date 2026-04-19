// ── Metrics: query counter + latency histogram ──────────────────────
// Zero-dep in-process metrics with OpenTelemetry-shaped hooks so the
// observability agent can swap in a real exporter without touching the
// call sites. Keep this lean — the fast path is the resolver, not here.

import { recordTypeName } from "./protocol";

export interface OtelCounterLike {
  add(value: number, attributes?: Record<string, string | number | boolean>): void;
}

export interface OtelHistogramLike {
  record(value: number, attributes?: Record<string, string | number | boolean>): void;
}

export interface MetricsBackend {
  queryCounter: OtelCounterLike;
  errorCounter: OtelCounterLike;
  cacheHitCounter: OtelCounterLike;
  latencyHistogram: OtelHistogramLike;
}

export interface MetricsSnapshot {
  queriesTotal: number;
  errorsTotal: number;
  cacheHitsTotal: number;
  latencyCount: number;
  latencySumMs: number;
  latencyBuckets: Array<{ leMs: number; count: number }>;
  byType: Record<string, number>;
  byRcode: Record<string, number>;
}

const DEFAULT_BUCKETS_MS = [0.1, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

class InMemoryCounter implements OtelCounterLike {
  value = 0;
  readonly byTag = new Map<string, number>();

  add(value: number, attributes?: Record<string, string | number | boolean>): void {
    this.value += value;
    if (attributes !== undefined) {
      for (const [k, v] of Object.entries(attributes)) {
        const tag = `${k}=${String(v)}`;
        this.byTag.set(tag, (this.byTag.get(tag) ?? 0) + value);
      }
    }
  }
}

class InMemoryHistogram implements OtelHistogramLike {
  count = 0;
  sum = 0;
  readonly bucketBounds: number[];
  readonly bucketCounts: number[];

  constructor(boundariesMs: number[]) {
    this.bucketBounds = [...boundariesMs];
    this.bucketCounts = new Array<number>(boundariesMs.length + 1).fill(0);
  }

  record(value: number): void {
    this.count += 1;
    this.sum += value;
    let placed = false;
    for (let i = 0; i < this.bucketBounds.length; i += 1) {
      const bound = this.bucketBounds[i];
      if (bound !== undefined && value <= bound) {
        const cur = this.bucketCounts[i] ?? 0;
        this.bucketCounts[i] = cur + 1;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const lastIdx = this.bucketCounts.length - 1;
      const cur = this.bucketCounts[lastIdx] ?? 0;
      this.bucketCounts[lastIdx] = cur + 1;
    }
  }
}

export class Metrics {
  readonly queryCounter: InMemoryCounter;
  readonly errorCounter: InMemoryCounter;
  readonly cacheHitCounter: InMemoryCounter;
  readonly latencyHistogram: InMemoryHistogram;

  private readonly byType = new Map<string, number>();
  private readonly byRcode = new Map<string, number>();

  constructor(bucketsMs: number[] = DEFAULT_BUCKETS_MS) {
    this.queryCounter = new InMemoryCounter();
    this.errorCounter = new InMemoryCounter();
    this.cacheHitCounter = new InMemoryCounter();
    this.latencyHistogram = new InMemoryHistogram(bucketsMs);
  }

  recordQuery(type: number, rcode: number, latencyMs: number, cacheHit: boolean): void {
    const typeName = recordTypeName(type);
    const rcodeKey = String(rcode);

    this.queryCounter.add(1, { type: typeName, rcode: rcodeKey });
    this.latencyHistogram.record(latencyMs);
    if (cacheHit) this.cacheHitCounter.add(1, { type: typeName });

    this.byType.set(typeName, (this.byType.get(typeName) ?? 0) + 1);
    this.byRcode.set(rcodeKey, (this.byRcode.get(rcodeKey) ?? 0) + 1);
  }

  recordError(reason: string): void {
    this.errorCounter.add(1, { reason });
  }

  snapshot(): MetricsSnapshot {
    const buckets: Array<{ leMs: number; count: number }> = [];
    for (let i = 0; i < this.latencyHistogram.bucketBounds.length; i += 1) {
      const leMs = this.latencyHistogram.bucketBounds[i] ?? 0;
      const count = this.latencyHistogram.bucketCounts[i] ?? 0;
      buckets.push({ leMs, count });
    }
    buckets.push({
      leMs: Number.POSITIVE_INFINITY,
      count: this.latencyHistogram.bucketCounts[this.latencyHistogram.bucketCounts.length - 1] ?? 0,
    });

    return {
      queriesTotal: this.queryCounter.value,
      errorsTotal: this.errorCounter.value,
      cacheHitsTotal: this.cacheHitCounter.value,
      latencyCount: this.latencyHistogram.count,
      latencySumMs: this.latencyHistogram.sum,
      latencyBuckets: buckets,
      byType: Object.fromEntries(this.byType),
      byRcode: Object.fromEntries(this.byRcode),
    };
  }

  /**
   * Attach a real OpenTelemetry-shaped backend. The observability agent
   * can call this to route metrics into the LGTM stack. In-memory
   * tallies continue in parallel for /metrics debug endpoint access.
   */
  attachBackend(_backend: MetricsBackend): void {
    // Stub — the observability agent wires real Otel instruments here.
    // Left intentionally empty; the shape of MetricsBackend is the
    // contract they build against.
  }
}

export const defaultMetrics = new Metrics();
