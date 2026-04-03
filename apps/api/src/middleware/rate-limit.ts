import type { Context, MiddlewareHandler } from "hono";

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. Default: 100 */
  limit: number;
  /** Window size in milliseconds. Default: 60_000 (1 minute) */
  windowMs: number;
  /** Function to extract the key from the request. Default: client IP */
  keyFn?: (c: Context) => string;
  /** Interval in ms to prune expired entries. Default: 60_000 */
  pruneIntervalMs?: number;
}

/**
 * Sliding-window in-memory rate limiter middleware for Hono.
 *
 * Tracks request timestamps per key (IP by default) and rejects
 * requests that exceed the configured limit within the window.
 */
export function rateLimiter(opts: Partial<RateLimitOptions> = {}): MiddlewareHandler {
  const limit = opts.limit ?? 100;
  const windowMs = opts.windowMs ?? 60_000;
  const keyFn = opts.keyFn ?? defaultKeyFn;
  const pruneIntervalMs = opts.pruneIntervalMs ?? 60_000;

  const store = new Map<string, RateLimitEntry>();

  // Periodically prune expired entries to avoid unbounded memory growth
  const pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, pruneIntervalMs);

  // Allow the process to exit without waiting for the timer
  if (typeof pruneTimer === "object" && "unref" in pruneTimer) {
    pruneTimer.unref();
  }

  return async (c, next): Promise<Response | void> => {
    const key = keyFn(c);
    const now = Date.now();

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Drop timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= limit) {
      const oldestInWindow = entry.timestamps[0]!;
      const retryAfterSec = Math.ceil((oldestInWindow + windowMs - now) / 1000);

      c.header("Retry-After", String(retryAfterSec));
      c.header("X-RateLimit-Limit", String(limit));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil((oldestInWindow + windowMs) / 1000)));

      return c.json(
        { error: "Too many requests. Please try again later." },
        429,
      );
    }

    entry.timestamps.push(now);

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(limit - entry.timestamps.length));
    c.header(
      "X-RateLimit-Reset",
      String(Math.ceil((entry.timestamps[0]! + windowMs) / 1000)),
    );

    await next();
  };
}

function defaultKeyFn(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}
