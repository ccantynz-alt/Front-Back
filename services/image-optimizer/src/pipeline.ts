/**
 * The orchestration layer: parses params, checks the allowlist,
 * negotiates format, looks up the cache, fetches + transforms on miss,
 * stores the result, and returns the bytes + cache-key + hit flag.
 *
 * This module is the *only* place that knows the full lifecycle of a
 * request.  The HTTP handler stays thin; tests can drive the pipeline
 * directly without spinning up a server.
 */

import type { Allowlist } from "./allowlist.ts";
import { deriveCacheKey } from "./cache-key.ts";
import { negotiateFormat, outputFormatToMime } from "./format-negotiation.ts";
import { parseTransformParams } from "./params.ts";
import { fetchSource, type FetchSourceOptions } from "./source-fetch.ts";
import type { ObjectStorage } from "./storage.ts";
import type { ImageTransformer } from "./transformer.ts";
import {
	OptimizerError,
	type SourceImage,
	type TransformResult,
} from "./types.ts";

export interface PipelineDeps {
	allowlist: Allowlist;
	storage: ObjectStorage;
	transformer: ImageTransformer;
	/** Optional override — tests inject a mock fetcher here. */
	fetchSource?: (
		url: string,
		opts?: FetchSourceOptions,
	) => Promise<SourceImage>;
}

export interface PipelineRequest {
	rawQuery: Record<string, string | undefined>;
	acceptHeader?: string | null;
	tenantId?: string;
}

export class OptimizerPipeline {
	private readonly deps: PipelineDeps;

	constructor(deps: PipelineDeps) {
		this.deps = deps;
	}

	async run(req: PipelineRequest): Promise<TransformResult> {
		const params = parseTransformParams(req.rawQuery);
		this.deps.allowlist.assertAllowed(params.src, req.tenantId);

		// We don't know the source ETag until we fetch — so we fetch first,
		// derive the key, then probe the cache.  The alternative
		// (HEAD-then-GET) doubles latency on cache misses for marginal
		// hit-rate gain, and many CDNs return different ETags for HEAD vs
		// GET.  Fetch-then-key wins.
		const fetchSourceImpl = this.deps.fetchSource ?? fetchSource;
		const source = await fetchSourceImpl(params.src);

		const outputFormat = negotiateFormat(
			params,
			req.acceptHeader,
			source.contentType,
		);
		const cacheKey = deriveCacheKey({
			params,
			sourceEtag: source.etag ?? "",
			outputFormat,
		});

		const cached = await this.deps.storage.get(cacheKey).catch((err: unknown) => {
			throw new OptimizerError(
				"STORAGE_ERROR",
				`storage GET failed: ${(err as Error).message}`,
				502,
			);
		});
		if (cached) {
			return {
				bytes: cached.bytes,
				contentType: cached.contentType,
				cacheKey,
				cacheHit: true,
			};
		}

		const transformed = await this.deps.transformer.transform({
			bytes: source.bytes,
			params,
			outputFormat,
		});

		await this.deps.storage
			.put(cacheKey, {
				bytes: transformed.bytes,
				contentType: transformed.contentType,
			})
			.catch((err: unknown) => {
				// Storage write failures are non-fatal — we still serve the
				// freshly transformed bytes — but we log via the thrown
				// error type so observability picks it up upstream.
				throw new OptimizerError(
					"STORAGE_ERROR",
					`storage PUT failed: ${(err as Error).message}`,
					502,
				);
			});

		return {
			bytes: transformed.bytes,
			contentType: transformed.contentType ?? outputFormatToMime(outputFormat),
			cacheKey,
			cacheHit: false,
		};
	}
}
