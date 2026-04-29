/**
 * Output-format negotiation.
 *
 * Resolution order:
 *   1. Explicit `?fmt=` param wins outright (if set, returned as-is).
 *   2. Otherwise inspect the client's `Accept` header — prefer AVIF, then
 *      WebP, then JPEG/PNG, in that order.  AVIF beats WebP because it's
 *      smaller for the same quality on every modern device that
 *      advertises support.
 *   3. As a last resort, fall back to the source's content-type when it
 *      is one of our supported output formats (e.g. PNG → PNG).
 *   4. Final fallback: WebP (broadest modern support, always re-encodable).
 */

import {
	type OutputFormat,
	SUPPORTED_OUTPUT_FORMATS,
	type TransformParams,
} from "./types.ts";

const ACCEPT_PREFERENCE: ReadonlyArray<{
	mime: string;
	format: OutputFormat;
}> = [
	{ mime: "image/avif", format: "avif" },
	{ mime: "image/webp", format: "webp" },
	{ mime: "image/jpeg", format: "jpeg" },
	{ mime: "image/png", format: "png" },
];

export function negotiateFormat(
	params: TransformParams,
	acceptHeader: string | null | undefined,
	sourceContentType: string | null | undefined,
): OutputFormat {
	if (params.format !== undefined) return params.format;

	if (acceptHeader) {
		const accepted = parseAcceptHeader(acceptHeader);
		if (accepted.includes("image/*") || accepted.includes("*/*")) {
			// Wildcard accept — pick the best modern format.
			return "avif";
		}
		for (const { mime, format } of ACCEPT_PREFERENCE) {
			if (accepted.includes(mime)) return format;
		}
	}

	if (sourceContentType) {
		const sourceFmt = mimeToOutputFormat(sourceContentType);
		if (sourceFmt) return sourceFmt;
	}

	return "webp";
}

export function outputFormatToMime(fmt: OutputFormat): string {
	return `image/${fmt === "jpeg" ? "jpeg" : fmt}`;
}

function parseAcceptHeader(header: string): string[] {
	// Strip q-values; we only care about presence for our small format set.
	return header
		.split(",")
		.map((part) => {
			const semi = part.indexOf(";");
			return (semi < 0 ? part : part.slice(0, semi)).trim().toLowerCase();
		})
		.filter((s) => s.length > 0);
}

function mimeToOutputFormat(contentType: string): OutputFormat | undefined {
	const lower = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
	const match = lower.match(/^image\/(.+)$/u);
	if (!match) return undefined;
	const sub = match[1] === "jpg" ? "jpeg" : match[1];
	if (sub && (SUPPORTED_OUTPUT_FORMATS as readonly string[]).includes(sub)) {
		return sub as OutputFormat;
	}
	return undefined;
}
