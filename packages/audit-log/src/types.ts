// ── Audit Log Types ─────────────────────────────────────────────────
// Zod schemas for every structured type in the library. The schemas
// are the source of truth: TypeScript types are derived via z.infer,
// and runtime guards use safeParse. This matches the Zod-first
// discipline enforced across the monorepo.
//
// Entry shape is modelled on the FRE 901/902 + NIST SP 800-92
// "who, what, when, where, how, result" framing so the log is
// court-admissible without post-hoc schema rework.

import { z } from "zod";

// ── Actions ─────────────────────────────────────────────────────────
// Standardised verbs. New verbs can be added but existing ones must
// never be renamed — previously-hashed entries would break verification.

export const AuditActionSchema = z.enum([
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
  "EXPORT",
  "IMPORT",
  "SIGN",
  "APPROVE",
  "REJECT",
  "LOGIN",
  "LOGOUT",
  "ACCESS_DENIED",
  "CONFIG_CHANGE",
  "KEY_ROTATE",
  "OTHER",
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

export function isAuditAction(value: unknown): value is AuditAction {
  return AuditActionSchema.safeParse(value).success;
}

// ── Result ──────────────────────────────────────────────────────────

export const AuditResultSchema = z.enum(["success", "failure"]);
export type AuditResult = z.infer<typeof AuditResultSchema>;

// ── Actor ───────────────────────────────────────────────────────────
// "Who did it" — user, service, or system. `id` is the stable
// authentication subject identifier. `displayName` is human readable
// and may change without breaking the chain.

export const AuditActorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  role: z.string().min(1),
  ip: z.string().nullable().default(null),
  userAgent: z.string().nullable().default(null),
  sessionId: z.string().nullable().default(null),
});

export type AuditActor = z.infer<typeof AuditActorSchema>;

// ── Resource ────────────────────────────────────────────────────────
// "What was touched" — the thing the action acted upon.

export const AuditResourceSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  label: z.string().nullable().default(null),
});

export type AuditResource = z.infer<typeof AuditResourceSchema>;

// ── Entry input (caller-provided fields) ────────────────────────────
// This is what consumers pass to AuditLog.append(). The library fills
// in id, timestamp, previousHash, entryHash, and sequence on append.

export const AuditEntryInputSchema = z.object({
  actor: AuditActorSchema,
  action: AuditActionSchema,
  resource: AuditResourceSchema,
  result: AuditResultSchema,
  detail: z.record(z.string(), z.unknown()).default({}),
  errorCode: z.string().nullable().default(null),
});

export type AuditEntryInput = z.infer<typeof AuditEntryInputSchema>;

// ── Sealed entry (what lives in WORM storage) ───────────────────────
// `previousHash` is the entryHash of the immediately preceding entry,
// or the genesis marker for the first entry in the chain. `entryHash`
// is SHA-256(canonicalJSON(everything except entryHash and
// timestampToken)). `timestampToken` is an opaque RFC 3161 token blob
// supplied by the pluggable TSA provider.

export const GENESIS_PREVIOUS_HASH = "GENESIS";

export const AuditEntrySchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime({ offset: true }),
  actor: AuditActorSchema,
  action: AuditActionSchema,
  resource: AuditResourceSchema,
  result: AuditResultSchema,
  detail: z.record(z.string(), z.unknown()),
  errorCode: z.string().nullable(),
  previousHash: z.string().min(1),
  entryHash: z.string().regex(/^[a-f0-9]{64}$/),
  timestampToken: z.string().nullable(),
});

export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export function isAuditEntry(value: unknown): value is AuditEntry {
  return AuditEntrySchema.safeParse(value).success;
}

// ── Verification result ─────────────────────────────────────────────

export const VerifyFailureReasonSchema = z.enum([
  "sequence_gap",
  "hash_mismatch",
  "previous_hash_mismatch",
  "genesis_misplaced",
  "schema_invalid",
  "timestamp_token_invalid",
]);

export type VerifyFailureReason = z.infer<typeof VerifyFailureReasonSchema>;

export interface VerifyFailure {
  sequence: number;
  entryId: string | null;
  reason: VerifyFailureReason;
  message: string;
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  failures: VerifyFailure[];
}
