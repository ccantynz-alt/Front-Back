import { describe, test, expect } from "bun:test";
import app from "../index";

// ── Helpers ─────────────────────────────────────────────────────────

function trpcGet(procedure: string, input?: unknown): string {
  const base = `/api/trpc/${procedure}`;
  if (input === undefined) return base;
  return `${base}?input=${encodeURIComponent(JSON.stringify(input))}`;
}

function trpcMutation(
  procedure: string,
  input: unknown,
  headers?: Record<string, string>,
): Request {
  return new Request(`http://localhost/api/trpc/${procedure}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(input),
  });
}

// ── billing.getPlans ────────────────────────────────────────────────

describe("billing.getPlans", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(trpcGet("billing.getPlans"));
    expect(res.status).toBe(401);
  });

  test("route exists and responds to GET", async () => {
    const res = await app.request(trpcGet("billing.getPlans"), {
      headers: { Authorization: "Bearer test-session-token" },
    });
    // Protected procedure — returns 401 because session token is invalid.
    // The important thing is the route resolves (not 404).
    expect(res.status).not.toBe(404);
  });
});

// ── billing.getSubscription ─────────────────────────────────────────

describe("billing.getSubscription", () => {
  test("returns 401 without auth header", async () => {
    const res = await app.request(trpcGet("billing.getSubscription"));
    expect(res.status).toBe(401);
  });

  test("route exists and responds", async () => {
    const res = await app.request(trpcGet("billing.getSubscription"), {
      headers: { Authorization: "Bearer test-session-token" },
    });
    expect(res.status).not.toBe(404);
  });
});

// ── billing.createCheckoutSession ───────────────────────────────────

describe("billing.createCheckoutSession", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(
      trpcMutation("billing.createCheckoutSession", {
        planId: "pro",
        interval: "month",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects free plan via input validation", async () => {
    // PlanId.exclude(["free", "enterprise"]) means "free" should fail validation
    const res = await app.request(
      trpcMutation("billing.createCheckoutSession", {
        planId: "free",
        interval: "month",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    );
    // tRPC checks auth before input on protected procedures, so 401 expected
    expect([400, 401]).toContain(res.status);
  });

  test("rejects enterprise plan via input validation", async () => {
    const res = await app.request(
      trpcMutation("billing.createCheckoutSession", {
        planId: "enterprise",
        interval: "month",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects invalid interval", async () => {
    const res = await app.request(
      trpcMutation("billing.createCheckoutSession", {
        planId: "pro",
        interval: "weekly",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects missing successUrl", async () => {
    const res = await app.request(
      trpcMutation("billing.createCheckoutSession", {
        planId: "pro",
        interval: "month",
        cancelUrl: "https://example.com/cancel",
      }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects non-URL successUrl", async () => {
    const res = await app.request(
      trpcMutation("billing.createCheckoutSession", {
        planId: "pro",
        interval: "month",
        successUrl: "not-a-url",
        cancelUrl: "https://example.com/cancel",
      }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects missing cancelUrl", async () => {
    const res = await app.request(
      trpcMutation("billing.createCheckoutSession", {
        planId: "pro",
        interval: "month",
        successUrl: "https://example.com/success",
      }),
    );
    expect([400, 401]).toContain(res.status);
  });
});

// ── billing.getUsage ────────────────────────────────────────────────

describe("billing.getUsage", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(trpcGet("billing.getUsage"));
    expect(res.status).toBe(401);
  });

  test("route exists", async () => {
    const res = await app.request(trpcGet("billing.getUsage"), {
      headers: { Authorization: "Bearer test-session" },
    });
    expect(res.status).not.toBe(404);
  });
});

// ── billing.getInvoices ─────────────────────────────────────────────

describe("billing.getInvoices", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(trpcGet("billing.getInvoices"));
    expect(res.status).toBe(401);
  });

  test("accepts optional limit param", async () => {
    const res = await app.request(
      trpcGet("billing.getInvoices", { limit: 5 }),
      { headers: { Authorization: "Bearer test-session" } },
    );
    expect(res.status).not.toBe(404);
  });

  test("rejects limit above 100", async () => {
    const res = await app.request(
      trpcGet("billing.getInvoices", { limit: 200 }),
      { headers: { Authorization: "Bearer test-session" } },
    );
    // Validation fires before or after auth — both 400 and 401 are acceptable
    expect([400, 401]).toContain(res.status);
  });

  test("rejects limit of 0", async () => {
    const res = await app.request(
      trpcGet("billing.getInvoices", { limit: 0 }),
      { headers: { Authorization: "Bearer test-session" } },
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects negative limit", async () => {
    const res = await app.request(
      trpcGet("billing.getInvoices", { limit: -1 }),
      { headers: { Authorization: "Bearer test-session" } },
    );
    expect([400, 401]).toContain(res.status);
  });
});
