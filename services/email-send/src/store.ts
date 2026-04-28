import type { DeliveryEvent, EventType, MessageStatus, StoredMessage } from "./types.ts";

/**
 * In-memory message store. v1.
 * v2: replaced with Turso-backed persistence (documented in README).
 */
export class MessageStore {
  private readonly messages = new Map<string, StoredMessage>();

  put(message: StoredMessage): void {
    this.messages.set(message.id, message);
  }

  get(id: string): StoredMessage | undefined {
    return this.messages.get(id);
  }

  list(tenantId: string): StoredMessage[] {
    return [...this.messages.values()].filter((m) => m.tenantId === tenantId);
  }

  setStatus(id: string, status: MessageStatus): StoredMessage | undefined {
    const m = this.messages.get(id);
    if (!m) return undefined;
    const updated: StoredMessage = { ...m, status, updatedAt: new Date().toISOString() };
    this.messages.set(id, updated);
    return updated;
  }

  appendEvent(
    id: string,
    type: EventType,
    detail?: string,
    extra: { recipient?: string; smtpCode?: number } = {},
  ): DeliveryEvent | undefined {
    const m = this.messages.get(id);
    if (!m) return undefined;
    const event: DeliveryEvent = {
      id: crypto.randomUUID(),
      messageId: id,
      type,
      occurredAt: new Date().toISOString(),
      ...(detail !== undefined ? { detail } : {}),
      ...(extra.recipient !== undefined ? { recipient: extra.recipient } : {}),
      ...(extra.smtpCode !== undefined ? { smtpCode: extra.smtpCode } : {}),
    };
    const events = [...m.events, event];
    this.messages.set(id, { ...m, events, updatedAt: new Date().toISOString() });
    return event;
  }

  incrementAttempts(id: string): number {
    const m = this.messages.get(id);
    if (!m) return 0;
    const attempts = m.attempts + 1;
    this.messages.set(id, { ...m, attempts, updatedAt: new Date().toISOString() });
    return attempts;
  }

  size(): number {
    return this.messages.size;
  }
}
