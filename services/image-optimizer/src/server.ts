/**
 * HTTP server entry-point — mounts the optimizer pipeline behind a Hono app.
 *
 * Endpoints:
 *   GET  /healthz          → 200 "ok"
 *   GET  /transform?…      → image bytes + cache headers
 *
 * The Hono app is also exported (without `serve()` being called) so
 * tests can hit it via `app.request(...)` without binding a port.
 */

import { Hono } from "hono";
import { Allowlist, type AllowlistConfig } from "./allowlist.ts";
import { OptimizerPipeline, type PipelineDeps } from "./pipeline.ts";
import { OptimizerError } from "./types.ts";

export interface AppConfig {
	allowlist: AllowlistConfig;
}

export function createApp(deps: Omit<PipelineDeps, "allowlist"> & {
	allowlist: AllowlistConfig | Allowlist;
}): Hono {
	const allowlist =
		deps.allowlist instanceof Allowlist
			? deps.allowlist
			: new Allowlist(deps.allowlist);

	const pipelineDeps: PipelineDeps = {
		allowlist,
		storage: deps.storage,
		transformer: deps.transformer,
	};
	if (deps.fetchSource) pipelineDeps.fetchSource = deps.fetchSource;
	const pipeline = new OptimizerPipeline(pipelineDeps);

	const app = new Hono();

	app.get("/healthz", (c) => c.text("ok"));

	app.get("/transform", async (c) => {
		const url = new URL(c.req.url);
		const rawQuery: Record<string, string | undefined> = {};
		for (const [k, v] of url.searchParams.entries()) {
			rawQuery[k] = v;
		}
		const tenantId = c.req.header("x-tenant-id") ?? undefined;
		const acceptHeader = c.req.header("accept") ?? null;

		try {
			const pipelineReq: Parameters<typeof pipeline.run>[0] = {
				rawQuery,
				acceptHeader,
			};
			if (tenantId !== undefined) pipelineReq.tenantId = tenantId;
			const result = await pipeline.run(pipelineReq);
			c.header("content-type", result.contentType);
			c.header("x-cache", result.cacheHit ? "HIT" : "MISS");
			c.header("x-cache-key", result.cacheKey);
			// Aggressive edge cache: optimizer outputs are content-addressed,
			// so they're safe to cache for a year.
			c.header("cache-control", "public, max-age=31536000, immutable");
			return c.body(result.bytes as unknown as ArrayBuffer, 200);
		} catch (err) {
			if (err instanceof OptimizerError) {
				return c.json(
					{ error: err.code, message: err.message },
					err.status as never,
				);
			}
			return c.json(
				{
					error: "INTERNAL_ERROR",
					message: (err as Error).message ?? "unknown error",
				},
				500,
			);
		}
	});

	return app;
}
