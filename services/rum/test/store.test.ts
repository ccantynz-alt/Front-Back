import { describe, expect, it } from "bun:test";
import type { Batch } from "../src/collector/schema";
import { RateLimiter, RumStore } from "../src/collector/store";

const batch = (over: Partial<Batch> = {}): Batch => ({
  tenant: "acme",
  route: "/",
  sentAt: 1_000,
  viewport: [1280, 720],
  deviceMemory: 8,
  connection: "4g",
  metrics: [{ n: "LCP", v: 1500, t: 100 }],
  ...over,
});

describe("RumStore", () => {
  it("ingests samples and isolates tenants", () => {
    const s = new RumStore();
    s.ingest(batch({ tenant: "acme" }), 100);
    s.ingest(batch({ tenant: "globex" }), 100);
    expect(s.query("acme").length).toBe(1);
    expect(s.query("globex").length).toBe(1);
    expect(s.query("nope").length).toBe(0);
  });

  it("filters by route, metric, since", () => {
    const s = new RumStore();
    s.ingest(batch({ route: "/a", metrics: [{ n: "LCP", v: 1000, t: 0 }] }), 1);
    s.ingest(batch({ route: "/b", metrics: [{ n: "LCP", v: 2000, t: 0 }] }), 2);
    s.ingest(batch({ route: "/a", metrics: [{ n: "INP", v: 50, t: 0 }] }), 3);
    expect(s.query("acme", { route: "/a" }).length).toBe(2);
    expect(s.query("acme", { metric: "LCP" }).length).toBe(2);
    expect(s.query("acme", { since: 3 }).length).toBe(1);
  });

  it("computes percentiles per metric", () => {
    const s = new RumStore();
    for (let i = 1; i <= 100; i++) {
      s.ingest(batch({ metrics: [{ n: "LCP", v: i, t: 0 }] }), i);
    }
    const stats = s.stats("acme");
    expect(stats.LCP.count).toBe(100);
    expect(stats.LCP.p50).toBeCloseTo(50.5, 5);
    expect(stats.LCP.p99).toBeCloseTo(99.01, 5);
    expect(stats.INP.count).toBe(0);
  });

  it("buckets time series", () => {
    const s = new RumStore();
    // Two 1-minute buckets at t=0 and t=60s.
    s.ingest(batch({ metrics: [{ n: "LCP", v: 100, t: 0 }] }), 0);
    s.ingest(batch({ metrics: [{ n: "LCP", v: 200, t: 0 }] }), 30_000);
    s.ingest(batch({ metrics: [{ n: "LCP", v: 300, t: 0 }] }), 65_000);
    const points = s.timeseries("acme", "LCP", "1m");
    expect(points.length).toBe(2);
    const first = points[0];
    const second = points[1];
    if (!first || !second) throw new Error("expected two buckets");
    expect(first.bucketStart).toBe(0);
    expect(first.count).toBe(2);
    expect(second.bucketStart).toBe(60_000);
    expect(second.count).toBe(1);
  });

  it("respects ring buffer capacity", () => {
    const s = new RumStore({ capacity: 3 });
    for (let i = 0; i < 10; i++) {
      s.ingest(batch({ metrics: [{ n: "LCP", v: i, t: 0 }] }), i);
    }
    expect(s.size()).toBe(3);
  });
});

describe("RateLimiter", () => {
  it("allows up to the burst budget then blocks", () => {
    const rl = new RateLimiter({ perMinute: 60, burst: 3 });
    expect(rl.consume("ip", 0)).toBe(true);
    expect(rl.consume("ip", 0)).toBe(true);
    expect(rl.consume("ip", 0)).toBe(true);
    expect(rl.consume("ip", 0)).toBe(false);
  });

  it("refills tokens over time", () => {
    const rl = new RateLimiter({ perMinute: 60, burst: 1 });
    expect(rl.consume("ip", 0)).toBe(true);
    expect(rl.consume("ip", 0)).toBe(false);
    // perMinute=60 → 1 token / 1000ms.
    expect(rl.consume("ip", 1_000)).toBe(true);
  });

  it("is per-key", () => {
    const rl = new RateLimiter({ perMinute: 60, burst: 1 });
    expect(rl.consume("a", 0)).toBe(true);
    expect(rl.consume("a", 0)).toBe(false);
    expect(rl.consume("b", 0)).toBe(true);
  });
});
