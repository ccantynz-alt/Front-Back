import type { DeliveryEvent, MessageRecord, MessageStatus } from "../types.ts";

/**
 * In-memory message store. Production deployments swap this for a
 * Turso-backed implementation; the interface stays identical so the
 * pipeline never needs to know.
 */
export class MessageStore {
  private readonly messages = new Map<string, MessageRecord>();

  insert(record: MessageRecord): void {
    if (this.messages.has(record.messageId)) {
      throw new Error(`Duplicate messageId: ${record.messageId}`);
    }
    this.messages.set(record.messageId, { ...record, events: [...record.events] });
  }

  get(messageId: string): MessageRecord | undefined {
    const m = this.messages.get(messageId);
    if (!m) return undefined;
    return { ...m, events: [...m.events] };
  }

  appendEvent(messageId: string, event: DeliveryEvent, newStatus: MessageStatus): MessageRecord {
    const current = this.messages.get(messageId);
    if (!current) {
      throw new Error(`Unknown messageId: ${messageId}`);
    }
    const next: MessageRecord = {
      ...current,
      status: newStatus,
      updatedAt: event.ts,
      events: [...current.events, event],
    };
    this.messages.set(messageId, next);
    return { ...next, events: [...next.events] };
  }

  setCarrierMessageId(messageId: string, carrierMessageId: string): void {
    const current = this.messages.get(messageId);
    if (!current) {
      throw new Error(`Unknown messageId: ${messageId}`);
    }
    this.messages.set(messageId, { ...current, carrierMessageId });
  }

  findByCarrierMessageId(carrierMessageId: string): MessageRecord | undefined {
    for (const m of this.messages.values()) {
      if (m.carrierMessageId === carrierMessageId) {
        return { ...m, events: [...m.events] };
      }
    }
    return undefined;
  }

  size(): number {
    return this.messages.size;
  }
}
