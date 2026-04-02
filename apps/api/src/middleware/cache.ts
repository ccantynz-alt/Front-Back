/**
 * Edge caching middleware for Hono.
 *
 * Provides intelligent Cache-Control, CDN-Cache-Control, and Surrogate-Control
 * headers with multiple caching strategies optimized for Cloudflare Workers.
 */

import type { MiddlewareHandler } from "hono";

// ── Types ────────────────────────────────────────────────────────

export interface CacheOptions {
  /** Max age in seconds for browser cache */
  maxAge: number;
  /** Stale-while-revalidate window in seconds */
  staleWhileRevalidate?: number;
  /** Headers to include in the Vary header */
  varyBy?: string[];
  /** Cache scope: public (CDN + browser) or private (browser only) */
  scope?: "public" | "private";
  /** Whether the resource is immutable (never changes at this URL) */
  immutable?: boolean;
}

type CacheStrategy = "immutable" | "dynamic" | "private" | "realtime";

// ── Strategy presets ─────────────────────────────────────────────

const STRATEGY_DEFAULTS: Record<CacheStrategy, CacheOptions> = {
  /** Static assets, fonts, hashed files — cache for 1 year */
  immutable: {
    maxAge: 31_536_000,
    scope: "public",
    immutable: true,
  },
  /** API responses — short TTL with stale-while-revalidate */
  dynamic: {
    maxAge: 60,
    staleWhileRevalidate: 120,
    scope: "public",
    varyBy: ["Accept", "Accept-Encoding"],
  },
  /** Authenticated / user-specific responses — browser only */
  private: {
    maxAge: 0,
    scope: "private",
    varyBy: ["Authorization", "Cookie"],
  },
  /** WebSocket / SSE / streaming — never cache */
  realtime: {
    maxAge: 0,
    scope: "private",
  },
};

// ── Helpers ──────────────────────────────────────────────────────

function shouldBypassCache(req: Request): boolean {
  const url = new URL(req.url);
  if (url.searchParams.get("nocache") === "1") return true;

  const cc = req.headers.get("Cache-Control");
  if (cc && (cc.includes("no-cache") || cc.includes("no-store"))) return true;

  return false;
}

function buildCacheControlValue(opts: CacheOptions): string {
  // Realtime / no-store
  if (opts.maxAge === 0 && opts.scope === "private" && !opts.staleWhileRevalidate) {
    return "no-store, no-cache, must-revalidate";
  }

  const parts: string[] = [];

  parts.push(opts.scope === "private" ? "private" : "public");
  parts.push(`max-age=${opts.maxAge}`);

  if (opts.staleWhileRevalidate) {
    parts.push(`stale-while-revalidate=${opts.staleWhileRevalidate}`);
  }

  if (opts.immutable) {
    parts.push("immutable");
  }

  return parts.join(", ");
}

// ── Core middleware factory ──────────────────────────────────────

export function cacheMiddleware(options: CacheOptions): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Never cache error responses
    if (c.res.status >= 400) return;

    // Bypass when explicitly requested
    if (shouldBypassCache(c.req.raw)) {
      c.header("Cache-Control", "no-store, no-cache, must-revalidate");
      return;
    }

    const ccValue = buildCacheControlValue(options);

    // Browser cache
    c.header("Cache-Control", ccValue);

    // CDN / edge cache (Cloudflare respects this)
    if (options.scope !== "private") {
      const cdnMaxAge = options.maxAge;
      const cdnSwr = options.staleWhileRevalidate ?? 0;
      c.header(
        "CDN-Cache-Control",
        `public, max-age=${cdnMaxAge}${cdnSwr ? `, stale-while-revalidate=${cdnSwr}` : ""}`,
      );
      c.header(
        "Surrogate-Control",
        `max-age=${cdnMaxAge}${cdnSwr ? `, stale-while-revalidate=${cdnSwr}` : ""}`,
      );
    }

    // Vary header
    const varyHeaders = options.varyBy ?? [];
    if (varyHeaders.length > 0) {
      c.header("Vary", varyHeaders.join(", "));
    }
  };
}

// ── Strategy helper ──────────────────────────────────────────────

export function cacheStrategy(
  strategy: CacheStrategy,
  overrides?: Partial<CacheOptions>,
): MiddlewareHandler {
  const opts: CacheOptions = { ...STRATEGY_DEFAULTS[strategy], ...overrides };
  return cacheMiddleware(opts);
}

// ── Preset exports (ready to mount) ──────────────────────────────

/** Static/immutable assets — 1 year, immutable flag */
export const cacheStatic: MiddlewareHandler = cacheStrategy("immutable");

/** Dynamic API responses — 60s TTL + 120s stale-while-revalidate */
export const cacheDynamic: MiddlewareHandler = cacheStrategy("dynamic");

/** Private/authenticated responses — no shared cache */
export const cachePrivate: MiddlewareHandler = cacheStrategy("private");

/** Streaming / real-time — no caching at all */
export const noCache: MiddlewareHandler = cacheStrategy("realtime");
