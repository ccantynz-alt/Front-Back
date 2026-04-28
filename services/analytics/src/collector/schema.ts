import { z } from "zod";

/**
 * Tenant + identifier safety: keep these tight so that the in-memory ring
 * buffer can never get poisoned by adversarial keys (long strings, control
 * chars, etc.). 128 chars is enough for any realistic tenant slug.
 */
const slug = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const utmSchema = z
  .object({
    source: z.string().max(128).optional(),
    medium: z.string().max(128).optional(),
    campaign: z.string().max(128).optional(),
    term: z.string().max(128).optional(),
    content: z.string().max(128).optional(),
  })
  .strict();
export type Utm = z.infer<typeof utmSchema>;

/**
 * One product-analytics event. We accept either a pageview ("$pageview")
 * or an arbitrary custom event name. `props` is JSON-serialisable but capped.
 */
export const eventSchema = z
  .object({
    sessionId: slug,
    route: z.string().min(1).max(2048),
    event: z.string().min(1).max(128),
    props: z.record(z.string().max(128), z.union([z.string().max(2048), z.number(), z.boolean(), z.null()])).optional(),
    ts: z.number().int().min(0),
    referrer: z.string().max(2048).optional(),
    utm: utmSchema.optional(),
    /**
     * Signal that this event is the *first* event of its session — used by
     * the bounce-rate calculation. The collector will also re-derive bounce
     * server-side from the session ring, but the hint avoids a full scan.
     */
    isEntry: z.boolean().optional(),
  })
  .strict();
export type AnalyticsEvent = z.infer<typeof eventSchema>;

export const batchSchema = z
  .object({
    tenant: slug,
    /** Optional bearer for tenants that publish over a single domain. */
    bearer: z.string().min(1).max(256).optional(),
    events: z.array(eventSchema).min(1).max(64),
  })
  .strict();
export type Batch = z.infer<typeof batchSchema>;

export const statsQuerySchema = z.object({
  route: z.string().min(1).max(2048).optional(),
  event: z.string().min(1).max(128).optional(),
  since: z.coerce.number().int().min(0).optional(),
  topN: z.coerce.number().int().min(1).max(100).optional(),
});
export type StatsQuery = z.infer<typeof statsQuerySchema>;

export const funnelRequestSchema = z
  .object({
    steps: z.array(z.string().min(1).max(128)).min(2).max(10),
    since: z.number().int().min(0).optional(),
    /** Max ms between consecutive steps to count as same funnel run. */
    windowMs: z
      .number()
      .int()
      .min(1_000)
      .max(7 * 24 * 60 * 60 * 1000)
      .optional(),
  })
  .strict();
export type FunnelRequest = z.infer<typeof funnelRequestSchema>;
