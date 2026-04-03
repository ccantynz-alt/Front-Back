import { createHash, randomUUID } from "node:crypto";

/**
 * Represents a single entry in the WORM-compatible audit trail.
 * All fields from the auditLogs schema with typed action and result.
 */
export type AuditEntry = {
  id: string;
  timestamp: string;
  actorId: string;
  actorIp: string | null;
  actorDevice: string | null;
  action: "CREATE" | "READ" | "UPDATE" | "DELETE" | "EXPORT" | "SIGN";
  resourceType: string;
  resourceId: string;
  detail: string | null;
  result: "success" | "failure";
  sessionId: string | null;
  previousHash: string | null;
  entryHash: string;
  signature: string | null;
};

/**
 * Fields required when creating a new audit entry.
 * id, timestamp, entryHash, and previousHash are computed automatically.
 */
export type CreateAuditEntryInput = Omit<
  AuditEntry,
  "id" | "entryHash" | "previousHash" | "timestamp"
>;

/** Last known hash for chain continuity (module-level state) */
let lastHash: string | null = null;

/**
 * Computes a SHA-256 hash of all audit entry fields (excluding entryHash itself).
 * The hash covers: id, timestamp, actorId, actorIp, actorDevice, action,
 * resourceType, resourceId, detail, result, sessionId, previousHash, signature.
 */
export function computeEntryHash(entry: AuditEntry): string {
  const payload = [
    entry.id,
    entry.timestamp,
    entry.actorId,
    entry.actorIp ?? "",
    entry.actorDevice ?? "",
    entry.action,
    entry.resourceType,
    entry.resourceId,
    entry.detail ?? "",
    entry.result,
    entry.sessionId ?? "",
    entry.previousHash ?? "",
    entry.signature ?? "",
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Computes a chain hash linking the current entry to the previous one.
 * The chain hash is SHA-256(previousHash + "|" + entryHash).
 */
export function computeChainHash(
  previousHash: string,
  currentEntry: AuditEntry,
): string {
  const entryHash = computeEntryHash(currentEntry);
  const payload = `${previousHash}|${entryHash}`;
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Verifies the integrity of a hash chain of audit entries.
 * Checks that each entry's entryHash matches its computed hash
 * and that previousHash links correctly to the prior entry.
 *
 * @returns { valid: true } if the chain is intact,
 *          { valid: false, brokenAt: index } if a break is found.
 */
export function verifyChain(
  entries: AuditEntry[],
): { valid: boolean; brokenAt?: number } {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as AuditEntry;

    // Verify the entry's own hash
    const expectedHash = computeEntryHash(entry);
    if (entry.entryHash !== expectedHash) {
      return { valid: false, brokenAt: i };
    }

    // Verify chain linkage (skip first entry)
    if (i > 0) {
      const previousEntry = entries[i - 1] as AuditEntry;
      if (entry.previousHash !== previousEntry.entryHash) {
        return { valid: false, brokenAt: i };
      }
    }
  }

  return { valid: true };
}

/**
 * Creates a new audit entry with auto-generated id, timestamp,
 * and computed hash chain fields.
 *
 * Maintains module-level state of the last hash for chain continuity.
 */
export function createAuditEntry(fields: CreateAuditEntryInput): AuditEntry {
  const entry: AuditEntry = {
    ...fields,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    previousHash: lastHash,
    entryHash: "", // placeholder, computed below
  };

  entry.entryHash = computeEntryHash(entry);
  lastHash = entry.entryHash;

  return entry;
}
