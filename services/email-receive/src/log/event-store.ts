/**
 * Inbound event log. In-memory; production swap is Drizzle/Turso.
 */

import type { DeliveryStatus, InboundEvent } from "../types/index.ts";

export interface InboundEventStore {
	append(event: Omit<InboundEvent, "id">): InboundEvent;
	get(id: string): InboundEvent | null;
	updateStatus(
		id: string,
		status: DeliveryStatus,
		opts?: { attempts?: number; lastError?: string },
	): InboundEvent | null;
	listByTenant(tenantId: string, limit?: number): ReadonlyArray<InboundEvent>;
}

export class InMemoryInboundEventStore implements InboundEventStore {
	private readonly events = new Map<string, InboundEvent>();
	private counter = 0;

	append(event: Omit<InboundEvent, "id">): InboundEvent {
		this.counter += 1;
		const id = `inevt_${Date.now()}_${this.counter}`;
		const full: InboundEvent = { ...event, id };
		this.events.set(id, full);
		return full;
	}

	get(id: string): InboundEvent | null {
		return this.events.get(id) ?? null;
	}

	updateStatus(
		id: string,
		status: DeliveryStatus,
		opts?: { attempts?: number; lastError?: string },
	): InboundEvent | null {
		const existing = this.events.get(id);
		if (existing === undefined) return null;
		const next: InboundEvent = {
			...existing,
			deliveryStatus: status,
			attempts: opts?.attempts ?? existing.attempts,
			...(opts?.lastError !== undefined ? { lastError: opts.lastError } : {}),
		};
		this.events.set(id, next);
		return next;
	}

	listByTenant(tenantId: string, limit = 100): ReadonlyArray<InboundEvent> {
		const filtered = [...this.events.values()].filter(
			(e) => e.tenantId === tenantId,
		);
		filtered.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
		return filtered.slice(0, limit);
	}
}
