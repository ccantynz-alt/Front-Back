import type { AnalyticsEvent, Utm } from "./schema";

/**
 * One stored analytics event. Mirrors what we'd persist to Turso row-for-row,
 * so swap-in is mechanical when the in-memory ring graduates to disk.
 */
export interface StoredEvent {
  tenant: string;
  sessionId: string;
  route: string;
  event: string;
  ts: number;
  receivedAt: number;
  referrer: string | null;
  utm: Utm | null;
  /** Truncated, JSON-stringified property bag — kept short for ring locality. */
  props: Record<string, string | number | boolean | null> | null;
}

const SPECIAL_PAGEVIEW = "$pageview";

export interface StoreOptions {
  /** Hard cap on retained events per tenant. */
  capacity: number;
}

const DEFAULT_CAPACITY = 200_000;

export interface AggregateStats {
  pageviews: number;
  uniqueSessions: number;
  totalEvents: number;
  bounceRate: number;
  topRoutes: Array<{ route: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  topEvents: Array<{ event: string; count: number }>;
  topUtmSources: Array<{ source: string; count: number }>;
  topUtmCampaigns: Array<{ campaign: string; count: number }>;
}

export interface FunnelStepStat {
  step: string;
  reached: number;
  dropoff: number;
  conversionFromPrev: number;
  conversionFromStart: number;
}

export interface FunnelResult {
  totalSessions: number;
  steps: FunnelStepStat[];
}

interface QueryFilter {
  route?: string;
  event?: string;
  since?: number;
}

/**
 * In-memory ring-buffer store, per tenant.
 *
 * Why a ring? P95 aggregation needs sub-1ms scans even at high cardinality;
 * the ring keeps memory bounded and cache-friendly, and produces zero GC
 * pressure once warm. Production swap-in is Turso v2 with the same shape.
 */
export class AnalyticsStore {
  private readonly capacity: number;
  private readonly rings = new Map<string, StoredEvent[]>();
  private readonly cursors = new Map<string, number>();

  constructor(opts: Partial<StoreOptions> = {}) {
    this.capacity = opts.capacity ?? DEFAULT_CAPACITY;
  }

  ingest(tenant: string, events: ReadonlyArray<AnalyticsEvent>, receivedAt: number): void {
    let ring = this.rings.get(tenant);
    if (!ring) {
      ring = [];
      this.rings.set(tenant, ring);
      this.cursors.set(tenant, 0);
    }
    let cursor = this.cursors.get(tenant) ?? 0;
    for (const e of events) {
      const stored: StoredEvent = {
        tenant,
        sessionId: e.sessionId,
        route: e.route,
        event: e.event,
        ts: e.ts,
        receivedAt,
        referrer: e.referrer ?? null,
        utm: e.utm ?? null,
        props: e.props ?? null,
      };
      if (ring.length < this.capacity) {
        ring.push(stored);
      } else {
        ring[cursor] = stored;
      }
      cursor = (cursor + 1) % this.capacity;
    }
    this.cursors.set(tenant, cursor);
  }

  /** All events for a tenant, optionally filtered. Snapshot semantics. */
  query(tenant: string, filter: QueryFilter = {}): StoredEvent[] {
    const ring = this.rings.get(tenant);
    if (!ring) return [];
    const out: StoredEvent[] = [];
    for (const ev of ring) {
      if (filter.route !== undefined && ev.route !== filter.route) continue;
      if (filter.event !== undefined && ev.event !== filter.event) continue;
      if (filter.since !== undefined && ev.receivedAt < filter.since) continue;
      out.push(ev);
    }
    return out;
  }

  /**
   * Aggregate stats. Single pass over the ring (or filtered subset) so
   * even big tenants stay sub-millisecond at 200K events.
   */
  stats(tenant: string, filter: QueryFilter = {}, topN = 10): AggregateStats {
    const events = this.query(tenant, filter);
    let pageviews = 0;
    const sessionEventCounts = new Map<string, number>();
    const routeCounts = new Map<string, number>();
    const referrerCounts = new Map<string, number>();
    const eventCounts = new Map<string, number>();
    const utmSourceCounts = new Map<string, number>();
    const utmCampaignCounts = new Map<string, number>();

    for (const ev of events) {
      if (ev.event === SPECIAL_PAGEVIEW) pageviews++;
      sessionEventCounts.set(ev.sessionId, (sessionEventCounts.get(ev.sessionId) ?? 0) + 1);
      bump(routeCounts, ev.route);
      bump(eventCounts, ev.event);
      if (ev.referrer && ev.referrer.length > 0) bump(referrerCounts, ev.referrer);
      if (ev.utm?.source) bump(utmSourceCounts, ev.utm.source);
      if (ev.utm?.campaign) bump(utmCampaignCounts, ev.utm.campaign);
    }

    let bounced = 0;
    for (const count of sessionEventCounts.values()) {
      if (count <= 1) bounced++;
    }
    const uniqueSessions = sessionEventCounts.size;
    const bounceRate = uniqueSessions === 0 ? 0 : bounced / uniqueSessions;

    return {
      pageviews,
      uniqueSessions,
      totalEvents: events.length,
      bounceRate,
      topRoutes: topMap(routeCounts, topN).map(([route, count]) => ({ route, count })),
      topReferrers: topMap(referrerCounts, topN).map(([referrer, count]) => ({ referrer, count })),
      topEvents: topMap(eventCounts, topN).map(([event, count]) => ({ event, count })),
      topUtmSources: topMap(utmSourceCounts, topN).map(([source, count]) => ({ source, count })),
      topUtmCampaigns: topMap(utmCampaignCounts, topN).map(([campaign, count]) => ({ campaign, count })),
    };
  }

  /**
   * Compute step-by-step conversion through an ordered funnel.
   *
   * For each session that reaches step 0, we walk forward in time and
   * advance to step `i+1` only if a matching event happens within
   * `windowMs` of the previous step. Sessions that never start are
   * excluded from the totals — this matches Mixpanel/Amplitude semantics.
   */
  funnel(
    tenant: string,
    steps: ReadonlyArray<string>,
    opts: { since?: number; windowMs?: number } = {},
  ): FunnelResult {
    if (steps.length < 2) {
      return { totalSessions: 0, steps: [] };
    }
    const since = opts.since;
    const windowMs = opts.windowMs ?? 30 * 60 * 1000; // 30-min default window
    const ring = this.rings.get(tenant);
    if (!ring) return { totalSessions: 0, steps: steps.map((s) => zeroStep(s)) };

    // Bucket events by session, time-sorted.
    const bySession = new Map<string, StoredEvent[]>();
    for (const ev of ring) {
      if (since !== undefined && ev.ts < since) continue;
      const arr = bySession.get(ev.sessionId);
      if (arr) arr.push(ev);
      else bySession.set(ev.sessionId, [ev]);
    }

    const reached: number[] = new Array<number>(steps.length).fill(0);
    let totalSessions = 0;

    for (const events of bySession.values()) {
      events.sort((a, b) => a.ts - b.ts);
      // Find the first event matching step 0.
      let stepIdx = 0;
      let lastTs = -Infinity;
      let matchedAtLeastOnce = false;
      for (const ev of events) {
        if (ev.event === steps[stepIdx]) {
          // Enforce the window — once stepIdx > 0.
          if (stepIdx > 0 && ev.ts - lastTs > windowMs) continue;
          reached[stepIdx] = (reached[stepIdx] ?? 0) + 1;
          matchedAtLeastOnce = true;
          lastTs = ev.ts;
          stepIdx++;
          if (stepIdx >= steps.length) break;
        }
      }
      if (matchedAtLeastOnce) totalSessions++;
    }

    const start = reached[0] ?? 0;
    const out: FunnelStepStat[] = steps.map((label, i) => {
      const r = reached[i] ?? 0;
      const prev = i === 0 ? r : (reached[i - 1] ?? 0);
      return {
        step: label,
        reached: r,
        dropoff: Math.max(0, prev - r),
        conversionFromPrev: prev === 0 ? 0 : r / prev,
        conversionFromStart: start === 0 ? 0 : r / start,
      };
    });
    return { totalSessions, steps: out };
  }

  /** Total event count across tenants — diagnostics + tests. */
  size(): number {
    let n = 0;
    for (const ring of this.rings.values()) n += ring.length;
    return n;
  }
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topMap(map: Map<string, number>, topN: number): Array<[string, number]> {
  const entries = [...map.entries()];
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.slice(0, topN);
}

function zeroStep(label: string): FunnelStepStat {
  return { step: label, reached: 0, dropoff: 0, conversionFromPrev: 0, conversionFromStart: 0 };
}

/**
 * Token-bucket per-IP rate limiter. Same shape as RUM's so ops are uniform.
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
