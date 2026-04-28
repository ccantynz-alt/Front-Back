import { beforeEach, describe, expect, test } from "bun:test";
import { type Clock, Mesh } from "./mesh";

class FakeClock implements Clock {
	t = 1_000_000;
	now() {
		return this.t;
	}
	advance(ms: number) {
		this.t += ms;
	}
}

describe("Mesh", () => {
	let clock: FakeClock;
	let mesh: Mesh;

	beforeEach(() => {
		clock = new FakeClock();
		mesh = new Mesh(
			{
				topology: "full-mesh",
				cidr: "10.42.0.0/16",
				deadNodeAfterMs: 90_000,
				keyRotationGraceMs: 300_000,
			},
			clock,
		);
	});

	test("registerNode allocates IP, mints keys, returns private key", () => {
		const r = mesh.registerNode({
			id: "alpha",
			region: "us-east",
			endpoint: "1.2.3.4:51820",
			role: "hub",
			announcedAllowedIPs: [],
		});
		expect(r.node.id).toBe("alpha");
		expect(r.node.tunnelIP).toBe("10.42.0.2/32");
		expect(r.privateKey.length).toBeGreaterThan(0);
		expect(r.node.publicKey.length).toBeGreaterThan(0);
		expect(r.node.lastSeenAt).toBe(clock.now());
	});

	test("registerNode rejects duplicate id", () => {
		mesh.registerNode({
			id: "alpha",
			region: "r",
			endpoint: "1.2.3.4:51820",
			role: "peer",
			announcedAllowedIPs: [],
		});
		expect(() =>
			mesh.registerNode({
				id: "alpha",
				region: "r",
				endpoint: "1.2.3.4:51820",
				role: "peer",
				announcedAllowedIPs: [],
			}),
		).toThrow(/already exists/);
	});

	test("removeNode frees the tunnel IP for reuse", () => {
		mesh.registerNode({
			id: "a",
			region: "r",
			endpoint: "1.1.1.1:51820",
			role: "peer",
			announcedAllowedIPs: [],
		});
		mesh.registerNode({
			id: "b",
			region: "r",
			endpoint: "2.2.2.2:51820",
			role: "peer",
			announcedAllowedIPs: [],
		});
		mesh.removeNode("a");
		const c = mesh.registerNode({
			id: "c",
			region: "r",
			endpoint: "3.3.3.3:51820",
			role: "peer",
			announcedAllowedIPs: [],
		});
		// freed .2 should be reissued before issuing .4.
		expect(c.node.tunnelIP).toBe("10.42.0.2/32");
	});

	test("heartbeat updates lastSeenAt and detects dead nodes", () => {
		mesh.registerNode({
			id: "a",
			region: "r",
			endpoint: "1.1.1.1:51820",
			role: "peer",
			announcedAllowedIPs: [],
		});
		// Advance time past dead threshold.
		clock.advance(91_000);
		expect(mesh.deadNodes().map((n) => n.id)).toEqual(["a"]);

		// Heartbeat resurrects.
		mesh.heartbeat("a");
		expect(mesh.deadNodes().length).toBe(0);
	});

	test("rotateKeys keeps previous public key alive during grace period", () => {
		const reg = mesh.registerNode({
			id: "a",
			region: "r",
			endpoint: "1.1.1.1:51820",
			role: "peer",
			announcedAllowedIPs: [],
		});
		const oldPub = reg.node.publicKey;
		const rot = mesh.rotateKeys("a");
		expect(rot.node.publicKey).not.toBe(oldPub);
		expect(rot.node.previousPublicKey).toBe(oldPub);
		expect(rot.node.previousKeyRetiresAt).toBe(clock.now() + 300_000);
		expect(rot.privateKey).not.toBe(reg.privateKey);

		// Still in grace -> previous key retained on heartbeat.
		clock.advance(60_000);
		const hb1 = mesh.heartbeat("a");
		expect(hb1?.previousPublicKey).toBe(oldPub);

		// Past grace -> previous key purged on heartbeat.
		clock.advance(300_000);
		const hb2 = mesh.heartbeat("a");
		expect(hb2?.previousPublicKey).toBeUndefined();
		expect(hb2?.previousKeyRetiresAt).toBeUndefined();
	});

	test("configFor renders a wg-quick config with all live peers", () => {
		mesh.registerNode({
			id: "alpha",
			region: "us-east",
			endpoint: "1.1.1.1:51820",
			role: "hub",
			announcedAllowedIPs: [],
		});
		mesh.registerNode({
			id: "beta",
			region: "eu-west",
			endpoint: "2.2.2.2:51820",
			role: "peer",
			announcedAllowedIPs: [],
		});
		mesh.registerNode({
			id: "gamma",
			region: "ap-south",
			endpoint: "3.3.3.3:51820",
			role: "peer",
			announcedAllowedIPs: [],
		});
		const conf = mesh.configFor("alpha");
		expect(conf).toContain("# node-id = alpha");
		expect(conf).toContain("# node-id = beta");
		expect(conf).toContain("# node-id = gamma");
	});

	test("configFor excludes dead nodes from peer list", () => {
		mesh.registerNode({
			id: "alpha",
			region: "r",
			endpoint: "1.1.1.1:51820",
			role: "peer",
			announcedAllowedIPs: [],
		});
		mesh.registerNode({
			id: "beta",
			region: "r",
			endpoint: "2.2.2.2:51820",
			role: "peer",
			announcedAllowedIPs: [],
		});
		// Advance past dead threshold for both.
		clock.advance(91_000);
		// Heartbeat alpha so only beta is dead.
		mesh.heartbeat("alpha");
		const conf = mesh.configFor("alpha");
		expect(conf).toContain("# node-id = alpha");
		expect(conf).not.toContain("# node-id = beta");
	});

	test("hub-spoke topology: spoke config only contains hub peers", () => {
		const spokeMesh = new Mesh(
			{ topology: "hub-spoke", cidr: "10.42.0.0/16" },
			clock,
		);
		spokeMesh.registerNode({
			id: "hub1",
			region: "r",
			endpoint: "1.1.1.1:51820",
			role: "hub",
			announcedAllowedIPs: [],
		});
		spokeMesh.registerNode({
			id: "spokeA",
			region: "r",
			endpoint: "2.2.2.2:51820",
			role: "spoke",
			announcedAllowedIPs: [],
		});
		spokeMesh.registerNode({
			id: "spokeB",
			region: "r",
			endpoint: "3.3.3.3:51820",
			role: "spoke",
			announcedAllowedIPs: [],
		});
		const confSpoke = spokeMesh.configFor("spokeA");
		expect(confSpoke).toContain("# node-id = hub1");
		expect(confSpoke).not.toContain("# node-id = spokeB");
		const confHub = spokeMesh.configFor("hub1");
		expect(confHub).toContain("# node-id = spokeA");
		expect(confHub).toContain("# node-id = spokeB");
	});

	test("rotateKeys/configFor on unknown node throws", () => {
		expect(() => mesh.rotateKeys("ghost")).toThrow(/unknown node/);
		expect(() => mesh.configFor("ghost")).toThrow(/unknown node/);
	});
});
