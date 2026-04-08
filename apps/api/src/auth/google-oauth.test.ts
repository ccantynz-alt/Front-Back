import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  generateAuthUrl,
  validateConfig,
  GoogleOAuthConfigSchema,
  GoogleUserInfoSchema,
  type GoogleOAuthConfig,
} from "./google-oauth";

// ── Test fixtures ───────────────────────────────────────────────────

const VALID_CONFIG: GoogleOAuthConfig = {
  clientId: "123456789.apps.googleusercontent.com",
  clientSecret: "GOCSPX-secret-value",
  redirectUri: "https://app.example.com/auth/google/callback",
};

// ── generateAuthUrl ─────────────────────────────────────────────────

describe("generateAuthUrl", () => {
  test("returns a URL string starting with Google accounts domain", () => {
    const url = generateAuthUrl(VALID_CONFIG, "random-state-123");
    expect(url).toStartWith("https://accounts.google.com/o/oauth2/v2/auth");
  });

  test("includes client_id in query params", () => {
    const url = generateAuthUrl(VALID_CONFIG, "state");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe(VALID_CONFIG.clientId);
  });

  test("includes redirect_uri in query params", () => {
    const url = generateAuthUrl(VALID_CONFIG, "state");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe(VALID_CONFIG.redirectUri);
  });

  test("includes state parameter", () => {
    const state = "csrf-protection-token-abc";
    const url = generateAuthUrl(VALID_CONFIG, state);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("state")).toBe(state);
  });

  test("includes response_type=code", () => {
    const url = generateAuthUrl(VALID_CONFIG, "state");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("response_type")).toBe("code");
  });

  test("includes openid email profile in scope", () => {
    const url = generateAuthUrl(VALID_CONFIG, "state");
    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope");
    expect(scope).toContain("openid");
    expect(scope).toContain("email");
    expect(scope).toContain("profile");
  });

  test("includes access_type=offline", () => {
    const url = generateAuthUrl(VALID_CONFIG, "state");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("access_type")).toBe("offline");
  });

  test("includes prompt=consent", () => {
    const url = generateAuthUrl(VALID_CONFIG, "state");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("prompt")).toBe("consent");
  });

  test("different states produce different URLs", () => {
    const url1 = generateAuthUrl(VALID_CONFIG, "state-1");
    const url2 = generateAuthUrl(VALID_CONFIG, "state-2");
    expect(url1).not.toBe(url2);
  });
});

// ── GoogleOAuthConfigSchema ─────────────────────────────────────────

describe("GoogleOAuthConfigSchema", () => {
  test("accepts valid config", () => {
    const result = GoogleOAuthConfigSchema.safeParse(VALID_CONFIG);
    expect(result.success).toBe(true);
  });

  test("rejects missing clientId", () => {
    const result = GoogleOAuthConfigSchema.safeParse({
      clientSecret: "secret",
      redirectUri: "https://example.com/callback",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing clientSecret", () => {
    const result = GoogleOAuthConfigSchema.safeParse({
      clientId: "id",
      redirectUri: "https://example.com/callback",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing redirectUri", () => {
    const result = GoogleOAuthConfigSchema.safeParse({
      clientId: "id",
      clientSecret: "secret",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid redirectUri (not a URL)", () => {
    const result = GoogleOAuthConfigSchema.safeParse({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty clientId", () => {
    const result = GoogleOAuthConfigSchema.safeParse({
      clientId: "",
      clientSecret: "secret",
      redirectUri: "https://example.com/callback",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty clientSecret", () => {
    const result = GoogleOAuthConfigSchema.safeParse({
      clientId: "id",
      clientSecret: "",
      redirectUri: "https://example.com/callback",
    });
    expect(result.success).toBe(false);
  });
});

// ── validateConfig ──────────────────────────────────────────────────

describe("validateConfig", () => {
  test("returns parsed config for valid input", () => {
    const config = validateConfig(VALID_CONFIG);
    expect(config.clientId).toBe(VALID_CONFIG.clientId);
    expect(config.clientSecret).toBe(VALID_CONFIG.clientSecret);
    expect(config.redirectUri).toBe(VALID_CONFIG.redirectUri);
  });

  test("throws for invalid input", () => {
    expect(() => validateConfig({ clientId: "only-id" })).toThrow();
  });

  test("throws for null", () => {
    expect(() => validateConfig(null)).toThrow();
  });

  test("throws for string", () => {
    expect(() => validateConfig("not an object")).toThrow();
  });
});

// ── GoogleUserInfoSchema ────────────────────────────────────────────

describe("GoogleUserInfoSchema", () => {
  test("accepts valid user info with all fields", () => {
    const result = GoogleUserInfoSchema.safeParse({
      sub: "1234567890",
      email: "user@gmail.com",
      email_verified: true,
      name: "Test User",
      picture: "https://lh3.googleusercontent.com/a/photo.jpg",
      given_name: "Test",
      family_name: "User",
    });
    expect(result.success).toBe(true);
  });

  test("accepts user info with only required fields", () => {
    const result = GoogleUserInfoSchema.safeParse({
      sub: "1234567890",
      email: "user@gmail.com",
      email_verified: true,
      name: "Test User",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing sub", () => {
    const result = GoogleUserInfoSchema.safeParse({
      email: "user@gmail.com",
      email_verified: true,
      name: "Test",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid email", () => {
    const result = GoogleUserInfoSchema.safeParse({
      sub: "123",
      email: "not-an-email",
      email_verified: true,
      name: "Test",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing name", () => {
    const result = GoogleUserInfoSchema.safeParse({
      sub: "123",
      email: "user@gmail.com",
      email_verified: true,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid picture URL", () => {
    const result = GoogleUserInfoSchema.safeParse({
      sub: "123",
      email: "user@gmail.com",
      email_verified: true,
      name: "Test",
      picture: "not a url",
    });
    expect(result.success).toBe(false);
  });
});
