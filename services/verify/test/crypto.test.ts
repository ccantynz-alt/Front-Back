import { describe, expect, it } from "bun:test";
import {
  constantTimeEqualsHex,
  generateCode,
  generateUuid,
  hashCode,
  hashIdentifier,
  seededRng,
  urlSafeToken,
} from "../src/crypto.js";

describe("code generation", () => {
  it("generates 6-digit numeric codes by default", () => {
    const code = generateCode(6);
    expect(code).toMatch(/^\d{6}$/u);
  });

  it("respects requested length within bounds", () => {
    for (const len of [4, 5, 6, 7, 8, 9, 10]) {
      const c = generateCode(len);
      expect(c.length).toBe(len);
      expect(c).toMatch(/^\d+$/u);
    }
  });

  it("rejects out-of-range lengths", () => {
    expect(() => generateCode(3)).toThrow();
    expect(() => generateCode(11)).toThrow();
  });

  it("is deterministic with a seeded RNG", () => {
    const a = seededRng("seed-1");
    const b = seededRng("seed-1");
    expect(generateCode(6, a)).toBe(generateCode(6, b));
  });

  it("produces different codes from different seeds", () => {
    const a = seededRng("seed-A");
    const b = seededRng("seed-B");
    expect(generateCode(6, a)).not.toBe(generateCode(6, b));
  });
});

describe("HMAC code storage", () => {
  it("hashes codes deterministically with same secret", () => {
    const h1 = hashCode("secret", "123456");
    const h2 = hashCode("secret", "123456");
    expect(h1).toBe(h2);
  });
  it("produces different hashes with different secrets", () => {
    const h1 = hashCode("secret-a", "123456");
    const h2 = hashCode("secret-b", "123456");
    expect(h1).not.toBe(h2);
  });
  it("never returns plaintext code", () => {
    const code = "987654";
    const h = hashCode("secret", code);
    expect(h.includes(code)).toBe(false);
    expect(h).toMatch(/^[0-9a-f]{64}$/u);
  });
  it("identifier hashing is one-way", () => {
    const h = hashIdentifier("secret", "user@example.com");
    expect(h.includes("@")).toBe(false);
    expect(h).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe("constant-time equality", () => {
  it("returns true for identical hex strings", () => {
    const a = "deadbeef".padEnd(64, "0");
    expect(constantTimeEqualsHex(a, a)).toBe(true);
  });
  it("returns false for differing hex of same length", () => {
    const a = "deadbeef".padEnd(64, "0");
    const b = "deadbeef".padEnd(64, "1");
    expect(constantTimeEqualsHex(a, b)).toBe(false);
  });
  it("returns false on length mismatch", () => {
    expect(constantTimeEqualsHex("ab", "abcd")).toBe(false);
  });
  it("returns false on invalid hex without throwing", () => {
    expect(constantTimeEqualsHex("zz", "zz")).toBe(false);
  });
});

describe("token + uuid generation", () => {
  it("urlSafeToken produces base64url chars only", () => {
    const t = urlSafeToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/u);
  });
  it("uuid v4 has correct shape", () => {
    const u = generateUuid();
    expect(u).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });
});
