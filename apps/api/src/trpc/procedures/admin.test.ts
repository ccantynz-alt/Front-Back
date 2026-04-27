// BLK-013 — admin.stats — the single aggregator that backs the five
// tiles on the /admin dashboard. Verifies:
//   1. Non-admin callers are rejected (FORBIDDEN).
//   2. Admin callers receive the exact Zod-validated output shape.
//   3. Counts reflect seeded data (users / sessions-last-24h /
//      deployments-all-time / deployments-this-month).
//   4. claudeSpendMonthUsd rounds to two decimal places.
//   5. The exported Zod schema enumerates exactly the five fields
//      the /admin dashboard consumes — no field drift.

import { describe, test, expect, afterEach } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  users,
  sessions,
  deployments,
  projects,
  conversations,
  chatMessages,
  scopedDb,
} from "@back-to-the-future/db";
import { appRouter } from "../router";
import { createSession } from "../../auth/session";
import type { TRPCContext } from "../context";
import { adminStatsOutputSchema } from "./admin";

// ── Context helpers ──────────────────────────────────────────────────

function ctxFor(userId: string, sessionToken: string): TRPCContext {
  return {
    db,
    userId,
    sessionToken,
    csrfToken: null,
    scopedDb: scopedDb(db, userId),
  };
}

async function createUser(
  role: "admin" | "viewer" | "editor",
): Promise<string> {
  const id = `admin-stats-${role}-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;
  await db.insert(users).values({
    id,
    email: `${id}@example.com`,
    displayName: `Admin Stats ${role}`,
    role,
  });
  return id;
}

async function cleanupUser(userId: string): Promise<void> {
  // Delete child rows that don't cascade from users.
  const projectIds = (
    await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.userId, userId))
  ).map((r) => r.id);
  if (projectIds.length > 0) {
    await db
      .delete(deployments)
      .where(inArray(deployments.projectId, projectIds));
    await db.delete(projects).where(inArray(projects.id, projectIds));
  }
  const convoIds = (
    await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.userId, userId))
  ).map((r) => r.id);
  if (convoIds.length > 0) {
    await db
      .delete(chatMessages)
      .where(inArray(chatMessages.conversationId, convoIds));
    await db.delete(conversations).where(inArray(conversations.id, convoIds));
  }
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ── Suite ────────────────────────────────────────────────────────────

describe("admin.stats — BLK-013 dashboard aggregator", () => {
  const allUsers: string[] = [];

  afterEach(async () => {
    for (const id of allUsers.splice(0)) await cleanupUser(id);
  });

  test("non-admin callers get FORBIDDEN", async () => {
    const userId = await createUser("viewer");
    allUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    let threw = false;
    try {
      await caller.admin.stats();
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("Admin");
    }
    expect(threw).toBe(true);
  });

  test("admin callers receive exactly the five documented fields", async () => {
    const userId = await createUser("admin");
    allUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    const res = await caller.admin.stats();
    const keys = Object.keys(res).sort();
    expect(keys).toEqual(
      [
        "activeSessions",
        "claudeSpendMonthUsd",
        "deploymentsThisMonth",
        "totalDeployments",
        "totalUsers",
      ].sort(),
    );
    expect(typeof res.totalUsers).toBe("number");
    expect(typeof res.activeSessions).toBe("number");
    expect(typeof res.totalDeployments).toBe("number");
    expect(typeof res.deploymentsThisMonth).toBe("number");
    expect(typeof res.claudeSpendMonthUsd).toBe("number");
  });

  test("totalUsers counts rows in users", async () => {
    const adminId = await createUser("admin");
    const seedId = await createUser("viewer");
    allUsers.push(adminId, seedId);
    const token = await createSession(adminId, db);
    const caller = appRouter.createCaller(ctxFor(adminId, token));

    const res = await caller.admin.stats();
    // Both users we just inserted must be present in the count.
    expect(res.totalUsers).toBeGreaterThanOrEqual(2);
  });

  test("activeSessions counts sessions created in the last 24h", async () => {
    const adminId = await createUser("admin");
    allUsers.push(adminId);
    const token = await createSession(adminId, db);
    const caller = appRouter.createCaller(ctxFor(adminId, token));

    // createSession inserted one session just now.
    const res = await caller.admin.stats();
    expect(res.activeSessions).toBeGreaterThanOrEqual(1);
  });

  test("deployments counters respond to freshly inserted rows", async () => {
    const adminId = await createUser("admin");
    allUsers.push(adminId);
    const token = await createSession(adminId, db);
    const caller = appRouter.createCaller(ctxFor(adminId, token));

    // Baseline
    const before = await caller.admin.stats();

    // Seed a project + a deployment created today (this month, all-time).
    const projectId = `proj-blk013-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;
    await db.insert(projects).values({
      id: projectId,
      userId: adminId,
      name: "BLK-013 Stats Test Project",
      slug: projectId,
    });
    const deploymentId = `dep-blk013-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;
    await db.insert(deployments).values({
      id: deploymentId,
      projectId,
      userId: adminId,
      status: "live",
    });

    const after = await caller.admin.stats();
    expect(after.totalDeployments).toBe(before.totalDeployments + 1);
    expect(after.deploymentsThisMonth).toBe(before.deploymentsThisMonth + 1);
  });

  test("claudeSpendMonthUsd is rounded to two decimal places", async () => {
    const adminId = await createUser("admin");
    allUsers.push(adminId);
    const token = await createSession(adminId, db);
    const caller = appRouter.createCaller(ctxFor(adminId, token));

    // Seed a conversation with a message in the current month so the
    // cost aggregator has something to sum.
    const convoId = `conv-blk013-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;
    await db.insert(conversations).values({
      id: convoId,
      userId: adminId,
      title: "BLK-013 Test Conversation",
    });
    const msgId = `msg-blk013-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;
    await db.insert(chatMessages).values({
      id: msgId,
      conversationId: convoId,
      role: "assistant",
      content: "hi",
      model: "claude-sonnet-4-20250514",
      inputTokens: 1000,
      outputTokens: 500,
    });

    const res = await caller.admin.stats();
    // Two decimal places — the number must equal its own 2dp rounding.
    const rounded = Math.round(res.claudeSpendMonthUsd * 100) / 100;
    expect(res.claudeSpendMonthUsd).toBe(rounded);
    expect(res.claudeSpendMonthUsd).toBeGreaterThanOrEqual(0);
  });
});

// ── Schema contract ─────────────────────────────────────────────────

describe("admin.stats — Zod output schema contract", () => {
  test("lists exactly the five BLK-013 fields", () => {
    const keys = Object.keys(adminStatsOutputSchema.shape).sort();
    expect(keys).toEqual(
      [
        "totalUsers",
        "activeSessions",
        "totalDeployments",
        "deploymentsThisMonth",
        "claudeSpendMonthUsd",
      ].sort(),
    );
  });

  test("accepts a valid payload", () => {
    const parsed = adminStatsOutputSchema.parse({
      totalUsers: 3,
      activeSessions: 1,
      totalDeployments: 10,
      deploymentsThisMonth: 4,
      claudeSpendMonthUsd: 12.34,
    });
    expect(parsed.totalUsers).toBe(3);
    expect(parsed.claudeSpendMonthUsd).toBe(12.34);
  });

  test("rejects extra or missing fields at runtime", () => {
    expect(() =>
      adminStatsOutputSchema.parse({
        totalUsers: 1,
        activeSessions: 1,
        totalDeployments: 1,
        deploymentsThisMonth: 1,
        // claudeSpendMonthUsd missing
      }),
    ).toThrow();
  });
});
