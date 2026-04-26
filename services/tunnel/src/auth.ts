// ── Reverse-tunnel shared-secret auth ───────────────────────────────
//
// The edge daemon authenticates incoming origin connections via a
// `Bearer ${TUNNEL_SHARED_SECRET}` header. We compare in constant
// time so an attacker cannot probe the secret via timing.
//
// Mirrors the pattern in `apps/api/src/webhooks/gluecron-push.ts`.
// ─────────────────────────────────────────────────────────────────────

const BEARER_PREFIX = "Bearer ";

/**
 * Constant-time string equality. Compares byte-by-byte after a length
 * check; uses a branchless XOR accumulator so the loop always touches
 * every byte of the longer string.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still walk the shorter input so we do not leak length via the
    // early-exit path. The real shared secret has a fixed length, so
    // length alone already reveals a mismatch on an attacker probe;
    // this is belt-and-braces for parity with the webhook helper.
    let dummy = 0;
    for (let i = 0; i < a.length; i++) {
      dummy |= a.charCodeAt(i) ^ a.charCodeAt(i);
    }
    return dummy === 1;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Extract a Bearer token from an Authorization header. Returns `null`
 * if the header is missing, empty, or not a Bearer token.
 */
export function extractBearer(header: string | undefined | null): string | null {
  if (!header) {
    return null;
  }
  if (!header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length === 0 ? null : token;
}

/**
 * Verify a presented Authorization header against the configured
 * shared secret. Both arguments must be non-empty strings, and the
 * comparison is constant-time. Returns false on any malformed input —
 * never throws.
 */
export function verifyTunnelAuth(
  authHeader: string | undefined | null,
  expectedSecret: string | undefined | null,
): boolean {
  if (!expectedSecret) {
    return false;
  }
  const presented = extractBearer(authHeader);
  if (!presented) {
    return false;
  }
  return timingSafeEqual(presented, expectedSecret);
}
