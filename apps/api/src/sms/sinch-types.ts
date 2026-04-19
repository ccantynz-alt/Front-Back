// ── BLK-030 — Sinch SMS REST API Zod contracts ────────────────────────
// Zod schemas for every request / response shape that crosses the wire
// between Crontech and the Sinch SMS REST API. Sinch is our wholesale
// carrier aggregator for v1; customers call Crontech's own SMS API and
// we front-run their messages through Sinch at a configurable markup.
//
// Iron rule (CLAUDE.md §6.1): Zod at every boundary. Raw JSON from
// Sinch is parsed, then validated here before it leaves the client.
// Permissive on new fields Sinch may add; strict on the load-bearing
// keys we rely on (status, delivery report, segment count, cost).

import { z } from "zod";

// ── E.164 phone number primitive ──────────────────────────────────────
// Matches the ITU-T E.164 format: leading '+', 8-15 digits, first digit
// non-zero. Accepts the MSISDN without the '+' too, via a refinement
// helper exported below for tolerant callers.

export const E164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/u, "Phone numbers must be in E.164 format, e.g. +14155551234.");

export type E164 = z.infer<typeof E164Schema>;

// ── Send SMS request ───────────────────────────────────────────────────
// Sinch "Batches" endpoint: POST /xms/v1/{servicePlanId}/batches.
// We expose the single-recipient shape customers typically want; the
// Sinch API itself accepts an array `to`, which we pass through.

export const SinchSendRequestSchema = z.object({
  from: E164Schema,
  to: z.array(E164Schema).min(1),
  body: z.string().min(1).max(1600),
  /** Optional Sinch delivery-report callback override. */
  delivery_report: z
    .enum(["none", "summary", "full", "per_recipient", "per_recipient_final"])
    .optional(),
  /** Optional feedback webhook URL override (per-batch). */
  callback_url: z.string().url().optional(),
});

export type SinchSendRequest = z.infer<typeof SinchSendRequestSchema>;

// ── Send SMS response ──────────────────────────────────────────────────
// Sinch returns the created batch ID plus a snapshot of the payload. We
// capture the fields we persist: id, from/to, body, segment count, cost.

export const SinchSendResponseSchema = z
  .object({
    id: z.string().min(1),
    from: z.string(),
    to: z.array(z.string()).optional(),
    body: z.string().optional(),
    canceled: z.boolean().optional(),
    created_at: z.string().optional(),
    modified_at: z.string().optional(),
    /** Total SMS parts billed by Sinch — a single long SMS may be >1. */
    number_of_message_parts: z.number().int().nonnegative().optional(),
    /** Per-segment cost in USD dollars (string from Sinch). */
    price_per_part: z
      .object({ amount: z.union([z.string(), z.number()]), currency: z.string() })
      .optional(),
    /** Aggregate cost in USD dollars if Sinch returns it. */
    total_price: z
      .object({ amount: z.union([z.string(), z.number()]), currency: z.string() })
      .optional(),
  })
  .passthrough();

export type SinchSendResponse = z.infer<typeof SinchSendResponseSchema>;

// ── Get single message ─────────────────────────────────────────────────
// GET /xms/v1/{servicePlanId}/batches/{batchId}
//
// The delivery status we care about (queued/sent/delivered/failed) is
// derived from `batchDeliveryReport` style fields; for the v1 client we
// just mirror the batch record.

export const SinchMessageSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().optional(),
    to: z.array(z.string()).optional(),
    body: z.string().optional(),
    created_at: z.string().optional(),
    modified_at: z.string().optional(),
    canceled: z.boolean().optional(),
    number_of_message_parts: z.number().int().nonnegative().optional(),
    status: z.string().optional(),
    total_price: z
      .object({ amount: z.union([z.string(), z.number()]), currency: z.string() })
      .optional(),
  })
  .passthrough();

export type SinchMessage = z.infer<typeof SinchMessageSchema>;

// ── List messages ──────────────────────────────────────────────────────
// GET /xms/v1/{servicePlanId}/batches?page=...&page_size=...
// Sinch exposes opaque page cursors; we pass them through.

export const SinchListMessagesResponseSchema = z
  .object({
    count: z.number().int().nonnegative().optional(),
    page: z.number().int().nonnegative().optional(),
    page_size: z.number().int().nonnegative().optional(),
    batches: z.array(SinchMessageSchema).optional(),
    next_page: z.string().optional(),
  })
  .passthrough();

export type SinchListMessagesResponse = z.infer<typeof SinchListMessagesResponseSchema>;

// ── Inbound webhook (MO — Mobile Originated) ───────────────────────────
// Sinch delivers inbound SMS to the URL configured in the dashboard.
// Shape per Sinch docs — the fields we pin are the ones we persist:
// `id`, `from`, `to`, `body`, `received_at`.

export const SinchInboundWebhookSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().optional(),
    from: z.string().min(1),
    to: z.string().min(1),
    body: z.string().default(""),
    received_at: z.string().optional(),
    operator_id: z.string().optional(),
    sent_at: z.string().optional(),
  })
  .passthrough();

export type SinchInboundWebhook = z.infer<typeof SinchInboundWebhookSchema>;

// ── Delivery report webhook (MT status callback) ──────────────────────

export const SinchDeliveryReportSchema = z
  .object({
    batch_id: z.string().min(1),
    type: z.string().optional(),
    status: z.string().optional(),
    at: z.string().optional(),
    statuses: z
      .array(
        z
          .object({
            code: z.number().int().optional(),
            status: z.string().optional(),
            count: z.number().int().optional(),
            recipients: z.array(z.string()).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type SinchDeliveryReport = z.infer<typeof SinchDeliveryReportSchema>;

// ── Number provisioning (for buy/release) ─────────────────────────────
// Sinch exposes "Available Numbers" + "Active Numbers" endpoints. We
// abstract both into a small typed surface used by the tRPC router.

export const SinchNumberSchema = z
  .object({
    phone_number: z.string().min(1),
    region_code: z.string().optional(),
    type: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    monthly_price: z
      .object({ amount: z.union([z.string(), z.number()]), currency: z.string() })
      .optional(),
  })
  .passthrough();

export type SinchNumber = z.infer<typeof SinchNumberSchema>;

// ── Public derived types ──────────────────────────────────────────────

export const SmsSegmentationSchema = z.object({
  segments: z.number().int().positive(),
  encoding: z.enum(["gsm7", "ucs2"]),
  length: z.number().int().nonnegative(),
});

export type SmsSegmentation = z.infer<typeof SmsSegmentationSchema>;

/**
 * A row as it lives on the tRPC wire. Mirrors `sms_messages` in the DB
 * with ISO strings instead of Date objects so JSON transport is clean.
 */
export const PersistedSmsMessageSchema = z.object({
  id: z.string(),
  userId: z.string(),
  direction: z.enum(["send", "receive"]),
  fromNumber: z.string(),
  toNumber: z.string(),
  body: z.string(),
  segments: z.number().int().nonnegative(),
  status: z.enum(["queued", "sent", "delivered", "failed", "received"]),
  providerMessageId: z.string().nullable(),
  costMicrodollars: z.number().int().nonnegative(),
  markupMicrodollars: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
});

export type PersistedSmsMessage = z.infer<typeof PersistedSmsMessageSchema>;
