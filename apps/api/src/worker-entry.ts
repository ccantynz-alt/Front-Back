/**
 * Cloudflare Workers entry point for the Cronix API.
 *
 * This module re-exports the Hono app as a Workers-compatible fetch handler
 * and exports Durable Object classes for real-time collaboration.
 *
 * Unlike the Bun entry (index.ts), there is no Bun.serve() call here --
 * Workers only need an exported fetch function + DO class exports.
 */

import app from "./index";
import type { Env } from "./types/env";
import { CollabRoom } from "./durable-objects/collab-room";

export { CollabRoom };
export type { Env };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // ── Map Cloudflare bindings to globalThis for downstream access ──
    // This allows the Hono app (and Drizzle, AI SDK, etc.) to access
    // Workers bindings without requiring Workers-specific imports.
    const g = globalThis as Record<string, unknown>;

    g.__CF_ENV = env;
    g.__CF_CTX = ctx;

    // D1 binding for Drizzle (SQLite at the edge)
    if (env.DB) {
      g.__D1_DB = env.DB;
    }

    // R2 for object storage
    if (env.STORAGE) {
      g.__R2_STORAGE = env.STORAGE;
    }

    // KV for caching
    if (env.CACHE) {
      g.__KV_CACHE = env.CACHE;
    }

    // Durable Objects for collaboration
    if (env.COLLAB_ROOM) {
      g.__DO_COLLAB_ROOM = env.COLLAB_ROOM;
    }

    // Hyperdrive pooled connection string for Neon PostgreSQL
    if (env.HYPERDRIVE) {
      g.__HYPERDRIVE_URL = env.HYPERDRIVE.connectionString;
    }

    // Environment name
    g.__ENVIRONMENT = env.ENVIRONMENT;

    // Secret environment variables
    if (env.DATABASE_URL) g.__DATABASE_URL = env.DATABASE_URL;
    if (env.TURSO_URL) g.__TURSO_URL = env.TURSO_URL;
    if (env.TURSO_AUTH_TOKEN) g.__TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN;
    if (env.OPENAI_API_KEY) g.__OPENAI_API_KEY = env.OPENAI_API_KEY;
    if (env.STRIPE_SECRET_KEY) g.__STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
    if (env.STRIPE_WEBHOOK_SECRET)
      g.__STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
    if (env.INNGEST_EVENT_KEY) g.__INNGEST_EVENT_KEY = env.INNGEST_EVENT_KEY;
    if (env.INNGEST_SIGNING_KEY)
      g.__INNGEST_SIGNING_KEY = env.INNGEST_SIGNING_KEY;

    return app.fetch(request, env, ctx);
  },
};
