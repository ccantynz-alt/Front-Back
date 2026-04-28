/**
 * Bootable entry-point for the image-optimizer service.
 *
 * Run: `bun run src/index.ts`
 *
 * The actual app is constructed in `server.ts` so tests can drive
 * `createApp(...)` without binding a port.
 */

import { loadConfig } from "./config.ts";
import { createApp } from "./server.ts";
import { HttpObjectStorage, MemoryObjectStorage, type ObjectStorage } from "./storage.ts";
import {
	PassthroughTransformer,
	SharpTransformer,
	type ImageTransformer,
} from "./transformer.ts";

export { createApp } from "./server.ts";
export { OptimizerPipeline } from "./pipeline.ts";
export { Allowlist } from "./allowlist.ts";
export { parseTransformParams, canonicalize } from "./params.ts";
export { deriveCacheKey, hashBytes } from "./cache-key.ts";
export { negotiateFormat, outputFormatToMime } from "./format-negotiation.ts";
export { fetchSource } from "./source-fetch.ts";
export {
	HttpObjectStorage,
	MemoryObjectStorage,
	type ObjectStorage,
	type StoredObject,
} from "./storage.ts";
export {
	SharpTransformer,
	PassthroughTransformer,
	type ImageTransformer,
} from "./transformer.ts";
export * from "./types.ts";

async function main(): Promise<void> {
	const config = loadConfig();
	const storage: ObjectStorage = config.storageUrl
		? new HttpObjectStorage({
				baseUrl: config.storageUrl,
				...(config.storageAuth !== undefined
					? { authHeader: config.storageAuth }
					: {}),
			})
		: new MemoryObjectStorage();

	const transformer: ImageTransformer =
		(await SharpTransformer.create()) ?? new PassthroughTransformer();

	const app = createApp({
		allowlist: config.allowlist,
		storage,
		transformer,
	});

	// Bun.serve typing is loosely modelled here so we don't have to
	// pull in @types/bun's full surface as a runtime dep.
	const bun = (globalThis as { Bun?: { serve: (opts: unknown) => unknown } }).Bun;
	if (!bun) {
		throw new Error("image-optimizer requires Bun runtime");
	}
	bun.serve({
		port: config.port,
		fetch: app.fetch,
	});
	// eslint-disable-next-line no-console
	console.log(`[image-optimizer] listening on :${config.port}`);
}

if (import.meta.main) {
	void main();
}
