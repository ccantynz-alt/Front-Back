/**
 * Admin API — bearer auth, CRUD on rules, event listing, error shapes.
 */
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createAdminApp } from "../src/admin";
import { InMemoryEventStore, InMemoryRuleStore } from "../src/store";

const TOKEN = "test-token";

function makeApp(): {
  app: Hono;
  rules: InMemoryRuleStore;
  events: InMemoryEventStore;
} {
  const rules = new InMemoryRuleStore();
  const events = new InMemoryEventStore();
  const root = new Hono();
  root.route(
    "/admin",
    createAdminApp({ rules, events, adminToken: TOKEN, idFactory: () => "rule_test" }),
  );
  return { app: root, rules, events };
}

const auth = { headers: { Authorization: `Bearer ${TOKEN}` } };

describe("admin API auth", () => {
  it("rejects missing bearer token", async () => {
    const { app } = makeApp();
    const res = await app.request("/admin/tenants/t1/rules");
    expect(res.status).toBe(401);
  });

  it("rejects wrong bearer token", async () => {
    const { app } = makeApp();
    const res = await app.request("/admin/tenants/t1/rules", {
      headers: { Authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts valid bearer", async () => {
    const { app } = makeApp();
    const res = await app.request("/admin/tenants/t1/rules", auth);
    expect(res.status).toBe(200);
  });

  it("constructor refuses empty admin token", () => {
    expect(() =>
      createAdminApp({
        rules: new InMemoryRuleStore(),
        events: new InMemoryEventStore(),
        adminToken: "",
      }),
    ).toThrow();
  });
});

describe("admin API CRUD", () => {
  it("creates a rule and lists it", async () => {
    const { app } = makeApp();
    const created = await app.request("/admin/tenants/t1/rules", {
      ...auth,
      method: "POST",
      headers: { ...auth.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ pattern: "^/api", deny: true }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { rule: { id: string; deny: boolean } };
    expect(createdBody.rule.id).toBe("rule_test");
    expect(createdBody.rule.deny).toBe(true);

    const listed = await app.request("/admin/tenants/t1/rules", auth);
    const listBody = (await listed.json()) as { rules: Array<{ id: string }> };
    expect(listBody.rules.length).toBe(1);
    expect(listBody.rules[0]?.id).toBe("rule_test");
  });

  it("rejects malformed JSON", async () => {
    const { app } = makeApp();
    const res = await app.request("/admin/tenants/t1/rules", {
      ...auth,
      method: "POST",
      headers: { ...auth.headers, "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid rule shape", async () => {
    const { app } = makeApp();
    const res = await app.request("/admin/tenants/t1/rules", {
      ...auth,
      method: "POST",
      headers: { ...auth.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ pattern: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("deletes a rule", async () => {
    const { app } = makeApp();
    await app.request("/admin/tenants/t1/rules", {
      ...auth,
      method: "POST",
      headers: { ...auth.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ pattern: "^/api", deny: true, id: "fixed-id" }),
    });
    const del = await app.request("/admin/tenants/t1/rules/fixed-id", {
      ...auth,
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    const missing = await app.request("/admin/tenants/t1/rules/fixed-id", {
      ...auth,
      method: "DELETE",
    });
    expect(missing.status).toBe(404);
  });
});

describe("admin API events", () => {
  it("returns events shape", async () => {
    const { app, events } = makeApp();
    events.append({
      id: "e1",
      tenantId: "t1",
      ts: 1000,
      ip: "1.1.1.1",
      method: "GET",
      pathname: "/api",
      userAgent: "",
      outcome: { decision: "deny", reason: "rule-deny", ruleId: "r1" },
    });
    const res = await app.request("/admin/tenants/t1/events?since=0", auth);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      events: Array<{ id: string; outcome: { decision: string } }>;
    };
    expect(body.events.length).toBe(1);
    expect(body.events[0]?.outcome.decision).toBe("deny");
  });

  it("filters by since timestamp", async () => {
    const { app, events } = makeApp();
    events.append({
      id: "old",
      tenantId: "t1",
      ts: 100,
      ip: "1.1.1.1",
      method: "GET",
      pathname: "/api",
      userAgent: "",
      outcome: { decision: "allow", reason: "default-allow" },
    });
    events.append({
      id: "new",
      tenantId: "t1",
      ts: 5000,
      ip: "1.1.1.1",
      method: "GET",
      pathname: "/api",
      userAgent: "",
      outcome: { decision: "allow", reason: "default-allow" },
    });
    const res = await app.request("/admin/tenants/t1/events?since=1000", auth);
    const body = (await res.json()) as { events: Array<{ id: string }> };
    expect(body.events.length).toBe(1);
    expect(body.events[0]?.id).toBe("new");
  });

  it("rejects invalid since/limit", async () => {
    const { app } = makeApp();
    const a = await app.request("/admin/tenants/t1/events?since=-1", auth);
    expect(a.status).toBe(400);
    const b = await app.request("/admin/tenants/t1/events?limit=999999", auth);
    expect(b.status).toBe(400);
  });
});
