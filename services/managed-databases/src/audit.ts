// ── Audit Logging ─────────────────────────────────────────────────────
// Every provision, deprovision, connection-string fetch, rotation,
// branch, snapshot, restore, and soft-delete is logged as a single
// JSON line. Plaintext credentials are NEVER included — only metadata.

import type { AuditAction, AuditEntry, AuditSink, Clock } from "./types";

export interface AuditLoggerOptions {
  readonly sink?: AuditSink;
  readonly clock?: Clock;
}

export class AuditLogger {
  private readonly sink: AuditSink;
  private readonly clock: Clock;

  constructor(options: AuditLoggerOptions = {}) {
    this.sink = options.sink ?? defaultSink;
    this.clock = options.clock ?? Date.now;
  }

  log(params: {
    dbId: string | null;
    tenantId: string;
    action: AuditAction;
    requesterId: string;
    result: "ok" | "error";
    error?: string;
  }): AuditEntry {
    const entry: AuditEntry = {
      dbId: params.dbId,
      tenantId: params.tenantId,
      action: params.action,
      requesterId: params.requesterId,
      timestamp: new Date(this.clock()).toISOString(),
      result: params.result,
      ...(params.error !== undefined ? { error: params.error } : {}),
    };
    this.sink(entry);
    return entry;
  }
}

function defaultSink(entry: AuditEntry): void {
  // Single JSON line — Loki / Grafana friendly.
  console.log(JSON.stringify({ component: "managed-databases", ...entry }));
}
