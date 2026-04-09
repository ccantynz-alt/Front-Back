import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db, apiKeys } from "@back-to-the-future/db";

export interface ApiKeyAuthEnv {
  Variables: {
    userId: string | null;
    apiKeyId: string | null;
  };
}

/**
 * Hash a raw API key using SHA-256 for lookup.
 */
async function hashApiKey(rawKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hono middleware that authenticates requests using API keys.
 * Accepts `Authorization: Bearer btf_sk_...` headers.
 *
 * If the token does not start with "btf_sk_", it is ignored (falls through
 * to the session-based auth middleware).
 */
export const apiKeyAuthMiddleware = createMiddleware<ApiKeyAuthEnv>(
  async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader?.startsWith("Bearer btf_sk_")) {
      c.set("apiKeyId", null);
      return next();
    }

    const rawKey = authHeader.slice(7); // Remove "Bearer "

    try {
      const keyHash = await hashApiKey(rawKey);

      const results = await db
        .select({
          id: apiKeys.id,
          userId: apiKeys.userId,
          expiresAt: apiKeys.expiresAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash))
        .limit(1);

      const key = results[0];

      if (!key) {
        return c.json({ error: "Invalid API key" }, 401);
      }

      // Check expiration
      if (key.expiresAt && key.expiresAt < new Date()) {
        return c.json({ error: "API key expired" }, 401);
      }

      // Update last used timestamp (fire and forget)
      void db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, key.id));

      c.set("userId", key.userId);
      c.set("apiKeyId", key.id);
      return next();
    } catch (err: unknown) {
      console.error(
        "API key auth error:",
        err instanceof Error ? err.message : String(err),
      );
      return c.json({ error: "Authentication failed" }, 500);
    }
  },
);
