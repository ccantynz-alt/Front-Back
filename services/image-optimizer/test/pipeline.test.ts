/**
 * Pipeline integration test.  We mock the source fetcher and the
 * transformer because the test sandbox does not have libvips, and we
 * don't want network calls.  These mocks are documented inline.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Allowlist } from "../src/allowlist.ts";
import { OptimizerPipeline, type PipelineDeps } from "../src/pipeline.ts";
import { MemoryObjectStorage } from "../src/storage.ts";
import type { ImageTransformer } from "../src/transformer.ts";
import { OptimizerError, type SourceImage } from "../src/types.ts";

class CountingTransformer implements ImageTransformer {
	calls = 0;
	transform(input: { bytes: Uint8Array; outputFormat: string }) {
		this.calls += 1;
		return Promise.resolve({
			bytes: new Uint8Array([0xff, 0xff, ...input.bytes]),
			contentType: `image/${input.outputFormat}`,
		});
	}
}

const allowlist = new Allowlist({
	tenants: { default: ["cdn.example.com"] },
	defaultTenant: "default",
});

function buildSourceMock(
	bytes: Uint8Array,
	contentType = "image/png",
	etag = "abc123",
) {
	return mock(() =>
		Promise.resolve<SourceImage>({ bytes, contentType, etag }),
	);
}

describe("OptimizerPipeline", () => {
	let storage: MemoryObjectStorage;
	let transformer: CountingTransformer;

	beforeEach(() => {
		storage = new MemoryObjectStorage();
		transformer = new CountingTransformer();
	});

	it("fetches, transforms, and caches on first miss", async () => {
		const fetchSource = buildSourceMock(new Uint8Array([1, 2, 3]));
		const deps: PipelineDeps = { allowlist, storage, transformer, fetchSource };
		const pipeline = new OptimizerPipeline(deps);

		const result = await pipeline.run({
			rawQuery: { src: "https://cdn.example.com/a.png", w: "200" },
			acceptHeader: "image/avif",
		});

		expect(result.cacheHit).toBe(false);
		expect(transformer.calls).toBe(1);
		expect(fetchSource).toHaveBeenCalledTimes(1);
		expect(storage.size).toBe(1);
		expect(result.contentType).toBe("image/avif");
		expect(result.bytes[0]).toBe(0xff);
	});

	it("serves cached bytes on hit without re-running transform", async () => {
		const fetchSource = buildSourceMock(new Uint8Array([1, 2, 3]));
		const deps: PipelineDeps = { allowlist, storage, transformer, fetchSource };
		const pipeline = new OptimizerPipeline(deps);

		const args = {
			rawQuery: { src: "https://cdn.example.com/a.png", w: "200" },
			acceptHeader: "image/avif",
		};
		const first = await pipeline.run(args);
		const second = await pipeline.run(args);

		expect(first.cacheHit).toBe(false);
		expect(second.cacheHit).toBe(true);
		// Transform runs once; second request hits the cache.
		expect(transformer.calls).toBe(1);
		expect(first.cacheKey).toBe(second.cacheKey);
	});

	it("creates a new cache entry when the source ETag changes", async () => {
		const deps1: PipelineDeps = {
			allowlist,
			storage,
			transformer,
			fetchSource: buildSourceMock(new Uint8Array([1]), "image/png", "v1"),
		};
		const deps2: PipelineDeps = {
			allowlist,
			storage,
			transformer,
			fetchSource: buildSourceMock(new Uint8Array([1]), "image/png", "v2"),
		};
		const args = {
			rawQuery: { src: "https://cdn.example.com/a.png", w: "200" },
			acceptHeader: "image/avif",
		};
		const r1 = await new OptimizerPipeline(deps1).run(args);
		const r2 = await new OptimizerPipeline(deps2).run(args);
		expect(r1.cacheKey).not.toBe(r2.cacheKey);
		expect(transformer.calls).toBe(2);
	});

	it("rejects sources outside the allowlist with 403", async () => {
		const deps: PipelineDeps = {
			allowlist,
			storage,
			transformer,
			fetchSource: buildSourceMock(new Uint8Array([1])),
		};
		const pipeline = new OptimizerPipeline(deps);

		try {
			await pipeline.run({
				rawQuery: { src: "https://evil.com/a.png", w: "200" },
				acceptHeader: "image/avif",
			});
			expect.unreachable("expected SOURCE_NOT_ALLOWED");
		} catch (err) {
			expect(err).toBeInstanceOf(OptimizerError);
			expect((err as OptimizerError).code).toBe("SOURCE_NOT_ALLOWED");
			expect((err as OptimizerError).status).toBe(403);
		}
	});

	it("propagates source-fetch errors", async () => {
		const deps: PipelineDeps = {
			allowlist,
			storage,
			transformer,
			fetchSource: () =>
				Promise.reject(new OptimizerError("SOURCE_NOT_FOUND", "404", 404)),
		};
		const pipeline = new OptimizerPipeline(deps);

		try {
			await pipeline.run({
				rawQuery: { src: "https://cdn.example.com/missing.png" },
				acceptHeader: "image/webp",
			});
			expect.unreachable("expected SOURCE_NOT_FOUND");
		} catch (err) {
			expect(err).toBeInstanceOf(OptimizerError);
			expect((err as OptimizerError).code).toBe("SOURCE_NOT_FOUND");
		}
	});

	it("rejects oversized requests via param validation", async () => {
		const deps: PipelineDeps = {
			allowlist,
			storage,
			transformer,
			fetchSource: buildSourceMock(new Uint8Array([1])),
		};
		const pipeline = new OptimizerPipeline(deps);

		try {
			await pipeline.run({
				rawQuery: { src: "https://cdn.example.com/a.png", w: "9999" },
				acceptHeader: "image/avif",
			});
			expect.unreachable("expected INVALID_PARAMS");
		} catch (err) {
			expect(err).toBeInstanceOf(OptimizerError);
			expect((err as OptimizerError).code).toBe("INVALID_PARAMS");
		}
	});

	it("DPR multiplier produces a different cache key from the same dpr=1 request", async () => {
		const deps: PipelineDeps = {
			allowlist,
			storage,
			transformer,
			fetchSource: buildSourceMock(new Uint8Array([1])),
		};
		const pipeline = new OptimizerPipeline(deps);

		const a = await pipeline.run({
			rawQuery: { src: "https://cdn.example.com/a.png", w: "200" },
			acceptHeader: "image/webp",
		});
		const b = await pipeline.run({
			rawQuery: { src: "https://cdn.example.com/a.png", w: "200", dpr: "2" },
			acceptHeader: "image/webp",
		});
		expect(a.cacheKey).not.toBe(b.cacheKey);
	});
});
