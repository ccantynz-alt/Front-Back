import { z } from "zod";

/**
 * Region: a single geographic deployment target.
 * `costPerHour` is the marginal cost (USD) of running ONE instance for one hour.
 * `capacity` is the maximum total instances the region can host across all services.
 * `currentLoad` is the current count of instances scheduled in the region (across services).
 */
export const RegionSchema = z.object({
  id: z.string().min(1),
  code: z
    .string()
    .min(2)
    .max(16)
    .regex(/^[a-z0-9-]+$/u, "region code must be kebab-case lowercase"),
  location: z.string().min(1),
  capacity: z.number().int().nonnegative(),
  currentLoad: z.number().int().nonnegative(),
  costPerHour: z.number().nonnegative(),
});
export type Region = z.infer<typeof RegionSchema>;

/**
 * Single sample of traffic observed for a service in a region at a point in time.
 * `timestamp` is unix-ms. `qps` is queries-per-second observed in the bucket.
 * `p95LatencyMs` is the 95th percentile request latency in that bucket.
 */
export const TrafficSampleSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  regionId: z.string().min(1),
  qps: z.number().nonnegative(),
  p95LatencyMs: z.number().nonnegative(),
});
export type TrafficSample = z.infer<typeof TrafficSampleSchema>;

/**
 * Per-service current scheduled state, as reported by the deploy-orchestrator.
 */
export const ServiceRegionStateSchema = z.object({
  serviceId: z.string().min(1),
  regionId: z.string().min(1),
  instanceCount: z.number().int().nonnegative(),
  lastScaleEventAt: z.number().int().nonnegative(),
});
export type ServiceRegionState = z.infer<typeof ServiceRegionStateSchema>;

/**
 * Submission body to `POST /services/:id/state` — the orchestrator pushes
 * the current state plus a recent traffic window.
 */
export const SubmitStateBodySchema = z.object({
  states: z.array(ServiceRegionStateSchema),
  recentTraffic: z.array(TrafficSampleSchema),
  /**
   * Latency budget in ms. The decision engine prefers cheaper regions only
   * while observed p95 stays under this budget.
   */
  latencyBudgetMs: z.number().positive(),
  /**
   * Cost budget in USD per hour. Total scheduled instance cost must stay
   * under this ceiling after the decision is applied.
   */
  costBudgetUsdPerHour: z.number().nonnegative(),
  /**
   * Target QPS-per-instance. Capacity planning aims to keep observed QPS
   * per region under this value.
   */
  targetQpsPerInstance: z.number().positive(),
});
export type SubmitStateBody = z.infer<typeof SubmitStateBodySchema>;

/**
 * Single per-region decision: positive = scale up, negative = scale down.
 */
export const ScaleActionSchema = z.object({
  regionId: z.string().min(1),
  delta: z.number().int(),
  targetInstanceCount: z.number().int().nonnegative(),
  reason: z.string(),
});
export type ScaleAction = z.infer<typeof ScaleActionSchema>;

export const ScalingDecisionSchema = z.object({
  serviceId: z.string().min(1),
  decidedAt: z.number().int().nonnegative(),
  actions: z.array(ScaleActionSchema),
  /** True if the decision engine refused to act because of cooldown. */
  cooldownActive: z.boolean(),
  /** Total predicted hourly cost (USD) after the decision is applied. */
  projectedHourlyCostUsd: z.number().nonnegative(),
});
export type ScalingDecision = z.infer<typeof ScalingDecisionSchema>;

export const PredictionPointSchema = z.object({
  regionId: z.string().min(1),
  /** Unix-ms midpoint of the predicted bucket. */
  timestamp: z.number().int().nonnegative(),
  predictedQps: z.number().nonnegative(),
});
export type PredictionPoint = z.infer<typeof PredictionPointSchema>;

export const PredictionSeriesSchema = z.object({
  serviceId: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  points: z.array(PredictionPointSchema),
});
export type PredictionSeries = z.infer<typeof PredictionSeriesSchema>;

/** Cooldown between scale events, in ms. Prevents oscillation. */
export const SCALE_COOLDOWN_MS = 5 * 60 * 1000;

/** Default EMA smoothing factor (alpha) for the predictor. */
export const DEFAULT_EMA_ALPHA = 0.3;

/** Number of hourly prediction points returned by `predictNextHour`. */
export const HOURLY_FORECAST_POINTS = 12; // every 5 min for 1 hour
