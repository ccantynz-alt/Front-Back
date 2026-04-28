import { renderWgConfig, selectPeers } from "./config-generator";
import { IpAllocator } from "./ip-allocator";
import { generateKeyPair } from "./keys";
import {
	type CreateNodeInput,
	type CreateNodeResult,
	DEFAULT_MESH_OPTIONS,
	type MeshNode,
	type MeshOptions,
} from "./types";

/** Pluggable clock so tests can advance time without `setTimeout` weirdness. */
export interface Clock {
	now(): number;
}

const wallClock: Clock = { now: () => Date.now() };

/**
 * The in-memory WireGuard mesh registry / control plane.
 *
 * Stores private keys for nodes that the control plane minted. In production
 * you'd swap this for a sealed-secret store (Vault, KMS, sealed-D1, etc.) — the
 * interface is stable so the swap is a single dependency injection.
 */
export class Mesh {
	private readonly nodes = new Map<string, MeshNode>();
	private readonly privateKeys = new Map<string, string>();
	private readonly allocator: IpAllocator;
	private readonly clock: Clock;
	readonly options: MeshOptions;

	constructor(options?: Partial<MeshOptions>, clock: Clock = wallClock) {
		this.options = { ...DEFAULT_MESH_OPTIONS, ...options };
		this.allocator = new IpAllocator(this.options.cidr);
		this.clock = clock;
	}

	listNodes(): MeshNode[] {
		return [...this.nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
	}

	getNode(id: string): MeshNode | undefined {
		return this.nodes.get(id);
	}

	registerNode(input: CreateNodeInput): CreateNodeResult {
		if (this.nodes.has(input.id)) {
			throw new Error(`node already exists: ${input.id}`);
		}
		const tunnelIP = this.allocator.allocate();
		const { publicKey, privateKey } = generateKeyPair();
		const now = this.clock.now();
		const node: MeshNode = {
			id: input.id,
			region: input.region,
			publicKey,
			endpoint: input.endpoint,
			allowedIPs: [...input.announcedAllowedIPs],
			tunnelIP,
			role: input.role,
			createdAt: now,
			lastSeenAt: now,
		};
		this.nodes.set(node.id, node);
		this.privateKeys.set(node.id, privateKey);
		return { node, privateKey };
	}

	removeNode(id: string): boolean {
		const node = this.nodes.get(id);
		if (!node) return false;
		this.allocator.free(node.tunnelIP);
		this.nodes.delete(id);
		this.privateKeys.delete(id);
		return true;
	}

	heartbeat(id: string, at?: number): MeshNode | undefined {
		const node = this.nodes.get(id);
		if (!node) return undefined;
		const stamp = at ?? this.clock.now();
		const updated: MeshNode = { ...node, lastSeenAt: stamp };
		// Also purge expired previous keys on contact.
		if (
			updated.previousKeyRetiresAt !== undefined &&
			stamp >= updated.previousKeyRetiresAt
		) {
			delete updated.previousPublicKey;
			delete updated.previousKeyRetiresAt;
		}
		this.nodes.set(id, updated);
		return updated;
	}

	/**
	 * Returns nodes whose `lastSeenAt` is older than the dead threshold relative
	 * to `at` (defaults to current clock). Does NOT mutate state — callers can
	 * decide whether to evict, alert, or just exclude from config generation.
	 */
	deadNodes(at?: number): MeshNode[] {
		const stamp = at ?? this.clock.now();
		return this.listNodes().filter(
			(n) => stamp - n.lastSeenAt > this.options.deadNodeAfterMs,
		);
	}

	/**
	 * Rotate keys for a node. Returns the new private key (only time it leaves
	 * the control plane). The previous public key is retained for
	 * `keyRotationGraceMs` so peers that haven't yet picked up the new config
	 * still validate against the old one — soft cutover, no flap.
	 */
	rotateKeys(id: string): CreateNodeResult {
		const node = this.nodes.get(id);
		if (!node) throw new Error(`unknown node: ${id}`);
		const { publicKey, privateKey } = generateKeyPair();
		const now = this.clock.now();
		const rotated: MeshNode = {
			...node,
			publicKey,
			previousPublicKey: node.publicKey,
			previousKeyRetiresAt: now + this.options.keyRotationGraceMs,
		};
		this.nodes.set(id, rotated);
		this.privateKeys.set(id, privateKey);
		return { node: rotated, privateKey };
	}

	/** Generate the wg-quick config a given node should run. */
	configFor(id: string): string {
		const self = this.nodes.get(id);
		if (!self) throw new Error(`unknown node: ${id}`);
		const privateKey = this.privateKeys.get(id);
		if (!privateKey) throw new Error(`no private key on file for ${id}`);
		// Exclude dead nodes from the active peer list so we don't keep dialing
		// a black hole. They'll come back automatically once heartbeats resume.
		const dead = new Set(this.deadNodes().map((n) => n.id));
		const liveNodes = this.listNodes().filter((n) => !dead.has(n.id));
		const peers = selectPeers(id, liveNodes, this.options.topology);
		return renderWgConfig({ self, privateKey, peers });
	}

	/** For tests/debug only: peek at a stored private key. Never expose over HTTP. */
	_peekPrivateKey(id: string): string | undefined {
		return this.privateKeys.get(id);
	}

	get topology(): MeshOptions["topology"] {
		return this.options.topology;
	}
}
