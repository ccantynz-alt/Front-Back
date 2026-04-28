import { describe, expect, test } from "bun:test";
import { decideScaling } from "../src/decision";
import type { TrafficPredictor } from "../src/predictor";
import type {
  PredictionSeries,
  Region,
  ServiceRegionState,
  TrafficSample,
} from "../src/schemas";
import { SCALE_COOLDOWN_MS } from "../src/schemas";

const NOW = 1_700_000_000_000;

function fixedPredictor(map: Record<string, number>): TrafficPredictor {
  return {
    predictNextHour(serviceId, _samples, now): PredictionSeries {
      const points = Object.entries(map).map(([regionId, qps]) => ({
        regionId,
        timestamp: now,
        predictedQps: qps,
      }));
      return { serviceId, generatedAt: now, points };
    },
  };
}

function region(
  id: string,
  costPerHour: number,
  capacity = 100,
  currentLoad = 0,
): Region {
  return { id, code: id, location: id, capacity, currentLoad, costPerHour };
}

function state(
  serviceId: string,
  regionId: string,
  instanceCount: number,
  lastScaleEventAt = 0,
): ServiceRegionState {
  return { serviceId, regionId, instanceCount, lastScaleEventAt };
}

describe("decideScaling — basic math", () => {
  test("scales up to match predicted qps", () => {
    const decision = decideScaling({
      serviceId: "svc",
      now: NOW,
      regions: [region("us", 1)],
      states: [state("svc", "us", 1)],
      recentTraffic: [],
      latencyBudgetMs: 200,
      costBudgetUsdPerHour: 1000,
      targetQpsPerInstance: 100,
      predictor: fixedPredictor({ us: 500 }), // needs 5 instances
    });
    expect(decision.cooldownActive).toBe(false);
    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0]?.targetInstanceCount).toBe(5);
    expect(decision.actions[0]?.delta).toBe(4);
  });

  test("scales down when traffic falls", () => {
    const decision = decideScaling({
      serviceId: "svc",
      now: NOW,
      regions: [region("us", 1)],
      states: [state("svc", "us", 10)],
      recentTraffic: [],
      latencyBudgetMs: 200,
      costBudgetUsdPerHour: 1000,
      targetQpsPerInstance: 100,
      predictor: fixedPredictor({ us: 200 }), // needs 2
    });
    expect(decision.actions[0]?.targetInstanceCount).toBe(2);
    expect(decision.actions[0]?.delta).toBe(-8);
  });

  test("no action when already at target", () => {
    const decision = decideScaling({
      serviceId: "svc",
      now: NOW,
      regions: [region("us", 1)],
      states: [state("svc", "us", 5)],
      recentTraffic: [],
      latencyBudgetMs: 200,
      costBudgetUsdPerHour: 1000,
      targetQpsPerInstance: 100,
      predictor: fixedPredictor({ us: 500 }),
    });
    expect(decision.actions).toHaveLength(0);
  });
});

describe("decideScaling — cooldown enforcement", () => {
  test("cooldown active suppresses actions", () => {
    const decision = decideScaling({
      serviceId: "svc",
      now: NOW,
      regions: [region("us", 1)],
      states: [state("svc", "us", 1, NOW - 60_000)], // 1 min ago < 5 min cooldown
      recentTraffic: [],
      latencyBudgetMs: 200,
      costBudgetUsdPerHour: 1000,
      targetQpsPerInstance: 100,
      predictor: fixedPredictor({ us: 1000 }),
    });
    expect(decision.cooldownActive).toBe(true);
    expect(decision.actions).toHaveLength(0);
  });

  test("cooldown lifts after window", () => {
    const decision = decideScaling({
      serviceId: "svc",
      now: NOW,
      regions: [region("us", 1)],
      states: [state("svc", "us", 1, NOW - SCALE_COOLDOWN_MS - 1)],
      recentTraffic: [],
      latencyBudgetMs: 200,
      costBudgetUsdPerHour: 1000,
      targetQpsPerInstance: 100,
      predictor: fixedPredictor({ us: 1000 }),
    });
    expect(decision.cooldownActive).toBe(false);
    expect(decision.actions.length).toBeGreaterThan(0);
  });
});

describe("decideScaling — cost-aware preference", () => {
  test("prefers cheaper region under budget pressure", () => {
    const decision = decideScaling({
      serviceId: "svc",
      now: NOW,
      regions: [region("cheap", 1), region("expensive", 10)],
      states: [
        state("svc", "cheap", 0),
        state("svc", "expensive", 5), // will be trimmed
      ],
      recentTraffic: [],
      latencyBudgetMs: 200,
      // Budget allows only ~5 cheap or 0.5 expensive
      costBudgetUsdPerHour: 5,
      targetQpsPerInstance: 100,
      predictor: fixedPredictor({ cheap: 500, expensive: 500 }),
    });
    const expensive = decision.actions.find((a) => a.regionId === "expensive");
    expect(expensive).toBeDefined();
    expect(expensive?.targetInstanceCount).toBe(0);
    expect(decision.projectedHourlyCostUsd).toBeLessThanOrEqual(5);
  });

  test("does NOT trim a region that exceeds latency budget", () => {
    const traffic: TrafficSample[] = [
      {
        timestamp: NOW,
        regionId: "expensive",
        qps: 0,
        p95LatencyMs: 999, // violates budget
      },
    ];
    const decision = decideScaling({
      serviceId: "svc",
      now: NOW,
      regions: [region("cheap", 1), region("expensive", 10)],
      states: [state("svc", "cheap", 0), state("svc", "expensive", 3)],
      recentTraffic: traffic,
      latencyBudgetMs: 200,
      costBudgetUsdPerHour: 5,
      targetQpsPerInstance: 100,
      predictor: fixedPredictor({ cheap: 500, expensive: 100 }),
    });
    const expensiveAction = decision.actions.find(
      (a) => a.regionId === "expensive",
    );
    // Under latency pressure: must NOT be trimmed below current 3, and gets +1.
    if (expensiveAction) {
      expect(expensiveAction.targetInstanceCount).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("decideScaling — capacity headroom", () => {
  test("respects region capacity minus other-service load", () => {
    const decision = decideScaling({
      serviceId: "svc",
      now: NOW,
      regions: [region("us", 1, 10, 8)], // capacity 10, others use 8
      states: [state("svc", "us", 0)],
      recentTraffic: [],
      latencyBudgetMs: 200,
      costBudgetUsdPerHour: 1000,
      targetQpsPerInstance: 100,
      predictor: fixedPredictor({ us: 5000 }), // wants 50 → capped at 2
    });
    expect(decision.actions[0]?.targetInstanceCount).toBeLessThanOrEqual(2);
  });
});
