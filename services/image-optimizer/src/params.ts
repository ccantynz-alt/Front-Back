/**
 * Query-parameter validation and canonicalisation for the transform endpoint.
 *
 * The canonicalised params are the *single source of truth* for the cache
 * key — anything that affects the output bytes must round-trip through
 * `parseTransformParams`.
 */

import { z } from "zod";
import {
	FIT_MODES,
	LIMITS,
	OptimizerError,
	SUPPORTED_OUTPUT_FORMATS,
	type TransformParams,
} from "./types.ts";

const intFromString = (max: number, min = 1) =>
	z
		.string()
		.regex(/^\d+$/u, "must be a positive integer")
		.transform((s) => Number.parseInt(s, 10))
		.refine((n) => n >= min && n <= max, `must be between ${min} and ${max}`);

const floatFromString = (max: number, min: number) =>
	z
		.string()
		.regex(/^\d+(\.\d+)?$/u, "must be a non-negative number")
		.transform((s) => Number.parseFloat(s))
		.refine((n) => n >= min && n <= max, `must be between ${min} and ${max}`);

const querySchema = z.object({
	src: z
		.string()
		.url("src must be an absolute http(s) URL")
		.refine(
			(u) => u.startsWith("http://") || u.startsWith("https://"),
			"src must be http or https",
		),
	w: intFromString(LIMITS.maxWidth).optional(),
	h: intFromString(LIMITS.maxHeight).optional(),
	q: intFromString(LIMITS.maxQuality, LIMITS.minQuality).optional(),
	fmt: z.enum(SUPPORTED_OUTPUT_FORMATS).optional(),
	fit: z.enum(FIT_MODES).optional(),
	blur: floatFromString(LIMITS.maxBlur, LIMITS.minBlur).optional(),
	dpr: floatFromString(LIMITS.maxDpr, LIMITS.minDpr).optional(),
});

/**
 * Parse + validate query params from a `URLSearchParams`-shaped record.
 * Throws `OptimizerError(INVALID_PARAMS, …, 400)` on any violation.
 */
export function parseTransformParams(
	raw: Record<string, string | undefined>,
): TransformParams {
	const result = querySchema.safeParse(raw);
	if (!result.success) {
		const message = result.error.issues
			.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
			.join("; ");
		throw new OptimizerError("INVALID_PARAMS", message, 400);
	}
	const v = result.data;

	const dpr = v.dpr ?? LIMITS.defaultDpr;
	// Apply DPR multiplier to the requested dimensions, but never let that
	// blow past our hard caps.
	const width =
		v.w === undefined
			? undefined
			: Math.min(LIMITS.maxWidth, Math.round(v.w * dpr));
	const height =
		v.h === undefined
			? undefined
			: Math.min(LIMITS.maxHeight, Math.round(v.h * dpr));

	const params: TransformParams = {
		src: v.src,
		quality: v.q ?? LIMITS.defaultQuality,
		fit: v.fit ?? "cover",
		blur: v.blur ?? 0,
		dpr,
	};
	if (width !== undefined) params.width = width;
	if (height !== undefined) params.height = height;
	if (v.fmt !== undefined) params.format = v.fmt;
	return params;
}

/**
 * Canonicalise params to a stable JSON string for cache-key hashing.
 * Keys are sorted; absent optional fields are omitted (not nulled).
 * This guarantees `?w=200&h=100` and `?h=100&w=200` hash identically.
 */
export function canonicalize(params: TransformParams): string {
	const entries: Array<[string, string | number]> = [
		["src", params.src],
		["q", params.quality],
		["fit", params.fit],
		["blur", params.blur],
		["dpr", params.dpr],
	];
	if (params.width !== undefined) entries.push(["w", params.width]);
	if (params.height !== undefined) entries.push(["h", params.height]);
	if (params.format !== undefined) entries.push(["fmt", params.format]);
	entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return JSON.stringify(entries);
}
