// ── Google OAuth 2.0 Authentication ──────────────────────────────────
// Handles the full OAuth 2.0 authorization code flow:
// 1. Redirect user to Google consent screen
// 2. Handle callback with authorization code
// 3. Exchange code for tokens
// 4. Fetch user profile from Google
// 5. Upsert user in database and create session

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, users } from "@back-to-the-future/db";
import { createSession } from "./session";

// ── Environment Validation ──────────────────────────────────────────

const googleEnvSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

function getGoogleConfig(): { clientId: string; clientSecret: string } {
  const parsed = googleEnvSchema.safeParse({
    GOOGLE_CLIENT_ID: process.env["GOOGLE_CLIENT_ID"],
    GOOGLE_CLIENT_SECRET: process.env["GOOGLE_CLIENT_SECRET"],
  });

  if (!parsed.success) {
    throw new Error(
      "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.",
    );
  }

  return {
    clientId: parsed.data.GOOGLE_CLIENT_ID,
    clientSecret: parsed.data.GOOGLE_CLIENT_SECRET,
  };
}

function getRedirectUri(): string {
  const base =
    process.env["API_BASE_URL"] ?? "http://localhost:3001";
  return `${base}/api/auth/google/callback`;
}

function getWebAppUrl(): string {
  return process.env["WEB_APP_URL"] ?? "http://localhost:3000";
}

// ── Google API Response Schemas ─────────────────────────────────────

const googleTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  id_token: z.string().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const googleUserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  verified_email: z.boolean().optional(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  picture: z.string().url().optional(),
});

type GoogleUserProfile = z.infer<typeof googleUserProfileSchema>;

// ── OAuth State Management ──────────────────────────────────────────
// In-memory state store with TTL to prevent CSRF attacks on OAuth flow.

const oauthStateStore = new Map<
  string,
  { createdAt: number; redirectTo: string }
>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateOAuthState(redirectTo: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  oauthStateStore.set(state, {
    createdAt: Date.now(),
    redirectTo,
  });

  return state;
}

function consumeOAuthState(
  state: string,
): { redirectTo: string } | null {
  const entry = oauthStateStore.get(state);
  if (!entry) return null;

  oauthStateStore.delete(state);

  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;

  return { redirectTo: entry.redirectTo };
}

// Periodic cleanup of expired states
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of oauthStateStore) {
    if (now - entry.createdAt > STATE_TTL_MS) {
      oauthStateStore.delete(key);
    }
  }
}, 60_000);

// ── Token Exchange ──────────────────────────────────────────────────

async function exchangeCodeForTokens(
  code: string,
): Promise<z.infer<typeof googleTokenResponseSchema>> {
  const config = getGoogleConfig();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google token exchange failed: ${response.status} ${errorBody}`);
  }

  const data: unknown = await response.json();
  const parsed = googleTokenResponseSchema.parse(data);
  return parsed;
}

// ── Profile Fetch ───────────────────────────────────────────────────

async function fetchGoogleProfile(
  accessToken: string,
): Promise<GoogleUserProfile> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(`Google profile fetch failed: ${response.status}`);
  }

  const data: unknown = await response.json();
  return googleUserProfileSchema.parse(data);
}

// ── User Upsert ─────────────────────────────────────────────────────

async function upsertGoogleUser(
  profile: GoogleUserProfile,
): Promise<string> {
  // Check if a user with this email already exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, profile.email))
    .limit(1);

  const existingUser = existing[0];
  if (existingUser) {
    // Update Google ID and avatar if not set
    await db
      .update(users)
      .set({
        googleId: profile.id,
        avatarUrl: profile.picture ?? existingUser.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));
    return existingUser.id;
  }

  // Create new user
  const userId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    email: profile.email,
    displayName:
      profile.name ?? profile.given_name ?? profile.email.split("@")[0] ?? "User",
    authProvider: "google",
    googleId: profile.id,
    avatarUrl: profile.picture ?? null,
  });

  return userId;
}

// ── Build Google Auth URL ───────────────────────────────────────────

export function buildGoogleAuthUrl(redirectTo?: string): string {
  const config = getGoogleConfig();
  const state = generateOAuthState(redirectTo ?? "/dashboard");

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ── Hono Routes ─────────────────────────────────────────────────────

export const googleOAuthRoutes = new Hono();

// Step 1: Redirect to Google consent screen
googleOAuthRoutes.get("/google", (c) => {
  const redirectTo = c.req.query("redirectTo") ?? "/dashboard";

  try {
    const url = buildGoogleAuthUrl(redirectTo);
    return c.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth configuration error";
    return c.json({ error: message }, 500);
  }
});

// Step 2: Handle callback from Google
googleOAuthRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const webAppUrl = getWebAppUrl();

  // Handle OAuth errors from Google
  if (error) {
    const errorDesc = c.req.query("error_description") ?? error;
    return c.redirect(
      `${webAppUrl}/login?error=${encodeURIComponent(errorDesc)}`,
    );
  }

  if (!code || !state) {
    return c.redirect(
      `${webAppUrl}/login?error=${encodeURIComponent("Missing authorization code or state")}`,
    );
  }

  // Validate state to prevent CSRF
  const stateData = consumeOAuthState(state);
  if (!stateData) {
    return c.redirect(
      `${webAppUrl}/login?error=${encodeURIComponent("Invalid or expired OAuth state. Please try again.")}`,
    );
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Fetch user profile
    const profile = await fetchGoogleProfile(tokens.access_token);

    // Upsert user in database
    const userId = await upsertGoogleUser(profile);

    // Create session
    const sessionToken = await createSession(userId, db);

    // Redirect back to web app with session token
    const redirectUrl = new URL(
      `${webAppUrl}${stateData.redirectTo}`,
    );
    redirectUrl.searchParams.set("token", sessionToken);
    redirectUrl.searchParams.set("provider", "google");

    return c.redirect(redirectUrl.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    console.error("[google-oauth] callback error:", message);
    return c.redirect(
      `${webAppUrl}/login?error=${encodeURIComponent("Google sign-in failed. Please try again.")}`,
    );
  }
});
