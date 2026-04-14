/**
 * Webhook event emitter.
 *
 * `emitWebhook` is the fire-and-forget entry point that application code
 * calls whenever something happens that external subscribers care about
 * (e.g. "payment.succeeded", "site.deployed"). It does NOT attempt HTTP
 * delivery inline — it only enqueues rows into `webhook_deliveries`. The
 * dispatcher loop in `./dispatcher.ts` is responsible for actually POSTing
 * them and retrying on failure.
 *
 * This separation keeps the hot path fast (one DB insert per subscriber,
 * no network I/O) and makes delivery idempotent: if the process crashes
 * mid-emit, the next dispatcher run simply picks up any `pending` rows.
 */

import { and, eq } from "drizzle-orm";
import type { db as defaultDb } from "@back-to-the-future/db";
import { userWebhooks, webhookDeliveries } from "@back-to-the-future/db";

export type DbClient = typeof defaultDb;

/**
 * Enqueue an outbound webhook delivery for every active subscription
 * owned by `userId` that matches `event`. Returns the number of
 * deliveries enqueued.
 *
 * - A webhook whose `events` column is an empty array `[]` or contains
 *   the literal `"*"` is treated as a wildcard subscriber.
 * - Deliveries are inserted with `status = 'pending'`, `attempt_count = 0`,
 *   and `next_retry_at = now()` so the next dispatcher run picks them up
 *   immediately.
 */
export async function emitWebhook(
  db: DbClient,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const activeHooks = await db
    .select()
    .from(userWebhooks)
    .where(and(eq(userWebhooks.userId, userId), eq(userWebhooks.isActive, true)));

  const matching = activeHooks.filter((hook) => {
    let events: unknown;
    try {
      events = JSON.parse(hook.events);
    } catch {
      return false;
    }
    if (!Array.isArray(events)) return false;
    if (events.length === 0) return true; // empty = wildcard
    if (events.includes("*")) return true;
    return events.includes(event);
  });

  if (matching.length === 0) return 0;

  const payloadJson = JSON.stringify(payload);
  const now = new Date();

  const rows = matching.map((hook) => ({
    id: crypto.randomUUID(),
    webhookId: hook.id,
    event,
    payload: payloadJson,
    status: "pending" as const,
    attemptCount: 0,
    nextRetryAt: now,
    createdAt: now,
  }));

  await db.insert(webhookDeliveries).values(rows);
  return rows.length;
}
