// ── Object Storage — bucket policies ──────────────────────────────────
// Per-bucket access controls. Three canonical visibility modes plus a
// custom-policy escape hatch for fine-grained ACLs.
//
//   - "public-read"     anonymous GETs allowed; writes still require auth
//   - "private"         all access requires auth + bucket membership
//   - "authenticated"   any valid API key may read; writes require membership
//
// The HTTP layer consults these policies before delegating to the driver.

import type { AuthIdentity } from "./auth";

export type BucketVisibility = "public-read" | "private" | "authenticated";

export interface BucketPolicy {
  bucket: string;
  visibility: BucketVisibility;
}

export interface BucketPolicyStore {
  get(bucket: string): Promise<BucketPolicy | null>;
  set(policy: BucketPolicy): Promise<void>;
}

/** In-memory policy store — production callers supply a DB-backed impl. */
export class InMemoryPolicyStore implements BucketPolicyStore {
  private readonly map = new Map<string, BucketPolicy>();

  async get(bucket: string): Promise<BucketPolicy | null> {
    return this.map.get(bucket) ?? null;
  }

  async set(policy: BucketPolicy): Promise<void> {
    this.map.set(policy.bucket, policy);
  }
}

export type AccessVerb = "read" | "write";

/**
 * Decide whether the supplied identity (possibly null = anonymous) may
 * perform `verb` against `bucket` under `policy`. Returns `true` if
 * allowed, `false` if denied.
 *
 * Default policy when `policy === null` is "private + no implicit
 * membership" — i.e. the only way in is to explicitly grant membership.
 */
export function authorize(
  policy: BucketPolicy | null,
  identity: AuthIdentity | null,
  verb: AccessVerb,
  bucket: string,
): boolean {
  // Reads against a public-read bucket are allowed for anyone.
  if (verb === "read" && policy?.visibility === "public-read") {
    return true;
  }

  // All other access requires authentication.
  if (identity === null) return false;

  // Authenticated visibility allows any valid identity to read.
  if (verb === "read" && policy?.visibility === "authenticated") {
    return true;
  }

  // Membership check.
  if (verb === "read") {
    return identity.readableBuckets.has(bucket) || identity.writableBuckets.has(bucket);
  }
  return identity.writableBuckets.has(bucket);
}
