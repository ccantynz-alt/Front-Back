// ── Public Types ───────────────────────────────────────────────────────
// Shared types used across the vault store, server, audit log, and tests.

export type AuditAction =
  | "PUT"
  | "GET"
  | "DELETE"
  | "LIST"
  | "BUNDLE"
  | "AUTH_REJECT"
  | "RATE_LIMIT";

export interface AuditEntry {
  readonly tenantId: string;
  readonly key: string | null;
  readonly action: AuditAction;
  readonly requesterId: string;
  readonly timestamp: string;
  readonly result: "ok" | "error";
  readonly error?: string;
}

export interface VaultStoredSecret {
  readonly ciphertext: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type Clock = () => number;

export type AuditSink = (entry: AuditEntry) => void;
