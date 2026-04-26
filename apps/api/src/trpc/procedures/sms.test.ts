// ── BLK-030 — SMS tRPC procedure tests ────────────────────────────────
// Exercises the tRPC `sms` router + the `send()` pipeline + the
// inbound webhook app against the test sqlite DB with a mocked Sinch
// client so we never hit the real carrier.
//
// Coverage contract (per BLK-030 brief):
//   1. E.164 validation — bad input at the tRPC boundary bounces with
//      BAD_REQUEST before Sinch is contacted.
//   2. Send happy path — Sinch 201, segment count + markup math runs,
//      row persisted with correct cost + status.
//   3. Sinch 5xx — retries with exponential backoff, then surfaces a
//      BAD_GATEWAY and persists the row as `failed`.
//   4. Markup per-message — retail = wholesale × (1 + markup%) within
//      microdollar precision; matches per-segment pricing.
//   5. Webhook signature verification — valid HMAC accepted, missing
//      or wrong signature returns 401.
//   6. Admin-only number purchase / release — viewers get FORBIDDEN.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import {
  db,
  users,
  sessions,
  scopedDb,
  smsMessages,
  smsNumbers,
  smsWebhookSubscriptions,
  userWebhooks,
  webhookDeliveries,
} from "@back-to-the-future/db";
import { appRouter } from "../router";
import { createSession } from "../../auth/session";
import type { TRPCContext } from "../context";
import { __setSmsTestHooks, __resetSmsTestHooks } from "./sms";
import {
  SinchError,
  segmentSms,
  applyMarkup,
  dollarsToMicrodollars,
  verifySinchSignature,
  type SinchClient,
} from "../../sms/sinch-client";
import { clearSmsRateLimits } from "../../sms/send";
import { createInboundSmsApp } from "../../sms/inbound";

// ── Test harness ──────────────────────────────────────────────────────

function ctxFor(userId: string, sessionToken: string): TRPCContext {
  return {
    db,
    userId,
    sessionToken,
    csrfToken: null,
    scopedDb: scopedDb(db, userId),
  };
}

async function createUser(role: "admin" | "viewer"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `sms-${role}-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}@example.com`,
    displayName: `SMS Test ${role}`,
    role,
  });
  return id;
}

async function cleanupUser(userId: string): Promise<void> {
  await db.delete(smsMessages).where(eq(smsMessages.userId, userId));
  await db.delete(smsNumbers).where(eq(smsNumbers.userId, userId));
  await db
    .delete(smsWebhookSubscriptions)
    .where(eq(smsWebhookSubscriptions.userId, userId));
  await db.delete(webhookDeliveries);
  await db.delete(userWebhooks).where(eq(userWebhooks.userId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

async function attachNumber(userId: string, e164: string): Promise<void> {
  await db.insert(smsNumbers).values({
    id: `smsn_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
    userId,
    e164Number: e164,
    countryCode: "US",
    sinchNumberId: `sinch_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`,
    capabilities: JSON.stringify(["sms"]),
    monthlyCostMicrodollars: 1_000_000,
  });
}

// ── Fake Sinch client ─────────────────────────────────────────────────

interface SinchCallLog {
  send: Array<{ from: string; to: string; body: string }>;
  get: string[];
  list: Array<{ cursor?: string; limit?: number }>;
}

type SendOutcome =
  | { kind: "ok"; id: string; segments?: number; pricePerPart?: string }
  | { kind: "err"; error: Error };

interface FakeClientState {
  log: SinchCallLog;
  /** Queue of outcomes; each call shifts one off. Last one is reused. */
  sendQueue: SendOutcome[];
}

function emptyState(): FakeClientState {
  return {
    log: { send: [], get: [], list: [] },
    sendQueue: [],
  };
}

function makeFakeClient(state: FakeClientState): SinchClient {
  const impl = {
    async sendSms(input: { from: string; to: string; body: string }) {
      state.log.send.push(input);
      const outcome =
        state.sendQueue.length > 0
          ? state.sendQueue.shift()!
          : ({ kind: "ok", id: "sinch-default" } as SendOutcome);
      if (outcome.kind === "err") throw outcome.error;
      const segments = outcome.segments ?? segmentSms(input.body).segments;
      return {
        id: outcome.id,
        from: input.from,
        to: [input.to],
        body: input.body,
        number_of_message_parts: segments,
        price_per_part: {
          amount: outcome.pricePerPart ?? "0.01",
          currency: "USD",
        },
      };
    },
    async getMessage({ messageId }: { messageId: string }) {
      state.log.get.push(messageId);
      return { id: messageId };
    },
    async listMessages(input: { cursor?: string; limit?: number } = {}) {
      state.log.list.push(input);
      return { count: 0, batches: [] };
    },
  };
  return impl as unknown as SinchClient;
}

// ── Suite ─────────────────────────────────────────────────────────────

describe("sms router", () => {
  const createdUsers: string[] = [];
  let state: FakeClientState;
  let savedStripe: string | undefined;

  beforeEach(() => {
    state = emptyState();
    clearSmsRateLimits();
    __setSmsTestHooks({
      clientFactory: () => makeFakeClient(state),
      markupPercent: 30,
      sendOverrides: {
        sleep: async () => {},
        retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 4 },
      },
    });
    savedStripe = process.env["STRIPE_ENABLED"];
  });

  afterEach(async () => {
    __resetSmsTestHooks();
    clearSmsRateLimits();
    if (savedStripe === undefined) delete process.env["STRIPE_ENABLED"];
    else process.env["STRIPE_ENABLED"] = savedStripe;
    for (const id of createdUsers.splice(0)) await cleanupUser(id);
  });

  async function protectedCaller(
    role: "admin" | "viewer" = "viewer",
  ): Promise<{
    caller: ReturnType<typeof appRouter.createCaller>;
    userId: string;
  }> {
    const userId = await createUser(role);
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    return {
      caller: appRouter.createCaller(ctxFor(userId, token)),
      userId,
    };
  }

  // ── 1. E.164 validation ────────────────────────────────────────────

  test("send rejects non-E.164 `to` at the Zod boundary before Sinch is called", async () => {
    const { caller, userId } = await protectedCaller();
    await attachNumber(userId, "+14155550100");

    let caught: unknown;
    try {
      await caller.sms.send({ to: "555-1234", body: "hi" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    // Zod validation error surfaces as BAD_REQUEST from tRPC.
    const code = (caught as { code?: string }).code;
    expect(code).toBe("BAD_REQUEST");
    expect(state.log.send).toHaveLength(0);
  });

  test("send rejects non-E.164 `from` at the Zod boundary", async () => {
    const { caller, userId } = await protectedCaller();
    await attachNumber(userId, "+14155550100");

    let caught: unknown;
    try {
      await caller.sms.send({
        to: "+14155550199",
        body: "hi",
        from: "not-a-number",
      });
    } catch (err) {
      caught = err;
    }
    const code = (caught as { code?: string }).code;
    expect(code).toBe("BAD_REQUEST");
    expect(state.log.send).toHaveLength(0);
  });

  // ── 2. Send happy path ──────────────────────────────────────────────

  test("send dispatches to Sinch and persists a sent row with segments + markup", async () => {
    const { caller, userId } = await protectedCaller();
    await attachNumber(userId, "+14155550100");
    state.sendQueue.push({ kind: "ok", id: "sinch-42", pricePerPart: "0.01" });

    const out = await caller.sms.send({
      to: "+14155550199",
      body: "Hello from Crontech SMS!",
    });

    expect(out.providerMessageId).toBe("sinch-42");
    expect(out.status).toBe("sent");
    expect(out.segments).toBe(1);
    // 1 segment × $0.01 = 10_000 µ$. 30% markup = 3_000. Retail = 13_000.
    expect(out.costMicrodollars).toBe(10_000);
    expect(out.markupMicrodollars).toBe(3_000);
    expect(out.retailMicrodollars).toBe(13_000);

    const rows = await db
      .select()
      .from(smsMessages)
      .where(eq(smsMessages.providerMessageId, "sinch-42"));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.status).toBe("sent");
    expect(row?.userId).toBe(userId);
    expect(row?.fromNumber).toBe("+14155550100");
    expect(row?.toNumber).toBe("+14155550199");
    expect(row?.segments).toBe(1);
    expect(row?.costMicrodollars).toBe(10_000);
    expect(row?.markupMicrodollars).toBe(3_000);
    expect(state.log.send).toHaveLength(1);
  });

  test("send records multi-segment billing when Sinch reports >1 parts", async () => {
    const { caller, userId } = await protectedCaller();
    await attachNumber(userId, "+14155550100");
    state.sendQueue.push({
      kind: "ok",
      id: "sinch-long",
      segments: 3,
      pricePerPart: "0.01",
    });

    const longBody = "A".repeat(400); // 3 GSM-7 segments
    const out = await caller.sms.send({
      to: "+14155550199",
      body: longBody,
    });

    expect(out.segments).toBe(3);
    // 3 × 10_000 = 30_000 µ$ wholesale; 30% = 9_000; retail = 39_000.
    expect(out.costMicrodollars).toBe(30_000);
    expect(out.markupMicrodollars).toBe(9_000);
    expect(out.retailMicrodollars).toBe(39_000);
  });

  // ── 3. Sinch 5xx → BAD_GATEWAY with retry logic ─────────────────────

  test("send retries 5xx with exponential backoff then surfaces BAD_GATEWAY", async () => {
    const { caller, userId } = await protectedCaller();
    await attachNumber(userId, "+14155550100");

    const transient = new SinchError("Upstream carrier busy.", {
      status: 502,
      retryable: true,
    });
    // 3 attempts total → queue 3 failures.
    state.sendQueue.push({ kind: "err", error: transient });
    state.sendQueue.push({ kind: "err", error: transient });
    state.sendQueue.push({ kind: "err", error: transient });

    let caught: unknown;
    try {
      await caller.sms.send({ to: "+14155550199", body: "retry please" });
    } catch (err) {
      caught = err;
    }
    const code = (caught as { code?: string }).code;
    expect(code).toBe("BAD_GATEWAY");

    // Each of the 3 attempts should have been issued.
    expect(state.log.send).toHaveLength(3);

    // Row persisted with status `failed` — customer sees the attempt.
    const rows = await db
      .select()
      .from(smsMessages)
      .where(eq(smsMessages.userId, userId));
    const failed = rows.filter((r) => r.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.errorCode).toBe("502");
  });

  test("send does NOT retry on 4xx from Sinch", async () => {
    const { caller, userId } = await protectedCaller();
    await attachNumber(userId, "+14155550100");
    const hard = new SinchError("Invalid sender number.", {
      status: 400,
      retryable: false,
    });
    state.sendQueue.push({ kind: "err", error: hard });

    let caught: unknown;
    try {
      await caller.sms.send({ to: "+14155550199", body: "nope" });
    } catch (err) {
      caught = err;
    }
    const code = (caught as { code?: string }).code;
    expect(code).toBe("BAD_GATEWAY");
    expect(state.log.send).toHaveLength(1);
  });

  // ── 4. Markup math — isolated unit tests ────────────────────────────

  test("applyMarkup computes retail + markup per segment", () => {
    const { retailMicrodollars, markupMicrodollars } = applyMarkup(10_000, 30);
    expect(markupMicrodollars).toBe(3_000);
    expect(retailMicrodollars).toBe(13_000);
  });

  test("dollarsToMicrodollars handles string + number inputs", () => {
    expect(dollarsToMicrodollars("0.01")).toBe(10_000);
    expect(dollarsToMicrodollars(0.01)).toBe(10_000);
    expect(dollarsToMicrodollars(undefined)).toBe(0);
    expect(dollarsToMicrodollars("-1")).toBe(0);
  });

  test("segmentSms counts GSM-7 and UCS-2 correctly", () => {
    expect(segmentSms("hello").segments).toBe(1);
    expect(segmentSms("A".repeat(160)).segments).toBe(1);
    expect(segmentSms("A".repeat(161)).segments).toBe(2);
    // Emoji forces UCS-2 → 70-char single-segment limit.
    const emoji = "🚀";
    expect(segmentSms(emoji).encoding).toBe("ucs2");
  });

  // ── 5. Webhook signature verification ───────────────────────────────

  test("verifySinchSignature accepts a correctly-signed payload and rejects tampered ones", async () => {
    const { createHmac } = await import("node:crypto");
    const secret = "test-webhook-secret";
    const rawBody = JSON.stringify({
      id: "mo-1",
      from: "+14155550123",
      to: "+14155550100",
      body: "hi",
    });
    const signature = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    expect(
      await verifySinchSignature({ rawBody, provided: signature, secret }),
    ).toBe(true);
    expect(
      await verifySinchSignature({
        rawBody,
        provided: `sha256=${signature}`,
        secret,
      }),
    ).toBe(true);
    expect(
      await verifySinchSignature({
        rawBody,
        provided: "not-the-signature",
        secret,
      }),
    ).toBe(false);
    expect(
      await verifySinchSignature({ rawBody, provided: null, secret }),
    ).toBe(false);
  });

  test("inbound webhook returns 401 for bad signatures, 200 for valid ones, and persists the row", async () => {
    const userId = await createUser("viewer");
    createdUsers.push(userId);
    const e164 = "+14155550177";
    await attachNumber(userId, e164);

    const secret = "inbound-test-secret";
    const app = createInboundSmsApp({ db, getSecret: () => secret });

    const rawBody = JSON.stringify({
      id: "mo-42",
      from: "+14155550123",
      to: e164,
      body: "Hello Crontech",
    });
    const { createHmac } = await import("node:crypto");
    const signature = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    // Bad signature → 401.
    const bad = await app.request("/sms/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sinch-signature": "wrong",
      },
      body: rawBody,
    });
    expect(bad.status).toBe(401);

    // Missing signature → 401.
    const missing = await app.request("/sms/inbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    });
    expect(missing.status).toBe(401);

    // Valid signature → 200 + row persisted.
    const ok = await app.request("/sms/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sinch-signature": signature,
      },
      body: rawBody,
    });
    expect(ok.status).toBe(200);
    const rows = await db
      .select()
      .from(smsMessages)
      .where(eq(smsMessages.providerMessageId, "mo-42"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.direction).toBe("receive");
    expect(rows[0]?.status).toBe("received");
    expect(rows[0]?.fromNumber).toBe("+14155550123");
    expect(rows[0]?.toNumber).toBe(e164);
  });

  test("inbound webhook enqueues a webhook_deliveries row when a subscription exists", async () => {
    const userId = await createUser("viewer");
    createdUsers.push(userId);
    const e164 = "+14155550178";
    await attachNumber(userId, e164);
    await db.insert(smsWebhookSubscriptions).values({
      id: `sub_${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`,
      userId,
      e164Number: e164,
      customerWebhookUrl: "https://example.com/sms",
      hmacSecret: "customer-secret",
      events: JSON.stringify(["inbound"]),
    });

    const secret = "inbound-test-secret-2";
    const app = createInboundSmsApp({ db, getSecret: () => secret });
    const rawBody = JSON.stringify({
      id: "mo-55",
      from: "+14155550123",
      to: e164,
      body: "Fanout me",
    });
    const { createHmac } = await import("node:crypto");
    const signature = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    const res = await app.request("/sms/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sinch-signature": signature,
      },
      body: rawBody,
    });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      webhookFanOut?: { enqueued?: number };
    };
    expect(payload.webhookFanOut?.enqueued).toBe(1);

    const deliveries = await db.select().from(webhookDeliveries);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    const sms = deliveries.find((d) => d.event === "sms.inbound");
    expect(sms).toBeDefined();
  });

  // ── 6. Admin-only purchase / release ────────────────────────────────

  test("buyNumber rejects viewers with FORBIDDEN", async () => {
    process.env["STRIPE_ENABLED"] = "true";
    const { caller } = await protectedCaller("viewer");
    let caught: unknown;
    try {
      await caller.sms.buyNumber({ countryCode: "US" });
    } catch (err) {
      caught = err;
    }
    const code = (caught as { code?: string }).code;
    expect(code).toBe("FORBIDDEN");
  });

  test("buyNumber refuses while billing is pre-launch (SERVICE_UNAVAILABLE)", async () => {
    delete process.env["STRIPE_ENABLED"];
    const { caller } = await protectedCaller("admin");
    let caught: unknown;
    try {
      await caller.sms.buyNumber({ countryCode: "US" });
    } catch (err) {
      caught = err;
    }
    const code = (caught as { code?: string }).code;
    expect(code).toBe("SERVICE_UNAVAILABLE");
  });

  test("admin buyNumber + releaseNumber round-trips a number row", async () => {
    process.env["STRIPE_ENABLED"] = "true";
    const { caller, userId } = await protectedCaller("admin");
    __setSmsTestHooks({
      clientFactory: () => makeFakeClient(state),
      markupPercent: 30,
      buyNumberImpl: async () => ({
        id: `smsn_${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`,
        e164Number: "+14155550123",
        sinchNumberId: "sinch-num-xyz",
        monthlyCostMicrodollars: 1_300_000,
      }),
    });

    const bought = await caller.sms.buyNumber({ countryCode: "US" });
    expect(bought.e164Number).toBe("+14155550123");
    expect(bought.monthlyCostMicrodollars).toBe(1_300_000);

    const released = await caller.sms.releaseNumber({ id: bought.id });
    expect(released.e164Number).toBe("+14155550123");
    expect(released.alreadyReleased).toBe(false);

    const rows = await db
      .select()
      .from(smsNumbers)
      .where(eq(smsNumbers.userId, userId));
    expect(rows[0]?.releasedAt).not.toBeNull();
  });

  test("releaseNumber rejects viewers with FORBIDDEN", async () => {
    const { caller } = await protectedCaller("viewer");
    let caught: unknown;
    try {
      await caller.sms.releaseNumber({ id: "smsn_nope" });
    } catch (err) {
      caught = err;
    }
    const code = (caught as { code?: string }).code;
    expect(code).toBe("FORBIDDEN");
  });

  // ── 7. listNumbers / listMessages / getMessage wire-checks ──────────

  test("listMessages returns only the caller's rows", async () => {
    const { caller, userId } = await protectedCaller();
    await attachNumber(userId, "+14155550100");
    state.sendQueue.push({ kind: "ok", id: "hello-1" });
    state.sendQueue.push({ kind: "ok", id: "hello-2" });
    await caller.sms.send({ to: "+14155550199", body: "one" });
    await caller.sms.send({ to: "+14155550199", body: "two" });

    const list = await caller.sms.listMessages({});
    expect(list.messages.length).toBe(2);
    // Both sends ordered by createdAt — SQLite integer timestamps resolve
    // to the second, so we don't assert on ordering within a 1s window.
    const bodies = list.messages.map((m) => m.body).sort();
    expect(bodies).toEqual(["one", "two"]);
  });

  test("listNumbers exposes parsed capabilities", async () => {
    const { caller, userId } = await protectedCaller();
    await attachNumber(userId, "+14155550100");
    const list = await caller.sms.listNumbers();
    expect(list[0]?.e164Number).toBe("+14155550100");
    expect(list[0]?.capabilities).toContain("sms");
  });

  test("getMessage rejects cross-user reads with NOT_FOUND", async () => {
    const { caller, userId } = await protectedCaller();
    await attachNumber(userId, "+14155550100");
    state.sendQueue.push({ kind: "ok", id: "secret-msg" });
    const sent = await caller.sms.send({ to: "+14155550199", body: "private" });

    const { caller: other } = await protectedCaller();
    let caught: unknown;
    try {
      await other.sms.getMessage({ id: sent.id });
    } catch (err) {
      caught = err;
    }
    const code = (caught as { code?: string }).code;
    expect(code).toBe("NOT_FOUND");
  });
});
