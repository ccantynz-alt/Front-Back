/**
 * Lightweight audit logger used by the automation subsystem.
 * Falls back to console when DB is unavailable so automation never crashes.
 */
import { createHash } from "node:crypto";
import { db, auditLogs } from "@back-to-the-future/db";

export interface AuditEntry {
  actorId: string;
  action: "CREATE" | "READ" | "UPDATE" | "DELETE" | "EXPORT" | "SIGN";
  resourceType: string;
  resourceId: string;
  detail?: string;
  result: "success" | "failure";
}

let lastHash: string | null = null;

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const previousHash = lastHash;
  const payload = JSON.stringify({ id, timestamp, previousHash, ...entry });
  const entryHash = createHash("sha256").update(payload).digest("hex");
  lastHash = entryHash;

  try {
    await db.insert(auditLogs).values({
      id,
      timestamp,
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      detail: entry.detail ?? null,
      result: entry.result,
      previousHash,
      entryHash,
    });
  } catch (err) {
    // Never let audit failures break automation - log to stderr as fallback.
    process.stderr.write(`[audit] DB write failed, falling back to stderr: ${err}\n`);
    process.stderr.write(`[audit] ${timestamp} ${entry.actorId} ${entry.action} ${entry.resourceType}:${entry.resourceId} ${entry.result}${entry.detail ? " - " + entry.detail : ""}\n`);
  }
}