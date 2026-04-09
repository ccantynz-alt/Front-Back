import { describe, test, expect } from "bun:test";
import {
  passwordSchema,
  registerWithPasswordSchema,
  loginWithPasswordSchema,
  calculatePasswordStrength,
} from "./password";

describe("Password Auth Module", () => {
  describe("passwordSchema", () => {
    test("accepts strong password", () => {
      expect(passwordSchema.safeParse("MyP@ssw0rd!23").success).toBe(true);
    });

    test("rejects short password", () => {
      expect(passwordSchema.safeParse("Ab1!").success).toBe(false);
    });

    test("rejects empty string", () => {
      expect(passwordSchema.safeParse("").success).toBe(false);
    });
  });

  describe("registerWithPasswordSchema", () => {
    test("accepts valid registration data", () => {
      const data = {
        email: "test@example.com",
        password: "MyP@ssw0rd!23",
        displayName: "Test User",
      };
      const result = registerWithPasswordSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    test("rejects invalid email", () => {
      const data = {
        email: "not-an-email",
        password: "MyP@ssw0rd!23",
        displayName: "Test User",
      };
      const result = registerWithPasswordSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    test("requires displayName", () => {
      const data = {
        email: "test@example.com",
        password: "MyP@ssw0rd!23",
      };
      const result = registerWithPasswordSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe("loginWithPasswordSchema", () => {
    test("accepts valid login data", () => {
      const data = {
        email: "test@example.com",
        password: "MyP@ssw0rd!23",
      };
      expect(loginWithPasswordSchema.safeParse(data).success).toBe(true);
    });

    test("rejects missing password", () => {
      const data = { email: "test@example.com" };
      expect(loginWithPasswordSchema.safeParse(data).success).toBe(false);
    });
  });

  describe("calculatePasswordStrength", () => {
    test("rates weak password as weak", () => {
      const result = calculatePasswordStrength("password");
      expect(result.score).toBeLessThanOrEqual(2);
    });

    test("rates strong password as strong", () => {
      const result = calculatePasswordStrength("MyS3cur3P@ss!2026");
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    test("returns suggestions for weak passwords", () => {
      const result = calculatePasswordStrength("abc");
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    test("returns fewer suggestions for strong passwords", () => {
      const weak = calculatePasswordStrength("abc");
      const strong = calculatePasswordStrength("MyS3cur3P@ss!2026XYZ");
      expect(strong.suggestions.length).toBeLessThanOrEqual(weak.suggestions.length);
    });
  });
});
