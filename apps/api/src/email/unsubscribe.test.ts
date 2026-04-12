import { describe, test, expect } from "bun:test";
import {
  generateUnsubscribeToken,
  decodeUnsubscribeToken,
} from "./templates";
import { unsubscribeRoutes, isUnsubscribed } from "./unsubscribe";
import { db, users, emailPreferences } from "@back-to-the-future/db";
import { eq } from "drizzle-orm";

// Helper: create a test user
async function createTestUser(id: string, email: string): Promise<void> {
  await db
    .insert(users)
    .values({
      id,
      email,
      displayName: "Test User",
      role: "viewer",
      authProvider: "password",
    })
    .onConflictDoNothing();
}

describe("Email Unsubscribe", () => {
  const testUserId = "unsub-test-user-" + crypto.randomUUID().slice(0, 8);
  const testEmail = `unsub-${testUserId}@test.com`;

  test("generateUnsubscribeToken creates a valid base64url token", () => {
    const token = generateUnsubscribeToken("user-123", "weeklyDigest");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  test("decodeUnsubscribeToken round-trips correctly", () => {
    const token = generateUnsubscribeToken("user-456", "collaborationInvite");
    const decoded = decodeUnsubscribeToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe("user-456");
    expect(decoded!.emailType).toBe("collaborationInvite");
  });

  test("decodeUnsubscribeToken returns null for invalid token", () => {
    expect(decodeUnsubscribeToken("not-a-valid-token")).toBeNull();
    expect(decodeUnsubscribeToken("")).toBeNull();
  });

  test("decodeUnsubscribeToken rejects tokens with invalid emailType", () => {
    // Craft a token with an invalid emailType
    const payload = JSON.stringify({ userId: "user-1", emailType: "invalid" });
    const fakeToken = Buffer.from(payload).toString("base64url");
    expect(decodeUnsubscribeToken(fakeToken)).toBeNull();
  });

  test("isUnsubscribed returns false when no preferences exist", async () => {
    const result = await isUnsubscribed("nonexistent-user-999", "weeklyDigest");
    expect(result).toBe(false);
  });

  test("POST /api/unsubscribe processes one-click unsubscribe", async () => {
    await createTestUser(testUserId, testEmail);

    const token = generateUnsubscribeToken(testUserId, "weeklyDigest");

    const req = new Request(
      `http://localhost/unsubscribe?token=${token}`,
      { method: "POST" },
    );
    const res = await unsubscribeRoutes.fetch(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success: boolean; emailType: string };
    expect(body.success).toBe(true);
    expect(body.emailType).toBe("weeklyDigest");

    // Verify preference was saved
    const prefs = await db
      .select()
      .from(emailPreferences)
      .where(eq(emailPreferences.userId, testUserId))
      .limit(1);
    expect(prefs[0]).toBeDefined();
    expect(prefs[0]!.weeklyDigest).toBe(false);
  });

  test("POST /api/unsubscribe rejects missing token", async () => {
    const req = new Request("http://localhost/unsubscribe", { method: "POST" });
    const res = await unsubscribeRoutes.fetch(req);
    expect(res.status).toBe(400);
  });

  test("GET /api/unsubscribe shows confirmation page", async () => {
    const uid = "unsub-get-test-" + crypto.randomUUID().slice(0, 8);
    await createTestUser(uid, `${uid}@test.com`);

    const token = generateUnsubscribeToken(uid, "collaborationInvite");
    const req = new Request(`http://localhost/unsubscribe?token=${token}`);
    const res = await unsubscribeRoutes.fetch(req);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("You have been unsubscribed");
    expect(html).toContain("Re-subscribe");
  });
});
