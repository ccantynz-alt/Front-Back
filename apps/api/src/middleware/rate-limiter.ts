import type { MiddlewareHandler } from "hono";
import { type KvNamespaceLike, createKvRateLimiter } from "./rate-limiter-kv";

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, RateLimitBucket>();

interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
}

/**
 * In-memory token-bucket rate limiter. Fast path for local dev and the
 * fallback path when KV is unreachable. Preserved for green-ecosystem
 * backwards compatibility — do not delete.
 */
export function createMemoryRateLimiter(opts: RateLimiterOptions = {}): MiddlewareHandler {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 100;

  return async (c, next): Promise<Response | undefined> => {
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now - bucket.lastRefill > windowMs) {
      bucket = { tokens: max, lastRefill: now };
      buckets.set(key, bucket);
    }

    if (bucket.tokens <= 0) {
      const retryAfter = Math.ceil((windowMs - (now - bucket.lastRefill)) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Too many requests" }, 429);
    }

    bucket.tokens--;
    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(bucket.tokens));

    await next();
    return undefined;
  };
}

/**
 * Legacy default export. Kept for backward compatibility with existing
 * call sites (`import { rateLimiter } from "./rate-limiter"`). New code
 * should prefer `createRateLimiter({ env })` which auto-selects KV.
 */
export const rateLimiter = createMemoryRateLimiter;

export { createKvRateLimiter };
export type { KvNamespaceLike };

// ── Auto-selecting factory ───────────────────────────────────────────

interface AutoRateLimiterOptions extends RateLimiterOptions {
  /**
   * Optional Workers environment bag. If it contains a `RATE_LIMIT_KV`
   * binding, the KV-backed limiter is used. Otherwise the in-memory
   * limiter is used. This lets the same code run in `bun run dev`
   * (no KV) and on Cloudflare Workers (with KV) without branching.
   */
  env?: { RATE_LIMIT_KV?: KvNamespaceLike } | undefined;
}

/**
 * Build a rate-limit middleware that prefers KV when available and falls
 * back to the in-memory limiter otherwise. This is the preferred entry
 * point for all new wiring.
 */
export function createRateLimiter(opts: AutoRateLimiterOptions = {}): MiddlewareHandler {
  const kv = opts.env?.RATE_LIMIT_KV;
  if (kv) {
    const kvOpts: Parameters<typeof createKvRateLimiter>[0] = { kv };
    if (opts.windowMs !== undefined) kvOpts.windowMs = opts.windowMs;
    if (opts.max !== undefined) kvOpts.max = opts.max;
    return createKvRateLimiter(kvOpts);
  }
  const memOpts: RateLimiterOptions = {};
  if (opts.windowMs !== undefined) memOpts.windowMs = opts.windowMs;
  if (opts.max !== undefined) memOpts.max = opts.max;
  return createMemoryRateLimiter(memOpts);
}
