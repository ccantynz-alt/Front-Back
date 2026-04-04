// ── KV Worker ─────────────────────────────────────────────────────────
// Edge-deployed KV worker for feature flags, configuration, and caching.
// Sub-5ms reads from 330+ Cloudflare edge locations.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

// ── Cloudflare Bindings ──────────────────────────────────────────────

export interface KVEnv {
  KV_NAMESPACE: KVNamespace;
  ENVIRONMENT: string;
}

// ── Worker App ───────────────────────────────────────────────────────

const app = new Hono<{ Bindings: KVEnv }>();

// Security headers
app.use("*", secureHeaders());

// CORS
app.use(
  "*",
  cors({
    origin: ["https://backtothefuture.dev", "http://localhost:3000"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400,
  }),
);

// ── Health Check ─────────────────────────────────────────────────────

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "kv-worker",
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

// ── Feature Flags ────────────────────────────────────────────────────

app.get("/flags", async (c) => {
  const listed = await c.env.KV_NAMESPACE.list({ prefix: "flags:" });

  const flags: Record<string, unknown> = {};
  for (const key of listed.keys) {
    const value = await c.env.KV_NAMESPACE.get(key.name);
    if (value !== null) {
      try {
        flags[key.name.replace("flags:", "")] = JSON.parse(value);
      } catch {
        flags[key.name.replace("flags:", "")] = value;
      }
    }
  }

  return c.json({ flags });
});

app.get("/flags/:key", async (c) => {
  const key = c.req.param("key");
  const value = await c.env.KV_NAMESPACE.get(`flags:${key}`);

  if (value === null) {
    return c.json({ error: "Flag not found" }, 404);
  }

  try {
    return c.json({ key, value: JSON.parse(value) });
  } catch {
    return c.json({ key, value });
  }
});

// ── KV List ──────────────────────────────────────────────────────────

app.get("/kv/list", async (c) => {
  const prefix = c.req.query("prefix") ?? "";
  const limit = Number(c.req.query("limit") ?? "100");
  const cursor = c.req.query("cursor");

  const options: KVNamespaceListOptions = { prefix, limit };
  if (cursor) {
    options.cursor = cursor;
  }

  const listed = await c.env.KV_NAMESPACE.list(options);

  return c.json({
    keys: listed.keys.map((k) => ({
      name: k.name,
      expiration: k.expiration,
      metadata: k.metadata,
    })),
    list_complete: listed.list_complete,
    cursor: listed.list_complete ? undefined : listed.cursor,
  });
});

// ── KV CRUD ──────────────────────────────────────────────────────────

app.get("/kv/:key", async (c) => {
  const key = c.req.param("key");
  const value = await c.env.KV_NAMESPACE.get(key);

  if (value === null) {
    return c.json({ error: "Not found" }, 404);
  }

  try {
    return c.json({ key, value: JSON.parse(value) });
  } catch {
    return c.json({ key, value });
  }
});

app.put("/kv/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json<{ value: unknown; ttl?: number; metadata?: Record<string, unknown> }>();

  const options: KVNamespacePutOptions = {};
  if (body.ttl) {
    options.expirationTtl = body.ttl;
  }
  if (body.metadata) {
    options.metadata = body.metadata;
  }

  await c.env.KV_NAMESPACE.put(
    key,
    JSON.stringify(body.value),
    options,
  );

  return c.json({ success: true, key });
});

app.delete("/kv/:key", async (c) => {
  const key = c.req.param("key");

  await c.env.KV_NAMESPACE.delete(key);

  return c.json({ deleted: true, key });
});

export default app;
