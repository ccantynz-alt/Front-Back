/**
 * Outbound webhook dispatcher loop.
 *
 * `runDispatcher` is the workhorse that drains the `webhook_deliveries`
 * queue: it selects up to 50 pending rows whose `next_retry_at` is due,
 * POSTs each to its parent webhook URL with an HMAC-SHA256 signature,
 * and transitions the row to `delivered` or `failed`. Transient failures
 * (5xx, 429, timeout) are retried with an exponential backoff schedule.
 * After 5 failed attempts the delivery is marked `failed` AND the parent
 * webhook is auto-deactivated so a persistently broken endpoint stops
 * wasting dispatcher cycles.
 *
 * Green-ecosystem guarantees:
 *   1. `Promise.allSettled` is used so one slow subscriber cannot starve
 *      the rest of the batch.
 *   2. If the dispatcher itself crashes mid-batch, unmarked rows remain
 *      `pending` and the next run picks them up — idempotent by design.
 *   3. HTTP errors are caught and recorded; the dispatcher never throws
 *      to its caller.
 */

import { and, asc, eq, lte } from "drizzle-orm";
import type { db as defaultDb } from "@back-to-the-future/db";
import { userWebhooks, webhookDeliveries } from "@back-to-the-future/db";

export type DbClient = typeof defaultDb;

// ── Tunables ────────────────────────────────────────────────────────

const BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
/** Backoff schedule in milliseconds. Index = attempt count AFTER this run. */
const BACKOFF_MS: readonly number[] = [
  30_000, // 30s
  2 * 60_000, // 2m
  10 * 60_000, // 10m
  60 * 60_000, // 1h
  6 * 60 * 60_000, // 6h
];

// ── HMAC signing ────────────────────────────────────────────────────

/**
 * Compute `hex(HMAC-SHA256(secret, `${timestamp}.${payload}`))`. Uses
 * SubtleCrypto so the same code runs in Bun, Node, and Cloudflare Workers.
 */
export async function computeSignature(
  secret: string,
  timestamp: number,
  payloadJson: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payloadJson}`),
  );
  return Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Result type ─────────────────────────────────────────────────────

export interface DispatcherResult {
  delivered: number;
  failed: number;
}

// ── Injected fetch (testability) ────────────────────────────────────

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RunDispatcherOptions {
  /** Override for testing. Defaults to `globalThis.fetch`. */
  fetchImpl?: FetchLike;
  /** Override for testing. Defaults to `Date.now`. */
  now?: () => number;
}

// ── Main entry point ────────────────────────────────────────────────

export async function runDispatcher(
  db: DbClient,
  options: RunDispatcherOptions = {},
): Promise<DispatcherResult> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());

  // Select up to BATCH_SIZE pending rows whose next_retry_at is due.
  const due = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        lte(webhookDeliveries.nextRetryAt, new Date(now())),
      ),
    )
    .orderBy(asc(webhookDeliveries.nextRetryAt))
    .limit(BATCH_SIZE);

  if (due.length === 0) return { delivered: 0, failed: 0 };

  const results = await Promise.allSettled(
    due.map((delivery) => processDelivery(db, delivery, fetchImpl, now)),
  );

  let delivered = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value === "delivered") delivered++;
      else if (result.value === "failed") failed++;
    } else {
      // Swallow — the row stays pending, next run picks it up.
      failed++;
      console.warn("[webhook-dispatcher] unexpected error:", result.reason);
    }
  }

  return { delivered, failed };
}

// ── Per-delivery processing ─────────────────────────────────────────

type DeliveryOutcome = "delivered" | "failed" | "retry";

async function processDelivery(
  db: DbClient,
  delivery: typeof webhookDeliveries.$inferSelect,
  fetchImpl: FetchLike,
  now: () => number,
): Promise<DeliveryOutcome> {
  // Load parent webhook (url, secret, active).
  const parents = await db
    .select()
    .from(userWebhooks)
    .where(eq(userWebhooks.id, delivery.webhookId))
    .limit(1);
  const parent = parents[0];

  if (!parent) {
    // Orphaned delivery — nothing to send.
    await db
      .update(webhookDeliveries)
      .set({
        status: "failed",
        lastError: "parent webhook not found",
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    return "failed";
  }

  if (!parent.isActive) {
    // Parent deactivated mid-flight — fail without attempting.
    await db
      .update(webhookDeliveries)
      .set({
        status: "failed",
        lastError: "parent webhook inactive",
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    return "failed";
  }

  const timestamp = Math.floor(now() / 1000);
  const signature = await computeSignature(parent.secret, timestamp, delivery.payload);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response | null = null;
  let networkError: string | null = null;
  try {
    response = await fetchImpl(parent.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Crontech-Event": delivery.event,
        "X-Crontech-Signature": `t=${timestamp},v1=${signature}`,
        "X-Crontech-Delivery": delivery.id,
      },
      body: delivery.payload,
      signal: controller.signal,
    });
  } catch (err) {
    networkError = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timeoutId);
  }

  const nextAttemptCount = delivery.attemptCount + 1;

  // ── Success: 2xx ──────────────────────────────────────────────
  if (response && response.status >= 200 && response.status < 300) {
    await db
      .update(webhookDeliveries)
      .set({
        status: "delivered",
        attemptCount: nextAttemptCount,
        lastStatusCode: response.status,
        lastError: null,
        deliveredAt: new Date(now()),
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    return "delivered";
  }

  // Classify the failure.
  const statusCode = response?.status ?? 0;
  const isClientError =
    response !== null && statusCode >= 400 && statusCode < 500 && statusCode !== 429;

  // ── Permanent client error (4xx except 429): fail without retry ──
  if (isClientError) {
    await db
      .update(webhookDeliveries)
      .set({
        status: "failed",
        attemptCount: nextAttemptCount,
        lastStatusCode: statusCode,
        lastError: `client error ${statusCode}`,
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    return "failed";
  }

  // ── Transient failure: retry or exhaust ─────────────────────────
  const errorMessage = networkError
    ? `network: ${networkError}`
    : `server error ${statusCode || "unknown"}`;

  if (nextAttemptCount >= MAX_ATTEMPTS) {
    // Exhausted — mark failed AND auto-deactivate the parent webhook so
    // a persistently broken subscriber stops consuming dispatcher slots.
    await db
      .update(webhookDeliveries)
      .set({
        status: "failed",
        attemptCount: nextAttemptCount,
        lastStatusCode: statusCode || null,
        lastError: `${errorMessage} (exhausted retries)`,
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    await db
      .update(userWebhooks)
      .set({ isActive: false })
      .where(eq(userWebhooks.id, parent.id));
    return "failed";
  }

  // Schedule the next retry per the backoff table.
  const backoffIdx = Math.min(delivery.attemptCount, BACKOFF_MS.length - 1);
  const backoff = BACKOFF_MS[backoffIdx] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
  const nextRetryAt = new Date(now() + backoff);

  await db
    .update(webhookDeliveries)
    .set({
      attemptCount: nextAttemptCount,
      lastStatusCode: statusCode || null,
      lastError: errorMessage,
      nextRetryAt,
    })
    .where(eq(webhookDeliveries.id, delivery.id));

  return "retry";
}
