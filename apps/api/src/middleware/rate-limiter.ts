import type { MiddlewareHandler } from "hono";

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, RateLimitBucket>();

export function rateLimiter(opts: {
  windowMs?: number;
  max?: number;
}): MiddlewareHandler {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 100;

  return async (c, next): Promise<Response | void> => {
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

    return next();
  };
}
