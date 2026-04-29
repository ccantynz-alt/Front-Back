/**
 * HTTP-layer integration test.  We drive the Hono app via app.request()
 * with mocked storage + transformer + source fetcher — no port binding,
 * no real network.
 */
import { describe, expect, it } from "bun:test";
import { Allowlist } from "../src/allowlist.ts";
import { createApp } from "../src/server.ts";
import { MemoryObjectStorage } from "../src/storage.ts";
import type { ImageTransformer } from "../src/transformer.ts";
import type { SourceImage } from "../src/types.ts";

const allowlist = new Allowlist({
	tenants: { default: ["cdn.example.com"] },
	defaultTenant: "default",
});

class StubTransformer implements ImageTransformer {
	transform(input: { bytes: Uint8Array; outputFormat: string }) {
		return Promise.resolve({
			bytes: new Uint8Array([0x42, ...input.bytes]),
			contentType: `image/${input.outputFormat}`,
		});
	}
}

function fakeSource(): (url: string) => Promise<SourceImage> {
	return () =>
		Promise.resolve<SourceImage>({
			bytes: new Uint8Array([1, 2, 3]),
			contentType: "image/png",
			etag: "etag-1",
		});
}

describe("server.createApp", () => {
	it("/healthz returns ok", async () => {
		const app = createApp({
			allowlist,
			storage: new MemoryObjectStorage(),
			transformer: new StubTransformer(),
			fetchSource: fakeSource(),
		});
		const res = await app.request("/healthz");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});

	it("/transform returns 200 with cache MISS on first call", async () => {
		const app = createApp({
			allowlist,
			storage: new MemoryObjectStorage(),
			transformer: new StubTransformer(),
			fetchSource: fakeSource(),
		});
		const res = await app.request(
			"/transform?src=https%3A%2F%2Fcdn.example.com%2Fa.png&w=100",
			{ headers: { accept: "image/avif" } },
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("x-cache")).toBe("MISS");
		expect(res.headers.get("content-type")).toBe("image/avif");
		expect(res.headers.get("cache-control")).toContain("immutable");
	});

	it("/transform returns HIT on second call with the same params", async () => {
		const storage = new MemoryObjectStorage();
		const app = createApp({
			allowlist,
			storage,
			transformer: new StubTransformer(),
			fetchSource: fakeSource(),
		});
		const url =
			"/transform?src=https%3A%2F%2Fcdn.example.com%2Fa.png&w=100";
		await app.request(url, { headers: { accept: "image/avif" } });
		const res = await app.request(url, { headers: { accept: "image/avif" } });
		expect(res.headers.get("x-cache")).toBe("HIT");
	});

	it("/transform returns 400 for invalid params", async () => {
		const app = createApp({
			allowlist,
			storage: new MemoryObjectStorage(),
			transformer: new StubTransformer(),
			fetchSource: fakeSource(),
		});
		const res = await app.request(
			"/transform?src=https%3A%2F%2Fcdn.example.com%2Fa.png&w=99999",
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("INVALID_PARAMS");
	});

	it("/transform returns 403 for sources outside the allowlist", async () => {
		const app = createApp({
			allowlist,
			storage: new MemoryObjectStorage(),
			transformer: new StubTransformer(),
			fetchSource: fakeSource(),
		});
		const res = await app.request(
			"/transform?src=https%3A%2F%2Fevil.com%2Fa.png",
		);
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("SOURCE_NOT_ALLOWED");
	});

	it("/transform missing src returns 400", async () => {
		const app = createApp({
			allowlist,
			storage: new MemoryObjectStorage(),
			transformer: new StubTransformer(),
			fetchSource: fakeSource(),
		});
		const res = await app.request("/transform");
		expect(res.status).toBe(400);
	});

	it("/transform honours x-tenant-id header", async () => {
		const al = new Allowlist({
			tenants: {
				acme: ["cdn.acme.com"],
				default: ["cdn.example.com"],
			},
			defaultTenant: "default",
		});
		const app = createApp({
			allowlist: al,
			storage: new MemoryObjectStorage(),
			transformer: new StubTransformer(),
			fetchSource: fakeSource(),
		});
		// acme tenant cannot reach cdn.example.com
		const res = await app.request(
			"/transform?src=https%3A%2F%2Fcdn.example.com%2Fa.png",
			{ headers: { "x-tenant-id": "acme" } },
		);
		expect(res.status).toBe(403);
	});
});
