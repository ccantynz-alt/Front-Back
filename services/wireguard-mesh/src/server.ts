import { Hono } from "hono";
import { Mesh } from "./mesh";
import {
	CreateNodeInputSchema,
	HeartbeatInputSchema,
	type MeshOptions,
} from "./types";

export interface ServerOptions {
	/** Bearer token required for all admin endpoints. */
	adminToken: string;
	mesh?: Mesh;
	meshOptions?: Partial<MeshOptions>;
}

/**
 * Build the Hono app exposing the WireGuard mesh control plane.
 *
 * Endpoints (all admin endpoints require `Authorization: Bearer <token>`):
 *
 *   GET  /health                        — liveness, no auth
 *   GET  /nodes                         — list nodes (excludes private keys)
 *   POST /nodes                         — register a node, mint keypair, return private key once
 *   GET  /nodes/:id                     — fetch single node metadata
 *   GET  /nodes/:id/config              — render wg-quick config for the node
 *   POST /nodes/:id/heartbeat           — node liveness ping
 *   POST /nodes/:id/rotate              — rotate keys, return new private key once
 *   DELETE /nodes/:id                   — deregister a node and free its tunnel IP
 */
export function buildServer(opts: ServerOptions) {
	const mesh = opts.mesh ?? new Mesh(opts.meshOptions);
	const app = new Hono();

	app.get("/health", (c) =>
		c.json({
			ok: true,
			topology: mesh.topology,
			nodes: mesh.listNodes().length,
		}),
	);

	const requireAuth = async (
		c: Parameters<Parameters<typeof app.use>[1]>[0],
		next: () => Promise<void>,
	) => {
		const header = c.req.header("authorization") ?? "";
		const expected = `Bearer ${opts.adminToken}`;
		if (header !== expected) {
			return c.json({ error: "unauthorized" }, 401);
		}
		await next();
		return;
	};

	app.use("/nodes", requireAuth);
	app.use("/nodes/*", requireAuth);

	app.get("/nodes", (c) => c.json({ nodes: mesh.listNodes() }));

	app.post("/nodes", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = CreateNodeInputSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
		}
		try {
			const result = mesh.registerNode(parsed.data);
			return c.json(result, 201);
		} catch (e) {
			return c.json({ error: (e as Error).message }, 409);
		}
	});

	app.get("/nodes/:id", (c) => {
		const node = mesh.getNode(c.req.param("id"));
		if (!node) return c.json({ error: "not found" }, 404);
		return c.json({ node });
	});

	app.delete("/nodes/:id", (c) => {
		const ok = mesh.removeNode(c.req.param("id"));
		if (!ok) return c.json({ error: "not found" }, 404);
		return c.json({ ok: true });
	});

	app.get("/nodes/:id/config", (c) => {
		try {
			const conf = mesh.configFor(c.req.param("id"));
			return c.text(conf, 200, { "content-type": "text/plain; charset=utf-8" });
		} catch (e) {
			return c.json({ error: (e as Error).message }, 404);
		}
	});

	app.post("/nodes/:id/heartbeat", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = HeartbeatInputSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
		}
		const updated = mesh.heartbeat(
			c.req.param("id"),
			parsed.data.at,
		);
		if (!updated) return c.json({ error: "not found" }, 404);
		return c.json({ node: updated });
	});

	app.post("/nodes/:id/rotate", (c) => {
		try {
			const result = mesh.rotateKeys(c.req.param("id"));
			return c.json(result);
		} catch (e) {
			return c.json({ error: (e as Error).message }, 404);
		}
	});

	return { app, mesh };
}
