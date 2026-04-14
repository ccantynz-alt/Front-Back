/**
 * Unsubscribe route handlers for GDPR compliance.
 *
 * GET  /api/unsubscribe?token=xxx  — shows confirmation page
 * POST /api/unsubscribe             — one-click unsubscribe (RFC 8058)
 * GET  /api/resubscribe?token=xxx  — re-subscribe
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, emailPreferences, users } from "@back-to-the-future/db";
import {
  decodeUnsubscribeToken,
  generateUnsubscribeToken,
  type UnsubscribableEmailType,
} from "./templates";

const BRAND_NAME = process.env["SITE_NAME"] ?? "Crontech";
const PUBLIC_URL = process.env["PUBLIC_URL"] ?? "http://localhost:3000";

export const unsubscribeRoutes = new Hono();

/**
 * Upsert email preferences for a user.
 */
async function setEmailPreference(
  userId: string,
  emailType: UnsubscribableEmailType,
  enabled: boolean,
): Promise<void> {
  // Check if preferences row exists
  const existing = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId))
    .limit(1);

  const columnName =
    emailType === "weeklyDigest" ? "weeklyDigest" : "collaborationInvite";

  if (existing[0]) {
    await db
      .update(emailPreferences)
      .set({
        [columnName === "weeklyDigest" ? "weeklyDigest" : "collaborationInvite"]:
          enabled,
        updatedAt: new Date(),
      })
      .where(eq(emailPreferences.userId, userId));
  } else {
    await db.insert(emailPreferences).values({
      id: crypto.randomUUID(),
      userId,
      weeklyDigest: emailType === "weeklyDigest" ? enabled : true,
      collaborationInvite:
        emailType === "collaborationInvite" ? enabled : true,
      updatedAt: new Date(),
    });
  }
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} - ${BRAND_NAME}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           display: flex; justify-content: center; align-items: center; min-height: 100vh;
           margin: 0; background: #f4f4f5; color: #374151; }
    .card { background: #fff; border-radius: 12px; padding: 40px; max-width: 480px;
            box-shadow: 0 1px 3px rgba(0,0,0,.1); text-align: center; }
    h1 { font-size: 22px; color: #111827; margin: 0 0 16px; }
    p  { font-size: 15px; line-height: 1.6; margin: 0 0 12px; }
    a  { color: #6366f1; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    ${body}
  </div>
</body>
</html>`;
}

/**
 * GET /api/unsubscribe?token=xxx
 * Shows confirmation page and processes unsubscribe.
 */
unsubscribeRoutes.get("/unsubscribe", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.html(
      htmlPage("Invalid Link", "<h1>Invalid Link</h1><p>The unsubscribe link is missing or malformed.</p>"),
      400,
    );
  }

  const decoded = decodeUnsubscribeToken(token);
  if (!decoded) {
    return c.html(
      htmlPage("Invalid Link", "<h1>Invalid Link</h1><p>The unsubscribe token is invalid or expired.</p>"),
      400,
    );
  }

  // Verify user exists
  const userRow = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, decoded.userId))
    .limit(1);

  if (!userRow[0]) {
    return c.html(
      htmlPage("User Not Found", "<h1>User Not Found</h1><p>We could not find an account for this token.</p>"),
      404,
    );
  }

  // Process unsubscribe
  await setEmailPreference(decoded.userId, decoded.emailType, false);

  const resubToken = generateUnsubscribeToken(decoded.userId, decoded.emailType);
  const resubUrl = `${PUBLIC_URL}/api/resubscribe?token=${resubToken}`;

  const emailLabel =
    decoded.emailType === "weeklyDigest"
      ? "weekly digest"
      : "collaboration invite";

  return c.html(
    htmlPage(
      "Unsubscribed",
      `<h1>You have been unsubscribed</h1>
       <p>You will no longer receive <strong>${emailLabel}</strong> emails from ${BRAND_NAME}.</p>
       <p><a href="${resubUrl}">Changed your mind? Re-subscribe</a></p>
       <p><a href="${PUBLIC_URL}">Return to ${BRAND_NAME}</a></p>`,
    ),
  );
});

/**
 * POST /api/unsubscribe
 * One-click unsubscribe per RFC 8058.
 * Gmail/Yahoo require this since Feb 2024.
 */
unsubscribeRoutes.post("/unsubscribe", async (c) => {
  // RFC 8058: token can come from query param or form body
  let token = c.req.query("token");

  if (!token) {
    try {
      const body = await c.req.parseBody();
      token = typeof body["token"] === "string" ? body["token"] : undefined;
    } catch {
      // body parse failed, continue with no token
    }
  }

  if (!token) {
    return c.json({ error: "Missing token" }, 400);
  }

  const decoded = decodeUnsubscribeToken(token);
  if (!decoded) {
    return c.json({ error: "Invalid token" }, 400);
  }

  await setEmailPreference(decoded.userId, decoded.emailType, false);

  return c.json({ success: true, emailType: decoded.emailType });
});

/**
 * GET /api/resubscribe?token=xxx
 * Re-subscribe after unsubscribing.
 */
unsubscribeRoutes.get("/resubscribe", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.html(
      htmlPage("Invalid Link", "<h1>Invalid Link</h1><p>The re-subscribe link is missing or malformed.</p>"),
      400,
    );
  }

  const decoded = decodeUnsubscribeToken(token);
  if (!decoded) {
    return c.html(
      htmlPage("Invalid Link", "<h1>Invalid Link</h1><p>The re-subscribe token is invalid.</p>"),
      400,
    );
  }

  await setEmailPreference(decoded.userId, decoded.emailType, true);

  const emailLabel =
    decoded.emailType === "weeklyDigest"
      ? "weekly digest"
      : "collaboration invite";

  return c.html(
    htmlPage(
      "Re-subscribed",
      `<h1>Welcome back!</h1>
       <p>You have been re-subscribed to <strong>${emailLabel}</strong> emails.</p>
       <p><a href="${PUBLIC_URL}">Return to ${BRAND_NAME}</a></p>`,
    ),
  );
});

/**
 * Check if a user has unsubscribed from a given email type.
 */
export async function isUnsubscribed(
  userId: string,
  emailType: UnsubscribableEmailType,
): Promise<boolean> {
  const row = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId))
    .limit(1);

  const prefs = row[0];
  if (!prefs) return false; // Default is subscribed

  if (emailType === "weeklyDigest") return !prefs.weeklyDigest;
  if (emailType === "collaborationInvite") return !prefs.collaborationInvite;
  return false;
}
