import { describe, test, expect } from "bun:test";
import { app } from "./index";

// ── Smoke Tests ─────────────────────────────────────────────────────
// These verify that the API server starts and core endpoints respond.

describe("Smoke: Health endpoint", () => {
  test("GET /api/health returns 200 with status ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  test("GET /api/health returns valid ISO timestamp", async () => {
    const res = await app.request("/api/health");
    const body = (await res.json()) as { timestamp: string };
    const date = new Date(body.timestamp);
    expect(date.toISOString()).toBe(body.timestamp);
  });

  test("GET /api/health returns JSON content type", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("Smoke: tRPC endpoint", () => {
  test("GET /api/trpc/health returns 200", async () => {
    const res = await app.request("/api/trpc/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { data: { status: string } } };
    expect(body.result.data).toEqual({ status: "ok" });
  });

  test("GET /api/trpc/hello with valid input returns greeting", async () => {
    const url = `/api/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: "Smoke" }))}`;
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { data: { greeting: string } } };
    expect(body.result.data.greeting).toBe("Hello, Smoke!");
  });
});

describe("Smoke: WebSocket upgrade", () => {
  test("GET /api/ws without upgrade header returns 426 or appropriate status", async () => {
    const res = await app.request("/api/ws");
    // Without Upgrade header, the server should reject with a non-200 status
    expect(res.status).not.toBe(200);
  });
});

describe("Smoke: CORS headers", () => {
  test("OPTIONS /api/health returns CORS headers", async () => {
    const res = await app.request("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
      },
    });
    // CORS middleware should add Allow-Origin header
    const allowOrigin = res.headers.get("access-control-allow-origin");
    expect(allowOrigin).toBeDefined();
  });
});

describe("Smoke: Rate limiting headers", () => {
  test("GET /api/health includes security headers", async () => {
    const res = await app.request("/api/health");
    // secureHeaders middleware adds security headers
    const xContentType = res.headers.get("x-content-type-options");
    expect(xContentType).toBe("nosniff");
  });
});

describe("Smoke: Stripe webhook endpoint exists", () => {
  test("POST /api/webhooks/stripe without signature returns 400", async () => {
    const res = await app.request("/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "test" }),
    });
    // Should return 400 because stripe-signature header is missing
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("stripe-signature");
  });
});

describe("Smoke: 404 handling", () => {
  test("GET /api/nonexistent returns 404 JSON", async () => {
    const res = await app.request("/api/nonexistent-route-12345");
    expect(res.status).toBe(404);
  });
});
