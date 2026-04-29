import { describe, expect, it } from "bun:test";
import { type AppDeps, createApp } from "../src/collector/app";
import { AnalyticsStore, RateLimiter } from "../src/collector/store";
import { DailySaltStore } from "../src/collector/session";

const FIXED_SALT = Buffer.from("a".repeat(64), "hex");

const buildDeps = (
  override: { now?: () => number; perMinute?: number; burst?: number; verifyBearer?: AppDeps["verifyBearer"] } = {},
): AppDeps => {
  const store = new AnalyticsStore();
  const limiter = new RateLimiter({ perMinute: override.perMinute ?? 60, burst: override.burst ?? 60 });
  const salts = new DailySaltStore({ randomSource: () => FIXED_SALT, now: override.now ?? (() => 1_000) });
  const deps: AppDeps = {
    store,
    limiter,
    salts,
    resolveTenant: (req, fallback) => req.headers.get("x-tenant-id") ?? fallback,
    now: override.now ?? (() => 1_000),
  };
  if (override.verifyBearer) deps.verifyBearer = override.verifyBearer;
  return deps;
};

const validBatch = {
  tenant: "acme",
  events: [
    { sessionId: "client-pending", route: "/", event: "$pageview", ts: 1, isEntry: true },
    { sessionId: "client-pending", route: "/", event: "click", ts: 2, props: { button: "cta" } },
  ],
};

describe("collector app", () => {
  it("accepts a valid batch and replaces sessionId server-side", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    const res = await app.fetch(
      new Request("http://t/a/v1/collect", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": "acme" },
        body: JSON.stringify(validBatch),
      }),
    );
    expect(res.status).toBe(200);
    const stored = deps.store.query("acme");
    expect(stored.length).toBe(2);
    // Server replaces the client-provided sessionId.
    expect(stored[0]?.sessionId).not.toBe("client-pending");
    expect(stored[0]?.sessionId).toHaveLength(16);
    // Same client (same ip/ua/day) -> same sid for both events.
    expect(stored[0]?.sessionId).toBe(stored[1]?.sessionId);
  });

  it("derives different sessionIds for different IPs", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    await app.fetch(
      new Request("http://t/a/v1/collect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": "acme",
          "x-forwarded-for": "1.1.1.1",
          "user-agent": "ua",
        },
        body: JSON.stringify(validBatch),
      }),
    );
    await app.fetch(
      new Request("http://t/a/v1/collect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": "acme",
          "x-forwarded-for": "2.2.2.2",
          "user-agent": "ua",
        },
        body: JSON.stringify(validBatch),
      }),
    );
    const r = deps.store.stats("acme");
    expect(r.uniqueSessions).toBe(2);
  });

  it("rejects malformed JSON", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    const res = await app.fetch(
      new Request("http://t/a/v1/collect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects schema-invalid payloads", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    const res = await app.fetch(
      new Request("http://t/a/v1/collect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant: "acme", events: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rate limits per IP", async () => {
    const deps = buildDeps({ burst: 2 });
    const app = createApp(deps);
    const fire = () =>
      app.fetch(
        new Request("http://t/a/v1/collect", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "9.9.9.9",
            "x-tenant-id": "acme",
          },
          body: JSON.stringify(validBatch),
        }),
      );
    expect((await fire()).status).toBe(200);
    expect((await fire()).status).toBe(200);
    expect((await fire()).status).toBe(429);
  });

  it("returns aggregate stats with topN filtering", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    for (let i = 0; i < 5; i++) {
      await app.fetch(
        new Request("http://t/a/v1/collect", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": "acme",
            "x-forwarded-for": `10.0.0.${i}`,
          },
          body: JSON.stringify({
            tenant: "acme",
            events: [{ sessionId: "x", route: "/", event: "$pageview", ts: i }],
          }),
        }),
      );
    }
    const res = await app.fetch(
      new Request("http://t/a/v1/stats?topN=3", {
        method: "GET",
        headers: { "x-tenant-id": "acme" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenant: string; stats: { pageviews: number; uniqueSessions: number } };
    expect(body.tenant).toBe("acme");
    expect(body.stats.pageviews).toBe(5);
    expect(body.stats.uniqueSessions).toBe(5);
  });

  it("computes a funnel via POST /a/v1/funnel", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    // Same IP/UA -> single sessionId server-side. Use that to walk the funnel.
    const send = (event: string, ts: number) =>
      app.fetch(
        new Request("http://t/a/v1/collect", {
          method: "POST",
          headers: { "content-type": "application/json", "x-tenant-id": "acme", "x-forwarded-for": "5.5.5.5" },
          body: JSON.stringify({
            tenant: "acme",
            events: [{ sessionId: "x", route: "/", event, ts }],
          }),
        }),
      );
    await send("land", 0);
    await send("signup", 1_000);
    await send("purchase", 2_000);
    const res = await app.fetch(
      new Request("http://t/a/v1/funnel", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": "acme" },
        body: JSON.stringify({ steps: ["land", "signup", "purchase"] }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      funnel: { steps: Array<{ reached: number }> };
    };
    expect(body.funnel.steps[0]?.reached).toBe(1);
    expect(body.funnel.steps[1]?.reached).toBe(1);
    expect(body.funnel.steps[2]?.reached).toBe(1);
  });

  it("enforces bearer auth when configured", async () => {
    const deps = buildDeps({
      verifyBearer: (tenant, bearer) => tenant === "acme" && bearer === "secret",
    });
    const app = createApp(deps);
    const bad = await app.fetch(
      new Request("http://t/a/v1/collect", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": "acme" },
        body: JSON.stringify({ ...validBatch, bearer: "wrong" }),
      }),
    );
    expect(bad.status).toBe(401);
    const ok = await app.fetch(
      new Request("http://t/a/v1/collect", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": "acme" },
        body: JSON.stringify({ ...validBatch, bearer: "secret" }),
      }),
    );
    expect(ok.status).toBe(200);
  });

  it("opens CORS for /a/v1/collect", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    const res = await app.fetch(
      new Request("http://t/a/v1/collect", {
        method: "OPTIONS",
        headers: {
          origin: "https://random.example",
          "access-control-request-method": "POST",
        },
      }),
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("locks CORS on /a/v1/stats", async () => {
    const deps = buildDeps();
    const app = createApp(deps, { statsOrigins: ["https://dash.example"] });
    const allowed = await app.fetch(
      new Request("http://t/a/v1/stats", {
        method: "GET",
        headers: { origin: "https://dash.example", "x-tenant-id": "acme" },
      }),
    );
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://dash.example");
    const blocked = await app.fetch(
      new Request("http://t/a/v1/stats", {
        method: "GET",
        headers: { origin: "https://attacker.example", "x-tenant-id": "acme" },
      }),
    );
    expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("/healthz reports samples and salt day", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    const res = await app.fetch(new Request("http://t/healthz"));
    const body = (await res.json()) as { ok: boolean; samples: number; day: number };
    expect(body.ok).toBe(true);
    expect(typeof body.day).toBe("number");
  });
});
