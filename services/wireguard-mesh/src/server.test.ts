import { describe, expect, test } from "bun:test";
import { buildServer } from "./server";

const TOKEN = "test-token-correct-horse-battery-staple";
const auth = { authorization: `Bearer ${TOKEN}` };

function freshServer() {
	return buildServer({ adminToken: TOKEN });
}

describe("HTTP server", () => {
	test("GET /health is unauthenticated and returns ok", async () => {
		const { app } = freshServer();
		const res = await app.request("/health");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; topology: string };
		expect(body.ok).toBe(true);
		expect(body.topology).toBe("full-mesh");
	});

	test("admin endpoints reject missing/wrong bearer token", async () => {
		const { app } = freshServer();
		const noAuth = await app.request("/nodes");
		expect(noAuth.status).toBe(401);
		const wrongAuth = await app.request("/nodes", {
			headers: { authorization: "Bearer wrong" },
		});
		expect(wrongAuth.status).toBe(401);
	});

	test("POST /nodes registers and returns one-time private key", async () => {
		const { app } = freshServer();
		const res = await app.request("/nodes", {
			method: "POST",
			headers: { ...auth, "content-type": "application/json" },
			body: JSON.stringify({
				id: "alpha",
				region: "us-east",
				endpoint: "1.2.3.4:51820",
				role: "hub",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			node: { id: string; tunnelIP: string };
			privateKey: string;
		};
		expect(body.node.id).toBe("alpha");
		expect(body.node.tunnelIP).toBe("10.42.0.2/32");
		expect(body.privateKey.length).toBeGreaterThan(0);
	});

	test("POST /nodes rejects invalid input", async () => {
		const { app } = freshServer();
		const res = await app.request("/nodes", {
			method: "POST",
			headers: { ...auth, "content-type": "application/json" },
			body: JSON.stringify({ id: "", region: "r", endpoint: "no-port" }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /nodes rejects duplicate id with 409", async () => {
		const { app } = freshServer();
		const create = () =>
			app.request("/nodes", {
				method: "POST",
				headers: { ...auth, "content-type": "application/json" },
				body: JSON.stringify({
					id: "alpha",
					region: "r",
					endpoint: "1.1.1.1:51820",
				}),
			});
		const a = await create();
		expect(a.status).toBe(201);
		const b = await create();
		expect(b.status).toBe(409);
	});

	test("GET /nodes/:id/config renders text/plain wg config", async () => {
		const { app } = freshServer();
		await app.request("/nodes", {
			method: "POST",
			headers: { ...auth, "content-type": "application/json" },
			body: JSON.stringify({
				id: "alpha",
				region: "r",
				endpoint: "1.1.1.1:51820",
			}),
		});
		const res = await app.request("/nodes/alpha/config", { headers: auth });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type") ?? "").toContain("text/plain");
		const text = await res.text();
		expect(text).toContain("[Interface]");
		expect(text).toContain("Address = 10.42.0.2/32");
	});

	test("POST /nodes/:id/heartbeat updates lastSeenAt", async () => {
		const { app } = freshServer();
		await app.request("/nodes", {
			method: "POST",
			headers: { ...auth, "content-type": "application/json" },
			body: JSON.stringify({
				id: "alpha",
				region: "r",
				endpoint: "1.1.1.1:51820",
			}),
		});
		const at = 9_999_999_999;
		const res = await app.request("/nodes/alpha/heartbeat", {
			method: "POST",
			headers: { ...auth, "content-type": "application/json" },
			body: JSON.stringify({ at }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { node: { lastSeenAt: number } };
		expect(body.node.lastSeenAt).toBe(at);
	});

	test("POST /nodes/:id/rotate yields a new keypair", async () => {
		const { app } = freshServer();
		const initial = await app.request("/nodes", {
			method: "POST",
			headers: { ...auth, "content-type": "application/json" },
			body: JSON.stringify({
				id: "alpha",
				region: "r",
				endpoint: "1.1.1.1:51820",
			}),
		});
		const initialBody = (await initial.json()) as {
			node: { publicKey: string };
			privateKey: string;
		};
		const rot = await app.request("/nodes/alpha/rotate", {
			method: "POST",
			headers: auth,
		});
		expect(rot.status).toBe(200);
		const rotBody = (await rot.json()) as {
			node: { publicKey: string; previousPublicKey?: string };
			privateKey: string;
		};
		expect(rotBody.node.publicKey).not.toBe(initialBody.node.publicKey);
		expect(rotBody.node.previousPublicKey).toBe(initialBody.node.publicKey);
		expect(rotBody.privateKey).not.toBe(initialBody.privateKey);
	});

	test("DELETE /nodes/:id deregisters", async () => {
		const { app } = freshServer();
		await app.request("/nodes", {
			method: "POST",
			headers: { ...auth, "content-type": "application/json" },
			body: JSON.stringify({
				id: "alpha",
				region: "r",
				endpoint: "1.1.1.1:51820",
			}),
		});
		const del = await app.request("/nodes/alpha", {
			method: "DELETE",
			headers: auth,
		});
		expect(del.status).toBe(200);
		const get = await app.request("/nodes/alpha", { headers: auth });
		expect(get.status).toBe(404);
	});

	test("GET /nodes lists registered nodes", async () => {
		const { app } = freshServer();
		await app.request("/nodes", {
			method: "POST",
			headers: { ...auth, "content-type": "application/json" },
			body: JSON.stringify({
				id: "alpha",
				region: "r",
				endpoint: "1.1.1.1:51820",
			}),
		});
		await app.request("/nodes", {
			method: "POST",
			headers: { ...auth, "content-type": "application/json" },
			body: JSON.stringify({
				id: "beta",
				region: "r",
				endpoint: "2.2.2.2:51820",
			}),
		});
		const res = await app.request("/nodes", { headers: auth });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { nodes: Array<{ id: string }> };
		expect(body.nodes.map((n) => n.id).sort()).toEqual(["alpha", "beta"]);
	});
});
