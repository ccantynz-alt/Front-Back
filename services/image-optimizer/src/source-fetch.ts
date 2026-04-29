/**
 * Streaming source-image fetcher with hard size + content-type guards.
 *
 * Why not just pipe the response straight through?  Because:
 *   1. We need the ETag (or content-hash) before we can compute a cache
 *      key.  That means we must read the bytes once, hash them, and
 *      then feed them to Sharp.
 *   2. We must enforce a max-size cap.  An attacker who points us at a
 *      multi-GB file would otherwise OOM the worker.  We accumulate
 *      chunks and abort the moment we cross the cap.
 *   3. We must reject non-image responses early so we never hand a
 *      `text/html` payload to Sharp.
 */

import { hashBytes } from "./cache-key.ts";
import { OptimizerError, type SourceImage } from "./types.ts";

const DEFAULT_MAX_SOURCE_BYTES = 25 * 1024 * 1024; // 25 MiB

const IMAGE_MIME = /^image\//iu;

export interface FetchSourceOptions {
	maxBytes?: number;
	fetcher?: typeof fetch;
	timeoutMs?: number;
}

export async function fetchSource(
	url: string,
	opts: FetchSourceOptions = {},
): Promise<SourceImage> {
	const maxBytes = opts.maxBytes ?? DEFAULT_MAX_SOURCE_BYTES;
	const fetcher = opts.fetcher ?? fetch;
	const timeoutMs = opts.timeoutMs ?? 15_000;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let res: Response;
	try {
		res = await fetcher(url, { signal: controller.signal });
	} catch (err) {
		clearTimeout(timer);
		throw new OptimizerError(
			"SOURCE_NOT_FOUND",
			`failed to fetch source: ${(err as Error).message}`,
			502,
		);
	}
	clearTimeout(timer);

	if (res.status === 404) {
		throw new OptimizerError(
			"SOURCE_NOT_FOUND",
			`source returned 404: ${url}`,
			404,
		);
	}
	if (!res.ok) {
		throw new OptimizerError(
			"SOURCE_NOT_FOUND",
			`source returned ${res.status}: ${url}`,
			502,
		);
	}

	const contentType = res.headers.get("content-type") ?? "";
	if (!IMAGE_MIME.test(contentType)) {
		throw new OptimizerError(
			"SOURCE_NOT_IMAGE",
			`source content-type is not an image: '${contentType}'`,
			415,
		);
	}

	const declaredLength = Number.parseInt(
		res.headers.get("content-length") ?? "",
		10,
	);
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw new OptimizerError(
			"SOURCE_TOO_LARGE",
			`source declared content-length ${declaredLength} exceeds cap ${maxBytes}`,
			413,
		);
	}

	const reader = res.body?.getReader();
	if (!reader) {
		throw new OptimizerError(
			"SOURCE_NOT_FOUND",
			"source response has no body",
			502,
		);
	}

	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => undefined);
			throw new OptimizerError(
				"SOURCE_TOO_LARGE",
				`source exceeded max bytes ${maxBytes}`,
				413,
			);
		}
		chunks.push(value);
	}

	const bytes = concatChunks(chunks, total);
	const headerEtag = res.headers.get("etag")?.replace(/^W\//u, "").replace(/^"|"$/gu, "");
	const etag = headerEtag && headerEtag.length > 0 ? headerEtag : hashBytes(bytes);

	return { bytes, contentType, etag };
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}
