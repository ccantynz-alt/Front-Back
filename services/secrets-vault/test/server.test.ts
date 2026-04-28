import { beforeEach, describe, expect, it } from "bun:test";
import { AuditLogger } from "../src/audit";
import { parseMasterKey } from "../src/crypto";
import { RateLimiter } from "../src/rate-limit";
import { createServer } from "../src/server";
import { VaultStore } from "../src/store";
import type { AuditEntry } from "../src/types";

const MASTER_HEX = "1".repeat(64);
const TOKEN = "test-internal-token-XYZ";

function makeApp(rateLimiterOpts?: { windowMs: number; maxRequests: number; clock: () => number }) {
  const masterKey = parseMasterKey(MASTER_HEX);
  const entries: AuditEntry[] = [];
  const audit = new AuditLogger({ sink: (e) => entries.push(e) });
  const store = new VaultStore({ masterKey, audit });
  const rateLimiter = rateLimiterOpts
    ? new RateLimiter(rateLimiterOpts)
    : new RateLimiter({ maxRequests: 10_000, windowMs: 60_000 });
  const app = createServer({ store, authToken: TOKEN, rateLimiter, audit });
  return { app, entries, store };
}

const authHeaders = {
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
  "x-crontech-requester": "deploy-orchestrator",
};

describe("HTTP server", () => {
  let app: ReturnType<typeof makeApp>["app"];
  let entries: AuditEntry[];

  beforeEach(() => {
    const made = makeApp();
    app = made.app;
    entries = made.entries;
  });

  it("rejects requests without bearer token", async () => {
    const res = await app.request("/tenants/t1/secrets/K", { method: "GET" });
    expect(res.status).toBe(401);
    const auth = entries.find((e) => e.action === "AUTH_REJECT");
    expect(auth).toBeDefined();
  });

  it("rejects requests with wrong bearer token", async () => {
    const res = await app.request("/tenants/t1/secrets/K", {
      method: "GET",
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("PUT then GET round-trips a secret", async () => {
    const put = await app.request("/tenants/t1/secrets/DB_URL", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ value: "postgres://prod" }),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { tenantId: string; key: string };
    expect(putBody.tenantId).toBe("t1");
    expect(putBody.key).toBe("DB_URL");

    const get = await app.request("/tenants/t1/secrets/DB_URL", {
      method: "GET",
      headers: authHeaders,
    });
    expect(get.status).toBe(200);
    const getBody = (await get.json()) as { value: string };
    expect(getBody.value).toBe("postgres://prod");
  });

  it("LIST returns keys without values", async () => {
    await app.request("/tenants/t1/secrets/A", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ value: "VA" }),
    });
    await app.request("/tenants/t1/secrets/B", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ value: "VB" }),
    });
    const list = await app.request("/tenants/t1/secrets", {
      method: "GET",
      headers: authHeaders,
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { keys: string[] };
    expect(body.keys).toEqual(["A", "B"]);
    const text = JSON.stringify(body);
    expect(text).not.toContain("VA");
    expect(text).not.toContain("VB");
  });

  it("DELETE removes a secret", async () => {
    await app.request("/tenants/t1/secrets/K", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ value: "v" }),
    });
    const del = await app.request("/tenants/t1/secrets/K", {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(del.status).toBe(200);
    const get = await app.request("/tenants/t1/secrets/K", {
      method: "GET",
      headers: authHeaders,
    });
    expect(get.status).toBe(404);
  });

  it("BUNDLE returns map for the requested keys only", async () => {
    await app.request("/tenants/t1/secrets/DB_URL", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ value: "postgres://prod" }),
    });
    await app.request("/tenants/t1/secrets/API_KEY", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ value: "sk-abc" }),
    });
    await app.request("/tenants/t1/secrets/UNUSED", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ value: "should-not-leak" }),
    });
    const res = await app.request("/tenants/t1/secrets/bundle", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ keys: ["DB_URL", "API_KEY"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { env: Record<string, string> };
    expect(body.env).toEqual({ DB_URL: "postgres://prod", API_KEY: "sk-abc" });
    expect(body.env).not.toHaveProperty("UNUSED");
  });

  it("BUNDLE rejects empty keys array", async () => {
    const res = await app.request("/tenants/t1/secrets/bundle", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ keys: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid tenantId / key formats", async () => {
    const res = await app.request("/tenants/!!bad!!/secrets/K", {
      method: "GET",
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });

  it("trips rate limit and audit-logs RATE_LIMIT", async () => {
    let now = 0;
    const made = makeApp({ windowMs: 1000, maxRequests: 2, clock: () => now });
    await made.app.request("/tenants/t1/secrets/A", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ value: "v" }),
    });
    await made.app.request("/tenants/t1/secrets/A", {
      method: "GET",
      headers: authHeaders,
    });
    const limited = await made.app.request("/tenants/t1/secrets/A", {
      method: "GET",
      headers: authHeaders,
    });
    expect(limited.status).toBe(429);
    const rateLimitEntries = made.entries.filter((e) => e.action === "RATE_LIMIT");
    expect(rateLimitEntries.length).toBeGreaterThan(0);

    // After advancing time, requests succeed again.
    now = 1500;
    const ok = await made.app.request("/tenants/t1/secrets/A", {
      method: "GET",
      headers: authHeaders,
    });
    expect(ok.status).toBe(200);
  });

  it("/health responds without auth", async () => {
    const res = await app.request("/health", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});
