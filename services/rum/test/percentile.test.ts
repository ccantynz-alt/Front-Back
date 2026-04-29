import { describe, expect, it } from "bun:test";
import { percentiles, quantile } from "../src/collector/percentile";

describe("quantile", () => {
  it("returns 0 for empty input", () => {
    expect(quantile([], 0.5)).toBe(0);
  });

  it("returns the only value for single-element input", () => {
    expect(quantile([42], 0.99)).toBe(42);
  });

  it("matches the canonical median for odd n", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it("interpolates between samples", () => {
    // 0..9, P95 with linear interp = 0.95 * 9 = 8.55
    const sorted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(quantile(sorted, 0.95)).toBeCloseTo(8.55, 5);
  });

  it("clamps q outside [0,1]", () => {
    expect(quantile([10, 20, 30], -1)).toBe(10);
    expect(quantile([10, 20, 30], 2)).toBe(30);
  });
});

describe("percentiles", () => {
  it("computes the standard P50/P75/P95/P99 quartet", () => {
    const data = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const p = percentiles(data);
    expect(p.count).toBe(100);
    // For 1..100 with linear interp: P50 = 50.5, P75 = 75.25, P95 = 95.05, P99 = 99.01.
    expect(p.p50).toBeCloseTo(50.5, 5);
    expect(p.p75).toBeCloseTo(75.25, 5);
    expect(p.p95).toBeCloseTo(95.05, 5);
    expect(p.p99).toBeCloseTo(99.01, 5);
  });

  it("does not mutate the input", () => {
    const data = [3, 1, 2];
    percentiles(data);
    expect(data).toEqual([3, 1, 2]);
  });
});
