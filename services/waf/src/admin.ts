/**
 * Admin HTTP API — Hono router, mountable from any host app.
 *
 * Routes (all prefixed by however the host app mounts the router):
 *   GET    /tenants/:tenantId/rules
 *   POST   /tenants/:tenantId/rules
 *   DELETE /tenants/:tenantId/rules/:ruleId
 *   GET    /tenants/:tenantId/events?since=<unixMs>&limit=<n>
 *
 * Auth: bearer token comparison against `WAF_ADMIN_TOKEN`. The token is
 * required on every request — no anonymous access. The host app passes the
 * token in via `createAdminApp({ adminToken })`.
 */
import { Hono } from "hono";
import type { EventStore, RuleStore } from "./store";
import { NewRuleSchema, type Rule } from "./types";

export interface AdminAppOptions {
  rules: RuleStore;
  events: EventStore;
  /** Bearer token expected in Authorization header. Required. */
  adminToken: string;
  /** Override id factory for deterministic tests. */
  idFactory?: () => string;
}

const defaultIdFactory = (): string =>
  `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function createAdminApp(opts: AdminAppOptions): Hono {
  if (!opts.adminToken) {
    throw new Error("WAF admin token is required");
  }
  const idFactory = opts.idFactory ?? defaultIdFactory;
  const app = new Hono();

  app.use("*", async (c, next) => {
    const auth = c.req.header("authorization");
    const expected = `Bearer ${opts.adminToken}`;
    if (auth !== expected) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
    return;
  });

  app.get("/tenants/:tenantId/rules", (c) => {
    const tenantId = c.req.param("tenantId");
    const list = opts.rules.list(tenantId);
    return c.json({ rules: list });
  });

  app.post("/tenants/:tenantId/rules", async (c) => {
    const tenantId = c.req.param("tenantId");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    const parsed = NewRuleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid rule", issues: parsed.error.issues }, 400);
    }
    const id = parsed.data.id ?? idFactory();
    const rule: Rule = {
      id,
      tenantId,
      pattern: parsed.data.pattern,
      methods: parsed.data.methods,
      priority: parsed.data.priority,
      createdAt: Date.now(),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.allow !== undefined ? { allow: parsed.data.allow } : {}),
      ...(parsed.data.deny !== undefined ? { deny: parsed.data.deny } : {}),
      ...(parsed.data.rateLimit !== undefined ? { rateLimit: parsed.data.rateLimit } : {}),
      ...(parsed.data.requireAuth !== undefined ? { requireAuth: parsed.data.requireAuth } : {}),
      ...(parsed.data.ipAllowlist !== undefined ? { ipAllowlist: parsed.data.ipAllowlist } : {}),
      ...(parsed.data.ipDenylist !== undefined ? { ipDenylist: parsed.data.ipDenylist } : {}),
      ...(parsed.data.bodyDenyPatterns !== undefined
        ? { bodyDenyPatterns: parsed.data.bodyDenyPatterns }
        : {}),
    };
    opts.rules.upsert(rule);
    return c.json({ rule }, 201);
  });

  app.delete("/tenants/:tenantId/rules/:ruleId", (c) => {
    const tenantId = c.req.param("tenantId");
    const ruleId = c.req.param("ruleId");
    const ok = opts.rules.delete(tenantId, ruleId);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.json({ deleted: true });
  });

  app.get("/tenants/:tenantId/events", (c) => {
    const tenantId = c.req.param("tenantId");
    const sinceRaw = c.req.query("since");
    const limitRaw = c.req.query("limit");
    const since = sinceRaw ? Number.parseInt(sinceRaw, 10) : 0;
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 500;
    if (Number.isNaN(since) || since < 0) {
      return c.json({ error: "invalid since" }, 400);
    }
    if (Number.isNaN(limit) || limit < 1 || limit > 10_000) {
      return c.json({ error: "invalid limit" }, 400);
    }
    const events = opts.events.recent(tenantId, since, limit);
    return c.json({ events });
  });

  return app;
}
