/**
 * Integration test for the outbound webhook dispatcher.
 *
 * Uses the real drizzle client pointed at the test sqlite database
 * (apps/api/test/setup.ts wipes + re-migrates before every run) and a
 * mocked `fetchImpl` so we can assert request shape, HMAC signature, and
 * state transitions without touching the network.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, users, userWebhooks, webhookDeliveries } from "@back-to-the-future/db";
import {
  computeSignature,
  runDispatcher,
} from "./dispatcher";
import { emitWebhook } from "./emit";

// ── Fixture helpers ─────────────────────────────────────────────────

async function resetTables(): Promise<void> {
  await db.delete(webhookDeliveries);
  await db.delete(userWebhooks);
  await db.delete(users);
}

async function ensureUser(userId: string): Promise<void> {
  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (existing.length > 0) return;
  await db.insert(users).values({
    id: userId,
    email: `${userId}@example.test`,
    displayName: userId,
    role: "editor",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function seedWebhook(overrides: Partial<{
  id: string;
  userId: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
}> = {}): Promise<string> {
  const id = overrides.id ?? crypto.randomUUID();
  const userId = overrides.userId ?? `user-${id.slice(0, 8)}`;
  await ensureUser(userId);
  await db.insert(userWebhooks).values({
    id,
    userId,
    url: overrides.url ?? "https://example.test/hook",
    events: JSON.stringify(overrides.events ?? ["payment.succeeded"]),
    secret: overrides.secret ?? "whsec_test_secret",
    isActive: overrides.isActive ?? true,
    createdAt: new Date(),
  });
  return id;
}

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function makeFetch(handler: (call: FetchCall) => Response | Promise<Response>): {
  calls: FetchCall[];
  fn: (input: string, init?: RequestInit) => Promise<Response>;
} {
  const calls: FetchCall[] = [];
  return {
    calls,
    fn: async (input: string, init?: RequestInit): Promise<Response> => {
      const call: FetchCall = { url: input, init };
      calls.push(call);
      return handler(call);
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("runDispatcher — happy path", () => {
  beforeEach(async () => {
    await resetTables();
  });

  test("delivers a pending delivery, marks delivered, signs with HMAC", async () => {
    const webhookId = await seedWebhook({ secret: "whsec_hmac_test" });
    const deliveryId = crypto.randomUUID();
    const payload = JSON.stringify({ orderId: "ord_123", amount: 4200 });
    const fixedNow = 1_700_000_000_000;
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      webhookId,
      event: "payment.succeeded",
      payload,
      status: "pending",
      attemptCount: 0,
      nextRetryAt: new Date(fixedNow - 1000),
      createdAt: new Date(fixedNow - 5000),
    });

    const fakeFetch = makeFetch(() => new Response("ok", { status: 200 }));

    const result = await runDispatcher(db, {
      fetchImpl: fakeFetch.fn,
      now: () => fixedNow,
    });

    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(fakeFetch.calls.length).toBe(1);

    const call = fakeFetch.calls[0]!;
    expect(call.url).toBe("https://example.test/hook");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Crontech-Event"]).toBe("payment.succeeded");
    expect(headers["X-Crontech-Delivery"]).toBe(deliveryId);

    // Verify HMAC signature matches the expected value.
    const expectedTimestamp = Math.floor(fixedNow / 1000);
    const expectedSig = await computeSignature(
      "whsec_hmac_test",
      expectedTimestamp,
      payload,
    );
    expect(headers["X-Crontech-Signature"]).toBe(
      `t=${expectedTimestamp},v1=${expectedSig}`,
    );

    // Row should now be `delivered`.
    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, deliveryId));
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe("delivered");
    expect(rows[0]!.lastStatusCode).toBe(200);
    expect(rows[0]!.deliveredAt).not.toBeNull();
  });

  test("future-dated pending rows are skipped", async () => {
    const webhookId = await seedWebhook();
    await db.insert(webhookDeliveries).values({
      id: crypto.randomUUID(),
      webhookId,
      event: "payment.succeeded",
      payload: "{}",
      status: "pending",
      attemptCount: 0,
      nextRetryAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    const fakeFetch = makeFetch(() => new Response("ok", { status: 200 }));
    const result = await runDispatcher(db, { fetchImpl: fakeFetch.fn });
    expect(result.delivered).toBe(0);
    expect(fakeFetch.calls.length).toBe(0);
  });
});

describe("runDispatcher — failure handling", () => {
  beforeEach(async () => {
    await resetTables();
  });

  test("4xx (non-429) response marks delivery failed, no retry", async () => {
    const webhookId = await seedWebhook();
    const deliveryId = crypto.randomUUID();
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      webhookId,
      event: "payment.succeeded",
      payload: "{}",
      status: "pending",
      attemptCount: 0,
      nextRetryAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    });

    const fakeFetch = makeFetch(() => new Response("bad", { status: 400 }));
    const result = await runDispatcher(db, { fetchImpl: fakeFetch.fn });
    expect(result.failed).toBe(1);

    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, deliveryId));
    expect(rows[0]!.status).toBe("failed");
    expect(rows[0]!.lastStatusCode).toBe(400);
  });

  test("5xx response increments attempt_count and schedules retry", async () => {
    const webhookId = await seedWebhook();
    const deliveryId = crypto.randomUUID();
    const startedAt = new Date(Date.now() - 1000);
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      webhookId,
      event: "payment.succeeded",
      payload: "{}",
      status: "pending",
      attemptCount: 0,
      nextRetryAt: startedAt,
      createdAt: new Date(),
    });

    const fakeFetch = makeFetch(() => new Response("boom", { status: 503 }));
    const fixedNow = 2_000_000_000_000;
    await runDispatcher(db, { fetchImpl: fakeFetch.fn, now: () => fixedNow });

    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, deliveryId));
    const row = rows[0]!;
    expect(row.status).toBe("pending");
    expect(row.attemptCount).toBe(1);
    expect(row.lastStatusCode).toBe(503);
    // Backoff[0] = 30s => next_retry_at = fixedNow + 30_000
    expect(row.nextRetryAt.getTime()).toBe(fixedNow + 30_000);
  });

  test("429 is treated as transient and retried", async () => {
    const webhookId = await seedWebhook();
    const deliveryId = crypto.randomUUID();
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      webhookId,
      event: "payment.succeeded",
      payload: "{}",
      status: "pending",
      attemptCount: 0,
      nextRetryAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    });
    const fakeFetch = makeFetch(() => new Response("slow down", { status: 429 }));
    await runDispatcher(db, { fetchImpl: fakeFetch.fn });
    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, deliveryId));
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.attemptCount).toBe(1);
  });

  test("after 5 failed attempts, delivery is marked failed AND parent webhook is deactivated", async () => {
    const webhookId = await seedWebhook();
    const deliveryId = crypto.randomUUID();
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      webhookId,
      event: "payment.succeeded",
      payload: "{}",
      status: "pending",
      attemptCount: 4, // one more failure will hit MAX_ATTEMPTS=5
      nextRetryAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    });
    const fakeFetch = makeFetch(() => new Response("boom", { status: 500 }));
    await runDispatcher(db, { fetchImpl: fakeFetch.fn });

    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, deliveryId));
    expect(rows[0]!.status).toBe("failed");
    expect(rows[0]!.attemptCount).toBe(5);

    const parents = await db
      .select()
      .from(userWebhooks)
      .where(eq(userWebhooks.id, webhookId));
    expect(parents[0]!.isActive).toBe(false);
  });

  test("network error is retried (allSettled contains no unhandled rejections)", async () => {
    const webhookId = await seedWebhook();
    const deliveryId = crypto.randomUUID();
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      webhookId,
      event: "payment.succeeded",
      payload: "{}",
      status: "pending",
      attemptCount: 0,
      nextRetryAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    });
    const fakeFetch = makeFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const result = await runDispatcher(db, { fetchImpl: fakeFetch.fn });
    // One pending retry, not an outright failure.
    expect(result.delivered).toBe(0);
    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, deliveryId));
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.attemptCount).toBe(1);
    expect(rows[0]!.lastError).toContain("ECONNREFUSED");
  });
});

describe("emitWebhook", () => {
  beforeEach(async () => {
    await resetTables();
  });

  test("enqueues a delivery for every matching active subscription", async () => {
    const hookA = await seedWebhook({
      userId: "user-1",
      events: ["payment.succeeded"],
    });
    const hookB = await seedWebhook({
      userId: "user-1",
      events: ["payment.failed"], // should NOT match
    });
    await seedWebhook({
      userId: "user-2",
      events: ["payment.succeeded"], // different user, should NOT match
    });

    const enqueued = await emitWebhook(db, "user-1", "payment.succeeded", {
      orderId: "ord_1",
    });
    expect(enqueued).toBe(1);

    const deliveries = await db.select().from(webhookDeliveries);
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]!.webhookId).toBe(hookA);
    expect(deliveries[0]!.status).toBe("pending");
    expect(deliveries[0]!.event).toBe("payment.succeeded");

    // Sanity: unmatched hook still has zero deliveries.
    const bDeliveries = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, hookB));
    expect(bDeliveries.length).toBe(0);
  });

  test("empty events array acts as wildcard", async () => {
    await seedWebhook({ userId: "user-wild", events: [] });
    const enqueued = await emitWebhook(db, "user-wild", "anything.happened", {});
    expect(enqueued).toBe(1);
  });

  test("inactive webhooks are skipped", async () => {
    await seedWebhook({
      userId: "user-inactive",
      events: ["payment.succeeded"],
      isActive: false,
    });
    const enqueued = await emitWebhook(db, "user-inactive", "payment.succeeded", {});
    expect(enqueued).toBe(0);
  });
});
