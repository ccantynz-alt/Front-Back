/**
 * In-memory inbound route registry. Production swap-in: a Drizzle-backed
 * implementation that hits Turso/D1 — same interface, durable storage.
 */

import {
	type InboundRoute,
	type InboundRouteCreateInput,
	inboundRouteCreateSchema,
} from "../types/index.ts";

export interface InboundRouteRegistry {
	create(input: InboundRouteCreateInput): InboundRoute;
	get(id: string): InboundRoute | null;
	listByTenant(tenantId: string): ReadonlyArray<InboundRoute>;
	listAll(): ReadonlyArray<InboundRoute>;
	update(id: string, patch: Partial<InboundRouteCreateInput>): InboundRoute | null;
	delete(id: string): boolean;
}

export class InMemoryInboundRouteRegistry implements InboundRouteRegistry {
	private readonly store = new Map<string, InboundRoute>();
	private idCounter = 0;

	create(input: InboundRouteCreateInput): InboundRoute {
		const validated = inboundRouteCreateSchema.parse(input);
		this.idCounter += 1;
		const id = `inroute_${Date.now()}_${this.idCounter}`;
		const route: InboundRoute = {
			id,
			tenantId: validated.tenantId,
			pattern: validated.pattern,
			webhookUrl: validated.webhookUrl,
			hmacSecret: validated.hmacSecret,
			enabled: validated.enabled,
			createdAt: new Date(),
		};
		this.store.set(id, route);
		return route;
	}

	get(id: string): InboundRoute | null {
		return this.store.get(id) ?? null;
	}

	listByTenant(tenantId: string): ReadonlyArray<InboundRoute> {
		return [...this.store.values()].filter((r) => r.tenantId === tenantId);
	}

	listAll(): ReadonlyArray<InboundRoute> {
		return [...this.store.values()];
	}

	update(
		id: string,
		patch: Partial<InboundRouteCreateInput>,
	): InboundRoute | null {
		const existing = this.store.get(id);
		if (existing === undefined) return null;
		const next: InboundRoute = {
			...existing,
			...(patch.pattern !== undefined ? { pattern: patch.pattern } : {}),
			...(patch.webhookUrl !== undefined ? { webhookUrl: patch.webhookUrl } : {}),
			...(patch.hmacSecret !== undefined ? { hmacSecret: patch.hmacSecret } : {}),
			...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
		};
		this.store.set(id, next);
		return next;
	}

	delete(id: string): boolean {
		return this.store.delete(id);
	}
}
