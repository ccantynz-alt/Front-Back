import { describe, test, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { rateLimiter } from "./rate-limiter";

// ── Helpers ─────────────────────────────────────────────────────────

function createTestApp(opts: { windowMs?: number; max?: number } = {}): Hono {
  const app = new Hono();
  app.use("/api/*", rateLimiter(opts));
  app.get("/api/test", (c) => c.json({ ok: true }));
  app.post("/api/submit", (c) => c.json({ submitted: true }));
  return app;
}

function makeRequest(
  app: Hono,
  path: string,
  ip: string = "192.168.1.1",
): Promise<Response> {
  return app.request(path, {
    headers: { "x-forwarded-for": ip },
  });
}

// ── Rate Limiter: Basic Behavior ────────────────────────────────────

describe("rateLimiter - allows requests under limit", () => {
  test("allows first request", async () => {
    const app = createTestApp({ max: 5 });
    const res = await makeRequest(app, "/api/test", "10.0.0.1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  test("allows multiple requests under the limit", async () => {
    const app = createTestApp({ max: 5 });
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest(app, "/api/test", "10.0.0.2");
      expect(res.status).toBe(200);
    }
  });

  test("sets X-RateLimit-Limit header", async () => {
    const app = createTestApp({ max: 10 });
    const res = await makeRequest(app, "/api/test", "10.0.0.3");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
  });

  test("sets X-RateLimit-Remaining header", async () => {
    const app = createTestApp({ max: 5 });
    const res = await makeRequest(app, "/api/test", "10.0.0.4");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  test("remaining count decreases with each request", async () => {
    const app = createTestApp({ max: 3 });
    const ip = "10.0.0.5";

    const res1 = await makeRequest(app, "/api/test", ip);
    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("2");

    const res2 = await makeRequest(app, "/api/test", ip);
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("1");

    const res3 = await makeRequest(app, "/api/test", ip);
    expect(res3.headers.get("X-RateLimit-Remaining")).toBe("0");
  });
});

// ── Rate Limiter: Blocking ─────────────────────────────────────────

describe("rateLimiter - blocks requests over limit", () => {
  test("returns 429 when limit exceeded", async () => {
    const app = createTestApp({ max: 2 });
    const ip = "10.0.1.1";

    await makeRequest(app, "/api/test", ip);
    await makeRequest(app, "/api/test", ip);

    // Third request should be blocked
    const res = await makeRequest(app, "/api/test", ip);
    expect(res.status).toBe(429);
  });

  test("returns error message in JSON body", async () => {
    const app = createTestApp({ max: 1 });
    const ip = "10.0.1.2";

    await makeRequest(app, "/api/test", ip);
    const res = await makeRequest(app, "/api/test", ip);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("Too many requests");
  });

  test("includes Retry-After header when blocked", async () => {
    const app = createTestApp({ max: 1, windowMs: 60_000 });
    const ip = "10.0.1.3";

    await makeRequest(app, "/api/test", ip);
    const res = await makeRequest(app, "/api/test", ip);

    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});

// ── Rate Limiter: Per-IP Isolation ──────────────────────────────────

describe("rateLimiter - per-IP isolation", () => {
  test("different IPs have separate rate limits", async () => {
    const app = createTestApp({ max: 1 });

    // First IP uses its limit
    const res1 = await makeRequest(app, "/api/test", "192.168.0.1");
    expect(res1.status).toBe(200);

    // Second IP still has its own limit
    const res2 = await makeRequest(app, "/api/test", "192.168.0.2");
    expect(res2.status).toBe(200);

    // First IP is now blocked
    const res3 = await makeRequest(app, "/api/test", "192.168.0.1");
    expect(res3.status).toBe(429);

    // Second IP is now blocked too
    const res4 = await makeRequest(app, "/api/test", "192.168.0.2");
    expect(res4.status).toBe(429);
  });

  test("different paths for same IP have separate buckets", async () => {
    const app = createTestApp({ max: 1 });
    const ip = "192.168.0.10";

    const res1 = await makeRequest(app, "/api/test", ip);
    expect(res1.status).toBe(200);

    // Different path should have its own bucket
    const res2 = await app.request("/api/submit", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
    });
    expect(res2.status).toBe(200);
  });
});

// ── Rate Limiter: Window Reset ──────────────────────────────────────

describe("rateLimiter - window reset", () => {
  test("resets after window expires", async () => {
    // Use a very short window (10ms) so the test runs fast
    const app = createTestApp({ max: 1, windowMs: 10 });
    const ip = "10.0.2.1";

    const res1 = await makeRequest(app, "/api/test", ip);
    expect(res1.status).toBe(200);

    // Blocked immediately
    const res2 = await makeRequest(app, "/api/test", ip);
    expect(res2.status).toBe(429);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should be allowed again after window reset
    const res3 = await makeRequest(app, "/api/test", ip);
    expect(res3.status).toBe(200);
  });
});

// ── Rate Limiter: Default Options ──────────────────────────────────

describe("rateLimiter - default options", () => {
  test("uses default max of 100 when not specified", async () => {
    const app = createTestApp({});
    const res = await makeRequest(app, "/api/test", "10.0.3.1");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
  });

  test("allows 100 requests with defaults", async () => {
    const app = createTestApp({});
    const ip = "10.0.3.2";

    for (let i = 0; i < 100; i++) {
      const res = await makeRequest(app, "/api/test", ip);
      expect(res.status).toBe(200);
    }

    // 101st should be blocked
    const blocked = await makeRequest(app, "/api/test", ip);
    expect(blocked.status).toBe(429);
  });
});
