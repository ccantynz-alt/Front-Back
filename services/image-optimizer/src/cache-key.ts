/**
 * Content-addressable cache-key derivation.
 *
 * Cache key = sha256(canonical(params) + "|" + sourceETag + "|" + outputFormat)
 *
 * The source ETag is in the key on purpose: when an upstream image
 * changes, its ETag changes, so the cache key changes, so we don't
 * serve stale bytes.  When a source omits an ETag we fall back to a
 * sha256 of the bytes themselves — slower but never stale.
 */

import { createHash } from "node:crypto";
import { canonicalize } from "./params.ts";
import type { OutputFormat, TransformParams } from "./types.ts";

export function deriveCacheKey(args: {
	params: TransformParams;
	sourceEtag: string;
	outputFormat: OutputFormat;
}): string {
	const canonical = canonicalize(args.params);
	const hash = createHash("sha256");
	hash.update(canonical);
	hash.update("|");
	hash.update(args.sourceEtag);
	hash.update("|");
	hash.update(args.outputFormat);
	return hash.digest("hex");
}

/** Compute a deterministic content-hash for source bytes (ETag fallback). */
export function hashBytes(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}
