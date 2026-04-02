/**
 * ETag middleware for conditional responses.
 *
 * Generates weak ETags from a fast hash of the response body and returns
 * 304 Not Modified when the client sends a matching If-None-Match header.
 * Saves bandwidth on repeated / polling requests.
 */

import type { MiddlewareHandler } from "hono";

/**
 * Fast non-cryptographic hash for ETag generation.
 * Uses FNV-1a 32-bit — tiny, fast, sufficient for cache validation.
 */
function fnv1a(data: Uint8Array): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i] as number;
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  // Convert to unsigned 32-bit hex
  return (hash >>> 0).toString(16);
}

/**
 * ETag middleware.
 *
 * - Generates a weak ETag (`W/"<hash>"`) from the response body.
 * - Returns 304 Not Modified when the client's `If-None-Match` matches.
 * - Skips streaming responses, non-200 status codes, and responses
 *   that already have an ETag.
 */
export function etagMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Only generate ETags for successful, non-streaming GET/HEAD responses
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return;
    if (c.res.status !== 200) return;
    if (c.res.headers.has("ETag")) return;

    // Skip streaming / chunked responses
    const transferEncoding = c.res.headers.get("Transfer-Encoding");
    if (transferEncoding?.includes("chunked")) return;

    // Skip SSE / event-stream
    const contentType = c.res.headers.get("Content-Type") ?? "";
    if (contentType.includes("text/event-stream")) return;

    // Clone the response so we can read the body
    const cloned = c.res.clone();
    const body = await cloned.arrayBuffer();

    if (body.byteLength === 0) return;

    const hash = fnv1a(new Uint8Array(body));
    const etag = `W/"${hash}"`;

    c.header("ETag", etag);

    // Check If-None-Match
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      c.res = new Response(null, {
        status: 304,
        headers: c.res.headers,
      });
    }
  };
}
