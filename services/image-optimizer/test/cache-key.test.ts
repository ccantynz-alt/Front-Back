import { describe, expect, it } from "bun:test";
import { deriveCacheKey, hashBytes } from "../src/cache-key.ts";
import { parseTransformParams } from "../src/params.ts";

describe("deriveCacheKey", () => {
	const baseParams = parseTransformParams({
		src: "https://cdn.example.com/a.png",
		w: "200",
		h: "100",
		q: "80",
	});

	it("is deterministic for identical inputs", () => {
		const a = deriveCacheKey({
			params: baseParams,
			sourceEtag: "abc123",
			outputFormat: "webp",
		});
		const b = deriveCacheKey({
			params: baseParams,
			sourceEtag: "abc123",
			outputFormat: "webp",
		});
		expect(a).toBe(b);
		// sha256 hex == 64 chars
		expect(a).toHaveLength(64);
	});

	it("changes when source ETag changes", () => {
		const a = deriveCacheKey({
			params: baseParams,
			sourceEtag: "abc123",
			outputFormat: "webp",
		});
		const b = deriveCacheKey({
			params: baseParams,
			sourceEtag: "def456",
			outputFormat: "webp",
		});
		expect(a).not.toBe(b);
	});

	it("changes when output format changes", () => {
		const a = deriveCacheKey({
			params: baseParams,
			sourceEtag: "abc123",
			outputFormat: "webp",
		});
		const b = deriveCacheKey({
			params: baseParams,
			sourceEtag: "abc123",
			outputFormat: "avif",
		});
		expect(a).not.toBe(b);
	});

	it("changes when transform params change", () => {
		const params2 = parseTransformParams({
			src: "https://cdn.example.com/a.png",
			w: "200",
			h: "100",
			q: "85", // different quality
		});
		const a = deriveCacheKey({
			params: baseParams,
			sourceEtag: "abc123",
			outputFormat: "webp",
		});
		const b = deriveCacheKey({
			params: params2,
			sourceEtag: "abc123",
			outputFormat: "webp",
		});
		expect(a).not.toBe(b);
	});
});

describe("hashBytes", () => {
	it("produces a stable hex digest", () => {
		const a = hashBytes(new Uint8Array([1, 2, 3]));
		const b = hashBytes(new Uint8Array([1, 2, 3]));
		expect(a).toBe(b);
		expect(a).toHaveLength(64);
	});

	it("differs for different inputs", () => {
		const a = hashBytes(new Uint8Array([1, 2, 3]));
		const b = hashBytes(new Uint8Array([1, 2, 4]));
		expect(a).not.toBe(b);
	});
});
