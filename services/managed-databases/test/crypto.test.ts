import { describe, expect, it } from "bun:test";

import {
  constantTimeEqual,
  decryptConnectionString,
  deriveTenantDek,
  encryptConnectionString,
  parseMasterKey,
} from "../src/crypto";

const HEX = "a".repeat(64);

describe("parseMasterKey", () => {
  it("accepts a 64-char hex string", () => {
    const key = parseMasterKey(HEX);
    expect(key.length).toBe(32);
  });

  it("rejects wrong length", () => {
    expect(() => parseMasterKey("a".repeat(63))).toThrow();
  });

  it("rejects non-hex chars", () => {
    expect(() => parseMasterKey("z".repeat(64))).toThrow();
  });
});

describe("deriveTenantDek", () => {
  it("is deterministic for the same tenant", () => {
    const k = parseMasterKey(HEX);
    const a = deriveTenantDek(k, "tenant-x");
    const b = deriveTenantDek(k, "tenant-x");
    expect(a.equals(b)).toBe(true);
  });

  it("differs across tenants", () => {
    const k = parseMasterKey(HEX);
    const a = deriveTenantDek(k, "tenant-a");
    const b = deriveTenantDek(k, "tenant-b");
    expect(a.equals(b)).toBe(false);
  });
});

describe("encrypt/decrypt connection string", () => {
  it("round-trips plaintext", () => {
    const k = parseMasterKey(HEX);
    const dek = deriveTenantDek(k, "t1");
    const blob = encryptConnectionString(dek, "t1", "db1", "postgres://x");
    expect(blob.ciphertext).not.toContain("postgres");
    const out = decryptConnectionString(dek, "t1", "db1", blob);
    expect(out).toBe("postgres://x");
  });

  it("fails with a different tenant", () => {
    const k = parseMasterKey(HEX);
    const dekA = deriveTenantDek(k, "t1");
    const dekB = deriveTenantDek(k, "t2");
    const blob = encryptConnectionString(dekA, "t1", "db1", "secret");
    expect(() => decryptConnectionString(dekB, "t2", "db1", blob)).toThrow();
  });

  it("fails with a different db id (AAD mismatch)", () => {
    const k = parseMasterKey(HEX);
    const dek = deriveTenantDek(k, "t1");
    const blob = encryptConnectionString(dek, "t1", "db1", "secret");
    expect(() => decryptConnectionString(dek, "t1", "db2", blob)).toThrow();
  });

  it("fails on tampered ciphertext", () => {
    const k = parseMasterKey(HEX);
    const dek = deriveTenantDek(k, "t1");
    const blob = encryptConnectionString(dek, "t1", "db1", "secret");
    const tampered = { ciphertext: `${blob.ciphertext.slice(0, -4)}AAAA` };
    expect(() => decryptConnectionString(dek, "t1", "db1", tampered)).toThrow();
  });
});

describe("constantTimeEqual", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });
  it("returns false for unequal strings", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });
  it("returns false for different lengths", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
