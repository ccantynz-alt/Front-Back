import { describe, test, expect, mock, beforeEach } from "bun:test";
import type Stripe from "stripe";
import app from "../index";

// ── Mock Stripe webhook verification ────────────────────────────────
// We mock the verifyWebhookSignature function to control test behavior
// without needing real Stripe secrets.

let mockReturnValue: Stripe.Event | null = null;
let mockError: Error | null = null;

mock.module("./stripe", () => ({
  verifyWebhookSignature: (_payload: string, _signature: string): Stripe.Event => {
    if (mockError) throw mockError;
    if (!mockReturnValue) throw new Error("No mock configured");
    return mockReturnValue;
  },
  getStripe: () => ({}),
  resetStripeInstance: () => {},
}));

// ── Helpers ─────────────────────────────────────────────────────────

function webhookRequest(body: string, signature?: string): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (signature !== undefined) {
    headers["stripe-signature"] = signature;
  }
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers,
    body,
  });
}

function fakeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}`,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    mockReturnValue = null;
    mockError = null;
  });

  test("returns 400 when stripe-signature header is missing", async () => {
    const req = webhookRequest('{"type":"test"}');

    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing stripe-signature header");
  });

  test("returns 400 when signature verification fails", async () => {
    mockError = new Error("Signature verification failed");

    const res = await app.fetch(webhookRequest('{"type":"test"}', "invalid_sig"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid signature");
  });

  test("returns 200 for a valid checkout.session.completed event", async () => {
    mockReturnValue = fakeEvent("checkout.session.completed", {
      id: "cs_test_123",
      customer: "cus_test_123",
      subscription: "sub_test_123",
      client_reference_id: "user_123",
      metadata: { planId: "pro" },
    });

    const res = await app.fetch(webhookRequest('{"type":"checkout.session.completed"}', "valid_sig"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("returns 200 for a valid customer.subscription.updated event", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockReturnValue = fakeEvent("customer.subscription.updated", {
      id: "sub_test_123",
      customer: "cus_test_123",
      status: "active",
      items: { data: [{ current_period_start: now, current_period_end: now + 30 * 86400 }] },
      cancel_at_period_end: false,
      metadata: {},
    });

    const res = await app.fetch(webhookRequest('{"type":"customer.subscription.updated"}', "valid_sig"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("returns 200 for a valid customer.subscription.deleted event", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockReturnValue = fakeEvent("customer.subscription.deleted", {
      id: "sub_test_123",
      customer: "cus_test_123",
      status: "canceled",
      items: { data: [{ current_period_start: now, current_period_end: now }] },
      cancel_at_period_end: false,
      metadata: {},
    });

    const res = await app.fetch(webhookRequest('{"type":"customer.subscription.deleted"}', "valid_sig"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("returns 200 for a valid invoice.payment_succeeded event", async () => {
    mockReturnValue = fakeEvent("invoice.payment_succeeded", {
      id: "in_test_123",
      customer: "cus_test_123",
      parent: {
        subscription_details: { subscription: "sub_test_123" },
      },
      amount_paid: 2999,
      currency: "usd",
    });

    const res = await app.fetch(webhookRequest('{"type":"invoice.payment_succeeded"}', "valid_sig"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("returns 200 for a valid invoice.payment_failed event", async () => {
    mockReturnValue = fakeEvent("invoice.payment_failed", {
      id: "in_test_456",
      customer: "cus_test_123",
      parent: {
        subscription_details: { subscription: "sub_test_123" },
      },
      amount_due: 2999,
      currency: "usd",
    });

    const res = await app.fetch(webhookRequest('{"type":"invoice.payment_failed"}', "valid_sig"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("returns 200 for an unhandled event type", async () => {
    mockReturnValue = fakeEvent("payment_intent.created", {});

    const res = await app.fetch(webhookRequest('{"type":"payment_intent.created"}', "valid_sig"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });
});
