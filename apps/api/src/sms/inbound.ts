// ── BLK-030 — Inbound SMS webhook (Sinch → Crontech) ─────────────────
// Sinch POSTs inbound (MO) SMS payloads to the URL we configure in
// their dashboard. This Hono handler:
//   1. Verifies the HMAC-SHA256 signature against SINCH_WEBHOOK_SECRET.
//      Invalid or missing → 401. No exceptions.
//   2. Parses the payload through Zod.
//   3. Persists the inbound row in `sms_messages`.
//   4. Looks up the customer's subscription row for the MSISDN and, if
//      present, enqueues an outbound webhook to their own URL via the
//      existing webhook engine.
//
// We deliberately do NOT call the customer's URL inline — the retry /
// delivery guarantees live in the webhook engine, and we want the
// Sinch reply to be fast (< 200ms target).

import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import {
  smsMessages,
  smsNumbers,
  smsWebhookSubscriptions,
  userWebhooks,
  webhookDeliveries,
} from "@back-to-the-future/db";
import { db as defaultDb } from "@back-to-the-future/db";
import {
  SinchInboundWebhookSchema,
  type SinchInboundWebhook,
} from "./sinch-types";
import { verifySinchSignature } from "./sinch-client";

export type DbClient = typeof defaultDb;

// ── Dependency seam for tests ─────────────────────────────────────────

export interface InboundHookDeps {
  db?: DbClient;
  getSecret?: () => string | undefined;
  /** Override the current time for deterministic tests. */
  now?: () => number;
}

/**
 * Factory: returns a Hono app that exposes `POST /api/sms/inbound`.
 * We keep it a factory (rather than a singleton) so tests can inject
 * their own DB + secret without mutating globals.
 */
export function createInboundSmsApp(deps: InboundHookDeps = {}): Hono {
  const db = deps.db ?? defaultDb;
  const getSecret =
    deps.getSecret ?? (() => process.env["SINCH_WEBHOOK_SECRET"]);
  const now = deps.now ?? (() => Date.now());

  const app = new Hono();

  app.post("/sms/inbound", async (c) => {
    // 1. Signature verification — read raw body so the HMAC is
    //    computed against the exact bytes Sinch signed.
    const rawBody = await c.req.text();
    const secret = getSecret();
    if (!secret) {
      return c.json(
        {
          ok: false,
          error: "Inbound SMS webhook secret is not configured on this deployment.",
        },
        500,
      );
    }
    const provided =
      c.req.header("x-sinch-signature") ??
      c.req.header("x-sinch-webhook-signature") ??
      null;
    const valid = await verifySinchSignature({
      rawBody,
      provided,
      secret,
    });
    if (!valid) {
      return c.json({ ok: false, error: "Invalid webhook signature." }, 401);
    }

    // 2. Payload parsing.
    let parsed: SinchInboundWebhook;
    try {
      const json = JSON.parse(rawBody) as unknown;
      parsed = SinchInboundWebhookSchema.parse(json);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to parse the inbound payload.";
      return c.json({ ok: false, error: message }, 400);
    }

    // 3. Resolve the user the `to` number belongs to. If we do not own
    //    the number we still 200 (Sinch would otherwise retry forever)
    //    but flag the row as orphaned by leaving `userId` empty — we
    //    never persist orphans because of the FK on `user_id`.
    const owner = await findNumberOwner(db, parsed.to);
    if (!owner) {
      // Ack the webhook so Sinch does not storm us, but log.
      console.warn(
        `[sms-inbound] Ignoring inbound to ${parsed.to}: number not owned by any user.`,
      );
      return c.json({ ok: true, status: "ignored" as const });
    }

    const messageId = `sms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const receivedAt = new Date(now());
    const row: typeof smsMessages.$inferInsert = {
      id: messageId,
      userId: owner.userId,
      direction: "receive",
      fromNumber: parsed.from,
      toNumber: parsed.to,
      body: parsed.body,
      segments: 1,
      status: "received",
      providerMessageId: parsed.id,
      costMicrodollars: 0,
      markupMicrodollars: 0,
      sentAt: receivedAt,
    };
    try {
      await db.insert(smsMessages).values(row);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Persistence failed.";
      console.error("[sms-inbound] Failed to persist inbound SMS:", message);
      return c.json({ ok: false, error: "Unable to record inbound message." }, 500);
    }

    // 4. Fan-out to the customer's webhook if they registered one for
    //    this specific number OR have a wildcard user webhook that
    //    subscribes to the `sms.inbound` event.
    const fanOut = await enqueueCustomerWebhook(db, {
      userId: owner.userId,
      toNumber: parsed.to,
      fromNumber: parsed.from,
      body: parsed.body,
      providerMessageId: parsed.id,
      messageId,
      receivedAt: receivedAt.toISOString(),
    });

    return c.json({
      ok: true,
      status: "accepted" as const,
      messageId,
      webhookFanOut: fanOut,
    });
  });

  return app;
}

/** Default-wired app for mounting on the main Hono tree. */
export const inboundSmsApp = createInboundSmsApp();

// ── Helpers ────────────────────────────────────────────────────────────

async function findNumberOwner(
  db: DbClient,
  e164: string,
): Promise<{ userId: string } | null> {
  const rows = await db
    .select({ userId: smsNumbers.userId })
    .from(smsNumbers)
    .where(eq(smsNumbers.e164Number, e164))
    .limit(1);
  const owner = rows[0];
  if (owner) return { userId: owner.userId };
  return null;
}

interface EnqueueWebhookInput {
  userId: string;
  toNumber: string;
  fromNumber: string;
  body: string;
  providerMessageId: string;
  messageId: string;
  receivedAt: string;
}

async function enqueueCustomerWebhook(
  db: DbClient,
  input: EnqueueWebhookInput,
): Promise<{ enqueued: number }> {
  // 1. SMS-specific subscription (per number).
  const subs = await db
    .select()
    .from(smsWebhookSubscriptions)
    .where(
      and(
        eq(smsWebhookSubscriptions.userId, input.userId),
        eq(smsWebhookSubscriptions.e164Number, input.toNumber),
      ),
    )
    .orderBy(desc(smsWebhookSubscriptions.createdAt));

  const payload = {
    type: "sms.inbound",
    messageId: input.messageId,
    providerMessageId: input.providerMessageId,
    from: input.fromNumber,
    to: input.toNumber,
    body: input.body,
    receivedAt: input.receivedAt,
  };

  let enqueued = 0;

  for (const sub of subs) {
    // Deliveries need an existing userWebhooks row — we upsert a shadow
    // entry here so the dispatcher picks it up. In production we'd wire
    // a single user_webhooks row per sms subscription at registration
    // time; for v1 we create the row lazily.
    let shadow = await db
      .select()
      .from(userWebhooks)
      .where(
        and(
          eq(userWebhooks.userId, input.userId),
          eq(userWebhooks.url, sub.customerWebhookUrl),
        ),
      )
      .limit(1);
    if (!shadow[0]) {
      const shadowId = `uwh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await db.insert(userWebhooks).values({
        id: shadowId,
        userId: input.userId,
        url: sub.customerWebhookUrl,
        events: sub.events,
        secret: sub.hmacSecret,
        isActive: true,
      });
      shadow = await db
        .select()
        .from(userWebhooks)
        .where(eq(userWebhooks.id, shadowId))
        .limit(1);
    }
    const hook = shadow[0];
    if (!hook) continue;
    const deliveryId = `wdel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      webhookId: hook.id,
      event: "sms.inbound",
      payload: JSON.stringify(payload),
      status: "pending",
      attemptCount: 0,
      nextRetryAt: new Date(),
    });
    enqueued += 1;
  }

  return { enqueued };
}
