// ── Edge-side connection acceptor ──────────────────────────────────
//
// Pure(-ish) handshake logic. Takes a presented token + advertised
// hostnames, verifies the token via the shared secret, and returns
// either an accepted set of claims or a structured rejection.
//
// Lifted out of the Bun.serve handler so the handshake can be unit
// tested without binding any sockets.
// ─────────────────────────────────────────────────────────────────────

import { AuthError, type TunnelClaims, verifyTunnelToken } from "../../shared/auth";

export type AcceptResult =
  | { readonly ok: true; readonly claims: TunnelClaims }
  | { readonly ok: false; readonly reason: string; readonly status: number };

/**
 * Verify a presented signed token. The token comes in as the `id`
 * field of the first frame on a freshly-opened socket (an `advertise`
 * frame). The hostnames the origin advertised in the same frame must
 * match the hostnames the token was issued for.
 */
export async function verifyHandshake(
  token: string,
  presentedHostnames: readonly string[],
  sharedSecret: string,
  options: { readonly nowSeconds?: number; readonly freshnessSeconds?: number } = {},
): Promise<AcceptResult> {
  if (!sharedSecret) {
    return { ok: false, reason: "edge misconfigured: no shared secret", status: 500 };
  }
  if (presentedHostnames.length === 0) {
    return { ok: false, reason: "no hostnames advertised", status: 400 };
  }
  let claims: TunnelClaims;
  try {
    const verifyOpts: { nowSeconds?: number; freshnessSeconds?: number } = {};
    if (options.nowSeconds !== undefined) {
      verifyOpts.nowSeconds = options.nowSeconds;
    }
    if (options.freshnessSeconds !== undefined) {
      verifyOpts.freshnessSeconds = options.freshnessSeconds;
    }
    claims = await verifyTunnelToken(token, sharedSecret, verifyOpts);
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, reason: err.message, status: 401 };
    }
    return { ok: false, reason: `auth error: ${(err as Error).message}`, status: 401 };
  }
  // The token's hostnames must be a superset of the advertised hostnames.
  // (We accept advertise-narrower-than-claims so an origin can split a
  // single token across multiple advertise frames in the future.)
  const claimedSet = new Set(claims.hostnames);
  for (const h of presentedHostnames) {
    if (!claimedSet.has(h)) {
      return {
        ok: false,
        reason: `advertised hostname ${h} not in token claims`,
        status: 403,
      };
    }
  }
  return { ok: true, claims };
}
