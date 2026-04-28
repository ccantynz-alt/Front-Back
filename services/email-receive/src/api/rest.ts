/**
 * REST handler for inbound route CRUD + event queries. Framework-agnostic:
 * exposes a single `handle(request)` returning a Response, so the host
 * (Hono on Bun, or a Cloudflare Worker) can mount it. apps/api wires it.
 */

import type { InboundEventStore } from "../log/event-store.ts";
import type { InboundRouteRegistry } from "../registry/inbound-routes.ts";
import { inboundRouteCreateSchema } from "../types/index.ts";

export interface RestApiOptions {
	readonly registry: InboundRouteRegistry;
	readonly events: InboundEventStore;
	/** Resolves tenant from inbound auth header. Tests inject a stub. */
	readonly authenticate: (req: Request) => Promise<string | null>;
}

const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});

export function createRestApi(options: RestApiOptions): {
	handle: (req: Request) => Promise<Response>;
} {
	const { registry, events, authenticate } = options;

	return {
		async handle(req: Request): Promise<Response> {
			const url = new URL(req.url);
			const tenantId = await authenticate(req);
			if (tenantId === null) {
				return json({ error: "unauthorized" }, 401);
			}

			// POST /v1/inbound/routes
			if (req.method === "POST" && url.pathname === "/v1/inbound/routes") {
				let body: unknown;
				try {
					body = await req.json();
				} catch {
					return json({ error: "invalid json" }, 400);
				}
				const parsed = inboundRouteCreateSchema.safeParse({
					...(typeof body === "object" && body !== null ? body : {}),
					tenantId,
				});
				if (!parsed.success) {
					return json({ error: "validation", issues: parsed.error.issues }, 400);
				}
				const route = registry.create(parsed.data);
				return json(serializeRoute(route), 201);
			}

			// GET /v1/inbound/routes
			if (req.method === "GET" && url.pathname === "/v1/inbound/routes") {
				const routes = registry.listByTenant(tenantId).map(serializeRoute);
				return json({ routes });
			}

			// GET /v1/inbound/routes/:id
			const routeIdMatch = /^\/v1\/inbound\/routes\/([^/]+)$/.exec(url.pathname);
			if (req.method === "GET" && routeIdMatch !== null) {
				const r = registry.get(routeIdMatch[1] ?? "");
				if (r === null || r.tenantId !== tenantId) {
					return json({ error: "not found" }, 404);
				}
				return json(serializeRoute(r));
			}
			if (req.method === "PATCH" && routeIdMatch !== null) {
				const r = registry.get(routeIdMatch[1] ?? "");
				if (r === null || r.tenantId !== tenantId) {
					return json({ error: "not found" }, 404);
				}
				let body: unknown;
				try {
					body = await req.json();
				} catch {
					return json({ error: "invalid json" }, 400);
				}
				const updated = registry.update(
					r.id,
					typeof body === "object" && body !== null
						? (body as Record<string, never>)
						: {},
				);
				if (updated === null) return json({ error: "not found" }, 404);
				return json(serializeRoute(updated));
			}
			if (req.method === "DELETE" && routeIdMatch !== null) {
				const r = registry.get(routeIdMatch[1] ?? "");
				if (r === null || r.tenantId !== tenantId) {
					return json({ error: "not found" }, 404);
				}
				registry.delete(r.id);
				return new Response(null, { status: 204 });
			}

			// GET /v1/inbound/events
			if (req.method === "GET" && url.pathname === "/v1/inbound/events") {
				const limitRaw = url.searchParams.get("limit");
				const limit = limitRaw !== null ? Math.min(Number(limitRaw), 500) : 100;
				const list = events.listByTenant(tenantId, limit).map(serializeEvent);
				return json({ events: list });
			}

			return json({ error: "not found" }, 404);
		},
	};
}

function serializeRoute(
	r: ReturnType<InboundRouteRegistry["create"]>,
): Record<string, unknown> {
	return {
		id: r.id,
		tenantId: r.tenantId,
		pattern: r.pattern,
		webhookUrl: r.webhookUrl,
		enabled: r.enabled,
		createdAt: r.createdAt.toISOString(),
	};
}

function serializeEvent(
	e: ReturnType<InboundEventStore["append"]>,
): Record<string, unknown> {
	return {
		id: e.id,
		tenantId: e.tenantId,
		messageId: e.messageId,
		from: e.from,
		to: e.to,
		subject: e.subject,
		receivedAt: e.receivedAt.toISOString(),
		spfPass: e.spfPass,
		dkimPass: e.dkimPass,
		routedTo: e.routedTo,
		deliveryStatus: e.deliveryStatus,
		attempts: e.attempts,
		...(e.lastError !== undefined ? { lastError: e.lastError } : {}),
	};
}
