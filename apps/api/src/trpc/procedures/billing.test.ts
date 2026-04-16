// Pre-launch Stripe disable — verifies the billing procedures that
// CREATE payments return a SERVICE_UNAVAILABLE error whenever the
// STRIPE_ENABLED env flag is not "true". Authorised by Craig on
// 16 Apr 2026. Webhook handlers intentionally NOT tested here — they
// must stay unguarded.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, users, sessions, scopedDb } from "@back-to-the-future/db";
import { appRouter } from "../router";
import { createSession } from "../../auth/session";
import type { TRPCContext } from "../context";

function ctxFor(userId: string, sessionToken: string): TRPCContext {
  return {
    db,
    userId,
    sessionToken,
    csrfToken: null,
    scopedDb: scopedDb(db, userId),
  };
}

async function createTestUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `billing-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    displayName: "Billing Test User",
  });
  return id;
}

async function cleanupTestUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

describe("billing pre-launch guard", () => {
  let userId: string;
  let token: string;
  let savedFlag: string | undefined;

  beforeEach(async () => {
    savedFlag = process.env["STRIPE_ENABLED"];
    // Default disabled posture — the actual scenario we run in pre-launch.
    delete process.env["STRIPE_ENABLED"];
    userId = await createTestUser();
    token = await createSession(userId, db);
  });

  afterEach(async () => {
    if (savedFlag === undefined) delete process.env["STRIPE_ENABLED"];
    else process.env["STRIPE_ENABLED"] = savedFlag;
    await cleanupTestUser(userId);
  });

  test("createCheckoutSession is blocked when STRIPE_ENABLED is unset", async () => {
    const caller = appRouter.createCaller(ctxFor(userId, token));
    let threw = false;
    try {
      await caller.billing.createCheckoutSession({ priceId: "price_test_pro" });
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("pre-launch");
    }
    expect(threw).toBe(true);
  });

  test("createCheckoutSession is blocked when STRIPE_ENABLED !== 'true'", async () => {
    process.env["STRIPE_ENABLED"] = "false";
    const caller = appRouter.createCaller(ctxFor(userId, token));
    let threw = false;
    try {
      await caller.billing.createCheckoutSession({ priceId: "price_test_pro" });
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("Billing is not yet operational");
    }
    expect(threw).toBe(true);
  });

  test("createPortalSession is blocked when STRIPE_ENABLED is unset", async () => {
    const caller = appRouter.createCaller(ctxFor(userId, token));
    let threw = false;
    try {
      await caller.billing.createPortalSession({ customerId: "cus_test_123" });
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("pre-launch");
    }
    expect(threw).toBe(true);
  });

  test("getPlans remains callable in pre-launch (read-only)", async () => {
    // Read-only procedures are not gated — users can still see what's
    // coming, they just cannot check out until billing re-enables.
    const caller = appRouter.createCaller(ctxFor(userId, token));
    const plans = await caller.billing.getPlans();
    expect(Array.isArray(plans)).toBe(true);
  });

  test("getSubscription remains callable in pre-launch (read-only)", async () => {
    const caller = appRouter.createCaller(ctxFor(userId, token));
    const sub = await caller.billing.getSubscription();
    expect(sub).toBeDefined();
    expect(typeof sub.plan).toBe("string");
  });
});
