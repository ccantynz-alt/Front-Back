import { describe, expect, it } from "bun:test";
import { createRestApi } from "../src/api/rest.ts";
import { InMemoryInboundEventStore } from "../src/log/event-store.ts";
import { InMemoryInboundRouteRegistry } from "../src/registry/inbound-routes.ts";

function buildApi(tenantId = "acme") {
	const registry = new InMemoryInboundRouteRegistry();
	const events = new InMemoryInboundEventStore();
	const api = createRestApi({
		registry,
		events,
		authenticate: async (req) => {
			const auth = req.headers.get("authorization");
			if (auth === null) return null;
			return tenantId;
		},
	});
	return { api, registry, events };
}

describe("REST API", () => {
	it("rejects requests without auth", async () => {
		const { api } = buildApi();
		const res = await api.handle(
			new Request("http://x/v1/inbound/routes"),
		);
		expect(res.status).toBe(401);
	});

	it("creates a route", async () => {
		const { api } = buildApi();
		const res = await api.handle(
			new Request("http://x/v1/inbound/routes", {
				method: "POST",
				headers: {
					authorization: "Bearer t",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					tenantId: "ignored", // server overrides with auth
					pattern: "support@*.crontech.dev",
					webhookUrl: "https://hooks.acme.com/inbound",
					hmacSecret: "verysecretkey1234",
				}),
			}),
		);
		expect(res.status).toBe(201);
		const body = (await res.json()) as { id: string; tenantId: string };
		expect(body.id.startsWith("inroute_")).toBe(true);
		expect(body.tenantId).toBe("acme");
	});

	it("lists routes by tenant", async () => {
		const { api, registry } = buildApi();
		registry.create({
			tenantId: "acme",
			pattern: "a@b.com",
			webhookUrl: "https://h",
			hmacSecret: "verysecretkey1234",
			enabled: true,
		});
		const res = await api.handle(
			new Request("http://x/v1/inbound/routes", {
				headers: { authorization: "Bearer t" },
			}),
		);
		const body = (await res.json()) as { routes: Array<{ id: string }> };
		expect(body.routes.length).toBe(1);
	});

	it("returns 404 cross-tenant", async () => {
		const { api, registry } = buildApi();
		const r = registry.create({
			tenantId: "other",
			pattern: "a@b.com",
			webhookUrl: "https://h",
			hmacSecret: "verysecretkey1234",
			enabled: true,
		});
		const res = await api.handle(
			new Request(`http://x/v1/inbound/routes/${r.id}`, {
				headers: { authorization: "Bearer t" },
			}),
		);
		expect(res.status).toBe(404);
	});

	it("deletes a route", async () => {
		const { api, registry } = buildApi();
		const r = registry.create({
			tenantId: "acme",
			pattern: "a@b.com",
			webhookUrl: "https://h",
			hmacSecret: "verysecretkey1234",
			enabled: true,
		});
		const res = await api.handle(
			new Request(`http://x/v1/inbound/routes/${r.id}`, {
				method: "DELETE",
				headers: { authorization: "Bearer t" },
			}),
		);
		expect(res.status).toBe(204);
		expect(registry.get(r.id)).toBeNull();
	});

	it("lists events", async () => {
		const { api, events } = buildApi();
		events.append({
			tenantId: "acme",
			messageId: "m1",
			from: "x@y.com",
			to: ["a@b.com"],
			subject: "hi",
			receivedAt: new Date(),
			spfPass: true,
			dkimPass: false,
			routedTo: null,
			deliveryStatus: "no_route",
			attempts: 0,
		});
		const res = await api.handle(
			new Request("http://x/v1/inbound/events", {
				headers: { authorization: "Bearer t" },
			}),
		);
		const body = (await res.json()) as { events: Array<{ id: string }> };
		expect(body.events.length).toBe(1);
	});

	it("validates input", async () => {
		const { api } = buildApi();
		const res = await api.handle(
			new Request("http://x/v1/inbound/routes", {
				method: "POST",
				headers: {
					authorization: "Bearer t",
					"content-type": "application/json",
				},
				body: JSON.stringify({ pattern: "x", webhookUrl: "not-a-url" }),
			}),
		);
		expect(res.status).toBe(400);
	});
});
