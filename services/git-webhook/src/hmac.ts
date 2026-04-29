// ── HMAC validation for GitHub webhook signatures ───────────────────────
//
// GitHub sends `X-Hub-Signature-256: sha256=<hex>` computed as
//   HMAC-SHA256(secret, raw_body) -> hex
// We verify in constant time using crypto.timingSafeEqual to avoid
// timing-oracle attacks on the secret.

import { createHmac, timingSafeEqual } from "node:crypto";

const SIG_PREFIX = "sha256=";

/**
 * Compute the canonical `sha256=<hex>` signature header value for a
 * raw payload + secret. Exposed so tests can generate matching signatures
 * without duplicating the algorithm.
 */
export function computeSignature(secret: string, rawBody: string): string {
  return SIG_PREFIX + createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Constant-time comparison of a delivered signature header vs the
 * expected signature for a given secret and raw body. Returns false for
 * any malformed input, length mismatch, or HMAC mismatch.
 *
 * IMPORTANT: caller MUST pass the EXACT raw request body bytes — not a
 * re-serialised JSON object. GitHub's signature is over the bytes on the
 * wire, and any whitespace / key-order change invalidates it.
 */
export function verifySignature(
  secret: string,
  rawBody: string,
  deliveredSignature: string | null | undefined,
): boolean {
  if (!deliveredSignature || !deliveredSignature.startsWith(SIG_PREFIX)) {
    return false;
  }
  const expected = computeSignature(secret, rawBody);
  // timingSafeEqual throws on length mismatch; pre-check makes the
  // failure path cheap and predictable.
  if (deliveredSignature.length !== expected.length) {
    return false;
  }
  const a = Buffer.from(deliveredSignature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
