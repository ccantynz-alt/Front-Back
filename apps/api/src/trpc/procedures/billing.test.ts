import { describe, test, expect } from "bun:test";
import app from "../../index";

// ── Billing tRPC Procedure Tests ──────────────────────────────────────
// Tests that verify the billing tRPC procedures handle auth and validation.
// Protected procedures should reject unauthenticated requests.
// Public procedures (plans) should not require auth.

describe("billing.plans", () => {
  test("does not require authentication", async () => {
    const url = `/api/trpc/billing.plans?input=${encodeURIComponent(JSON.stringify({}))}`;
    const res = await app.request(url);
    // plans is a public procedure — should NOT return 401
    expect(res.status).not.toBe(401);
  });
});

describe("billing.subscription", () => {
  test("rejects unauthenticated request", async () => {
    const url = `/api/trpc/billing.subscription?input=${encodeURIComponent(JSON.stringify({}))}`;
    const res = await app.request(url);
    expect(res.status).toBe(401);
  });
});

describe("billing.createCheckout", () => {
  test("rejects unauthenticated request", async () => {
    const res = await app.request("/api/trpc/billing.createCheckout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: "plan_pro",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("billing.billingPortal", () => {
  test("rejects unauthenticated request", async () => {
    const res = await app.request("/api/trpc/billing.billingPortal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        returnUrl: "https://example.com/settings",
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("billing.cancelSubscription", () => {
  test("rejects unauthenticated request", async () => {
    const res = await app.request("/api/trpc/billing.cancelSubscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

describe("billing.resumeSubscription", () => {
  test("rejects unauthenticated request", async () => {
    const res = await app.request("/api/trpc/billing.resumeSubscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

describe("billing.invoices", () => {
  test("rejects unauthenticated request", async () => {
    const url = `/api/trpc/billing.invoices?input=${encodeURIComponent(
      JSON.stringify({ limit: 10 }),
    )}`;
    const res = await app.request(url);
    expect(res.status).toBe(401);
  });
});
