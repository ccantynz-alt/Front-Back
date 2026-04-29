import type { AuditEntry } from "./types.js";

export interface AuditSink {
  log(entry: AuditEntry): void;
  recent(limit?: number): readonly AuditEntry[];
}

export class InMemoryAuditSink implements AuditSink {
  private readonly entries: AuditEntry[] = [];
  private readonly cap: number;

  constructor(cap = 1000) {
    this.cap = cap;
  }

  log(entry: AuditEntry): void {
    // Defensive copy + sanitisation: ensure no plaintext code/identifier slipped in.
    const sanitised: AuditEntry = {
      verificationId: entry.verificationId,
      tenantId: entry.tenantId,
      identifierHash: entry.identifierHash,
      action: entry.action,
      result: entry.result,
      ...(entry.channel ? { channel: entry.channel } : {}),
      ...(entry.requesterId ? { requesterId: entry.requesterId } : {}),
      timestamp: entry.timestamp,
    };
    this.entries.push(sanitised);
    if (this.entries.length > this.cap) {
      this.entries.shift();
    }
  }

  recent(limit = 100): readonly AuditEntry[] {
    return this.entries.slice(-limit);
  }
}
