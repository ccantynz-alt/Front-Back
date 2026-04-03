/**
 * Cloudflare Workers environment bindings.
 *
 * All bindings defined in wrangler.toml are available on the `Env` object
 * passed to the fetch handler. Secrets are set via `wrangler secret put <NAME>`.
 */

interface Hyperdrive {
  connectionString: string;
}

export interface Env {
  // ── Cloudflare Bindings ────────────────────────────────────────

  /** D1 database — edge SQLite (mirrors Turso schema) */
  DB: D1Database;

  /** R2 object storage — S3-compatible, zero egress */
  STORAGE: R2Bucket;

  /** KV namespace — global key-value cache */
  CACHE: KVNamespace;

  /** Durable Object — real-time collaboration rooms */
  COLLAB_ROOM: DurableObjectNamespace;

  /** Hyperdrive — connection pooling for Neon PostgreSQL */
  HYPERDRIVE?: Hyperdrive;

  // ── Environment Variables (wrangler.toml [vars]) ───────────────

  /** Current deployment environment */
  ENVIRONMENT: string;

  // ── Secrets (set via `wrangler secret put`) ────────────────────

  /** Neon PostgreSQL connection string */
  DATABASE_URL?: string;

  /** Turso database URL */
  TURSO_URL?: string;

  /** Turso auth token */
  TURSO_AUTH_TOKEN?: string;

  /** OpenAI API key for AI SDK */
  OPENAI_API_KEY?: string;

  /** Anthropic API key */
  ANTHROPIC_API_KEY?: string;

  /** Stripe secret key */
  STRIPE_SECRET_KEY?: string;

  /** Stripe webhook signing secret */
  STRIPE_WEBHOOK_SECRET?: string;

  /** Inngest event key */
  INNGEST_EVENT_KEY?: string;

  /** Inngest signing key */
  INNGEST_SIGNING_KEY?: string;

  /** Qdrant API key */
  QDRANT_API_KEY?: string;

  /** Qdrant cluster URL */
  QDRANT_URL?: string;

  /** WebAuthn RP ID (e.g., "cronix.dev") */
  WEBAUTHN_RP_ID?: string;

  /** WebAuthn RP origin (e.g., "https://cronix.dev") */
  WEBAUTHN_RP_ORIGIN?: string;

  /** Session signing secret */
  SESSION_SECRET?: string;
}

// ── Global augmentation for accessing bindings outside Workers context ──
// The worker-entry.ts maps bindings to globalThis so that code shared
// between Bun (dev) and Workers (prod) can access them uniformly.

declare global {
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __CF_ENV: Env | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __CF_CTX: ExecutionContext | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __D1_DB: D1Database | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __R2_STORAGE: R2Bucket | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __KV_CACHE: KVNamespace | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __DO_COLLAB_ROOM: DurableObjectNamespace | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __HYPERDRIVE_URL: string | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __ENVIRONMENT: string | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __DATABASE_URL: string | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __TURSO_URL: string | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __TURSO_AUTH_TOKEN: string | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __OPENAI_API_KEY: string | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __STRIPE_SECRET_KEY: string | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __STRIPE_WEBHOOK_SECRET: string | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __INNGEST_EVENT_KEY: string | undefined;
  // biome-ignore lint/style/noVar: globalThis augmentation requires var
  var __INNGEST_SIGNING_KEY: string | undefined;
}
