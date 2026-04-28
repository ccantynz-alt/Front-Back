// ── Audit Logging ─────────────────────────────────────────────────────
// Every read, write, list, and delete is logged to stdout as a single
// JSON line. Plaintext secret values are NEVER included — only metadata.
// This is what gets shipped to the LGTM stack via OpenTelemetry/Loki.

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
    tenantId: string;
    key: string | null;
    action: AuditAction;
    requesterId: string;
    result: "ok" | "error";
    error?: string;
  }): AuditEntry {
    const entry: AuditEntry = {
      tenantId: params.tenantId,
      key: params.key,
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
  // Single-line JSON for log scrapers. NEVER include plaintext values.
  console.log(JSON.stringify({ component: "secrets-vault", ...entry }));
}
