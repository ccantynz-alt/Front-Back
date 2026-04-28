import { describe, expect, it } from "bun:test";
import {
  constantTimeEqual,
  decryptValue,
  deriveTenantDek,
  encryptValue,
  parseMasterKey,
} from "../src/crypto";

const MASTER_HEX = "a".repeat(64); // 32 bytes of 0xaa
const masterKey = parseMasterKey(MASTER_HEX);

describe("parseMasterKey", () => {
  it("rejects non-hex strings", () => {
    expect(() => parseMasterKey("zzzz")).toThrow();
  });
  it("rejects wrong length", () => {
    expect(() => parseMasterKey("aabb")).toThrow();
  });
  it("accepts 64-char hex", () => {
    const buf = parseMasterKey(MASTER_HEX);
    expect(buf.length).toBe(32);
  });
});

describe("deriveTenantDek", () => {
  it("is deterministic — same inputs yield identical DEKs", () => {
    const a = deriveTenantDek(masterKey, "tenant-alpha");
    const b = deriveTenantDek(masterKey, "tenant-alpha");
    expect(a.equals(b)).toBe(true);
  });

  it("is unique per tenant", () => {
    const a = deriveTenantDek(masterKey, "tenant-alpha");
    const b = deriveTenantDek(masterKey, "tenant-beta");
    expect(a.equals(b)).toBe(false);
  });

  it("rejects empty tenantId", () => {
    expect(() => deriveTenantDek(masterKey, "")).toThrow();
  });

  it("DEK is 32 bytes", () => {
    const dek = deriveTenantDek(masterKey, "tenant-alpha");
    expect(dek.length).toBe(32);
  });
});

describe("encrypt/decrypt round-trip", () => {
  it("decrypts what was encrypted with matching tenant + key", () => {
    const dek = deriveTenantDek(masterKey, "tenant-alpha");
    const blob = encryptValue(dek, "tenant-alpha", "DATABASE_URL", "postgres://secret");
    const out = decryptValue(dek, "tenant-alpha", "DATABASE_URL", blob);
    expect(out).toBe("postgres://secret");
  });

  it("produces different ciphertext on each encrypt (random nonce)", () => {
    const dek = deriveTenantDek(masterKey, "tenant-alpha");
    const a = encryptValue(dek, "tenant-alpha", "key-1", "same-value");
    const b = encryptValue(dek, "tenant-alpha", "key-1", "same-value");
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects decrypt with wrong tenantId (AAD mismatch)", () => {
    const dekA = deriveTenantDek(masterKey, "tenant-alpha");
    const dekB = deriveTenantDek(masterKey, "tenant-beta");
    const blob = encryptValue(dekA, "tenant-alpha", "k", "x");
    // Even using the right-tenant DEK, swapping AAD must fail.
    expect(() => decryptValue(dekA, "tenant-beta", "k", blob)).toThrow();
    // And using the wrong-tenant DEK obviously must fail too.
    expect(() => decryptValue(dekB, "tenant-alpha", "k", blob)).toThrow();
    expect(() => decryptValue(dekB, "tenant-beta", "k", blob)).toThrow();
  });

  it("rejects decrypt with wrong secretKey (AAD mismatch)", () => {
    const dek = deriveTenantDek(masterKey, "tenant-alpha");
    const blob = encryptValue(dek, "tenant-alpha", "key-1", "value");
    expect(() => decryptValue(dek, "tenant-alpha", "key-2", blob)).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const dek = deriveTenantDek(masterKey, "tenant-alpha");
    const blob = encryptValue(dek, "tenant-alpha", "k", "value");
    const wire = Buffer.from(blob.ciphertext, "base64");
    // Flip a bit in the last ciphertext byte.
    const last = wire.length - 1;
    const original = wire[last];
    if (original === undefined) throw new Error("unexpected empty buffer");
    wire[last] = original ^ 0x01;
    const tampered = { ciphertext: wire.toString("base64") };
    expect(() => decryptValue(dek, "tenant-alpha", "k", tampered)).toThrow();
  });
});

describe("constantTimeEqual", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });
  it("returns false for different strings", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });
  it("returns false for length mismatch", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
