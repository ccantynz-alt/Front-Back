import { describe, expect, it } from "bun:test";
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  generateBackupCodes,
  generateSecret,
  generateTotp,
  verifyTotp,
} from "../src/totp.js";
import { seededRng } from "../src/crypto.js";

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const enc = base32Encode(data);
    const dec = base32Decode(enc);
    expect(Array.from(dec)).toEqual(Array.from(data));
  });

  it("ignores trailing padding chars", () => {
    const data = new Uint8Array([0xff, 0x00]);
    const enc = base32Encode(data);
    const dec = base32Decode(`${enc}===`);
    expect(Array.from(dec)).toEqual(Array.from(data));
  });
});

describe("TOTP RFC 6238 test vectors (SHA-1)", () => {
  // RFC 6238 Appendix B: shared secret "12345678901234567890"
  const sharedSecret = "12345678901234567890";
  const secretBase32 = base32Encode(new TextEncoder().encode(sharedSecret));

  // Test vectors at given Unix time should produce these 8-digit codes; we
  // verify with 8 digits to match the RFC fixtures.
  const vectors: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ];

  for (const [t, expected] of vectors) {
    it(`time=${t} produces code ${expected}`, () => {
      const code = generateTotp(secretBase32, t, { digits: 8 });
      expect(code).toBe(expected);
    });
  }
});

describe("TOTP verification", () => {
  it("verifies a fresh code", () => {
    const secret = generateSecret(20, seededRng("totp-test"));
    const ts = 1700000000;
    const code = generateTotp(secret, ts);
    expect(verifyTotp(secret, code, ts)).toBe(true);
  });

  it("accepts ±1 step tolerance (window=1)", () => {
    const secret = generateSecret(20, seededRng("totp-test-2"));
    const ts = 1700000000;
    const codePrev = generateTotp(secret, ts - 30);
    const codeNext = generateTotp(secret, ts + 30);
    expect(verifyTotp(secret, codePrev, ts, { window: 1 })).toBe(true);
    expect(verifyTotp(secret, codeNext, ts, { window: 1 })).toBe(true);
  });

  it("rejects codes outside the window", () => {
    const secret = generateSecret(20, seededRng("totp-test-3"));
    const ts = 1700000000;
    const farFuture = generateTotp(secret, ts + 30 * 5);
    expect(verifyTotp(secret, farFuture, ts, { window: 1 })).toBe(false);
  });

  it("rejects malformed codes", () => {
    const secret = generateSecret(20, seededRng("totp-test-4"));
    expect(verifyTotp(secret, "000000", 1700000000)).toBe(false);
    expect(verifyTotp(secret, "abcdef", 1700000000)).toBe(false);
  });
});

describe("otpauth URI", () => {
  it("encodes issuer + identifier + secret", () => {
    const uri = buildOtpAuthUri("JBSWY3DPEHPK3PXP", "alice@example.com", "Crontech");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Crontech");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("backup codes", () => {
  it("generates the requested number of unique-looking codes", () => {
    const codes = generateBackupCodes(8, seededRng("backup-test"));
    expect(codes.length).toBe(8);
    for (const c of codes) {
      expect(c).toMatch(/^[0-9a-f]{10}$/u);
    }
    expect(new Set(codes).size).toBe(8);
  });
});
