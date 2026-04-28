// ── Object Storage — auth ─────────────────────────────────────────────
// Authenticates requests via Crontech API key. Keys travel either as the
// `Authorization: Bearer <key>` header or, for browser-friendly download
// links, as part of a signed URL (see ./signed-url.ts).
//
// Keys themselves are opaque to this service — the platform issues them
// and supplies a verifier. We never store plaintext keys here.

import type { Context } from "hono";

/** Result of a successful authentication. */
export interface AuthIdentity {
  /** Stable principal ID — usually `tenant:<id>` or `user:<id>`. */
  principal: string;
  /** Set of bucket names this identity may write to. Empty = read-only. */
  writableBuckets: ReadonlySet<string>;
  /** Set of bucket names this identity may read from. */
  readableBuckets: ReadonlySet<string>;
}

/**
 * Verifier contract — the platform supplies this. Given an opaque API
 * key string, return an identity (or null if the key is invalid).
 *
 * Implementations MUST be constant-time on the failure path to avoid
 * leaking timing information about which keys exist.
 */
export type ApiKeyVerifier = (apiKey: string) => Promise<AuthIdentity | null>;

/**
 * In-memory verifier — for tests and local dev. Maps a fixed map of
 * `{ key -> identity }`. Production callers MUST supply their own
 * verifier backed by a database with proper hashing.
 */
export function staticVerifier(
  table: ReadonlyMap<string, AuthIdentity>,
): ApiKeyVerifier {
  return async (key: string): Promise<AuthIdentity | null> => {
    return table.get(key) ?? null;
  };
}

/** Pull the API key out of the Authorization header, if present. */
export function extractBearerKey(c: Context): string | null {
  const header = c.req.header("Authorization");
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export class AuthError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AuthError";
  }
}
