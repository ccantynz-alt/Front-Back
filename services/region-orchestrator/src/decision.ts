import type { TrafficPredictor } from "./predictor";
import {
  type Region,
  SCALE_COOLDOWN_MS,
  type ScaleAction,
  type ScalingDecision,
  type ServiceRegionState,
  type TrafficSample,
} from "./schemas";

export interface DecisionInputs {
  serviceId: string;
  now: number;
  regions: readonly Region[];
  states: readonly ServiceRegionState[];
  recentTraffic: readonly TrafficSample[];
  latencyBudgetMs: number;
  costBudgetUsdPerHour: number;
  targetQpsPerInstance: number;
  predictor: TrafficPredictor;
}

interface RegionContext {
  region: Region;
  state: ServiceRegionState | undefined;
  predictedQps: number;
  observedP95: number;
}

function buildContext(inputs: DecisionInputs): RegionContext[] {
  const prediction = inputs.predictor.predictNextHour(
    inputs.serviceId,
    inputs.recentTraffic,
    inputs.now,
  );
  // Average the predicted QPS per region across the forecast window.
  const predByRegion = new Map<string, { sum: number; count: number }>();
  for (const p of prediction.points) {
    const cur = predByRegion.get(p.regionId);
    if (cur) {
      cur.sum += p.predictedQps;
      cur.count += 1;
    } else {
      predByRegion.set(p.regionId, { sum: p.predictedQps, count: 1 });
    }
  }
  // Take max recent p95 latency per region as the conservative signal.
  const p95ByRegion = new Map<string, number>();
  for (const s of inputs.recentTraffic) {
    const cur = p95ByRegion.get(s.regionId) ?? 0;
    if (s.p95LatencyMs > cur) p95ByRegion.set(s.regionId, s.p95LatencyMs);
  }

  return inputs.regions.map((region): RegionContext => {
    const predEntry = predByRegion.get(region.id);
    const predictedQps =
      predEntry && predEntry.count > 0 ? predEntry.sum / predEntry.count : 0;
    return {
      region,
      state: inputs.states.find(
        (s) => s.regionId === region.id && s.serviceId === inputs.serviceId,
      ),
      predictedQps,
      observedP95: p95ByRegion.get(region.id) ?? 0,
    };
  });
}

function desiredInstancesForRegion(
  ctx: RegionContext,
  targetQpsPerInstance: number,
): number {
  if (targetQpsPerInstance <= 0) return 0;
  const raw = Math.ceil(ctx.predictedQps / targetQpsPerInstance);
  // Cap by region capacity. currentLoad is shared with other services so
  // the available headroom = capacity - (currentLoad - this service's count).
  const myCurrent = ctx.state?.instanceCount ?? 0;
  const otherLoad = Math.max(0, ctx.region.currentLoad - myCurrent);
  const headroom = Math.max(0, ctx.region.capacity - otherLoad);
  return Math.min(raw, headroom);
}

/**
 * Cost-aware scaling decision.
 *
 * Algorithm:
 *  1. Predict next-hour QPS per region.
 *  2. Compute desired instance count per region from predicted QPS / target.
 *  3. If a region is over its latency budget, never scale it down — and add
 *     one extra instance to absorb pressure.
 *  4. Sort regions by costPerHour ascending; greedily fit desired instances
 *     under the cost budget. Cheaper regions win when latency permits.
 *  5. Enforce cooldown: if any state's `lastScaleEventAt` is within the
 *     cooldown window, return `cooldownActive: true` and emit no actions.
 */
export function decideScaling(inputs: DecisionInputs): ScalingDecision {
  const contexts = buildContext(inputs);

  // Cooldown: if ANY region for this service scaled within the window, hold.
  const cooldownActive = inputs.states.some(
    (s) =>
      s.serviceId === inputs.serviceId &&
      inputs.now - s.lastScaleEventAt < SCALE_COOLDOWN_MS,
  );

  // Compute initial desired counts.
  const desired = new Map<string, number>();
  for (const ctx of contexts) {
    let want = desiredInstancesForRegion(ctx, inputs.targetQpsPerInstance);
    // Latency pressure: if observed p95 exceeds budget, never scale down,
    // and add 1 extra instance.
    if (ctx.observedP95 > inputs.latencyBudgetMs) {
      const cur = ctx.state?.instanceCount ?? 0;
      want = Math.max(want, cur) + 1;
      // Re-cap to headroom.
      const myCurrent = ctx.state?.instanceCount ?? 0;
      const otherLoad = Math.max(
        0,
        ctx.region.currentLoad - myCurrent,
      );
      const headroom = Math.max(0, ctx.region.capacity - otherLoad);
      want = Math.min(want, headroom);
    }
    desired.set(ctx.region.id, want);
  }

  // Cost-aware fitting: sort cheapest-first and trim from the most expensive
  // regions (that are NOT under latency pressure) until we fit in budget.
  const sorted = [...contexts].sort(
    (a, b) => a.region.costPerHour - b.region.costPerHour,
  );
  const totalCost = (): number =>
    sorted.reduce(
      (acc, ctx) => acc + (desired.get(ctx.region.id) ?? 0) * ctx.region.costPerHour,
      0,
    );

  // Drain expensive regions until under budget.
  for (let i = sorted.length - 1; i >= 0 && totalCost() > inputs.costBudgetUsdPerHour; i -= 1) {
    const ctx = sorted[i];
    if (!ctx) continue;
    if (ctx.observedP95 > inputs.latencyBudgetMs) continue; // never trim under pressure
    const cur = desired.get(ctx.region.id) ?? 0;
    if (cur > 0) {
      desired.set(ctx.region.id, cur - 1);
      i += 1; // re-check this region next iteration
    }
  }

  // Materialise actions.
  const actions: ScaleAction[] = [];
  for (const ctx of contexts) {
    const target = desired.get(ctx.region.id) ?? 0;
    const cur = ctx.state?.instanceCount ?? 0;
    const delta = target - cur;
    if (delta === 0) continue;
    let reason: string;
    if (ctx.observedP95 > inputs.latencyBudgetMs) {
      reason = `latency budget exceeded (p95=${ctx.observedP95.toFixed(0)}ms > ${inputs.latencyBudgetMs}ms)`;
    } else if (delta > 0) {
      reason = `predicted qps ${ctx.predictedQps.toFixed(2)} requires ${target} instances`;
    } else {
      reason = `predicted qps ${ctx.predictedQps.toFixed(2)} allows trim to ${target} instances (cost-aware)`;
    }
    actions.push({
      regionId: ctx.region.id,
      delta,
      targetInstanceCount: target,
      reason,
    });
  }

  const projected = sorted.reduce(
    (acc, ctx) => acc + (desired.get(ctx.region.id) ?? 0) * ctx.region.costPerHour,
    0,
  );

  return {
    serviceId: inputs.serviceId,
    decidedAt: inputs.now,
    actions: cooldownActive ? [] : actions,
    cooldownActive,
    projectedHourlyCostUsd: projected,
  };
}
