// launch.status — admin-only probe for the LaunchChecklist HUD.
// Verifies:
//   1. Non-admin calls are rejected (FORBIDDEN).
//   2. Admin calls return the expected shape.
//   3. Each boolean reflects whether the env var is non-empty.
//   4. Actual secret values are NEVER returned in the response.

import { describe, test, expect, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, users, sessions, scopedDb } from "@back-to-the-future/db";
import { appRouter } from "../router";
import { createSession } from "../../auth/session";
import type { TRPCContext } from "../context";

function ctxFor(userId: string, sessionToken: string): TRPCContext {
  return {
    db,
    userId,
    sessionToken,
    csrfToken: null,
    scopedDb: scopedDb(db, userId),
  };
}

async function createUser(role: "admin" | "viewer"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `launch-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    displayName: `Launch Test ${role}`,
    role,
  });
  return id;
}

async function cleanup(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

describe("launch.status admin probe", () => {
  const allUsers: string[] = [];

  afterEach(async () => {
    for (const id of allUsers.splice(0)) await cleanup(id);
  });

  test("non-admin callers get FORBIDDEN", async () => {
    const userId = await createUser("viewer");
    allUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    let threw = false;
    try {
      await caller.launch.status();
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("Admin");
    }
    expect(threw).toBe(true);
  });

  test("admin callers get secrets + probes shape", async () => {
    const userId = await createUser("admin");
    allUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    const res = await caller.launch.status();

    // All 12 secret keys present, all booleans
    const expected = [
      "DATABASE_URL",
      "DATABASE_AUTH_TOKEN",
      "SESSION_SECRET",
      "JWT_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRO_PRICE_ID",
      "STRIPE_ENTERPRISE_PRICE_ID",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
    ] as const;
    for (const k of expected) {
      expect(typeof res.secrets[k]).toBe("boolean");
    }

    expect(typeof res.probes.api_version).toBe("boolean");
    expect(typeof res.probes.db_connected).toBe("boolean");
    // If the tRPC caller returned at all, api_version is true by
    // definition — the procedure running *is* the proof.
    expect(res.probes.api_version).toBe(true);
  });

  test("secret presence reflects env var non-emptiness", async () => {
    const userId = await createUser("admin");
    allUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    const saved = process.env["STRIPE_PRO_PRICE_ID"];

    process.env["STRIPE_PRO_PRICE_ID"] = "";
    let res = await caller.launch.status();
    expect(res.secrets.STRIPE_PRO_PRICE_ID).toBe(false);

    process.env["STRIPE_PRO_PRICE_ID"] = "price_sentinel_canary";
    res = await caller.launch.status();
    expect(res.secrets.STRIPE_PRO_PRICE_ID).toBe(true);

    if (saved === undefined) delete process.env["STRIPE_PRO_PRICE_ID"];
    else process.env["STRIPE_PRO_PRICE_ID"] = saved;
  });

  test("response NEVER contains a raw secret value", async () => {
    const userId = await createUser("admin");
    allUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    const saved = process.env["JWT_SECRET"];
    const sentinel = "SECRET_SHOULD_NEVER_LEAK_" + Date.now();
    process.env["JWT_SECRET"] = sentinel;

    const res = await caller.launch.status();
    const json = JSON.stringify(res);
    expect(json.includes(sentinel)).toBe(false);
    expect(res.secrets.JWT_SECRET).toBe(true);

    if (saved === undefined) delete process.env["JWT_SECRET"];
    else process.env["JWT_SECRET"] = saved;
  });
});
