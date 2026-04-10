// ── WORM Storage Adapter Interface ──────────────────────────────────
// The audit log is storage-agnostic. Any backend that can implement
// append-only writes, ordered reads, and a count can host it.
// Production deployments should use genuine WORM storage
// (AWS S3 Object Lock in Compliance mode, Azure Immutable Blob,
// Cloudflare R2 Object Lock, etc.). For tests and local development
// an in-memory implementation is provided below.
//
// The contract is deliberately narrow:
//   - append(entry): never overwrite; never delete.
//   - readAll(): return all entries in append order.
//   - count(): number of appended entries.
//   - tail(): most recently appended entry, or null if empty.
//
// Implementations MUST guarantee that once append() resolves, the
// entry is durable and will be visible in the next readAll(). The
// AuditLog class assumes sequential append semantics and handles
// the chaining logic itself.

import type { AuditEntry } from "./types";

export interface WormStorage {
  append(entry: AuditEntry): Promise<void>;
  readAll(): Promise<AuditEntry[]>;
  count(): Promise<number>;
  tail(): Promise<AuditEntry | null>;
}

/**
 * In-memory WORM adapter. Entries are frozen on append so tests can
 * detect mutation bugs — any attempt to reassign a field on a
 * retrieved entry throws under strict mode.
 *
 * This adapter is suitable for unit tests, Sentinel's intel cache,
 * and ephemeral development loops. **Do not use it in production.**
 */
export class InMemoryWormStorage implements WormStorage {
  private readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    Object.freeze(entry);
    this.entries.push(entry);
  }

  async readAll(): Promise<AuditEntry[]> {
    return this.entries.slice();
  }

  async count(): Promise<number> {
    return this.entries.length;
  }

  async tail(): Promise<AuditEntry | null> {
    if (this.entries.length === 0) return null;
    return this.entries[this.entries.length - 1] ?? null;
  }

  /**
   * Test-only helper that forcibly mutates a stored entry by index.
   * Used to simulate tamper attempts in verify() tests. Not part of
   * the public interface — kept on the concrete class only.
   */
  __tamper(index: number, patch: Partial<AuditEntry>): void {
    const target = this.entries[index];
    if (target === undefined) {
      throw new Error(`__tamper: index ${index} out of range`);
    }
    const replaced = { ...target, ...patch } as AuditEntry;
    this.entries[index] = replaced;
  }
}
