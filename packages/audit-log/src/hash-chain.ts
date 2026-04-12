// ── Hash Chain Core ─────────────────────────────────────────────────
// Pure functions for canonicalising entries, computing hashes, and
// verifying a full chain. No I/O, no storage, no timestamping —
// those live in storage.ts and timestamp.ts. This file is the
// mathematical heart of the library: every tamper test runs through
// these functions.
//
// Canonical JSON rules (deterministic across runtimes):
//   1. Object keys sorted lexicographically (recursive).
//   2. No whitespace.
//   3. Strings encoded via JSON.stringify (handles escapes + unicode).
//   4. Undefined values are rejected upstream via Zod.
//
// Hash algorithm: SHA-256, hex-encoded, lowercase.

import { createHash } from "node:crypto";

import {
  AuditEntrySchema,
  GENESIS_PREVIOUS_HASH,
  type AuditEntry,
  type VerifyFailure,
  type VerifyResult,
} from "./types";

// ── Canonicalisation ────────────────────────────────────────────────

/**
 * Produce a deterministic JSON representation of a value by sorting
 * object keys at every level. Arrays preserve insertion order.
 * Used by sha256 + computeEntryHash so any two processes that start
 * from the same logical entry produce the same hash.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSON).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// ── Entry hashing ───────────────────────────────────────────────────

/**
 * Fields that participate in the entry hash. `entryHash` itself and
 * the optional `timestampToken` are deliberately excluded — the
 * timestamp token is issued by an external TSA *after* the hash is
 * computed, and `entryHash` cannot contain itself.
 */
export type HashableEntry = Omit<AuditEntry, "entryHash" | "timestampToken">;

export function computeEntryHash(entry: HashableEntry): string {
  return sha256Hex(canonicalJSON(entry));
}

/**
 * Build the next entry in a chain from a caller-provided base.
 * The caller is responsible for supplying `id`, `sequence`,
 * `timestamp`, and the input fields (actor/action/etc). This
 * function fills in `previousHash` and `entryHash` atomically so the
 * chain invariant cannot be violated by accident.
 */
export function sealEntry(
  base: Omit<HashableEntry, "previousHash">,
  previousEntry: AuditEntry | null,
): AuditEntry {
  const previousHash =
    previousEntry === null ? GENESIS_PREVIOUS_HASH : previousEntry.entryHash;
  const hashable: HashableEntry = { ...base, previousHash };
  const entryHash = computeEntryHash(hashable);
  return { ...hashable, entryHash, timestampToken: null };
}

// ── Verification ────────────────────────────────────────────────────

/**
 * Walk a chain of entries in sequence order and assert:
 *   - Entry #0's previousHash === GENESIS_PREVIOUS_HASH.
 *   - Every other entry's previousHash === prior entry's entryHash.
 *   - Every entry's stored entryHash === recomputed entryHash.
 *   - Sequence numbers are strictly 0, 1, 2, ... with no gaps.
 *   - Every entry passes the Zod schema.
 *
 * Returns a structured VerifyResult listing all failures. Does not
 * throw — callers decide how loudly to complain.
 */
export function verifyChain(entries: readonly AuditEntry[]): VerifyResult {
  const failures: VerifyFailure[] = [];
  let checked = 0;
  let previous: AuditEntry | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry === undefined) continue;
    checked += 1;

    const parsed = AuditEntrySchema.safeParse(entry);
    if (!parsed.success) {
      failures.push({
        sequence: i,
        entryId: typeof entry.id === "string" ? entry.id : null,
        reason: "schema_invalid",
        message: `Entry ${i} failed schema validation: ${parsed.error.message}`,
      });
      previous = null;
      continue;
    }

    if (entry.sequence !== i) {
      failures.push({
        sequence: i,
        entryId: entry.id,
        reason: "sequence_gap",
        message: `Entry at index ${i} has sequence ${entry.sequence}`,
      });
    }

    if (i === 0) {
      if (entry.previousHash !== GENESIS_PREVIOUS_HASH) {
        failures.push({
          sequence: i,
          entryId: entry.id,
          reason: "genesis_misplaced",
          message: `First entry previousHash must be ${GENESIS_PREVIOUS_HASH}, got ${entry.previousHash}`,
        });
      }
    } else if (previous !== null && entry.previousHash !== previous.entryHash) {
      failures.push({
        sequence: i,
        entryId: entry.id,
        reason: "previous_hash_mismatch",
        message: `Entry ${i} previousHash does not match prior entryHash`,
      });
    }

    const {
      entryHash: storedHash,
      timestampToken: _ignored,
      ...rest
    } = entry;
    void _ignored;
    const recomputed = computeEntryHash(rest);
    if (recomputed !== storedHash) {
      failures.push({
        sequence: i,
        entryId: entry.id,
        reason: "hash_mismatch",
        message: `Entry ${i} stored hash ${storedHash.slice(0, 12)}… != recomputed ${recomputed.slice(0, 12)}…`,
      });
    }

    previous = entry;
  }

  return { ok: failures.length === 0, checked, failures };
}
