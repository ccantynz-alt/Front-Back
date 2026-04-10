// ── AuditLog: composed entry point ──────────────────────────────────
// Wires the hash-chain core, a WormStorage adapter, and an optional
// TimestampAuthority into a single ergonomic class. Consumers only
// need to:
//   1. Construct with their storage + (optional) TSA.
//   2. Call .append(input) for every auditable event.
//   3. Periodically call .verify() to prove the chain is intact.
//
// The class is deliberately small — most of the interesting logic
// lives in hash-chain.ts so it can be audited in isolation.

import { randomUUID } from "node:crypto";

import { computeEntryHash, sealEntry, verifyChain } from "./hash-chain";
import type { WormStorage } from "./storage";
import type { TimestampAuthority } from "./timestamp";
import {
  AuditEntryInputSchema,
  type AuditEntry,
  type AuditEntryInput,
  type VerifyResult,
} from "./types";

export interface AuditLogOptions {
  storage: WormStorage;
  tsa?: TimestampAuthority;
  /**
   * Optional clock override. Defaults to Date.now(). Tests pass a
   * fixed value so generated entries are reproducible.
   */
  now?: () => Date;
  /**
   * Optional UUID generator. Defaults to node:crypto.randomUUID.
   * Tests override this to assert sequencing without collisions.
   */
  idGenerator?: () => string;
}

export class AuditLog {
  private readonly storage: WormStorage;
  private readonly tsa: TimestampAuthority | null;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private appendLock: Promise<void> = Promise.resolve();

  constructor(opts: AuditLogOptions) {
    this.storage = opts.storage;
    this.tsa = opts.tsa ?? null;
    this.now = opts.now ?? (() => new Date());
    this.idGenerator = opts.idGenerator ?? (() => randomUUID());
  }

  /**
   * Append a new audit entry. Validates input, seals it into the
   * chain, optionally requests a TSA timestamp token, and writes it
   * to WORM storage. Concurrent calls are serialised via a promise
   * chain so the sequence number + previousHash remain consistent.
   */
  async append(input: AuditEntryInput): Promise<AuditEntry> {
    const validated = AuditEntryInputSchema.parse(input);

    // Serialise append calls. We grab the current tail of the queue
    // BEFORE installing our own gate, so we only wait on callers that
    // arrived earlier — not on ourselves.
    const prior = this.appendLock;
    let release: () => void = () => undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.appendLock = prior.then(() => next);

    try {
      await prior;
      const tail = await this.storage.tail();
      const sequence = await this.storage.count();

      const base = {
        id: this.idGenerator(),
        sequence,
        timestamp: this.now().toISOString(),
        actor: validated.actor,
        action: validated.action,
        resource: validated.resource,
        result: validated.result,
        detail: validated.detail,
        errorCode: validated.errorCode,
      } as const;

      const sealed = sealEntry(base, tail);
      let timestampToken: string | null = null;
      if (this.tsa !== null) {
        const token = await this.tsa.stamp(sealed.entryHash);
        timestampToken = JSON.stringify(token);
      }

      const finalEntry: AuditEntry = { ...sealed, timestampToken };
      await this.storage.append(finalEntry);
      return finalEntry;
    } finally {
      release();
    }
  }

  /**
   * Verify the full chain in storage. Returns a structured result
   * listing every failure. Does not throw — callers decide whether
   * a single failure should halt operations or just alert.
   */
  async verify(): Promise<VerifyResult> {
    const entries = await this.storage.readAll();
    return verifyChain(entries);
  }

  /** Return a snapshot of all entries in append order. */
  async entries(): Promise<AuditEntry[]> {
    return this.storage.readAll();
  }

  /** Current number of entries in the chain. */
  async length(): Promise<number> {
    return this.storage.count();
  }

  /**
   * Recompute the tail entry's hash and compare to the stored value.
   * Useful as a cheap "integrity heartbeat" that doesn't walk the
   * full chain — O(1) instead of O(n).
   */
  async verifyTail(): Promise<boolean> {
    const tail = await this.storage.tail();
    if (tail === null) return true;
    const { entryHash: storedHash, timestampToken: _ignored, ...rest } = tail;
    void _ignored;
    return computeEntryHash(rest) === storedHash;
  }

}
