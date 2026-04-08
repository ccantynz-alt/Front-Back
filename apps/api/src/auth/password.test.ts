import { describe, test, expect } from "bun:test";
import {
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  PasswordComplexitySchema,
} from "./password";

// ── Password Hashing ────────────────────────────────────────────────

describe("hashPassword", () => {
  test("produces a hash string", async () => {
    const hash = await hashPassword("StrongP@ss1");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  test("produces different hashes for the same password (salted)", async () => {
    const hash1 = await hashPassword("StrongP@ss1");
    const hash2 = await hashPassword("StrongP@ss1");
    expect(hash1).not.toBe(hash2);
  });

  test("produces different hashes for different passwords", async () => {
    const hash1 = await hashPassword("StrongP@ss1");
    const hash2 = await hashPassword("DifferentP@ss2");
    expect(hash1).not.toBe(hash2);
  });

  test("hash contains argon2id identifier", async () => {
    const hash = await hashPassword("StrongP@ss1");
    expect(hash).toContain("argon2id");
  });
});

// ── Password Verification ──────────────────────────────────────────

describe("verifyPassword", () => {
  test("returns true for correct password", async () => {
    const password = "Correct$Horse99";
    const hash = await hashPassword(password);
    const result = await verifyPassword(password, hash);
    expect(result).toBe(true);
  });

  test("returns false for incorrect password", async () => {
    const hash = await hashPassword("Correct$Horse99");
    const result = await verifyPassword("Wrong$Horse88", hash);
    expect(result).toBe(false);
  });

  test("returns false for empty password against valid hash", async () => {
    const hash = await hashPassword("Correct$Horse99");
    const result = await verifyPassword("", hash);
    expect(result).toBe(false);
  });

  test("handles unicode passwords", async () => {
    const password = "P@sswrd!123";
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("P@sswrd!124", hash)).toBe(false);
  });

  test("handles long passwords", async () => {
    const longPassword = "Aa1!" + "x".repeat(200);
    const hash = await hashPassword(longPassword);
    expect(await verifyPassword(longPassword, hash)).toBe(true);
  });
});

// ── Password Complexity Validation ──────────────────────────────────

describe("validatePasswordComplexity", () => {
  test("accepts strong password", () => {
    const result = validatePasswordComplexity("MyStr0ng!Pass");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("accepts password with all required character types", () => {
    const result = validatePasswordComplexity("Aa1!aaaa");
    expect(result.valid).toBe(true);
  });

  test("rejects password shorter than 8 characters", () => {
    const result = validatePasswordComplexity("Aa1!bb");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("8 characters"))).toBe(true);
  });

  test("rejects password without uppercase letter", () => {
    const result = validatePasswordComplexity("nouppcase1!");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("uppercase"))).toBe(true);
  });

  test("rejects password without lowercase letter", () => {
    const result = validatePasswordComplexity("NOLOWER1!");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("lowercase"))).toBe(true);
  });

  test("rejects password without digit", () => {
    const result = validatePasswordComplexity("NoDigitHere!");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("digit"))).toBe(true);
  });

  test("rejects password without special character", () => {
    const result = validatePasswordComplexity("NoSpecial1a");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("special"))).toBe(true);
  });

  test("rejects empty password with multiple errors", () => {
    const result = validatePasswordComplexity("");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  test("accepts password at exact minimum length", () => {
    const result = validatePasswordComplexity("Aa1!bbbb");
    expect(result.valid).toBe(true);
  });

  test("rejects all-lowercase password", () => {
    const result = validatePasswordComplexity("alllowercase");
    expect(result.valid).toBe(false);
  });

  test("rejects all-numeric password", () => {
    const result = validatePasswordComplexity("12345678");
    expect(result.valid).toBe(false);
  });
});

// ── PasswordComplexitySchema (Zod) ─────────────────────────────────

describe("PasswordComplexitySchema", () => {
  test("parses valid password", () => {
    const result = PasswordComplexitySchema.safeParse("GoodP@ss1");
    expect(result.success).toBe(true);
  });

  test("fails for too-short password", () => {
    const result = PasswordComplexitySchema.safeParse("Ab1!");
    expect(result.success).toBe(false);
  });

  test("fails for non-string input", () => {
    const result = PasswordComplexitySchema.safeParse(12345678);
    expect(result.success).toBe(false);
  });

  test("returns the password string on success", () => {
    const result = PasswordComplexitySchema.safeParse("V@lid1Pass");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("V@lid1Pass");
    }
  });
});
