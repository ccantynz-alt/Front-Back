import {
  DEFAULT_EMA_ALPHA,
  HOURLY_FORECAST_POINTS,
  type PredictionPoint,
  type PredictionSeries,
  type TrafficSample,
} from "./schemas";

/**
 * Predictor interface — v1 ships a simple EMA + day-of-week seasonality model.
 * v2 will be a learned model running on the GPU tier; the decision engine
 * is decoupled from the implementation via this interface.
 */
export interface TrafficPredictor {
  predictNextHour(
    serviceId: string,
    samples: readonly TrafficSample[],
    now: number,
  ): PredictionSeries;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Bucket samples by region.
 */
function groupByRegion(
  samples: readonly TrafficSample[],
): Map<string, TrafficSample[]> {
  const map = new Map<string, TrafficSample[]>();
  for (const s of samples) {
    const arr = map.get(s.regionId);
    if (arr) {
      arr.push(s);
    } else {
      map.set(s.regionId, [s]);
    }
  }
  for (const [, arr] of map) {
    arr.sort((a, b) => a.timestamp - b.timestamp);
  }
  return map;
}

/**
 * Compute an exponential moving average over a sample series.
 * Empty input → 0. Single sample → that sample's value.
 */
export function computeEma(
  values: readonly number[],
  alpha: number = DEFAULT_EMA_ALPHA,
): number {
  if (values.length === 0) return 0;
  const head = values[0];
  if (head === undefined) return 0;
  let ema = head;
  for (let i = 1; i < values.length; i += 1) {
    const v = values[i];
    if (v === undefined) continue;
    ema = alpha * v + (1 - alpha) * ema;
  }
  return ema;
}

/**
 * Compute a day-of-week seasonality factor: ratio of the same hour-of-day on
 * the same weekday over the past weeks vs. the global mean. 1.0 if no signal.
 *
 * `now` and each sample's `timestamp` are unix-ms.
 */
export function dayOfWeekFactor(
  samples: readonly TrafficSample[],
  now: number,
): number {
  if (samples.length === 0) return 1;
  const targetDow = new Date(now).getUTCDay();
  const targetHour = new Date(now).getUTCHours();

  let matchSum = 0;
  let matchCount = 0;
  let totalSum = 0;
  let totalCount = 0;
  for (const s of samples) {
    const d = new Date(s.timestamp);
    totalSum += s.qps;
    totalCount += 1;
    if (d.getUTCDay() === targetDow && d.getUTCHours() === targetHour) {
      matchSum += s.qps;
      matchCount += 1;
    }
  }
  if (matchCount === 0 || totalCount === 0) return 1;
  const matchMean = matchSum / matchCount;
  const totalMean = totalSum / totalCount;
  if (totalMean === 0) return 1;
  return matchMean / totalMean;
}

/**
 * Default predictor: EMA over the most-recent samples in a region, scaled by
 * day-of-week seasonality. Forecasts `HOURLY_FORECAST_POINTS` evenly spaced
 * predictions over the next hour.
 */
export class EmaSeasonalPredictor implements TrafficPredictor {
  constructor(private readonly alpha: number = DEFAULT_EMA_ALPHA) {}

  predictNextHour(
    serviceId: string,
    samples: readonly TrafficSample[],
    now: number,
  ): PredictionSeries {
    const byRegion = groupByRegion(samples);
    const points: PredictionPoint[] = [];
    const stepMs = HOUR_MS / HOURLY_FORECAST_POINTS;

    for (const [regionId, regionSamples] of byRegion) {
      // Use only samples from the last 7 days for stability.
      const recent = regionSamples.filter(
        (s) => s.timestamp >= now - WEEK_MS && s.timestamp <= now,
      );
      if (recent.length === 0) continue;
      const qpsValues = recent.map((s) => s.qps);
      const baseEma = computeEma(qpsValues, this.alpha);
      for (let i = 0; i < HOURLY_FORECAST_POINTS; i += 1) {
        const t = now + Math.round((i + 0.5) * stepMs);
        const factor = dayOfWeekFactor(recent, t);
        const predicted = Math.max(0, baseEma * factor);
        points.push({
          regionId,
          timestamp: t,
          predictedQps: predicted,
        });
      }
    }

    return {
      serviceId,
      generatedAt: now,
      points,
    };
  }
}
