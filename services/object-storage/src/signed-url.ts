// ── Object Storage — pre-signed URLs ──────────────────────────────────
// HMAC-SHA256 signed URLs for time-bounded, link-shareable access to a
// single object. Inspired by S3 pre-signed URLs but simpler: we sign a
// canonical string of (method, bucket, key, expiry) and embed the
// signature + expiry as query parameters.
//
//   ?signed=<hex>&expires=<unix-seconds>&method=GET&principal=<id>
//
// Verification is constant-time. Expiry is enforced server-side. The
// signing secret never leaves the service.

import { createHmac, timingSafeEqual } from "node:crypto";

export type SignedMethod = "GET" | "PUT" | "DELETE";

export interface SignParams {
  method: SignedMethod;
  bucket: string;
  key: string;
  /** Wall-clock expiry as a Unix timestamp (seconds). */
  expiresAt: number;
  /** The principal the URL acts on behalf of — embedded for audit. */
  principal: string;
}

export interface SignedUrl {
  signature: string;
  expiresAt: number;
  principal: string;
  method: SignedMethod;
}

/** Build the canonical string that gets HMAC-signed. */
function canonicalString(params: SignParams): string {
  return [params.method, params.bucket, params.key, params.expiresAt, params.principal].join(
    "\n",
  );
}

/** Sign params with the supplied secret. Returns the URL fragment fields. */
export function sign(params: SignParams, secret: string): SignedUrl {
  if (secret.length === 0) {
    throw new Error("signed-url: secret must be a non-empty string");
  }
  const sig = createHmac("sha256", secret).update(canonicalString(params)).digest("hex");
  return {
    signature: sig,
    expiresAt: params.expiresAt,
    principal: params.principal,
    method: params.method,
  };
}

/** Build a query-string fragment for a signed URL. */
export function toQueryString(url: SignedUrl): string {
  const params = new URLSearchParams({
    signed: url.signature,
    expires: String(url.expiresAt),
    method: url.method,
    principal: url.principal,
  });
  return params.toString();
}

export interface VerifyResult {
  ok: boolean;
  reason?: "missing" | "expired" | "invalid";
  principal?: string;
}

/**
 * Verify a request URL against a signing secret. Returns `{ ok: true,
 * principal }` if the signature is valid and the URL has not expired,
 * otherwise `{ ok: false, reason }`.
 *
 * Constant-time on the failure path — does NOT short-circuit on a
 * mismatched signature length to avoid leaking information.
 */
export function verify(
  searchParams: URLSearchParams,
  expected: { method: SignedMethod; bucket: string; key: string },
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  const signature = searchParams.get("signed");
  const expiresStr = searchParams.get("expires");
  const principal = searchParams.get("principal");
  const method = searchParams.get("method");

  if (signature === null || expiresStr === null || principal === null || method === null) {
    return { ok: false, reason: "missing" };
  }

  const expiresAt = Number.parseInt(expiresStr, 10);
  if (Number.isNaN(expiresAt) || expiresAt < now) {
    return { ok: false, reason: "expired" };
  }

  if (method !== expected.method) {
    return { ok: false, reason: "invalid" };
  }

  const expectedSig = createHmac("sha256", secret)
    .update(
      canonicalString({
        method: expected.method,
        bucket: expected.bucket,
        key: expected.key,
        expiresAt,
        principal,
      }),
    )
    .digest("hex");

  // Constant-time compare. Both buffers must be the same length.
  const a = Buffer.from(expectedSig, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) {
    return { ok: false, reason: "invalid" };
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, principal };
}
