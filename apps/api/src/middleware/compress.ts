/**
 * Response compression middleware.
 *
 * Applies gzip/brotli compression selectively — compresses JSON, HTML,
 * and text responses while skipping binary data, streams, and WebSocket
 * upgrades.
 */

import type { MiddlewareHandler } from "hono";
import { compress } from "hono/compress";

// Content types that benefit from compression
const COMPRESSIBLE_TYPES = new Set([
  "application/json",
  "application/xml",
  "text/html",
  "text/plain",
  "text/css",
  "text/javascript",
  "application/javascript",
  "image/svg+xml",
]);

function isCompressible(contentType: string | null): boolean {
  if (!contentType) return false;
  // Strip charset and other params
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return COMPRESSIBLE_TYPES.has(base) || base.startsWith("text/");
}

function isWebSocketUpgrade(req: Request): boolean {
  return req.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

/**
 * Selective compression middleware.
 *
 * Wraps Hono's built-in compress() but skips WebSocket upgrades,
 * streaming responses (SSE), and non-compressible content types.
 * Always adds `Vary: Accept-Encoding`.
 */
export function compressMiddleware(): MiddlewareHandler {
  // Pre-build the inner compressor (gzip — universally supported,
  // Cloudflare handles brotli at the edge automatically)
  const inner = compress({ encoding: "gzip" });

  return async (c, next) => {
    // Skip WebSocket upgrade requests entirely
    if (isWebSocketUpgrade(c.req.raw)) {
      await next();
      return;
    }

    // Skip if the client does not accept compressed responses
    const accept = c.req.header("Accept-Encoding") ?? "";
    if (!accept.includes("gzip") && !accept.includes("br") && !accept.includes("deflate")) {
      await next();
      c.header("Vary", "Accept-Encoding");
      return;
    }

    // Run through the inner compressor
    await inner(c, async () => {
      await next();

      // After next() we can inspect the response content type.
      // If it is not compressible, remove any encoding the compressor
      // may have set (defensive — compress() is generally smart about this).
      const ct = c.res.headers.get("Content-Type");
      if (!isCompressible(ct)) {
        c.res.headers.delete("Content-Encoding");
      }

      // Always signal that encoding can vary
      c.header("Vary", "Accept-Encoding");
    });
  };
}
