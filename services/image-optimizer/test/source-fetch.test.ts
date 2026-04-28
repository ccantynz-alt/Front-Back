/**
 * Tests for source-fetch error paths.  We never make real network
 * calls — all fetchers are mocked Response factories.
 */
import { describe, expect, it } from "bun:test";
import { fetchSource } from "../src/source-fetch.ts";
import { OptimizerError } from "../src/types.ts";

function makeFetcher(response: Response): typeof fetch {
	return ((..._args: unknown[]) => Promise.resolve(response)) as unknown as typeof fetch;
}

describe("fetchSource", () => {
	it("returns image bytes + content-type + ETag", async () => {
		const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
		const res = new Response(bytes, {
			status: 200,
			headers: {
				"content-type": "image/png",
				etag: '"abc123"',
			},
		});
		const result = await fetchSource("https://cdn.example.com/a.png", {
			fetcher: makeFetcher(res),
		});
		expect(result.contentType).toBe("image/png");
		expect(result.etag).toBe("abc123");
		expect(result.bytes).toEqual(bytes);
	});

	it("derives ETag by hashing bytes when header is missing", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const res = new Response(bytes, {
			status: 200,
			headers: { "content-type": "image/png" },
		});
		const result = await fetchSource("https://cdn.example.com/a.png", {
			fetcher: makeFetcher(res),
		});
		expect(result.etag).toMatch(/^[0-9a-f]{64}$/u);
	});

	it("throws SOURCE_NOT_FOUND on 404", async () => {
		const res = new Response("", { status: 404 });
		try {
			await fetchSource("https://cdn.example.com/x.png", {
				fetcher: makeFetcher(res),
			});
			expect.unreachable("expected throw");
		} catch (err) {
			expect((err as OptimizerError).code).toBe("SOURCE_NOT_FOUND");
		}
	});

	it("throws SOURCE_NOT_IMAGE on text/html responses", async () => {
		const res = new Response("<html></html>", {
			status: 200,
			headers: { "content-type": "text/html" },
		});
		try {
			await fetchSource("https://cdn.example.com/x", {
				fetcher: makeFetcher(res),
			});
			expect.unreachable("expected throw");
		} catch (err) {
			expect((err as OptimizerError).code).toBe("SOURCE_NOT_IMAGE");
		}
	});

	it("throws SOURCE_TOO_LARGE when content-length exceeds cap", async () => {
		const res = new Response(new Uint8Array([1]), {
			status: 200,
			headers: {
				"content-type": "image/png",
				"content-length": "999999999",
			},
		});
		try {
			await fetchSource("https://cdn.example.com/big.png", {
				fetcher: makeFetcher(res),
				maxBytes: 1024,
			});
			expect.unreachable("expected throw");
		} catch (err) {
			expect((err as OptimizerError).code).toBe("SOURCE_TOO_LARGE");
		}
	});

	it("throws SOURCE_TOO_LARGE when streamed bytes exceed cap", async () => {
		const big = new Uint8Array(2048);
		const res = new Response(big, {
			status: 200,
			headers: { "content-type": "image/png" },
			// Note: omit content-length so the streaming path engages.
		});
		try {
			await fetchSource("https://cdn.example.com/big.png", {
				fetcher: makeFetcher(res),
				maxBytes: 1024,
			});
			expect.unreachable("expected throw");
		} catch (err) {
			expect((err as OptimizerError).code).toBe("SOURCE_TOO_LARGE");
		}
	});

	it("wraps fetch errors as SOURCE_NOT_FOUND", async () => {
		const fetcher = ((..._args: unknown[]) =>
			Promise.reject(new Error("connection refused"))) as unknown as typeof fetch;
		try {
			await fetchSource("https://cdn.example.com/a.png", { fetcher });
			expect.unreachable("expected throw");
		} catch (err) {
			expect((err as OptimizerError).code).toBe("SOURCE_NOT_FOUND");
		}
	});
});
