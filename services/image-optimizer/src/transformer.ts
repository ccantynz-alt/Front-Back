/**
 * Image transformer abstraction.
 *
 * In production we want `sharp` (libvips bindings) for speed and
 * format coverage, but `sharp` has native deps that may not always
 * be available in the test sandbox or in some CF Worker variants.
 *
 * We therefore define an interface and provide:
 *   - `SharpTransformer`     — dynamically-loaded sharp implementation
 *   - `PassthroughTransformer` — returns source bytes verbatim, used
 *      when sharp is unavailable AND no transformation is requested
 *      (i.e. only format conversion to the source's existing format).
 *      This keeps the cache layer working in constrained environments.
 *
 * Tests inject a `MockTransformer` (see test/transformer.mock.ts) so
 * the test suite never depends on libvips being installed.
 */

import { outputFormatToMime } from "./format-negotiation.ts";
import {
	OptimizerError,
	type OutputFormat,
	type TransformParams,
} from "./types.ts";

export interface TransformInput {
	bytes: Uint8Array;
	params: TransformParams;
	outputFormat: OutputFormat;
}

export interface TransformOutput {
	bytes: Uint8Array;
	contentType: string;
}

export interface ImageTransformer {
	transform(input: TransformInput): Promise<TransformOutput>;
}

/**
 * Best-effort sharp loader.  Returns null if `sharp` cannot be
 * required in the current runtime (e.g. test sandboxes without
 * libvips installed).  The HTTP layer falls back to passthrough in
 * that case.
 */
async function tryLoadSharp(): Promise<unknown | null> {
	try {
		const mod = await import("sharp" as string);
		return (mod as { default?: unknown }).default ?? mod;
	} catch {
		return null;
	}
}

export class SharpTransformer implements ImageTransformer {
	private readonly sharp: unknown;

	private constructor(sharp: unknown) {
		this.sharp = sharp;
	}

	static async create(): Promise<SharpTransformer | null> {
		const sharp = await tryLoadSharp();
		if (!sharp) return null;
		return new SharpTransformer(sharp);
	}

	async transform(input: TransformInput): Promise<TransformOutput> {
		// `sharp` exposes a chainable builder; we keep this loose-typed
		// because we never want to ship sharp's full type surface as a
		// hard dependency of this package.
		const sharpFn = this.sharp as (b: Uint8Array) => SharpPipeline;
		try {
			let pipeline = sharpFn(input.bytes);
			if (input.params.width !== undefined || input.params.height !== undefined) {
				pipeline = pipeline.resize({
					width: input.params.width,
					height: input.params.height,
					fit: input.params.fit,
				});
			}
			if (input.params.blur > 0) {
				// sharp's blur takes sigma 0.3..1000; clamp our 0..100 range.
				const sigma = Math.max(0.3, Math.min(input.params.blur, 100));
				pipeline = pipeline.blur(sigma);
			}
			pipeline = pipeline.toFormat(input.outputFormat, {
				quality: input.params.quality,
			});
			const buffer = await pipeline.toBuffer();
			return {
				bytes: new Uint8Array(buffer),
				contentType: outputFormatToMime(input.outputFormat),
			};
		} catch (err) {
			throw new OptimizerError(
				"TRANSFORM_FAILED",
				`sharp transform failed: ${(err as Error).message}`,
				500,
			);
		}
	}
}

interface SharpPipeline {
	resize(opts: {
		width?: number | undefined;
		height?: number | undefined;
		fit: string;
	}): SharpPipeline;
	blur(sigma: number): SharpPipeline;
	toFormat(fmt: string, opts: { quality: number }): SharpPipeline;
	toBuffer(): Promise<Buffer>;
}

/**
 * Fallback transformer that returns the source bytes unchanged but
 * tagged with the requested output content-type.  Only safe when:
 *   - no resize, blur, or format-mismatch is requested, OR
 *   - the caller explicitly opts in to "best-effort" mode.
 *
 * Used by tests and as a last resort in environments without sharp.
 */
export class PassthroughTransformer implements ImageTransformer {
	transform(input: TransformInput): Promise<TransformOutput> {
		return Promise.resolve({
			bytes: input.bytes,
			contentType: outputFormatToMime(input.outputFormat),
		});
	}
}
