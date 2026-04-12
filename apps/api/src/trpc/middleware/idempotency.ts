// ── Idempotency Middleware (Hook 3) ──────────────────────────────────
// Provides idempotency-key support for mutating tRPC procedures and
// exports utility functions (sha256Hex, stableStringify) used by the
// AI response cache and other subsystems.
//
// Usage as middleware:
//   protectedProcedure.use(idempotency).mutation(...)
//
// The middleware reads the `X-Idempotency-Key` header. If a result for
// that key already exists it returns the cached result; otherwise the
// procedure runs normally and the result is stashed for future replays.
//
// v0 scope: the middleware is a passthrough (no-op). sha256Hex and
// stableStringify are fully functional because cache.ts depends on them.

import { middleware } from "../init";

// ── Crypto helpers ──────────────────────────────────────────────────

/**
 * Returns the hex-encoded SHA-256 digest of `input`.
 * Works in Bun, Node 20+, and Cloudflare Workers (all have
 * globalThis.crypto.subtle).
 */
export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * JSON.stringify with sorted keys so the output is deterministic
 * regardless of property insertion order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

// ── Middleware (v0 passthrough) ──────────────────────────────────────

/**
 * Idempotency middleware. v0 is a passthrough — it does not persist
 * results yet. Wire a real idempotency store in a future session.
 */
export const idempotency = middleware(async ({ next }) => {
  return next();
});
