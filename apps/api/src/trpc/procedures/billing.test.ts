// Pre-launch Stripe disable — verifies the billing procedures that
// CREATE payments return a SERVICE_UNAVAILABLE error whenever the
// STRIPE_ENABLED env flag is not "true". Authorised by Craig on
// 16 Apr 2026. Webhook handlers intentionally NOT tested here — they
// must stay unguarded.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import {
  db,
  users,
  sessions,
  scopedDb,
  billingAccounts,
  buildMinutesUsage,
  deployments,
  projects,
} from "@back-to-the-future/db";
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
    email: `billing-test-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}@example.com`,
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

// ── BLK-010: getCurrentUsage (protected, no env gating) ────────────

describe("BLK-010: billing.getCurrentUsage", () => {
  let userId: string;
  let token: string;
  let projectId: string;
  let deploymentId1: string;
  let deploymentId2: string;

  beforeEach(async () => {
    userId = await createTestUser();
    token = await createSession(userId, db);

    projectId = crypto.randomUUID();
    await db.insert(projects).values({
      id: projectId,
      userId,
      name: "BLK-010 usage test project",
      slug: `blk010-usage-${projectId.slice(0, 8)}`,
      framework: "solidstart",
    });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(1, 0, 0, 0);

    deploymentId1 = crypto.randomUUID();
    deploymentId2 = crypto.randomUUID();

    await db.insert(deployments).values([
      {
        id: deploymentId1,
        userId,
        projectId,
        status: "live",
        createdAt: monthStart,
      },
      {
        id: deploymentId2,
        userId,
        projectId,
        status: "live",
        createdAt: monthStart,
      },
    ]);

    // Seed two usage rows inside the current month.
    await db.insert(buildMinutesUsage).values([
      {
        id: crypto.randomUUID(),
        userId,
        deploymentId: deploymentId1,
        minutesUsed: 1.5,
        recordedAt: monthStart,
        reportedToStripeAt: null,
      },
      {
        id: crypto.randomUUID(),
        userId,
        deploymentId: deploymentId2,
        minutesUsed: 2.25,
        recordedAt: monthStart,
        reportedToStripeAt: null,
      },
    ]);
  });

  afterEach(async () => {
    await db
      .delete(buildMinutesUsage)
      .where(eq(buildMinutesUsage.userId, userId));
    await db.delete(deployments).where(eq(deployments.userId, userId));
    await db.delete(projects).where(eq(projects.userId, userId));
    await cleanupTestUser(userId);
  });

  test("returns total build minutes for the current month (sum of usage rows)", async () => {
    const caller = appRouter.createCaller(ctxFor(userId, token));
    const result = await caller.billing.getCurrentUsage();
    expect(result).toBeDefined();
    expect(result.buildMinutesThisMonth).toBeCloseTo(3.75, 5);
  });

  test("returns the count of deployments the user has ever shipped", async () => {
    const caller = appRouter.createCaller(ctxFor(userId, token));
    const result = await caller.billing.getCurrentUsage();
    expect(result.deploymentCount).toBe(2);
  });

  test("unauthenticated callers cannot read usage (protected procedure)", async () => {
    // Build a context with no session → protectedProcedure must reject.
    const anonCtx: TRPCContext = {
      db,
      userId: null,
      sessionToken: null,
      csrfToken: null,
      scopedDb: null,
    };
    const caller = appRouter.createCaller(anonCtx);
    let threw = false;
    try {
      await caller.billing.getCurrentUsage();
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message.toLowerCase()).toMatch(/unauthor|forbid|session|logged in/);
    }
    expect(threw).toBe(true);
  });
});

// ── BLK-010: getPortalUrl (admin-only, flag-gated) ─────────────────

describe("BLK-010: billing.getPortalUrl", () => {
  let userId: string;
  let token: string;
  let savedFlag: string | undefined;

  beforeEach(async () => {
    savedFlag = process.env["STRIPE_ENABLED"];
    delete process.env["STRIPE_ENABLED"];
    userId = await createTestUser();
    // Promote to admin so the adminProcedure passes.
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, userId));
    token = await createSession(userId, db);
  });

  afterEach(async () => {
    if (savedFlag === undefined) delete process.env["STRIPE_ENABLED"];
    else process.env["STRIPE_ENABLED"] = savedFlag;
    await db.delete(billingAccounts).where(eq(billingAccounts.userId, userId));
    await cleanupTestUser(userId);
  });

  test("throws SERVICE_UNAVAILABLE when STRIPE_ENABLED is unset", async () => {
    const caller = appRouter.createCaller(ctxFor(userId, token));
    let threw = false;
    try {
      await caller.billing.getPortalUrl({
        returnUrl: "https://crontech.ai/dashboard",
      });
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("pre-launch");
    }
    expect(threw).toBe(true);
  });

  test("throws PRECONDITION_FAILED when the admin has no billing_accounts row", async () => {
    process.env["STRIPE_ENABLED"] = "true";
    const caller = appRouter.createCaller(ctxFor(userId, token));
    let threw = false;
    try {
      await caller.billing.getPortalUrl({
        returnUrl: "https://crontech.ai/dashboard",
      });
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("No Stripe Customer on file");
    }
    expect(threw).toBe(true);
  });

  test("non-admin callers are rejected by adminProcedure middleware", async () => {
    process.env["STRIPE_ENABLED"] = "true";
    // Demote the user and retry.
    await db
      .update(users)
      .set({ role: "viewer" })
      .where(eq(users.id, userId));
    const caller = appRouter.createCaller(ctxFor(userId, token));
    let threw = false;
    try {
      await caller.billing.getPortalUrl({
        returnUrl: "https://crontech.ai/dashboard",
      });
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message.toLowerCase()).toContain("admin");
    }
    expect(threw).toBe(true);
  });
});
