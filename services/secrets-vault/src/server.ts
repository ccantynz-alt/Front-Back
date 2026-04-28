// ── Secrets Vault HTTP Server ─────────────────────────────────────────
// Internal-only HTTP API for Crontech services. Protected by a static
// bearer token (`SECRETS_VAULT_INTERNAL_TOKEN`). Per-tenant rate limit.
// All bodies validated with Zod. Responses NEVER include plaintext on
// list/put/delete — only on explicit get and bundle endpoints.

import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { AuditLogger } from "./audit";
import { constantTimeEqual } from "./crypto";
import { RateLimiter } from "./rate-limit";
import { VaultStore } from "./store";

export interface ServerOptions {
  readonly store: VaultStore;
  readonly authToken: string;
  readonly rateLimiter?: RateLimiter;
  readonly audit?: AuditLogger;
}

const tenantIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_\-:.]+$/);
const secretKeySchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_\-.]+$/);
const valueSchema = z.string().min(0).max(64 * 1024); // 64 KiB cap per secret

const putBodySchema = z.object({ value: valueSchema });
const bundleBodySchema = z.object({
  keys: z.array(secretKeySchema).min(1).max(256),
});

export function createServer(options: ServerOptions): Hono {
  const { store, authToken } = options;
  const rateLimiter = options.rateLimiter ?? new RateLimiter();
  const audit = options.audit ?? new AuditLogger();
  const app = new Hono();

  // ── Auth middleware ──────────────────────────────────────────────
  app.use("/tenants/*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const expected = `Bearer ${authToken}`;
    if (!constantTimeEqual(header, expected)) {
      audit.log({
        tenantId: c.req.param("tenantId") ?? "unknown",
        key: null,
        action: "AUTH_REJECT",
        requesterId: "unknown",
        result: "error",
        error: "invalid bearer token",
      });
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
    return;
  });

  // ── Health ───────────────────────────────────────────────────────
  app.get("/health", (c) =>
    c.json({ status: "ok", service: "secrets-vault", timestamp: new Date().toISOString() }),
  );

  // ── Helpers ──────────────────────────────────────────────────────
  function rateLimited(c: Context, tenantId: string, requesterId: string): Response | null {
    if (rateLimiter.check(tenantId)) return null;
    audit.log({
      tenantId,
      key: null,
      action: "RATE_LIMIT",
      requesterId,
      result: "error",
      error: "rate limit exceeded",
    });
    return c.json({ error: "rate_limited" }, 429);
  }

  function requesterId(c: Context): string {
    return c.req.header("x-crontech-requester") ?? "internal";
  }

  // ── PUT secret ───────────────────────────────────────────────────
  app.put("/tenants/:tenantId/secrets/:key", async (c) => {
    const tenantId = c.req.param("tenantId");
    const key = c.req.param("key");
    const rid = requesterId(c);
    const tParse = tenantIdSchema.safeParse(tenantId);
    const kParse = secretKeySchema.safeParse(key);
    if (!tParse.success || !kParse.success) {
      return c.json({ error: "invalid tenantId or key" }, 400);
    }
    const limited = rateLimited(c, tenantId, rid);
    if (limited) return limited;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const parsed = putBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body — expected { value: string }" }, 400);
    }
    const meta = store.put({ tenantId, key, value: parsed.data.value, requesterId: rid });
    return c.json(
      { tenantId, key, createdAt: meta.createdAt, updatedAt: meta.updatedAt },
      200,
    );
  });

  // ── GET secret ───────────────────────────────────────────────────
  app.get("/tenants/:tenantId/secrets/:key", (c) => {
    const tenantId = c.req.param("tenantId");
    const key = c.req.param("key");
    const rid = requesterId(c);
    const tParse = tenantIdSchema.safeParse(tenantId);
    const kParse = secretKeySchema.safeParse(key);
    if (!tParse.success || !kParse.success) {
      return c.json({ error: "invalid tenantId or key" }, 400);
    }
    const limited = rateLimited(c, tenantId, rid);
    if (limited) return limited;
    const value = store.get({ tenantId, key, requesterId: rid });
    if (value === null) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ tenantId, key, value }, 200);
  });

  // ── LIST keys ────────────────────────────────────────────────────
  app.get("/tenants/:tenantId/secrets", (c) => {
    const tenantId = c.req.param("tenantId");
    const rid = requesterId(c);
    const tParse = tenantIdSchema.safeParse(tenantId);
    if (!tParse.success) {
      return c.json({ error: "invalid tenantId" }, 400);
    }
    const limited = rateLimited(c, tenantId, rid);
    if (limited) return limited;
    const keys = store.list({ tenantId, requesterId: rid });
    return c.json({ tenantId, keys }, 200);
  });

  // ── DELETE secret ────────────────────────────────────────────────
  app.delete("/tenants/:tenantId/secrets/:key", (c) => {
    const tenantId = c.req.param("tenantId");
    const key = c.req.param("key");
    const rid = requesterId(c);
    const tParse = tenantIdSchema.safeParse(tenantId);
    const kParse = secretKeySchema.safeParse(key);
    if (!tParse.success || !kParse.success) {
      return c.json({ error: "invalid tenantId or key" }, 400);
    }
    const limited = rateLimited(c, tenantId, rid);
    if (limited) return limited;
    const removed = store.delete({ tenantId, key, requesterId: rid });
    return c.json({ tenantId, key, removed }, 200);
  });

  // ── BUNDLE ───────────────────────────────────────────────────────
  // Integration point with Agent 3's deploy-orchestrator.
  app.post("/tenants/:tenantId/secrets/bundle", async (c) => {
    const tenantId = c.req.param("tenantId");
    const rid = requesterId(c);
    const tParse = tenantIdSchema.safeParse(tenantId);
    if (!tParse.success) {
      return c.json({ error: "invalid tenantId" }, 400);
    }
    const limited = rateLimited(c, tenantId, rid);
    if (limited) return limited;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
    const parsed = bundleBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid body — expected { keys: string[] }" }, 400);
    }
    const env = store.bundle({ tenantId, keys: parsed.data.keys, requesterId: rid });
    return c.json({ tenantId, env }, 200);
  });

  return app;
}
