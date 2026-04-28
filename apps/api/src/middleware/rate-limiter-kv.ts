/**
 * Cloudflare KV-backed rate limiter for Crontech.
 *
 * Replaces the in-memory Map approach for production deployments to Workers
 * where each isolate has its own process state and cold starts would reset
 * the bucket (effectively breaking rate limiting at scale). KV is:
 *   - free within limits,
 *   - native to the Workers platform (no extra service to run),
 *   - eventually-consistent — acceptable for rate limiting since a small
 *     window of over-limit traffic is infinitely better than no limiting
 *     at all.
 *
 * Algorithm: sliding-window counter per `rate:${ip}:${path}` key.
 * Each request reads the current count, increments, writes back with TTL
 * equal to the window size. When the count exceeds `max`, the request is
 * rejected with 429 until the TTL expires and the key disappears.
 *
 * Green ecosystem mandate: if KV is unreachable (error from get/put), the
 * middleware falls back to the in-memory limiter for THAT request and logs
 * a warning. A failing rate-limit store must never return 500 to a user.
 */

import type { MiddlewareHandler } from "hono";
import { rateLimiter as memoryRateLimiter } from "./rate-limiter";

// ── KV binding type ──────────────────────────────────────────────────
// We declare a minimal local interface rather than depending on @cloudflare/workers-types
// to avoid adding a top-level dev dep. This surface is exactly what we use.
export interface KvNamespaceLike {
  get(key: string, options?: { type?: "text" | "json" }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface BucketState {
  count: number;
  resetAt: number; // epoch ms
}

interface KvRateLimiterOptions {
  kv: KvNamespaceLike;
  windowMs?: number;
  max?: number;
  /** Optional fallback middleware used when KV throws. Defaults to the in-memory limiter. */
  fallback?: MiddlewareHandler;
}

/**
 * Build a Hono middleware that enforces a rate limit using a Cloudflare KV
 * namespace as the shared store.
 */
export function createKvRateLimiter(opts: KvRateLimiterOptions): MiddlewareHandler {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 100;
  const kv = opts.kv;
  const fallback = opts.fallback ?? memoryRateLimiter({ windowMs, max });

  return async (c, next): Promise<Response | undefined> => {
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
    const key = `rate:${ip}:${c.req.path}`;
    const now = Date.now();

    let state: BucketState;
    try {
      const raw = await kv.get(key, { type: "text" });
      if (raw === null) {
        state = { count: 0, resetAt: now + windowMs };
      } else {
        try {
          const parsed = JSON.parse(raw) as BucketState;
          if (
            typeof parsed.count !== "number" ||
            typeof parsed.resetAt !== "number" ||
            parsed.resetAt <= now
          ) {
            state = { count: 0, resetAt: now + windowMs };
          } else {
            state = parsed;
          }
        } catch {
          // Corrupt value — reset the window rather than 500ing.
          state = { count: 0, resetAt: now + windowMs };
        }
      }

      if (state.count >= max) {
        const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
        c.header("Retry-After", String(retryAfter));
        c.header("X-RateLimit-Limit", String(max));
        c.header("X-RateLimit-Remaining", "0");
        return c.json({ error: "Too many requests" }, 429);
      }

      state.count += 1;
      const ttlSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      await kv.put(key, JSON.stringify(state), { expirationTtl: ttlSeconds });

      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", String(Math.max(0, max - state.count)));

      await next();
      return undefined;
    } catch (err) {
      // KV unreachable — fall back to the in-memory limiter for this request.
      // NEVER return 500 because the rate-limit store broke.
      console.warn(
        "[rate-limiter-kv] KV store unreachable, falling back to memory limiter:",
        err instanceof Error ? err.message : String(err),
      );
      await fallback(c, next);
      return undefined;
    }
  };
}
