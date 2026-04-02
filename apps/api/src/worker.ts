/**
 * Cloudflare Workers entry point for the BTF API.
 *
 * This module re-exports the Hono app as a Workers-compatible fetch handler.
 * Unlike the Bun entry (index.ts), there is no Bun.serve() call here --
 * Workers only need an exported fetch function.
 */

import app from "./index";

/**
 * Cloudflare Workers environment bindings.
 * Uncomment bindings as they are provisioned in wrangler.toml.
 */
export interface Env {
  // Environment variables
  ENVIRONMENT: string;

  // Hyperdrive — connection pooling for Neon PostgreSQL
  // When available, use HYPERDRIVE.connectionString as the Neon URL
  // to benefit from edge connection pooling and reduced cold-connect latency.
  HYPERDRIVE?: Hyperdrive;

  // D1 Database
  // DB: D1Database;

  // R2 Object Storage
  // STORAGE: R2Bucket;

  // KV Namespace
  // CACHE: KVNamespace;

  // Durable Objects
  // COLLABORATION: DurableObjectNamespace;
}

/**
 * Cloudflare Hyperdrive binding type.
 * Provides a pooled connection string for PostgreSQL at the edge.
 */
interface Hyperdrive {
  connectionString: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    // When Hyperdrive is provisioned, expose its pooled connection string
    // so downstream DB clients (Drizzle + Neon) can use it instead of
    // establishing a fresh TCP connection on every request.
    if (env.HYPERDRIVE) {
      (globalThis as Record<string, unknown>).__HYPERDRIVE_URL =
        env.HYPERDRIVE.connectionString;
    }

    return app.fetch(request);
  },
};
