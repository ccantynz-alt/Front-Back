// BLK-018 Voice — smoke test. Verifies the stub-fallback path works
// when ANTHROPIC_API_KEY is absent so CI can pass without a live key.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildRuns, db, scopedDb, sessions, users } from "@back-to-the-future/db";
import { eq } from "drizzle-orm";
import { createSession } from "../../auth/session";
import type { TRPCContext } from "../context";
import { appRouter } from "../router";

function ctxFor(userId: string, sessionToken: string): TRPCContext {
  return {
    db,
    userId,
    sessionToken,
    csrfToken: null,
    serviceKey: null,
    scopedDb: scopedDb(db, userId),
  };
}

async function createTestUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `voice-test-${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}@example.com`,
    displayName: "Voice Test User",
  });
  return id;
}

async function cleanupTestUser(userId: string): Promise<void> {
  await db.delete(buildRuns).where(eq(buildRuns.actorUserId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

describe("voice.dispatch (stub fallback path)", () => {
  let userId: string;
  let token: string;
  let savedKey: string | undefined;

  beforeEach(async () => {
    // Force the no-Anthropic path so the test is deterministic even in
    // a dev environment that happens to have a key configured.
    savedKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = undefined;
    userId = await createTestUser();
    token = await createSession(userId, db);
  });

  afterEach(async () => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    await cleanupTestUser(userId);
  });

  test("returns kind=unknown with a clear reason when no provider is configured", async () => {
    const caller = appRouter.createCaller(ctxFor(userId, token));
    const out = await caller.voice.dispatch({
      transcript: "go to the dashboard",
      context: { route: "/" },
    });

    expect(out.source).toBe("stub");
    expect(out.intent.kind).toBe("unknown");
    if (out.intent.kind === "unknown") {
      expect(out.intent.reason).toContain("ANTHROPIC_API_KEY");
    }
    expect(out.transcript).toBe("go to the dashboard");
  });

  test("writes a theatre run for every dispatch — even on the stub path", async () => {
    const transcript = `smoke-probe-${Date.now().toString(36)}`;
    const caller = appRouter.createCaller(ctxFor(userId, token));
    await caller.voice.dispatch({ transcript });

    const runs = await db.select().from(buildRuns).where(eq(buildRuns.actorUserId, userId));
    const match = runs.find((r) => r.kind === "voice");
    expect(match).toBeDefined();
    expect(match?.status).toBe("succeeded");
    expect(match?.title).toContain("smoke-probe-");
  });

  test("rejects unauthenticated callers", async () => {
    const anon = appRouter.createCaller({
      db,
      userId: null,
      sessionToken: null,
      csrfToken: null,
      serviceKey: null,
      scopedDb: null,
    });
    try {
      await anon.voice.dispatch({ transcript: "hello" });
      expect(true).toBe(false);
    } catch (err) {
      const code = (err as { code?: string }).code;
      expect(code).toBe("UNAUTHORIZED");
    }
  });
});
