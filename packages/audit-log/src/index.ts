// ── @crontech/audit-log ─────────────────────────────────────────────
// Public entry point. Re-exports the full API in one place so
// downstream consumers only ever import from "@crontech/audit-log".

export {
  AuditActionSchema,
  AuditActorSchema,
  AuditEntryInputSchema,
  AuditEntrySchema,
  AuditResourceSchema,
  AuditResultSchema,
  GENESIS_PREVIOUS_HASH,
  VerifyFailureReasonSchema,
  isAuditAction,
  isAuditEntry,
  type AuditAction,
  type AuditActor,
  type AuditEntry,
  type AuditEntryInput,
  type AuditResource,
  type AuditResult,
  type VerifyFailure,
  type VerifyFailureReason,
  type VerifyResult,
} from "./types";

export {
  canonicalJSON,
  computeEntryHash,
  sealEntry,
  sha256Hex,
  verifyChain,
  type HashableEntry,
} from "./hash-chain";

export { InMemoryWormStorage, type WormStorage } from "./storage";

export {
  NullTsa,
  type TimestampAuthority,
  type TsaToken,
} from "./timestamp";

export { AuditLog, type AuditLogOptions } from "./audit-log";
