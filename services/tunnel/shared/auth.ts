// ── Reverse-tunnel mutual auth ──────────────────────────────────────
//
// The origin daemon authenticates to the edge by presenting a *signed
// token* on connect. The token is an HMAC-SHA256 of:
//
//   "<originId>.<issuedAtSeconds>.<nonce>"
//
// signed with the shared tunnel secret. The edge re-computes the HMAC
// and compares constant-time. We also enforce a freshness window so a
// captured token cannot be replayed indefinitely.
//
// This is a hard upgrade over v0's "raw secret in sub-protocol" — the
// secret never crosses the wire, only an HMAC of structured claims.
//
// Encoded form (URL-safe base64, no padding, dot-separated):
//
//   <claimsB64>.<signatureB64>
//
// where claimsB64 is the base64url of the JSON `{ id, ts, nonce, hostnames }`.
// ─────────────────────────────────────────────────────────────────────

import { base64UrlEncode } from "./frame";

export const TOKEN_FRESHNESS_SECONDS = 60;

export interface TunnelClaims {
  /** Stable origin identifier ("vps-vultr-1", "demo-laptop", ...). */
  readonly id: string;
  /** Issued-at, seconds since epoch. */
  readonly ts: number;
  /** Random nonce, prevents accidental replay reuse. */
  readonly nonce: string;
  /** Hostnames the origin claims to serve. */
  readonly hostnames: readonly string[];
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// ── Constant-time string equality ──────────────────────────────────

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
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

// ── HMAC-SHA256 over the claims ────────────────────────────────────

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

function b64urlEncode(s: string): string {
  return base64UrlEncode(new TextEncoder().encode(s));
}

function b64urlDecode(s: string): string {
  // Re-pad and swap URL-safe chars back.
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return atob(padded);
}

// ── Token issuance + verification ──────────────────────────────────

/**
 * Sign a fresh tunnel token. Called by the origin at every connect
 * attempt. Returns the wire-encoded `<claimsB64>.<signatureB64>` form.
 */
export async function signTunnelToken(
  claims: TunnelClaims,
  secret: string,
): Promise<string> {
  if (!secret) {
    throw new AuthError("secret must be non-empty");
  }
  if (claims.hostnames.length === 0) {
    throw new AuthError("claims.hostnames must be non-empty");
  }
  const json = JSON.stringify({
    id: claims.id,
    ts: claims.ts,
    nonce: claims.nonce,
    hostnames: claims.hostnames,
  });
  const claimsB64 = b64urlEncode(json);
  const sig = await hmacSha256(secret, claimsB64);
  return `${claimsB64}.${base64UrlEncode(sig)}`;
}

export interface VerifyOptions {
  /** Override the "now" clock for deterministic tests. */
  readonly nowSeconds?: number;
  /** Override the freshness window. */
  readonly freshnessSeconds?: number;
}

/**
 * Verify a presented tunnel token. Returns the decoded claims on
 * success, throws `AuthError` otherwise. The signature comparison is
 * constant-time, freshness is enforced against `nowSeconds`.
 */
export async function verifyTunnelToken(
  token: string,
  secret: string,
  options: VerifyOptions = {},
): Promise<TunnelClaims> {
  if (!secret) {
    throw new AuthError("secret must be non-empty");
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new AuthError("token missing");
  }
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    throw new AuthError("token malformed: expected <claims>.<signature>");
  }
  const claimsB64 = token.slice(0, dot);
  const signatureB64 = token.slice(dot + 1);

  const expected = await hmacSha256(secret, claimsB64);
  const expectedB64 = base64UrlEncode(expected);
  if (!timingSafeEqual(signatureB64, expectedB64)) {
    throw new AuthError("token signature mismatch");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecode(claimsB64));
  } catch (err) {
    throw new AuthError(`token claims malformed: ${(err as Error).message}`);
  }
  const claims = assertClaims(parsed);

  const freshness = options.freshnessSeconds ?? TOKEN_FRESHNESS_SECONDS;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - claims.ts) > freshness) {
    throw new AuthError(
      `token freshness expired (issued ${claims.ts}, now ${now}, window ${freshness}s)`,
    );
  }
  return claims;
}

function assertClaims(value: unknown): TunnelClaims {
  if (typeof value !== "object" || value === null) {
    throw new AuthError("claims is not an object");
  }
  const c = value as Record<string, unknown>;
  const id = c["id"];
  const ts = c["ts"];
  const nonce = c["nonce"];
  const hostnames = c["hostnames"];
  if (typeof id !== "string" || id.length === 0) {
    throw new AuthError("claims.id must be a non-empty string");
  }
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    throw new AuthError("claims.ts must be a finite number");
  }
  if (typeof nonce !== "string" || nonce.length === 0) {
    throw new AuthError("claims.nonce must be a non-empty string");
  }
  if (!Array.isArray(hostnames) || hostnames.length === 0) {
    throw new AuthError("claims.hostnames must be a non-empty array");
  }
  const hosts: string[] = [];
  for (const h of hostnames) {
    if (typeof h !== "string" || h.length === 0) {
      throw new AuthError("claims.hostnames entries must be non-empty strings");
    }
    hosts.push(h);
  }
  return { id, ts, nonce, hostnames: hosts };
}

/** Convenience: generate a 96-bit random nonce as base64url. */
export function generateNonce(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}
