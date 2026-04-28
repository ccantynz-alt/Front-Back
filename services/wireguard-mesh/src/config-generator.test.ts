import { describe, expect, test } from "bun:test";
import { renderWgConfig, selectPeers } from "./config-generator";
import type { MeshNode } from "./types";

const node = (over: Partial<MeshNode>): MeshNode => ({
	id: over.id ?? "n",
	region: over.region ?? "r",
	publicKey: over.publicKey ?? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
	endpoint: over.endpoint ?? "1.2.3.4:51820",
	allowedIPs: over.allowedIPs ?? [],
	tunnelIP: over.tunnelIP ?? "10.42.0.2/32",
	role: over.role ?? "peer",
	createdAt: over.createdAt ?? 0,
	lastSeenAt: over.lastSeenAt ?? 0,
});

describe("config-generator", () => {
	test("full-mesh selectPeers returns every other node, sorted", () => {
		const nodes = [
			node({ id: "c" }),
			node({ id: "a" }),
			node({ id: "b" }),
		];
		const peers = selectPeers("a", nodes, "full-mesh");
		expect(peers.map((n) => n.id)).toEqual(["b", "c"]);
	});

	test("hub-spoke: hub peers with everyone", () => {
		const nodes = [
			node({ id: "hub", role: "hub" }),
			node({ id: "s1", role: "spoke" }),
			node({ id: "s2", role: "spoke" }),
		];
		const peers = selectPeers("hub", nodes, "hub-spoke");
		expect(peers.map((n) => n.id)).toEqual(["s1", "s2"]);
	});

	test("hub-spoke: spoke only peers with hubs", () => {
		const nodes = [
			node({ id: "hub", role: "hub" }),
			node({ id: "s1", role: "spoke" }),
			node({ id: "s2", role: "spoke" }),
		];
		const peers = selectPeers("s1", nodes, "hub-spoke");
		expect(peers.map((n) => n.id)).toEqual(["hub"]);
	});

	test("renderWgConfig matches wg-quick shape", () => {
		const self = node({
			id: "alpha",
			region: "us-east",
			tunnelIP: "10.42.0.2/32",
			role: "hub",
		});
		const peer = node({
			id: "beta",
			region: "eu-west",
			tunnelIP: "10.42.0.3/32",
			endpoint: "5.6.7.8:51820",
			publicKey: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=",
			allowedIPs: ["192.168.10.0/24"],
		});
		const conf = renderWgConfig({
			self,
			privateKey: "PRIVATEKEYPLACEHOLDERPRIVATEKEYPLACEHOLDER0=",
			peers: [peer],
		});
		expect(conf).toContain("[Interface]");
		expect(conf).toContain("PrivateKey = PRIVATEKEYPLACEHOLDERPRIVATEKEYPLACEHOLDER0=");
		expect(conf).toContain("Address = 10.42.0.2/32");
		expect(conf).toContain("ListenPort = 51820");
		expect(conf).toContain("[Peer]");
		expect(conf).toContain("PublicKey = BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=");
		// AllowedIPs must include both the tunnel /32 and any announced subnets.
		expect(conf).toMatch(/AllowedIPs = 10\.42\.0\.3\/32, 192\.168\.10\.0\/24/);
		expect(conf).toContain("Endpoint = 5.6.7.8:51820");
		expect(conf).toContain("PersistentKeepalive = 25");
		// Trailing newline.
		expect(conf.endsWith("\n")).toBe(true);
	});

	test("renderWgConfig dedupes overlapping AllowedIPs", () => {
		const self = node({ id: "alpha" });
		const peer = node({
			id: "beta",
			tunnelIP: "10.42.0.3/32",
			// Duplicate the tunnel /32 in announced ranges; should appear once.
			allowedIPs: ["10.42.0.3/32", "10.42.0.3/32"],
		});
		const conf = renderWgConfig({
			self,
			privateKey: "x",
			peers: [peer],
		});
		const matches = conf.match(/10\.42\.0\.3\/32/g) ?? [];
		// Once in the AllowedIPs line. (No standalone Address line for the peer.)
		expect(matches.length).toBe(1);
	});

	test("renderWgConfig is stable: same input -> same output", () => {
		const self = node({ id: "alpha" });
		const peer = node({ id: "beta", tunnelIP: "10.42.0.3/32" });
		const a = renderWgConfig({ self, privateKey: "x", peers: [peer] });
		const b = renderWgConfig({ self, privateKey: "x", peers: [peer] });
		expect(a).toBe(b);
	});
});
