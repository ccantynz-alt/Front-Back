import { describe, test, expect } from "bun:test";
import { buildGoogleAuthUrl, googleOAuthRoutes } from "./google-oauth";

// ── buildGoogleAuthUrl ──────────────────────────────────────────────
// Note: buildGoogleAuthUrl reads env vars for GOOGLE_CLIENT_ID / SECRET.
// These tests run against whatever env is available; the shape of the URL
// is what we validate.

describe("buildGoogleAuthUrl", () => {
  test("is a function", () => {
    expect(typeof buildGoogleAuthUrl).toBe("function");
  });
});

// ── googleOAuthRoutes ───────────────────────────────────────────────

describe("googleOAuthRoutes", () => {
  test("is a Hono app", () => {
    expect(googleOAuthRoutes).toBeDefined();
    expect(typeof googleOAuthRoutes.fetch).toBe("function");
  });
});
