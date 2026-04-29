/**
 * Core domain types for the image-optimizer service.
 *
 * These are intentionally kept tiny and side-effect-free so they can be
 * imported from any layer (HTTP handler, transformer, cache, tests).
 */

export const SUPPORTED_INPUT_FORMATS = [
	"jpeg",
	"jpg",
	"png",
	"webp",
	"avif",
	"gif",
	"svg",
] as const;

export type InputFormat = (typeof SUPPORTED_INPUT_FORMATS)[number];

export const SUPPORTED_OUTPUT_FORMATS = ["webp", "avif", "jpeg", "png"] as const;
export type OutputFormat = (typeof SUPPORTED_OUTPUT_FORMATS)[number];

export const FIT_MODES = [
	"cover",
	"contain",
	"fill",
	"inside",
	"outside",
] as const;
export type FitMode = (typeof FIT_MODES)[number];

/**
 * The maximum dimensions and quality limits enforced server-side.
 * Anything bigger is rejected — both as a DoS guard and because Sharp
 * (and most decoders) get unstable past these sizes.
 */
export const LIMITS = {
	maxWidth: 8000,
	maxHeight: 8000,
	maxQuality: 100,
	minQuality: 1,
	maxBlur: 100,
	minBlur: 0,
	maxDpr: 4,
	minDpr: 1,
	defaultQuality: 80,
	defaultDpr: 1,
} as const;

/** Canonicalised, validated transform parameters. */
export interface TransformParams {
	src: string;
	width?: number;
	height?: number;
	quality: number;
	format?: OutputFormat;
	fit: FitMode;
	blur: number;
	dpr: number;
}

export interface SourceImage {
	bytes: Uint8Array;
	contentType: string;
	etag?: string;
}

export interface TransformResult {
	bytes: Uint8Array;
	contentType: string;
	cacheKey: string;
	cacheHit: boolean;
}

/**
 * Errors thrown by the optimizer pipeline.  Keeping a small set of named
 * codes lets the HTTP layer map cleanly to status codes without sniffing
 * stack traces.
 */
export type OptimizerErrorCode =
	| "INVALID_PARAMS"
	| "SOURCE_NOT_ALLOWED"
	| "SOURCE_NOT_FOUND"
	| "SOURCE_NOT_IMAGE"
	| "SOURCE_TOO_LARGE"
	| "TRANSFORM_FAILED"
	| "STORAGE_ERROR";

export class OptimizerError extends Error {
	readonly code: OptimizerErrorCode;
	readonly status: number;

	constructor(code: OptimizerErrorCode, message: string, status: number) {
		super(message);
		this.code = code;
		this.status = status;
		this.name = "OptimizerError";
	}
}
