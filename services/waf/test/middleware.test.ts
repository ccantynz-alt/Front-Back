/**
 * Hono middleware integration — short-circuits on deny / 429 / 401, passes
 * through on allow, and emits events with the right shape.
 */
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { WafEngine } from "../src/engine";
import { wafMiddleware } from "../src/middleware";
import { RateLimiter } from "../src/rate-limit";
import { rateLimitRule } from "../src/rules";
import { InMemoryEventStore, InMemoryRuleStore } from "../src/store";

function buildApp(): {
  app: Hono;
  rules: InMemoryRuleStore;
  events: InMemoryEventStore;
} {
  const rules = new InMemoryRuleStore();
  const events = new InMemoryEventStore();
  const engine = new WafEngine(rules, new RateLimiter());
  const app = new Hono();
  app.use(
    "*",
    wafMiddleware({
      engine,
      events,
      resolveTenantId: (c) => c.req.header("x-tenant-id"),
      idFactory: () => "evt_test",
    }),
  );
  app.get("/api/ping", (c) => c.json({ ok: true }));
  return { app, rules, events };
}

describe("wafMiddleware", () => {
  it("400s when tenant id is missing", async () => {
    const { app } = buildApp();
    const res = await app.request("/api/ping");
    expect(res.status).toBe(400);
  });

  it("passes through allowed requests", async () => {
    const { app } = buildApp();
    const res = await app.request("/api/ping", { headers: { "x-tenant-id": "t1" } });
    expect(res.status).toBe(200);
  });

  it("returns 403 on deny with reason in body", async () => {
    const { app } = buildApp();
    const res = await app.request("/api/ping", {
      headers: { "x-tenant-id": "t1", "user-agent": "sqlmap/1.0" },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe("scanner-ua");
  });

  it("returns 429 with Retry-After header on rate limit", async () => {
    const { app, rules } = buildApp();
    rules.upsert(rateLimitRule("t1", "rl", "^/api", 1, 1000));
    const first = await app.request("/api/ping", { headers: { "x-tenant-id": "t1" } });
    expect(first.status).toBe(200);
    const second = await app.request("/api/ping", { headers: { "x-tenant-id": "t1" } });
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).not.toBeNull();
  });

  it("emits an event with the canonical shape", async () => {
    const { app, events } = buildApp();
    await app.request("/api/ping", { headers: { "x-tenant-id": "t1" } });
    const recent = events.recent("t1", 0);
    expect(recent.length).toBe(1);
    const e = recent[0];
    expect(e?.id).toBe("evt_test");
    expect(e?.outcome.decision).toBe("allow");
    expect(e?.method).toBe("GET");
    expect(e?.pathname).toBe("/api/ping");
  });

  it("uses x-forwarded-for first IP when present", async () => {
    const { app, events } = buildApp();
    await app.request("/api/ping", {
      headers: {
        "x-tenant-id": "t1",
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      },
    });
    const recent = events.recent("t1", 0);
    expect(recent[0]?.ip).toBe("203.0.113.7");
  });
});
