/**
 * Runtime configuration loaded from environment variables.
 *
 * IMAGE_OPT_PORT                — listen port (default 3055)
 * IMAGE_OPT_ALLOWLIST           — JSON: { "tenants": { "default": ["*.example.com"] }, "defaultTenant": "default" }
 * IMAGE_OPT_STORAGE_URL         — base URL of the object-storage HTTP service (omit → in-memory cache)
 * IMAGE_OPT_STORAGE_AUTH        — value for the Authorization header on storage requests
 * IMAGE_OPT_MAX_SOURCE_BYTES    — hard cap on source-image size (default 25 MiB)
 *
 * Configuration is parsed once at boot.  Any malformed value aborts
 * startup loudly rather than silently falling back to defaults — we
 * want config errors to be unmissable in CI.
 */

import { z } from "zod";
import type { AllowlistConfig } from "./allowlist.ts";

const allowlistSchema = z.object({
	tenants: z.record(z.string(), z.array(z.string())),
	defaultTenant: z.string().optional(),
});

export interface RuntimeConfig {
	port: number;
	allowlist: AllowlistConfig;
	storageUrl: string | undefined;
	storageAuth: string | undefined;
	maxSourceBytes: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
	const port = Number.parseInt(env.IMAGE_OPT_PORT ?? "3055", 10);
	if (!Number.isFinite(port) || port < 1 || port > 65535) {
		throw new Error(`IMAGE_OPT_PORT must be a valid TCP port, got '${env.IMAGE_OPT_PORT}'`);
	}

	const allowlistJson = env.IMAGE_OPT_ALLOWLIST ?? '{"tenants":{}}';
	let allowlist: AllowlistConfig;
	try {
		const parsed = JSON.parse(allowlistJson);
		const validated = allowlistSchema.parse(parsed);
		allowlist = {
			tenants: validated.tenants,
			...(validated.defaultTenant !== undefined
				? { defaultTenant: validated.defaultTenant }
				: {}),
		};
	} catch (err) {
		throw new Error(
			`IMAGE_OPT_ALLOWLIST is not valid JSON or schema: ${(err as Error).message}`,
		);
	}

	const maxSourceBytes = Number.parseInt(
		env.IMAGE_OPT_MAX_SOURCE_BYTES ?? `${25 * 1024 * 1024}`,
		10,
	);
	if (!Number.isFinite(maxSourceBytes) || maxSourceBytes <= 0) {
		throw new Error("IMAGE_OPT_MAX_SOURCE_BYTES must be a positive integer");
	}

	return {
		port,
		allowlist,
		storageUrl: env.IMAGE_OPT_STORAGE_URL,
		storageAuth: env.IMAGE_OPT_STORAGE_AUTH,
		maxSourceBytes,
	};
}
