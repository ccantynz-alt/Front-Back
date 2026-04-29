import { buildServer } from "./server";
import type { MeshOptions, TopologyMode } from "./types";

export { Mesh } from "./mesh";
export { IpAllocator } from "./ip-allocator";
export { generateKeyPair, generateKeyPairFromSeed, isValidWgKey } from "./keys";
export { renderWgConfig, selectPeers } from "./config-generator";
export { buildServer } from "./server";
export type {
	MeshNode,
	MeshOptions,
	TopologyMode,
	NodeRole,
	CreateNodeInput,
	CreateNodeResult,
	HeartbeatInput,
} from "./types";

/**
 * Boot the control plane when this file is the entrypoint
 * (`bun run src/index.ts`). Uses env:
 *
 *   WGM_ADMIN_TOKEN  — required, bearer token for admin endpoints
 *   WGM_PORT         — listen port (default 8787)
 *   WGM_TOPOLOGY     — full-mesh | hub-spoke (default full-mesh)
 *   WGM_CIDR         — tunnel CIDR (default 10.42.0.0/16)
 */
function main() {
	const adminToken = process.env["WGM_ADMIN_TOKEN"];
	if (!adminToken) {
		console.error("WGM_ADMIN_TOKEN is required");
		process.exit(1);
	}
	const port = Number(process.env["WGM_PORT"] ?? "8787");
	const topology = (process.env["WGM_TOPOLOGY"] ?? "full-mesh") as TopologyMode;
	const cidr = process.env["WGM_CIDR"] ?? "10.42.0.0/16";

	const meshOptions: Partial<MeshOptions> = { topology, cidr };
	const { app } = buildServer({ adminToken, meshOptions });
	console.log(
		`[wireguard-mesh] listening on :${port} topology=${topology} cidr=${cidr}`,
	);
	// Bun's Bun.serve is the most direct path; Hono exposes a `fetch` handler.
	Bun.serve({ port, fetch: app.fetch });
}

if (import.meta.main) {
	main();
}
