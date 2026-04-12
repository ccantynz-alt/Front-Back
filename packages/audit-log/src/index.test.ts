// ── @crontech/audit-log tests ───────────────────────────────────────
// Cover the hash chain core, WORM adapter, TSA interface, and the
// composed AuditLog class. Every tamper scenario we care about for
// court admissibility is exercised below.

import { describe, expect, test } from "bun:test";

import {
  AuditLog,
  AuditEntrySchema,
  GENESIS_PREVIOUS_HASH,
  InMemoryWormStorage,
  NullTsa,
  canonicalJSON,
  computeEntryHash,
  isAuditAction,
  isAuditEntry,
  sealEntry,
  sha256Hex,
  verifyChain,
  type AuditEntry,
  type AuditEntryInput,
  type TimestampAuthority,
  type TsaToken,
} from "./index";

// ── Fixtures ────────────────────────────────────────────────────────

function sampleInput(overrides: Partial<AuditEntryInput> = {}): AuditEntryInput {
  return {
    actor: {
      id: "user_42",
      displayName: "Ada Lovelace",
      role: "admin",
      ip: "127.0.0.1",
      userAgent: "crontech-test/1.0",
      sessionId: "sess_abc",
    },
    action: "CREATE",
    resource: { type: "case_file", id: "case_001", label: "Doe v. Acme" },
    result: "success",
    detail: { fieldChanged: "status", to: "open" },
    errorCode: null,
    ...overrides,
  };
}

function fixedClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 3, 10, 0, 0, tick++));
}

function sequentialIds(): () => string {
  let n = 0;
  // UUID-shaped so Zod's uuid() check passes. Deterministic.
  return () => {
    const hex = (n++).toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}`;
  };
}

// ── canonicalJSON ───────────────────────────────────────────────────

describe("canonicalJSON", () => {
  test("sorts object keys", () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  test("recurses into nested objects", () => {
    expect(canonicalJSON({ b: { d: 1, c: 2 }, a: 3 })).toBe(
      '{"a":3,"b":{"c":2,"d":1}}',
    );
  });

  test("preserves array order", () => {
    expect(canonicalJSON([3, 1, 2])).toBe("[3,1,2]");
  });

  test("handles primitives", () => {
    expect(canonicalJSON(null)).toBe("null");
    expect(canonicalJSON("hello")).toBe('"hello"');
    expect(canonicalJSON(42)).toBe("42");
    expect(canonicalJSON(true)).toBe("true");
  });

  test("produces identical output for semantically-equal objects", () => {
    const a = { x: 1, y: { b: 2, a: 1 } };
    const b = { y: { a: 1, b: 2 }, x: 1 };
    expect(canonicalJSON(a)).toBe(canonicalJSON(b));
  });
});

// ── sha256Hex ───────────────────────────────────────────────────────

describe("sha256Hex", () => {
  test("known vector", () => {
    // sha256("abc") — NIST FIPS 180-4 example
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("deterministic", () => {
    expect(sha256Hex("crontech")).toBe(sha256Hex("crontech"));
  });

  test("empty string has known hash", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

// ── Schema guards ───────────────────────────────────────────────────

describe("isAuditAction", () => {
  test("accepts known actions", () => {
    expect(isAuditAction("CREATE")).toBe(true);
    expect(isAuditAction("DELETE")).toBe(true);
    expect(isAuditAction("KEY_ROTATE")).toBe(true);
  });

  test("rejects unknown values", () => {
    expect(isAuditAction("delete")).toBe(false);
    expect(isAuditAction("YEET")).toBe(false);
    expect(isAuditAction(42)).toBe(false);
    expect(isAuditAction(null)).toBe(false);
  });
});

// ── sealEntry ───────────────────────────────────────────────────────

describe("sealEntry", () => {
  test("first entry uses genesis previousHash", () => {
    const sealed = sealEntry(
      {
        id: "00000000-0000-4000-8000-000000000000",
        sequence: 0,
        timestamp: "2026-04-10T00:00:00.000Z",
        actor: sampleInput().actor,
        action: "CREATE",
        resource: sampleInput().resource,
        result: "success",
        detail: {},
        errorCode: null,
      },
      null,
    );
    expect(sealed.previousHash).toBe(GENESIS_PREVIOUS_HASH);
    expect(sealed.entryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sealed.timestampToken).toBeNull();
  });

  test("subsequent entries chain off prior entryHash", () => {
    const first = sealEntry(
      {
        id: "00000000-0000-4000-8000-000000000000",
        sequence: 0,
        timestamp: "2026-04-10T00:00:00.000Z",
        actor: sampleInput().actor,
        action: "CREATE",
        resource: sampleInput().resource,
        result: "success",
        detail: {},
        errorCode: null,
      },
      null,
    );
    const second = sealEntry(
      {
        id: "00000000-0000-4000-8000-000000000001",
        sequence: 1,
        timestamp: "2026-04-10T00:00:01.000Z",
        actor: sampleInput().actor,
        action: "UPDATE",
        resource: sampleInput().resource,
        result: "success",
        detail: {},
        errorCode: null,
      },
      first,
    );
    expect(second.previousHash).toBe(first.entryHash);
    expect(second.entryHash).not.toBe(first.entryHash);
  });

  test("hashes differ even with identical payloads when chained", () => {
    const base = {
      id: "00000000-0000-4000-8000-000000000000",
      sequence: 0,
      timestamp: "2026-04-10T00:00:00.000Z",
      actor: sampleInput().actor,
      action: "CREATE" as const,
      resource: sampleInput().resource,
      result: "success" as const,
      detail: {},
      errorCode: null,
    };
    const first = sealEntry(base, null);
    const second = sealEntry({ ...base, sequence: 1 }, first);
    expect(first.entryHash).not.toBe(second.entryHash);
  });
});

// ── computeEntryHash determinism ────────────────────────────────────

describe("computeEntryHash", () => {
  test("is key-order independent", () => {
    const a: AuditEntry = {
      id: "00000000-0000-4000-8000-000000000000",
      sequence: 0,
      timestamp: "2026-04-10T00:00:00.000Z",
      actor: sampleInput().actor,
      action: "CREATE",
      resource: sampleInput().resource,
      result: "success",
      detail: { y: 2, x: 1 },
      errorCode: null,
      previousHash: GENESIS_PREVIOUS_HASH,
      entryHash: "x",
      timestampToken: null,
    };
    const b: AuditEntry = {
      ...a,
      detail: { x: 1, y: 2 },
    };
    const {
      entryHash: _ignoredA,
      timestampToken: _tA,
      ...hashableA
    } = a;
    const {
      entryHash: _ignoredB,
      timestampToken: _tB,
      ...hashableB
    } = b;
    void _ignoredA;
    void _ignoredB;
    void _tA;
    void _tB;
    expect(computeEntryHash(hashableA)).toBe(computeEntryHash(hashableB));
  });
});

// ── AuditLog.append ─────────────────────────────────────────────────

describe("AuditLog.append", () => {
  test("appends entries with monotonic sequence", async () => {
    const storage = new InMemoryWormStorage();
    const log = new AuditLog({
      storage,
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    const a = await log.append(sampleInput());
    const b = await log.append(sampleInput({ action: "UPDATE" }));
    const c = await log.append(sampleInput({ action: "DELETE" }));
    expect(a.sequence).toBe(0);
    expect(b.sequence).toBe(1);
    expect(c.sequence).toBe(2);
    expect(b.previousHash).toBe(a.entryHash);
    expect(c.previousHash).toBe(b.entryHash);
  });

  test("first entry uses genesis previousHash", async () => {
    const storage = new InMemoryWormStorage();
    const log = new AuditLog({
      storage,
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    const first = await log.append(sampleInput());
    expect(first.previousHash).toBe(GENESIS_PREVIOUS_HASH);
  });

  test("rejects invalid input via Zod", async () => {
    const log = new AuditLog({
      storage: new InMemoryWormStorage(),
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    const badInput = {
      actor: { id: "", displayName: "x", role: "y", ip: null, userAgent: null, sessionId: null },
      action: "CREATE",
      resource: { type: "x", id: "y", label: null },
      result: "success",
      detail: {},
      errorCode: null,
    } as AuditEntryInput;
    await expect(log.append(badInput)).rejects.toThrow();
  });

  test("persists entries that pass the full Zod schema", async () => {
    const storage = new InMemoryWormStorage();
    const log = new AuditLog({
      storage,
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    await log.append(sampleInput());
    const [persisted] = await log.entries();
    expect(persisted).toBeDefined();
    expect(isAuditEntry(persisted)).toBe(true);
    expect(AuditEntrySchema.safeParse(persisted).success).toBe(true);
  });

  test("serialises concurrent appends into a valid chain", async () => {
    const storage = new InMemoryWormStorage();
    const log = new AuditLog({
      storage,
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    // Fire 25 concurrent appends. If the lock didn't work, the
    // chain would have gaps or broken previousHash references.
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        log.append(sampleInput({ detail: { i } })),
      ),
    );
    const verified = await log.verify();
    expect(verified.ok).toBe(true);
    expect(verified.checked).toBe(25);
    expect(verified.failures).toEqual([]);
  });
});

// ── AuditLog.verify ─────────────────────────────────────────────────

describe("AuditLog.verify", () => {
  test("empty log is valid", async () => {
    const log = new AuditLog({ storage: new InMemoryWormStorage() });
    const result = await log.verify();
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });

  test("intact chain passes verification", async () => {
    const log = new AuditLog({
      storage: new InMemoryWormStorage(),
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    for (let i = 0; i < 10; i++) {
      await log.append(sampleInput({ detail: { i } }));
    }
    const result = await log.verify();
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(10);
  });

  test("detects detail tampering via hash mismatch", async () => {
    const storage = new InMemoryWormStorage();
    const log = new AuditLog({
      storage,
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    await log.append(sampleInput({ detail: { amount: 100 } }));
    await log.append(sampleInput({ detail: { amount: 200 } }));
    await log.append(sampleInput({ detail: { amount: 300 } }));

    // An attacker edits the middle entry's detail. Because the stored
    // entryHash was computed over the original detail, verification
    // must fail on that entry — and the subsequent entry must fail
    // because its previousHash now points to a recomputed-mismatch.
    storage.__tamper(1, { detail: { amount: 999_999 } });

    const result = await log.verify();
    expect(result.ok).toBe(false);
    const reasons = result.failures.map((f) => f.reason);
    expect(reasons).toContain("hash_mismatch");
  });

  test("detects previousHash rewiring", async () => {
    const storage = new InMemoryWormStorage();
    const log = new AuditLog({
      storage,
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    await log.append(sampleInput());
    await log.append(sampleInput({ action: "UPDATE" }));
    await log.append(sampleInput({ action: "DELETE" }));

    // Rewire entry 2 to point at a fabricated previousHash that
    // matches the canonical form. Because entryHash is computed over
    // previousHash, recomputing will flag hash_mismatch on entry 2.
    storage.__tamper(2, {
      previousHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
    });
    const result = await log.verify();
    expect(result.ok).toBe(false);
    const reasons = result.failures.map((f) => f.reason);
    expect(
      reasons.includes("previous_hash_mismatch") ||
        reasons.includes("hash_mismatch"),
    ).toBe(true);
  });

  test("detects schema-invalid entries", () => {
    const garbage = [{ nope: "not an entry" }] as unknown as AuditEntry[];
    const result = verifyChain(garbage);
    expect(result.ok).toBe(false);
    expect(result.failures[0]?.reason).toBe("schema_invalid");
  });

  test("verifyTail is O(1) and catches tail tampering", async () => {
    const storage = new InMemoryWormStorage();
    const log = new AuditLog({
      storage,
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    await log.append(sampleInput());
    await log.append(sampleInput({ action: "UPDATE" }));
    expect(await log.verifyTail()).toBe(true);

    storage.__tamper(1, { errorCode: "tampered" });
    expect(await log.verifyTail()).toBe(false);
  });
});

// ── TSA integration ────────────────────────────────────────────────

describe("TSA integration", () => {
  test("NullTsa round-trips stamp/verify", async () => {
    const tsa = new NullTsa();
    const token = await tsa.stamp("deadbeef".padEnd(64, "0"));
    expect(token.issuer).toBe("null-tsa");
    expect(await tsa.verify("deadbeef".padEnd(64, "0"), token)).toBe(true);
  });

  test("NullTsa rejects wrong hash", async () => {
    const tsa = new NullTsa();
    const token = await tsa.stamp("a".repeat(64));
    expect(await tsa.verify("b".repeat(64), token)).toBe(false);
  });

  test("AuditLog stores timestampToken when TSA is configured", async () => {
    const storage = new InMemoryWormStorage();
    const log = new AuditLog({
      storage,
      tsa: new NullTsa(),
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    const entry = await log.append(sampleInput());
    expect(entry.timestampToken).not.toBeNull();
    const parsed = JSON.parse(entry.timestampToken ?? "{}") as TsaToken;
    expect(parsed.issuer).toBe("null-tsa");
  });

  test("custom TSA implementations plug in cleanly", async () => {
    const calls: string[] = [];
    class TrackingTsa implements TimestampAuthority {
      async stamp(hash: string): Promise<TsaToken> {
        calls.push(hash);
        return { token: "stub", issuedAt: "2026-04-10T00:00:00Z", issuer: "test" };
      }
      async verify(): Promise<boolean> {
        return true;
      }
    }
    const log = new AuditLog({
      storage: new InMemoryWormStorage(),
      tsa: new TrackingTsa(),
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    const entry = await log.append(sampleInput());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(entry.entryHash);
  });
});

// ── InMemoryWormStorage contract ────────────────────────────────────

describe("InMemoryWormStorage", () => {
  test("append + count + tail", async () => {
    const storage = new InMemoryWormStorage();
    expect(await storage.count()).toBe(0);
    expect(await storage.tail()).toBeNull();

    const log = new AuditLog({
      storage,
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    await log.append(sampleInput());
    await log.append(sampleInput());
    expect(await storage.count()).toBe(2);
    const tail = await storage.tail();
    expect(tail?.sequence).toBe(1);
  });

  test("readAll returns a defensive copy", async () => {
    const storage = new InMemoryWormStorage();
    const log = new AuditLog({
      storage,
      now: fixedClock(),
      idGenerator: sequentialIds(),
    });
    await log.append(sampleInput());
    const snapshot = await storage.readAll();
    snapshot.length = 0;
    expect(await storage.count()).toBe(1);
  });
});
