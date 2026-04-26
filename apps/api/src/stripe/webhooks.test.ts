// ── Stripe Webhook Handler Tests ──────────────────────────────────
//
// Covers the four Stripe event types the platform dispatches:
//   - checkout.session.completed
//   - customer.subscription.updated
//   - invoice.payment_succeeded
//   - invoice.payment_failed
//
// Plus idempotency: the same Stripe event delivered twice (Stripe
// retries webhooks on non-2xx responses, so double-delivery is not
// hypothetical) must not produce duplicate subscription or payment
// rows.
//
// Mocking strategy: Stripe is mocked at the SDK boundary
// (`./client::getStripe`). Handlers never make real Stripe API calls
// from tests. The DB is the real test DB (wiped + re-migrated in
// apps/api/test/setup.ts), so subscription/payment persistence is
// exercised end-to-end against the real Drizzle schema.

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import {
  db,
  users,
  subscriptions,
  payments,
  billingAccounts,
  billingEvents,
} from "@back-to-the-future/db";

// ── Stripe SDK Boundary Mock ──────────────────────────────────────
//
// handleCheckoutCompleted calls `getStripe().subscriptions.retrieve(id)`
// to fetch the full subscription after the checkout session fires.
// Mock returns a canned Stripe.Subscription object keyed off the id
// the test passes in. Tests override `mockSubscription` before each
// case so each scenario can set status / period / cancel flags.

let mockSubscription: Partial<Stripe.Subscription> = {};

await mock.module("./client", () => ({
  getStripe: () => ({
    subscriptions: {
      retrieve: async (id: string) => ({
        id,
        customer: mockSubscription.customer ?? "cus_test_default",
        status: mockSubscription.status ?? "active",
        cancel_at_period_end: mockSubscription.cancel_at_period_end ?? false,
        current_period_start:
          mockSubscription.current_period_start ?? 1_700_000_000,
        current_period_end:
          mockSubscription.current_period_end ?? 1_702_592_000,
        items: mockSubscription.items ?? {
          data: [{ price: { id: "price_test_pro" } }],
        },
      }),
    },
  }),
  // Preserve the BLK-010 exports so downstream imports (e.g. billing router
  // loading in a later test file) don't see the module missing its API.
  isStripeEnabled: () =>
    process.env["STRIPE_ENABLED"] === "true" ||
    process.env["STRIPE_ENABLED"] === "1",
  createPortalSession: async (
    _stripeCustomerId: string,
    _returnUrl: string,
  ): Promise<string> => {
    throw new Error("createPortalSession mock should not be hit in this test");
  },
}));

// Dynamic import AFTER mock.module so the handler picks up the mocked
// client. Top-level `await mock.module` + dynamic import is the Bun
// Test pattern for module-level substitution.
const { handleWebhookEvent } = await import("./webhooks");

// ── Test Fixtures ─────────────────────────────────────────────────

async function createTestUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `stripe-test-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}@example.com`,
    displayName: "Stripe Test User",
  });
  return id;
}

async function cleanupUser(userId: string): Promise<void> {
  await db.delete(payments).where(eq(payments.userId, userId));
  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
  await db.delete(billingAccounts).where(eq(billingAccounts.userId, userId));
  // billing_events rows FK with ON DELETE SET NULL, so they outlive users
  // in general. We wipe by user here for hygienic per-test isolation.
  await db.delete(billingEvents).where(eq(billingEvents.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

/** Build a minimally-shaped Stripe.Event for the handler. */
function buildEvent<T>(
  type: Stripe.Event.Type,
  data: T,
  eventId = `evt_test_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`,
): Stripe.Event {
  return {
    id: eventId,
    api_version: "2025-02-24.acacia",
    created: Math.floor(Date.now() / 1000),
    data: { object: data as unknown as Stripe.Event.Data.Object },
    livemode: false,
    object: "event",
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
  } as unknown as Stripe.Event;
}

// ── Tests ─────────────────────────────────────────────────────────

describe("Stripe webhook: checkout.session.completed", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createTestUser();
    mockSubscription = {
      status: "active",
      cancel_at_period_end: false,
      current_period_start: 1_700_000_000,
      current_period_end: 1_702_592_000,
      customer: "cus_test_123",
      items: {
        data: [{ price: { id: "price_test_pro" } }],
      } as Stripe.Subscription["items"],
    };
  });

  afterEach(async () => {
    await cleanupUser(userId);
  });

  test("creates a subscription row tied to client_reference_id (payment intent / checkout)", async () => {
    const event = buildEvent<Partial<Stripe.Checkout.Session>>(
      "checkout.session.completed",
      {
        id: "cs_test_create_sub",
        subscription: "sub_test_new_1",
        customer: "cus_test_123",
        client_reference_id: userId,
        metadata: {},
      },
    );

    await handleWebhookEvent(event);

    const row = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, "sub_test_new_1"),
    });
    expect(row).toBeDefined();
    expect(row!.userId).toBe(userId);
    expect(row!.stripeCustomerId).toBe("cus_test_123");
    expect(row!.stripePriceId).toBe("price_test_pro");
    expect(row!.status).toBe("active");
    expect(row!.cancelAtPeriodEnd).toBe(false);
  });

  test("falls back to metadata.userId when client_reference_id is missing", async () => {
    const event = buildEvent<Partial<Stripe.Checkout.Session>>(
      "checkout.session.completed",
      {
        id: "cs_test_metadata_userid",
        subscription: "sub_test_new_2",
        customer: "cus_test_123",
        client_reference_id: null,
        metadata: { userId },
      },
    );

    await handleWebhookEvent(event);

    const row = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, "sub_test_new_2"),
    });
    expect(row).toBeDefined();
    expect(row!.userId).toBe(userId);
  });

  test("is idempotent: the same event delivered twice leaves one row (on-conflict-do-update)", async () => {
    const event = buildEvent<Partial<Stripe.Checkout.Session>>(
      "checkout.session.completed",
      {
        id: "cs_test_idempotent",
        subscription: "sub_test_idempotent",
        customer: "cus_test_123",
        client_reference_id: userId,
        metadata: {},
      },
      "evt_test_idempotent_fixed",
    );

    // Stripe retries on non-2xx, so identical redelivery is expected.
    await handleWebhookEvent(event);
    await handleWebhookEvent(event);

    const rows = await db.query.subscriptions.findMany({
      where: eq(subscriptions.stripeSubscriptionId, "sub_test_idempotent"),
    });
    expect(rows.length).toBe(1);
  });
});

describe("Stripe webhook: customer.subscription.updated", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createTestUser();
    // Seed an existing subscription row so the UPDATE has a target.
    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      userId,
      stripeCustomerId: "cus_test_update",
      stripeSubscriptionId: "sub_test_to_update",
      stripePriceId: "price_test_pro",
      status: "active",
      currentPeriodStart: new Date(1_700_000_000 * 1000),
      currentPeriodEnd: new Date(1_702_592_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  afterEach(async () => {
    await cleanupUser(userId);
  });

  test("flips status from active to past_due and persists cancel_at_period_end", async () => {
    const sub = {
      id: "sub_test_to_update",
      status: "past_due",
      cancel_at_period_end: true,
      current_period_start: 1_700_000_000,
      current_period_end: 1_703_000_000,
      items: { data: [{ price: { id: "price_test_pro" } }] },
    } as unknown as Stripe.Subscription;

    const event = buildEvent("customer.subscription.updated", sub);
    await handleWebhookEvent(event);

    const row = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, "sub_test_to_update"),
    });
    expect(row).toBeDefined();
    expect(row!.status).toBe("past_due");
    expect(row!.cancelAtPeriodEnd).toBe(true);
  });
});

describe("Stripe webhook: invoice.payment_succeeded", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createTestUser();
    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      userId,
      stripeCustomerId: "cus_test_pay_ok",
      stripeSubscriptionId: "sub_test_pay_ok",
      stripePriceId: "price_test_pro",
      status: "past_due", // deliberately start past_due to prove payment flips it active
      currentPeriodStart: new Date(1_700_000_000 * 1000),
      currentPeriodEnd: new Date(1_702_592_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  afterEach(async () => {
    await cleanupUser(userId);
  });

  test("records a payment row and flips the subscription back to active", async () => {
    const invoice = {
      id: "in_test_pay_ok",
      payment_intent: "pi_test_pay_ok_1",
      subscription: "sub_test_pay_ok",
      amount_paid: 2900,
      currency: "usd",
    } as unknown as Stripe.Invoice;

    const event = buildEvent("invoice.payment_succeeded", invoice);
    await handleWebhookEvent(event);

    const pay = await db.query.payments.findFirst({
      where: eq(payments.stripePaymentIntentId, "pi_test_pay_ok_1"),
    });
    expect(pay).toBeDefined();
    expect(pay!.userId).toBe(userId);
    expect(pay!.amount).toBe(2900);
    expect(pay!.currency).toBe("usd");
    expect(pay!.status).toBe("succeeded");

    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, "sub_test_pay_ok"),
    });
    expect(sub!.status).toBe("active");
  });

  test("is idempotent: duplicate invoice.payment_succeeded does not create a second payment row", async () => {
    const invoice = {
      id: "in_test_pay_dup",
      payment_intent: "pi_test_pay_dup_1",
      subscription: "sub_test_pay_ok",
      amount_paid: 2900,
      currency: "usd",
    } as unknown as Stripe.Invoice;

    const event = buildEvent(
      "invoice.payment_succeeded",
      invoice,
      "evt_pay_dup_fixed",
    );
    await handleWebhookEvent(event);
    await handleWebhookEvent(event);

    const rows = await db.query.payments.findMany({
      where: eq(payments.stripePaymentIntentId, "pi_test_pay_dup_1"),
    });
    expect(rows.length).toBe(1);
  });
});

describe("Stripe webhook: invoice.payment_failed", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createTestUser();
    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      userId,
      stripeCustomerId: "cus_test_pay_fail",
      stripeSubscriptionId: "sub_test_pay_fail",
      stripePriceId: "price_test_pro",
      status: "active",
      currentPeriodStart: new Date(1_700_000_000 * 1000),
      currentPeriodEnd: new Date(1_702_592_000 * 1000),
      cancelAtPeriodEnd: false,
    });
  });

  afterEach(async () => {
    await cleanupUser(userId);
  });

  test("flips subscription status to past_due when Stripe reports a failed invoice", async () => {
    const invoice = {
      id: "in_test_pay_fail",
      payment_intent: "pi_test_pay_fail_1",
      subscription: "sub_test_pay_fail",
      amount_paid: 0,
      currency: "usd",
    } as unknown as Stripe.Invoice;

    const event = buildEvent("invoice.payment_failed", invoice);
    await handleWebhookEvent(event);

    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, "sub_test_pay_fail"),
    });
    expect(sub).toBeDefined();
    expect(sub!.status).toBe("past_due");
  });
});

// ── BLK-010: billing_events idempotency + new handlers ──────────────

describe("BLK-010: billing_events idempotency gate", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createTestUser();
  });

  afterEach(async () => {
    await cleanupUser(userId);
  });

  test("first delivery writes a billing_events row with payload + stripe_event_id", async () => {
    const event = buildEvent<Partial<Stripe.Customer>>(
      "customer.created",
      { id: "cus_blk010_new", metadata: { userId } },
      "evt_blk010_customer_created_once",
    );
    await handleWebhookEvent(event);

    const row = await db.query.billingEvents.findFirst({
      where: eq(billingEvents.stripeEventId, "evt_blk010_customer_created_once"),
    });
    expect(row).toBeDefined();
    expect(row!.eventType).toBe("customer.created");
    expect(row!.userId).toBe(userId);
    expect(row!.payloadJson).toContain("cus_blk010_new");
    expect(row!.processedAt).not.toBeNull();
  });

  test("second delivery of same event.id is rejected — still exactly one billing_events row", async () => {
    const event = buildEvent<Partial<Stripe.Customer>>(
      "customer.created",
      { id: "cus_blk010_replay", metadata: { userId } },
      "evt_blk010_replay_same_id",
    );
    await handleWebhookEvent(event);
    await handleWebhookEvent(event);

    const rows = await db.query.billingEvents.findMany({
      where: eq(billingEvents.stripeEventId, "evt_blk010_replay_same_id"),
    });
    expect(rows.length).toBe(1);
  });

  test("customer.created persists a billing_accounts row mapping userId → stripeCustomerId", async () => {
    const event = buildEvent<Partial<Stripe.Customer>>(
      "customer.created",
      { id: "cus_blk010_acct", metadata: { userId } },
      "evt_blk010_acct_create",
    );
    await handleWebhookEvent(event);

    const account = await db.query.billingAccounts.findFirst({
      where: eq(billingAccounts.userId, userId),
    });
    expect(account).toBeDefined();
    expect(account!.stripeCustomerId).toBe("cus_blk010_acct");
  });
});

describe("BLK-010: invoice.* and payment_intent.* are logged as events", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createTestUser();
  });

  afterEach(async () => {
    await cleanupUser(userId);
  });

  test("invoice.created is accepted and logged in billing_events even with no side-effect", async () => {
    const event = buildEvent<Partial<Stripe.Invoice>>(
      "invoice.created",
      {
        id: "in_blk010_created",
        metadata: { userId },
        subscription: null,
      } as Partial<Stripe.Invoice>,
      "evt_blk010_invoice_created",
    );
    await handleWebhookEvent(event);

    const row = await db.query.billingEvents.findFirst({
      where: eq(billingEvents.stripeEventId, "evt_blk010_invoice_created"),
    });
    expect(row).toBeDefined();
    expect(row!.eventType).toBe("invoice.created");
    expect(row!.processedAt).not.toBeNull();
  });

  test("payment_intent.succeeded is accepted and logged", async () => {
    const event = buildEvent<Partial<Stripe.PaymentIntent>>(
      "payment_intent.succeeded",
      {
        id: "pi_blk010_pi_ok",
        status: "succeeded",
        metadata: { userId },
      } as Partial<Stripe.PaymentIntent>,
      "evt_blk010_pi_ok",
    );
    await handleWebhookEvent(event);

    const row = await db.query.billingEvents.findFirst({
      where: eq(billingEvents.stripeEventId, "evt_blk010_pi_ok"),
    });
    expect(row).toBeDefined();
    expect(row!.eventType).toBe("payment_intent.succeeded");
  });
});
