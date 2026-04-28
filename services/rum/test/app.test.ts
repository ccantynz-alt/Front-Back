import { gzipSync } from "node:zlib";
import { describe, expect, it } from "bun:test";
import { type AppDeps, createApp } from "../src/collector/app";
import { RateLimiter, RumStore } from "../src/collector/store";

const buildDeps = (
  override: { now?: () => number; perMinute?: number; burst?: number } = {},
): AppDeps => {
  const store = new RumStore();
  const limiter = new RateLimiter({ perMinute: override.perMinute ?? 60, burst: override.burst ?? 60 });
  return {
    store,
    limiter,
    resolveTenant: (req, fallback) => req.headers.get("x-tenant-id") ?? fallback,
    now: override.now ?? (() => 1_000),
  };
};

const validBody = {
  tenant: "acme",
  route: "/",
  sentAt: 1,
  viewport: [1280, 720],
  deviceMemory: 8,
  connection: "4g",
  metrics: [
    { n: "LCP", v: 1500, t: 100 },
    { n: "INP", v: 80, t: 200 },
  ],
};

describe("collector app", () => {
  it("accepts a valid beacon batch", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    const res = await app.fetch(
      new Request("http://t/rum/v1/collect", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": "acme" },
        body: JSON.stringify(validBody),
      }),
    );
    expect(res.status).toBe(200);
    expect(deps.store.query("acme").length).toBe(2);
  });

  it("rejects malformed JSON", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    const res = await app.fetch(
      new Request("http://t/rum/v1/collect", {
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
      new Request("http://t/rum/v1/collect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validBody, metrics: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rate limits per IP", async () => {
    const deps = buildDeps({ burst: 2 });
    const app = createApp(deps);
    const fire = () =>
      app.fetch(
        new Request("http://t/rum/v1/collect", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4", "x-tenant-id": "acme" },
          body: JSON.stringify(validBody),
        }),
      );
    expect((await fire()).status).toBe(200);
    expect((await fire()).status).toBe(200);
    expect((await fire()).status).toBe(429);
  });

  it("decodes gzipped beacons", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    const compressed = gzipSync(Buffer.from(JSON.stringify(validBody)));
    const res = await app.fetch(
      new Request("http://t/rum/v1/collect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
          "x-tenant-id": "acme",
        },
        body: compressed,
      }),
    );
    expect(res.status).toBe(200);
    expect(deps.store.query("acme").length).toBe(2);
  });

  it("returns stats with percentile aggregates", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    for (let i = 1; i <= 10; i++) {
      await app.fetch(
        new Request("http://t/rum/v1/collect", {
          method: "POST",
          headers: { "content-type": "application/json", "x-tenant-id": "acme" },
          body: JSON.stringify({ ...validBody, metrics: [{ n: "LCP", v: i * 100, t: 0 }] }),
        }),
      );
    }
    const res = await app.fetch(
      new Request("http://t/rum/v1/stats?metric=LCP", {
        method: "GET",
        headers: { "x-tenant-id": "acme" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenant: string; stats: Record<string, { count: number; p50: number }> };
    expect(body.tenant).toBe("acme");
    expect(body.stats.LCP?.count).toBe(10);
    // 100..1000 with linear interp: P50 = 550.
    expect(body.stats.LCP?.p50).toBeCloseTo(550, 5);
  });

  it("returns timeseries buckets", async () => {
    const deps = buildDeps({ now: () => 0 });
    const app = createApp(deps);
    await app.fetch(
      new Request("http://t/rum/v1/collect", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": "acme" },
        body: JSON.stringify({ ...validBody, metrics: [{ n: "LCP", v: 1000, t: 0 }] }),
      }),
    );
    const res = await app.fetch(
      new Request("http://t/rum/v1/timeseries?metric=LCP&bucket=1m", {
        method: "GET",
        headers: { "x-tenant-id": "acme" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { points: Array<{ count: number }> };
    expect(body.points.length).toBe(1);
    expect(body.points[0]?.count).toBe(1);
  });

  it("opens CORS for the collect endpoint", async () => {
    const deps = buildDeps();
    const app = createApp(deps);
    const res = await app.fetch(
      new Request("http://t/rum/v1/collect", {
        method: "OPTIONS",
        headers: {
          origin: "https://random.example",
          "access-control-request-method": "POST",
        },
      }),
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("locks CORS on the stats endpoint", async () => {
    const deps = buildDeps();
    const app = createApp(deps, { statsOrigins: ["https://dash.example"] });
    const allowed = await app.fetch(
      new Request("http://t/rum/v1/stats", {
        method: "GET",
        headers: { origin: "https://dash.example", "x-tenant-id": "acme" },
      }),
    );
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://dash.example");
    const blocked = await app.fetch(
      new Request("http://t/rum/v1/stats", {
        method: "GET",
        headers: { origin: "https://attacker.example", "x-tenant-id": "acme" },
      }),
    );
    // Hono's CORS middleware leaves the header unset for disallowed origins.
    expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
  });
});
