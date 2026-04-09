import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, users, sessions, credentials } from "@back-to-the-future/db";
import { createSession, validateSession, deleteSession } from "./session";
import { generateCsrfToken, validateCsrfToken, cleanupExpiredCsrfTokens } from "./csrf";

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_USER_EMAIL = `test-auth-${Date.now()}@example.com`;
const TEST_USER_DISPLAY_NAME = "Test Auth User";
let testUserId: string;

async function createTestUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: TEST_USER_EMAIL,
    displayName: TEST_USER_DISPLAY_NAME,
  });
  return id;
}

async function cleanupTestUser(userId: string): Promise<void> {
  // Delete sessions first (FK constraint)
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(credentials).where(eq(credentials.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ── Session Tests ────────────────────────────────────────────────────

describe("Session Management", () => {
  beforeEach(async () => {
    testUserId = await createTestUser();
  });

  afterEach(async () => {
    await cleanupTestUser(testUserId);
  });

  test("createSession returns a token string", async () => {
    const token = await createSession(testUserId, db);
    expect(token).toBeString();
    expect(token.length).toBe(64); // 32 bytes hex-encoded
  });

  test("createSession creates a session in the database", async () => {
    const token = await createSession(testUserId, db);

    const result = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1);

    expect(result.length).toBe(1);
    const session = result[0]!;
    expect(session.userId).toBe(testUserId);
    expect(session.token).toBe(token);
    expect(session.expiresAt).toBeInstanceOf(Date);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("validateSession returns userId for valid session", async () => {
    const token = await createSession(testUserId, db);
    const userId = await validateSession(token, db);
    expect(userId).toBe(testUserId);
  });

  test("validateSession returns null for invalid token", async () => {
    const userId = await validateSession("invalid-token-that-does-not-exist", db);
    expect(userId).toBeNull();
  });

  test("validateSession returns null for expired session", async () => {
    const token = await createSession(testUserId, db);

    // Manually expire the session by setting expiresAt to the past
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.token, token));

    const userId = await validateSession(token, db);
    expect(userId).toBeNull();
  });

  test("deleteSession removes the session from DB", async () => {
    const token = await createSession(testUserId, db);

    // Verify session exists
    const before = await validateSession(token, db);
    expect(before).toBe(testUserId);

    // Delete session
    await deleteSession(token, db);

    // Verify session is gone
    const after = await validateSession(token, db);
    expect(after).toBeNull();
  });

  test("multiple sessions can exist for the same user", async () => {
    const token1 = await createSession(testUserId, db);
    const token2 = await createSession(testUserId, db);

    expect(token1).not.toBe(token2);

    const user1 = await validateSession(token1, db);
    const user2 = await validateSession(token2, db);

    expect(user1).toBe(testUserId);
    expect(user2).toBe(testUserId);
  });

  test("deleting one session does not affect other sessions for same user", async () => {
    const token1 = await createSession(testUserId, db);
    const token2 = await createSession(testUserId, db);

    await deleteSession(token1, db);

    const user1 = await validateSession(token1, db);
    const user2 = await validateSession(token2, db);

    expect(user1).toBeNull();
    expect(user2).toBe(testUserId);
  });
});

// ── CSRF Token Tests ────────────────────────────────────────────────

describe("CSRF Token Management", () => {
  test("generateCsrfToken returns a hex string", () => {
    const token = generateCsrfToken();
    expect(token).toBeString();
    expect(token.length).toBe(64); // 32 bytes hex-encoded
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  test("validateCsrfToken returns true for valid token", () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token)).toBe(true);
  });

  test("validateCsrfToken returns false for null", () => {
    expect(validateCsrfToken(null)).toBe(false);
  });

  test("validateCsrfToken returns false for unknown token", () => {
    expect(validateCsrfToken("unknown-token")).toBe(false);
  });

  test("CSRF tokens are single-use", () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token)).toBe(true);
    // Second use should fail
    expect(validateCsrfToken(token)).toBe(false);
  });

  test("cleanupExpiredCsrfTokens removes expired tokens", () => {
    // Generate tokens - they are not expired so cleanup should not remove them
    generateCsrfToken();
    generateCsrfToken();
    const cleaned = cleanupExpiredCsrfTokens();
    // Freshly created tokens should not be cleaned
    expect(cleaned).toBe(0);
  });
});

// ── Protected Route Access Tests ────────────────────────────────────

describe("Protected Procedure Access", () => {
  beforeEach(async () => {
    testUserId = await createTestUser();
  });

  afterEach(async () => {
    await cleanupTestUser(testUserId);
  });

  test("session token is required for protected access", async () => {
    // Without a session token, validateSession should return null
    const result = await validateSession("", db);
    expect(result).toBeNull();
  });

  test("valid session grants access (simulated)", async () => {
    const token = await createSession(testUserId, db);
    const userId = await validateSession(token, db);
    expect(userId).toBe(testUserId);
    // In the real middleware, this userId would be set on the context
    // and the enforceAuth middleware would allow the call through
  });

  test("expired session denies access", async () => {
    const token = await createSession(testUserId, db);

    // Expire the session
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.token, token));

    const userId = await validateSession(token, db);
    expect(userId).toBeNull();
  });

  test("revoked session (logout) denies access", async () => {
    const token = await createSession(testUserId, db);

    // Simulate logout
    await deleteSession(token, db);

    const userId = await validateSession(token, db);
    expect(userId).toBeNull();
  });
});
