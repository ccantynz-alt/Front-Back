import { describe, test, expect, mock, beforeEach } from "bun:test";
import app from "../index";

// ── Mock Stripe webhook verification ────────────────────────────────
// We mock the verifyWebhookSignature function to control test behavior
// without needing real Stripe secrets.

const mockVerify = mock(() => {});

mock.module("./stripe", () => ({
  verifyWebhookSignature: (...args: unknown[]) => mockVerify(...args),
  getStripe: () => ({}),
  resetStripeInstance: () => {},
}));

// ── Helpers ─────────────────────────────────────────────────────────

function webhookRequest(body: string, signature = "valid_sig"): Request {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body,
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    mockVerify.mockReset();
  });

  test("returns 400 when stripe-signature header is missing", async () => {
    const req = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "test" }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing stripe-signature header");
  });

  test("returns 400 when signature verification fails", async () => {
    mockVerify.mockImplementation(() => {
      throw new Error("Signature verification failed");
    });

    const res = await app.fetch(webhookRequest('{"type":"test"}', "invalid_sig"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid signature");
  });

  test("returns 200 for a valid checkout.session.completed event", async () => {
    mockVerify.mockReturnValue({
      id: "evt_test_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          customer: "cus_test_123",
          subscription: "sub_test_123",
          client_reference_id: "user_123",
          metadata: { planId: "pro" },
        },
      },
    });

    const res = await app.fetch(webhookRequest('{"type":"checkout.session.completed"}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("returns 200 for a valid customer.subscription.updated event", async () => {
    mockVerify.mockReturnValue({
      id: "evt_test_456",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_123",
          customer: "cus_test_123",
          status: "active",
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          cancel_at_period_end: false,
          metadata: {},
        },
      },
    });

    const res = await app.fetch(webhookRequest('{"type":"customer.subscription.updated"}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("returns 200 for a valid customer.subscription.deleted event", async () => {
    mockVerify.mockReturnValue({
      id: "evt_test_789",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test_123",
          customer: "cus_test_123",
          status: "canceled",
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000),
          cancel_at_period_end: false,
          metadata: {},
        },
      },
    });

    const res = await app.fetch(webhookRequest('{"type":"customer.subscription.deleted"}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("returns 200 for a valid invoice.payment_succeeded event", async () => {
    mockVerify.mockReturnValue({
      id: "evt_test_inv_1",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test_123",
          customer: "cus_test_123",
          subscription: "sub_test_123",
          amount_paid: 2999,
          currency: "usd",
        },
      },
    });

    const res = await app.fetch(webhookRequest('{"type":"invoice.payment_succeeded"}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("returns 200 for a valid invoice.payment_failed event", async () => {
    mockVerify.mockReturnValue({
      id: "evt_test_inv_2",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_test_456",
          customer: "cus_test_123",
          subscription: "sub_test_123",
          amount_due: 2999,
          currency: "usd",
        },
      },
    });

    const res = await app.fetch(webhookRequest('{"type":"invoice.payment_failed"}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("returns 200 for an unhandled event type", async () => {
    mockVerify.mockReturnValue({
      id: "evt_test_unknown",
      type: "payment_intent.created",
      data: { object: {} },
    });

    const res = await app.fetch(webhookRequest('{"type":"payment_intent.created"}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });
});
