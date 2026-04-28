import { z } from "zod";

/** Topology mode: full-mesh = every node peers with every other; hub-spoke = spokes peer through hub regions only. */
export const TopologyModeSchema = z.enum(["full-mesh", "hub-spoke"]);
export type TopologyMode = z.infer<typeof TopologyModeSchema>;

export const NodeRoleSchema = z.enum(["hub", "spoke", "peer"]);
export type NodeRole = z.infer<typeof NodeRoleSchema>;

/** A registered Crontech node in the mesh. */
export interface MeshNode {
	id: string;
	region: string;
	/** WireGuard x25519 public key, base64-encoded (32 raw bytes). */
	publicKey: string;
	/** Reachable endpoint as `host:port` (UDP). */
	endpoint: string;
	/**
	 * Allowed IPs the node *announces* it can route. The control-plane-allocated
	 * /32 inside `10.42.0.0/16` is always added implicitly.
	 */
	allowedIPs: string[];
	/** Tunnel-side IP allocated by the control plane (e.g. `10.42.0.7/32`). */
	tunnelIP: string;
	role: NodeRole;
	createdAt: number;
	lastSeenAt: number;
	/** Set when a key rotation has been issued; the previous public key is held until grace expires. */
	previousPublicKey?: string;
	previousKeyRetiresAt?: number;
}

/** Input for creating a new node. The control plane generates the keypair. */
export const CreateNodeInputSchema = z.object({
	id: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-zA-Z0-9_-]+$/, "id must be slug-like"),
	region: z.string().min(1).max(64),
	endpoint: z
		.string()
		.regex(/^[^\s]+:\d{1,5}$/, "endpoint must be host:port"),
	role: NodeRoleSchema.default("peer"),
	announcedAllowedIPs: z.array(z.string()).default([]),
});
export type CreateNodeInput = z.infer<typeof CreateNodeInputSchema>;

export const HeartbeatInputSchema = z.object({
	at: z.number().int().nonnegative().optional(),
});
export type HeartbeatInput = z.infer<typeof HeartbeatInputSchema>;

/** Result of a node creation: includes the freshly-generated private key, returned ONCE. */
export interface CreateNodeResult {
	node: MeshNode;
	/** WireGuard x25519 private key, base64-encoded. ONLY returned at creation/rotation. */
	privateKey: string;
}

/** Mesh-level options. */
export interface MeshOptions {
	topology: TopologyMode;
	/** CIDR for tunnel IP allocation. Default `10.42.0.0/16`. */
	cidr: string;
	/** Heartbeat dead-node threshold in milliseconds. Default 90_000. */
	deadNodeAfterMs: number;
	/** Grace period after key rotation before old key is purged. Default 300_000. */
	keyRotationGraceMs: number;
}

export const DEFAULT_MESH_OPTIONS: MeshOptions = {
	topology: "full-mesh",
	cidr: "10.42.0.0/16",
	deadNodeAfterMs: 90_000,
	keyRotationGraceMs: 300_000,
};
