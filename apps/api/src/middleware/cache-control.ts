import type { MiddlewareHandler } from "hono";

/**
 * Cache-Control middleware — ensures browsers and CDNs never serve stale
 * dynamic content. Static assets get long-lived immutable caching via the
 * edge worker / R2 layer, but API responses (tRPC, AI, auth, realtime)
 * must always be fresh.
 *
 * Pattern:
 *   /api/auth/*     → no-store (never cache auth flows)
 *   /api/ai/*       → no-cache (streaming, always fresh)
 *   /api/trpc/*     → no-cache, must-revalidate (data always fresh)
 *   /api/realtime/* → no-cache (SSE/WS, always fresh)
 *   /api/health     → max-age=5 (allow brief caching for health probes)
 *   everything else → no-cache, must-revalidate
 */
export function cacheControl(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Don't override if a handler already set Cache-Control explicitly
    if (c.res.headers.get("Cache-Control")) return;

    const path = c.req.path;

    if (path.startsWith("/api/auth")) {
      c.header("Cache-Control", "no-store");
      c.header("Pragma", "no-cache");
    } else if (path.startsWith("/api/ai") || path.startsWith("/api/chat")) {
      c.header("Cache-Control", "no-cache, no-store");
    } else if (path.startsWith("/api/realtime") || path.startsWith("/api/ws") || path.startsWith("/api/yjs")) {
      c.header("Cache-Control", "no-cache, no-store");
    } else if (path === "/api/health" || path === "/api/health/full") {
      c.header("Cache-Control", "public, max-age=5");
    } else {
      // Default for all data endpoints (tRPC, webhooks, etc.)
      c.header("Cache-Control", "no-cache, no-store, must-revalidate");
      c.header("Pragma", "no-cache");
      c.header("Expires", "0");
    }
  };
}
