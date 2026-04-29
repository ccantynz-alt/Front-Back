import { describe, expect, test } from "bun:test";
import {
  computeEma,
  dayOfWeekFactor,
  EmaSeasonalPredictor,
} from "../src/predictor";
import type { TrafficSample } from "../src/schemas";

describe("computeEma", () => {
  test("empty input returns 0", () => {
    expect(computeEma([])).toBe(0);
  });

  test("single sample returns that sample", () => {
    expect(computeEma([42])).toBe(42);
  });

  test("constant series returns the constant", () => {
    expect(computeEma([10, 10, 10, 10], 0.3)).toBeCloseTo(10, 5);
  });

  test("favours recent samples with higher alpha", () => {
    // values: old=0, new=100
    const lowAlpha = computeEma([0, 0, 0, 100], 0.1);
    const highAlpha = computeEma([0, 0, 0, 100], 0.9);
    expect(highAlpha).toBeGreaterThan(lowAlpha);
    // alpha=0.9 → ema = 0.9*100 + 0.1*0 = 90
    expect(highAlpha).toBeCloseTo(90, 5);
  });

  test("known sequence, alpha=0.5", () => {
    // ema_0 = 10
    // ema_1 = 0.5*20 + 0.5*10 = 15
    // ema_2 = 0.5*30 + 0.5*15 = 22.5
    expect(computeEma([10, 20, 30], 0.5)).toBeCloseTo(22.5, 5);
  });
});

describe("dayOfWeekFactor", () => {
  test("returns 1 for empty samples", () => {
    expect(dayOfWeekFactor([], Date.UTC(2026, 3, 28, 12))).toBe(1);
  });

  test("returns >1 when same dow/hour samples are above mean", () => {
    const targetTs = Date.UTC(2026, 3, 28, 12); // Tue noon UTC
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const samples: TrafficSample[] = [
      // Last week, same dow same hour: high
      {
        timestamp: targetTs - sevenDaysMs,
        regionId: "r1",
        qps: 100,
        p95LatencyMs: 50,
      },
      // Mid-week, off-hour: low
      {
        timestamp: targetTs - 3 * 24 * 60 * 60 * 1000,
        regionId: "r1",
        qps: 10,
        p95LatencyMs: 50,
      },
      {
        timestamp: targetTs - 2 * 24 * 60 * 60 * 1000,
        regionId: "r1",
        qps: 10,
        p95LatencyMs: 50,
      },
    ];
    const factor = dayOfWeekFactor(samples, targetTs);
    expect(factor).toBeGreaterThan(1);
  });
});

describe("EmaSeasonalPredictor.predictNextHour", () => {
  test("empty input returns no points", () => {
    const p = new EmaSeasonalPredictor();
    const out = p.predictNextHour("svc", [], Date.now());
    expect(out.points).toHaveLength(0);
    expect(out.serviceId).toBe("svc");
  });

  test("constant traffic predicts the constant", () => {
    const now = Date.UTC(2026, 3, 28, 12);
    const samples: TrafficSample[] = [];
    for (let i = 0; i < 10; i += 1) {
      samples.push({
        timestamp: now - i * 60 * 60 * 1000,
        regionId: "us-east",
        qps: 50,
        p95LatencyMs: 30,
      });
    }
    const p = new EmaSeasonalPredictor(0.3);
    const out = p.predictNextHour("svc", samples, now);
    expect(out.points.length).toBeGreaterThan(0);
    for (const point of out.points) {
      expect(point.regionId).toBe("us-east");
      expect(point.predictedQps).toBeCloseTo(50, 0);
    }
  });

  test("multi-region produces predictions for each region present", () => {
    const now = Date.UTC(2026, 3, 28, 12);
    const samples: TrafficSample[] = [
      { timestamp: now - 1000, regionId: "us-east", qps: 100, p95LatencyMs: 30 },
      { timestamp: now - 1000, regionId: "eu-west", qps: 25, p95LatencyMs: 40 },
    ];
    const p = new EmaSeasonalPredictor();
    const out = p.predictNextHour("svc", samples, now);
    const regions = new Set(out.points.map((x) => x.regionId));
    expect(regions.has("us-east")).toBe(true);
    expect(regions.has("eu-west")).toBe(true);
  });
});
