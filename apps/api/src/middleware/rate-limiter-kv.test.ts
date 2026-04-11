import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { createKvRateLimiter, type KvNamespaceLike } from "./rate-limiter-kv";

// ── In-memory KV stub ───────────────────────────────────────────────
// Implements the minimal surface we use. Tracks put/get calls and
// honours expirationTtl so we can simulate window reset without sleeping.

interface StubEntry {
  value: string;
  expiresAt: number; // epoch ms
}

function createStubKv(opts: { now?: () => number } = {}): KvNamespaceLike & {
  _store: Map<string, StubEntry>;
  _puts: number;
  _gets: number;
} {
  const store = new Map<string, StubEntry>();
  const now = opts.now ?? (() => Date.now());
  const kv = {
    _store: store,
    _puts: 0,
    _gets: 0,
    async get(key: string): Promise<string | null> {
      kv._gets++;
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ): Promise<void> {
      kv._puts++;
      const ttl = options?.expirationTtl ?? 60;
      store.set(key, { value, expiresAt: now() + ttl * 1000 });
    },
  };
  return kv;
}

function createBrokenKv(): KvNamespaceLike {
  return {
    async get(): Promise<string | null> {
      throw new Error("KV unreachable");
    },
    async put(): Promise<void> {
      throw new Error("KV unreachable");
    },
  };
}

function createTestApp(kv: KvNamespaceLike, opts: { windowMs?: number; max?: number } = {}): Hono {
  const app = new Hono();
  const mwOpts: Parameters<typeof createKvRateLimiter>[0] = { kv };
  if (opts.windowMs !== undefined) mwOpts.windowMs = opts.windowMs;
  if (opts.max !== undefined) mwOpts.max = opts.max;
  app.use("/api/*", createKvRateLimiter(mwOpts));
  app.get("/api/test", (c) => c.json({ ok: true }));
  return app;
}

async function makeRequest(app: Hono, ip: string): Promise<Response> {
  return app.request("/api/test", { headers: { "x-forwarded-for": ip } });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("createKvRateLimiter — basic behaviour", () => {
  test("allows first request and writes bucket to KV", async () => {
    const kv = createStubKv();
    const app = createTestApp(kv, { max: 5 });
    const res = await makeRequest(app, "10.0.0.1");
    expect(res.status).toBe(200);
    expect(kv._puts).toBe(1);
    expect(kv._store.size).toBe(1);
  });

  test("allows multiple requests under the limit", async () => {
    const kv = createStubKv();
    const app = createTestApp(kv, { max: 5 });
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest(app, "10.0.0.2");
      expect(res.status).toBe(200);
    }
  });

  test("sets X-RateLimit-Limit and X-RateLimit-Remaining headers", async () => {
    const kv = createStubKv();
    const app = createTestApp(kv, { max: 3 });
    const res1 = await makeRequest(app, "10.0.0.3");
    expect(res1.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("2");

    const res2 = await makeRequest(app, "10.0.0.3");
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("1");

    const res3 = await makeRequest(app, "10.0.0.3");
    expect(res3.headers.get("X-RateLimit-Remaining")).toBe("0");
  });
});

describe("createKvRateLimiter — blocking", () => {
  test("returns 429 when limit exceeded", async () => {
    const kv = createStubKv();
    const app = createTestApp(kv, { max: 2 });
    await makeRequest(app, "10.0.1.1");
    await makeRequest(app, "10.0.1.1");
    const res = await makeRequest(app, "10.0.1.1");
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Too many requests");
  });

  test("sets Retry-After on 429", async () => {
    const kv = createStubKv();
    const app = createTestApp(kv, { max: 1, windowMs: 60_000 });
    await makeRequest(app, "10.0.1.2");
    const res = await makeRequest(app, "10.0.1.2");
    expect(res.status).toBe(429);
    const retry = res.headers.get("Retry-After");
    expect(retry).not.toBeNull();
    expect(Number(retry)).toBeGreaterThan(0);
  });
});

describe("createKvRateLimiter — per-IP isolation", () => {
  test("different IPs have separate counters", async () => {
    const kv = createStubKv();
    const app = createTestApp(kv, { max: 1 });
    expect((await makeRequest(app, "10.0.2.1")).status).toBe(200);
    expect((await makeRequest(app, "10.0.2.2")).status).toBe(200);
    expect((await makeRequest(app, "10.0.2.1")).status).toBe(429);
    expect((await makeRequest(app, "10.0.2.2")).status).toBe(429);
  });
});

describe("createKvRateLimiter — window reset", () => {
  test("resets after window TTL expires", async () => {
    const kv = createStubKv();
    const app = createTestApp(kv, { max: 1, windowMs: 20 });
    const res1 = await makeRequest(app, "10.0.3.1");
    expect(res1.status).toBe(200);

    const res2 = await makeRequest(app, "10.0.3.1");
    expect(res2.status).toBe(429);

    await new Promise((r) => setTimeout(r, 40));

    const res3 = await makeRequest(app, "10.0.3.1");
    expect(res3.status).toBe(200);
  });
});

describe("createKvRateLimiter — KV failure fallback", () => {
  test("falls back to memory limiter when KV throws, never 500s", async () => {
    const kv = createBrokenKv();
    const app = new Hono();
    app.use("/api/*", createKvRateLimiter({ kv, max: 2 }));
    app.get("/api/test", (c) => c.json({ ok: true }));

    const res1 = await makeRequest(app, "10.0.4.1");
    expect(res1.status).toBe(200);

    // Memory limiter still holds the line.
    const res2 = await makeRequest(app, "10.0.4.1");
    expect(res2.status).toBe(200);

    const res3 = await makeRequest(app, "10.0.4.1");
    expect(res3.status).toBe(429);
  });

  test("uses custom fallback when supplied", async () => {
    const kv = createBrokenKv();
    const app = new Hono();
    let fallbackHit = 0;
    app.use("/api/*", createKvRateLimiter({
      kv,
      max: 100,
      fallback: async (_c, next) => {
        fallbackHit++;
        return next();
      },
    }));
    app.get("/api/test", (c) => c.json({ ok: true }));
    const res = await makeRequest(app, "10.0.4.2");
    expect(res.status).toBe(200);
    expect(fallbackHit).toBe(1);
  });
});
