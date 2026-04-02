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

  // D1 Database
  // DB: D1Database;

  // R2 Object Storage
  // STORAGE: R2Bucket;

  // KV Namespace
  // CACHE: KVNamespace;

  // Durable Objects
  // COLLABORATION: DurableObjectNamespace;
}

export default {
  async fetch(
    request: Request,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request);
  },
};
