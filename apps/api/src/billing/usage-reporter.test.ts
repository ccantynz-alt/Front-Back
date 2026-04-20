/**
 * BLK-010 — Usage Reporter Tests
 *
 * Exercises the Stripe-usage push loop at
 * `apps/api/src/billing/usage-reporter.ts`.
 *
 * Mocking strategy mirrors `apps/api/src/stripe/webhooks.test.ts`: we
 * mock the Stripe SDK at the `./stripe/client::getStripe` boundary so
 * the reporter never makes a real Stripe API call in CI. The DB is the
 * real test DB (wiped + re-migrated in `apps/api/test/setup.ts`), so
 * every usage_events / usage_reports / subscriptions persistence path
 * is exercised end-to-end against the real Drizzle schema.
 *
 * Coverage:
 *   - Happy path: records a delta-based usage record, inserts a new
 *     usage_reports row, marks status="pushed".
 *   - Idempotency: a second run with no new events is a no-op (no
 *     Stripe call, status="noop").
 *   - Delta-only: recording more usage pushes only the increment.
 *   - Failure path: a Stripe error on one event type yields
 *     status="failed" but leaves the DB unchanged so the next run
 *     retries cleanly.
 *   - Pre-launch guard: STRIPE_ENABLED !== "true" is a hard no-op.
 *   - Unmapped price: eventType not in STRIPE_USAGE_PRICE_MAP is
 *     skipped without touching Stripe.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import { and, eq } from "drizzle-orm";
import {
  db,
  subscriptions,
  usageEvents,
  usageReports,
  users,
} from "@back-to-the-future/db";
import { priceMapFromEnv } from "./usage-reporter";

// ── Stripe SDK Boundary Mock ──────────────────────────────────────
//
// The reporter does two things against Stripe:
//   1. `subscriptions.retrieve(id)` to resolve price → item id map
//   2. `subscriptionItems.createUsageRecord(itemId, params)` to push
//
// Both are mocked. Tests override `mockRetrieveImpl` / `mockCreateImpl`
// before each case to simulate Stripe state changes or outages.

let retrieveCalls: Array<string> = [];
let createCalls: Array<{ itemId: string; params: unknown }> = [];

type RetrieveImpl = (id: string) => Promise<{
  id: string;
  items: { data: Array<{ id: string; price: { id: string } }> };
}>;
type CreateImpl = (
  itemId: string,
  params: { quantity: number; action?: string; timestamp?: number | "now" },
) => Promise<{ id: string }>;

let mockRetrieveImpl: RetrieveImpl = async (id) => ({
  id,
  items: { data: [] },
});
let mockCreateImpl: CreateImpl = async () => ({
  id: `ur_default_${Math.random().toString(36).slice(2, 8)}`,
});

await mock.module("../stripe/client", () => ({
  getStripe: () => ({
    subscriptions: {
      retrieve: async (id: string) => {
        retrieveCalls.push(id);
        return mockRetrieveImpl(id);
      },
    },
    subscriptionItems: {
      createUsageRecord: async (
        itemId: string,
        params: {
          quantity: number;
          action?: string;
          timestamp?: number | "now";
        },
      ) => {
        createCalls.push({ itemId, params });
        return mockCreateImpl(itemId, params);
      },
    },
  }),
}));

// Dynamic import AFTER mock.module so the reporter picks up the mocked
// client. Mirrors the webhooks.test.ts pattern.
const { reportUsageForUser } = await import("./usage-reporter");

// ── Test Fixtures ─────────────────────────────────────────────────

const BUILD_PRICE = "price_test_build_meter";
const TOKENS_PRICE = "price_test_tokens_meter";
const BUILD_ITEM = "si_test_build";
const TOKENS_ITEM = "si_test_tokens";

async function createTestUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `usage-reporter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    displayName: "Usage Reporter Test",
  });
  return id;
}

async function seedSubscription(userId: string): Promise<void> {
  await db.insert(subscriptions).values({
    id: crypto.randomUUID(),
    userId,
    stripeCustomerId: "cus_test_usage",
    stripeSubscriptionId: "sub_test_usage",
    stripePriceId: BUILD_PRICE,
    status: "active",
    currentPeriodStart: new Date(1_700_000_000 * 1000),
    currentPeriodEnd: new Date(1_702_592_000 * 1000),
    cancelAtPeriodEnd: false,
  });
}

async function cleanup(userId: string): Promise<void> {
  await db.delete(usageReports).where(eq(usageReports.userId, userId));
  await db.delete(usageEvents).where(eq(usageEvents.userId, userId));
  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

function setPriceMap(value: string | null): void {
  if (value === null) delete process.env["STRIPE_USAGE_PRICE_MAP"];
  else process.env["STRIPE_USAGE_PRICE_MAP"] = value;
}

/** Insert a raw usage_events row directly so we don't depend on the
 *  recordUsage helper's extra validation / side effects in this file. */
async function recordEvent(
  userId: string,
  eventType: "build" | "ai_tokens",
  quantity: number,
  month: string,
): Promise<void> {
  await db.insert(usageEvents).values({
    id: crypto.randomUUID(),
    userId,
    projectId: null,
    eventType,
    quantity,
    unit: eventType === "build" ? "minutes" : "tokens",
    metadata: null,
    occurredAt: new Date(),
    billingMonth: month,
  });
}

// ── Pure helper tests ──────────────────────────────────────────────

describe("priceMapFromEnv", () => {
  test("parses a two-entry env value", () => {
    const map = priceMapFromEnv("build=price_a,ai_tokens=price_b");
    expect(map.build).toBe("price_a");
    expect(map.ai_tokens).toBe("price_b");
  });

  test("ignores unknown event types", () => {
    const map = priceMapFromEnv("build=price_a,bogus=price_x");
    expect(map.build).toBe("price_a");
    expect((map as Record<string, string>)["bogus"]).toBeUndefined();
  });

  test("empty string yields an empty map", () => {
    expect(Object.keys(priceMapFromEnv(""))).toHaveLength(0);
  });

  test("undefined yields an empty map", () => {
    expect(Object.keys(priceMapFromEnv(undefined))).toHaveLength(0);
  });
});

// ── Integration tests ──────────────────────────────────────────────

describe("reportUsageForUser", () => {
  let userId: string;
  let savedFlag: string | undefined;
  let savedPriceMap: string | undefined;

  beforeAll(() => {
    // Default retrieve returns a subscription with both build + tokens
    // subscription items. Individual tests can override if needed.
    mockRetrieveImpl = async (id) => ({
      id,
      items: {
        data: [
          { id: BUILD_ITEM, price: { id: BUILD_PRICE } },
          { id: TOKENS_ITEM, price: { id: TOKENS_PRICE } },
        ],
      },
    });
  });

  beforeEach(async () => {
    savedFlag = process.env["STRIPE_ENABLED"];
    savedPriceMap = process.env["STRIPE_USAGE_PRICE_MAP"];
    process.env["STRIPE_ENABLED"] = "true";
    setPriceMap(
      `build=${BUILD_PRICE},ai_tokens=${TOKENS_PRICE}`,
    );
    retrieveCalls = [];
    createCalls = [];
    mockCreateImpl = async () => ({
      id: `ur_${Math.random().toString(36).slice(2, 10)}`,
    });
    userId = await createTestUser();
    await seedSubscription(userId);
  });

  afterEach(async () => {
    if (savedFlag === undefined) delete process.env["STRIPE_ENABLED"];
    else process.env["STRIPE_ENABLED"] = savedFlag;
    if (savedPriceMap === undefined)
      delete process.env["STRIPE_USAGE_PRICE_MAP"];
    else process.env["STRIPE_USAGE_PRICE_MAP"] = savedPriceMap;
    await cleanup(userId);
  });

  test("pushes delta to Stripe on first report, inserts usage_reports row", async () => {
    const month = "2026-04";
    await recordEvent(userId, "build", 12, month);
    await recordEvent(userId, "build", 3, month);

    const outcome = await reportUsageForUser(userId, month);

    expect(outcome.ok).toBe(true);
    expect(outcome.results.length).toBe(4); // all event types considered

    const buildResult = outcome.results.find((r) => r.eventType === "build");
    expect(buildResult).toBeDefined();
    expect(buildResult!.status).toBe("pushed");
    expect(buildResult!.delta).toBe(15);
    expect(buildResult!.quantity).toBe(15);
    expect(buildResult!.subscriptionItemId).toBe(BUILD_ITEM);

    // Stripe was called exactly once for build (ai_tokens had no events
    // so delta=0 → noop, no Stripe call). Other unmapped types (request,
    // storage) short-circuit at the mapping check.
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]!.itemId).toBe(BUILD_ITEM);
    expect(
      (createCalls[0]!.params as { quantity: number }).quantity,
    ).toBe(15);

    const row = await db.query.usageReports.findFirst({
      where: and(
        eq(usageReports.userId, userId),
        eq(usageReports.billingMonth, month),
        eq(usageReports.eventType, "build"),
      ),
    });
    expect(row).toBeDefined();
    expect(row!.reportedQuantity).toBe(15);
    expect(row!.stripeSubscriptionItemId).toBe(BUILD_ITEM);
    expect(row!.lastStripeUsageRecordId).toBeTruthy();
  });

  test("second run with no new events is a noop (no Stripe call)", async () => {
    const month = "2026-04";
    await recordEvent(userId, "build", 10, month);

    await reportUsageForUser(userId, month);
    expect(createCalls).toHaveLength(1);

    createCalls = [];
    const second = await reportUsageForUser(userId, month);
    const buildResult = second.results.find((r) => r.eventType === "build");
    expect(buildResult!.status).toBe("noop");
    expect(buildResult!.delta).toBe(0);
    expect(createCalls).toHaveLength(0);
  });

  test("incremental usage pushes only the delta on the second report", async () => {
    const month = "2026-04";
    await recordEvent(userId, "build", 10, month);
    await reportUsageForUser(userId, month);

    // Add another 7 minutes of build usage, re-run.
    await recordEvent(userId, "build", 7, month);
    createCalls = [];
    const second = await reportUsageForUser(userId, month);

    const buildResult = second.results.find((r) => r.eventType === "build");
    expect(buildResult!.status).toBe("pushed");
    expect(buildResult!.delta).toBe(7);
    expect(buildResult!.quantity).toBe(17);

    expect(createCalls).toHaveLength(1);
    expect(
      (createCalls[0]!.params as { quantity: number }).quantity,
    ).toBe(7);

    const row = await db.query.usageReports.findFirst({
      where: and(
        eq(usageReports.userId, userId),
        eq(usageReports.billingMonth, month),
        eq(usageReports.eventType, "build"),
      ),
    });
    expect(row!.reportedQuantity).toBe(17);
  });

  test("Stripe failure leaves local state untouched so the next run retries cleanly", async () => {
    const month = "2026-04";
    await recordEvent(userId, "build", 25, month);

    mockCreateImpl = async () => {
      throw new Error("stripe_unavailable");
    };

    const outcome = await reportUsageForUser(userId, month);
    expect(outcome.ok).toBe(false);
    const buildResult = outcome.results.find((r) => r.eventType === "build");
    expect(buildResult!.status).toBe("failed");
    expect(buildResult!.reason).toContain("stripe_unavailable");

    // DB was NOT updated — the next run should see reportedQuantity=0
    // (no row inserted) and push the full 25 again.
    const row = await db.query.usageReports.findFirst({
      where: and(
        eq(usageReports.userId, userId),
        eq(usageReports.billingMonth, month),
        eq(usageReports.eventType, "build"),
      ),
    });
    expect(row).toBeUndefined();

    // Swap in a working Stripe mock. The retry should push 25.
    mockCreateImpl = async () => ({ id: "ur_after_recovery" });
    createCalls = [];
    const retry = await reportUsageForUser(userId, month);
    expect(retry.ok).toBe(true);
    const retryBuild = retry.results.find((r) => r.eventType === "build");
    expect(retryBuild!.status).toBe("pushed");
    expect(retryBuild!.delta).toBe(25);
    expect(createCalls).toHaveLength(1);
  });

  test("pre-launch guard: STRIPE_ENABLED !== 'true' is a no-op (no Stripe calls)", async () => {
    delete process.env["STRIPE_ENABLED"];
    const month = "2026-04";
    await recordEvent(userId, "build", 99, month);

    const outcome = await reportUsageForUser(userId, month);
    expect(outcome.ok).toBe(true);
    expect(outcome.skipped).toBe("billing-disabled");
    expect(outcome.results).toHaveLength(0);
    expect(retrieveCalls).toHaveLength(0);
    expect(createCalls).toHaveLength(0);
  });

  test("eventType with no price mapping is skipped cleanly", async () => {
    // Drop tokens from the map. A recorded ai_tokens event must yield
    // status="skipped" with reason="no-price-mapping" and NOT error.
    setPriceMap(`build=${BUILD_PRICE}`);
    const month = "2026-04";
    await recordEvent(userId, "ai_tokens", 500, month);

    const outcome = await reportUsageForUser(userId, month);
    const tokens = outcome.results.find((r) => r.eventType === "ai_tokens");
    expect(tokens!.status).toBe("skipped");
    expect(tokens!.reason).toBe("no-price-mapping");
    expect(tokens!.quantity).toBe(500);
    expect(createCalls).toHaveLength(0);
  });
});
