import { z } from "zod";

export const METRIC_NAMES = ["LCP", "CLS", "INP", "FCP", "TTFB"] as const;
export type MetricName = (typeof METRIC_NAMES)[number];

export const metricSchema = z.object({
  n: z.enum(METRIC_NAMES),
  v: z.number().finite().min(0).max(600_000),
  t: z.number().finite().min(0).max(86_400_000),
});

export const batchSchema = z.object({
  tenant: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  route: z.string().min(1).max(2048),
  sentAt: z.number().int().min(0),
  viewport: z.tuple([z.number().int().min(0).max(16384), z.number().int().min(0).max(16384)]),
  deviceMemory: z.number().min(0).max(1024).nullable(),
  connection: z.string().max(32).nullable(),
  metrics: z.array(metricSchema).min(1).max(64),
});

export type Batch = z.infer<typeof batchSchema>;
export type Metric = z.infer<typeof metricSchema>;

export const statsQuerySchema = z.object({
  route: z.string().min(1).max(2048).optional(),
  metric: z.enum(METRIC_NAMES).optional(),
  since: z.coerce.number().int().min(0).optional(),
});
export type StatsQuery = z.infer<typeof statsQuerySchema>;

export const timeseriesBucketSchema = z.enum(["1m", "5m", "1h"]);
export type TimeseriesBucket = z.infer<typeof timeseriesBucketSchema>;

export const timeseriesQuerySchema = z.object({
  route: z.string().min(1).max(2048).optional(),
  metric: z.enum(METRIC_NAMES),
  bucket: timeseriesBucketSchema.default("1m"),
  since: z.coerce.number().int().min(0).optional(),
});
export type TimeseriesQuery = z.infer<typeof timeseriesQuerySchema>;
