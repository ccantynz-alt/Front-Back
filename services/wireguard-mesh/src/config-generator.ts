import type { MeshNode, MeshOptions } from "./types";

/**
 * Determine which nodes are peers of `selfId` given the current topology.
 *
 *   - full-mesh: every other live node is a peer.
 *   - hub-spoke: hubs peer with all other nodes; spokes peer only with hubs.
 *
 * Returns peers deterministically sorted by id (so the generated config is
 * stable across calls — important for `wg syncconf` not flapping needlessly).
 */
export function selectPeers(
	selfId: string,
	nodes: ReadonlyArray<MeshNode>,
	topology: MeshOptions["topology"],
): MeshNode[] {
	const self = nodes.find((n) => n.id === selfId);
	if (!self) return [];
	const others = nodes.filter((n) => n.id !== selfId);
	let peers: MeshNode[];
	if (topology === "full-mesh") {
		peers = others;
	} else {
		// hub-spoke
		if (self.role === "hub") {
			peers = others;
		} else {
			peers = others.filter((n) => n.role === "hub");
		}
	}
	return [...peers].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Generate a wg-quick `wg0.conf` for the given node.
 *
 * Format (see `man wg-quick.8` and `man wg.8`):
 *
 *   [Interface]
 *   PrivateKey = ...
 *   Address = 10.42.0.X/32
 *   ListenPort = 51820
 *
 *   [Peer]
 *   # node-id = peer-a (region=us-east, role=peer)
 *   PublicKey = ...
 *   AllowedIPs = 10.42.0.Y/32, ...
 *   Endpoint = host:port
 *   PersistentKeepalive = 25
 */
export interface RenderConfigInput {
	self: MeshNode;
	privateKey: string;
	peers: MeshNode[];
	listenPort?: number;
	persistentKeepalive?: number;
}

export function renderWgConfig(input: RenderConfigInput): string {
	const port = input.listenPort ?? 51820;
	const keepalive = input.persistentKeepalive ?? 25;
	const lines: string[] = [];
	lines.push("[Interface]");
	lines.push(`# node-id = ${input.self.id} (region=${input.self.region}, role=${input.self.role})`);
	lines.push(`PrivateKey = ${input.privateKey}`);
	lines.push(`Address = ${input.self.tunnelIP}`);
	lines.push(`ListenPort = ${port}`);

	for (const peer of input.peers) {
		lines.push("");
		lines.push("[Peer]");
		lines.push(`# node-id = ${peer.id} (region=${peer.region}, role=${peer.role})`);
		lines.push(`PublicKey = ${peer.publicKey}`);
		const allowed = uniqueAllowedIPs([peer.tunnelIP, ...peer.allowedIPs]);
		lines.push(`AllowedIPs = ${allowed.join(", ")}`);
		lines.push(`Endpoint = ${peer.endpoint}`);
		lines.push(`PersistentKeepalive = ${keepalive}`);
	}

	// Trailing newline matches wg-quick's own style.
	return `${lines.join("\n")}\n`;
}

function uniqueAllowedIPs(items: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const it of items) {
		if (!it) continue;
		const norm = it.includes("/") ? it : `${it}/32`;
		if (seen.has(norm)) continue;
		seen.add(norm);
		out.push(norm);
	}
	return out;
}
