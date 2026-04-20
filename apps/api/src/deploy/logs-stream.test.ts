/**
 * Smoke tests for the BLK-009 deployment logs SSE stream.
 *
 * These drive the Hono app directly via `app.request(...)` using a real
 * drizzle client pointed at the test sqlite DB (bunfig preload wipes +
 * re-migrates before the suite runs). We:
 *
 *   1. Seed a user → project → deployment → three log rows.
 *   2. Hit `GET /deployments/:id/logs/stream` with a stubbed
 *      `validateSession` that returns the seeded userId.
 *   3. Read the first ~3 SSE frames and assert the initial status frame
 *      plus one data frame per log row, closed out with an `end` frame
 *      because the deployment is already in a terminal state.
 *   4. Cover the error paths: bad UUID, missing token, unknown deployment,
 *      cross-tenant deployment (same seed, different userId).
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  db,
  deploymentLogs,
  deployments,
  projects,
  users,
} from "@back-to-the-future/db";
import { createLogsStreamApp } from "./logs-stream";

// ── Fixture helpers ─────────────────────────────────────────────────

const FIXED_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const DEPLOYMENT_ID = "44444444-4444-4444-8444-444444444444";
const VALID_TOKEN = "test-session-token-xyz";

async function resetTables(): Promise<void> {
  await db.delete(deploymentLogs);
  await db.delete(deployments);
  await db.delete(projects);
  await db.delete(users);
}

async function seedUser(id = FIXED_USER_ID, email = `${id}@test.example`): Promise<void> {
  await db.insert(users).values({
    id,
    email,
    displayName: `user-${id.slice(0, 8)}`,
    role: "editor",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function seedProject(ownerId = FIXED_USER_ID): Promise<void> {
  await db.insert(projects).values({
    id: PROJECT_ID,
    userId: ownerId,
    name: "example",
    slug: `example-${PROJECT_ID.slice(0, 8)}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function seedDeployment(status: "queued" | "building" | "live" | "failed"): Promise<void> {
  await db.insert(deployments).values({
    id: DEPLOYMENT_ID,
    projectId: PROJECT_ID,
    userId: FIXED_USER_ID,
    status,
    triggeredBy: "manual",
    isCurrent: false,
    branch: "main",
    createdAt: new Date(),
  });
}

async function seedLog(
  id: string,
  line: string,
  stream: "stdout" | "stderr" | "event" = "stdout",
  offsetMs = 0,
): Promise<void> {
  await db.insert(deploymentLogs).values({
    id,
    deploymentId: DEPLOYMENT_ID,
    stream,
    line,
    timestamp: new Date(Date.UTC(2026, 3, 18, 12, 0, 0) + offsetMs),
  });
}

function makeApp(overrides?: {
  validate?: (token: string) => Promise<string | null>;
  pollMs?: number;
  maxMs?: number;
}): ReturnType<typeof createLogsStreamApp> {
  return createLogsStreamApp({
    db,
    validateSession: async (token: string) => {
      if (overrides?.validate) return overrides.validate(token);
      return token === VALID_TOKEN ? FIXED_USER_ID : null;
    },
    pollIntervalMs: overrides?.pollMs ?? 10,
    maxDurationMs: overrides?.maxMs ?? 500,
  });
}

async function collectText(res: Response, maxBytes = 8_192): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (out.length < maxBytes) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  try {
    await reader.cancel();
  } catch {
    // already closed
  }
  return out;
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(async () => {
  await resetTables();
});

describe("GET /deployments/:id/logs/stream", () => {
  test("returns 400 for a non-UUID deployment id", async () => {
    const app = makeApp();
    const res = await app.request("/deployments/not-a-uuid/logs/stream?token=" + VALID_TOKEN);
    expect(res.status).toBe(400);
  });

  test("returns 401 when no token is supplied", async () => {
    const app = makeApp();
    const res = await app.request(`/deployments/${DEPLOYMENT_ID}/logs/stream`);
    expect(res.status).toBe(401);
  });

  test("returns 401 when the token does not resolve to a user", async () => {
    const app = makeApp({ validate: async () => null });
    const res = await app.request(
      `/deployments/${DEPLOYMENT_ID}/logs/stream?token=bogus`,
    );
    expect(res.status).toBe(401);
  });

  test("returns 404 when the deployment does not exist", async () => {
    await seedUser();
    const app = makeApp();
    const res = await app.request(
      `/deployments/${DEPLOYMENT_ID}/logs/stream?token=${VALID_TOKEN}`,
    );
    expect(res.status).toBe(404);
  });

  test("returns 404 when the deployment belongs to another user", async () => {
    await seedUser(FIXED_USER_ID);
    await seedUser(OTHER_USER_ID, "other@test.example");
    await seedProject(OTHER_USER_ID);
    await seedDeployment("live");
    // DeploymentId exists but projectId is owned by OTHER_USER_ID.
    const app = makeApp();
    const res = await app.request(
      `/deployments/${DEPLOYMENT_ID}/logs/stream?token=${VALID_TOKEN}`,
    );
    expect(res.status).toBe(404);
  });

  test("streams a status frame, every log row, then an end frame when terminal", async () => {
    await seedUser();
    await seedProject();
    await seedDeployment("live");
    await seedLog("log-0001-0001-4001-8001-000000000001", "Cloning repo", "stdout", 0);
    await seedLog("log-0002-0002-4002-8002-000000000002", "Building", "stdout", 1_000);
    await seedLog("log-0003-0003-4003-8003-000000000003", "Deployed", "stdout", 2_000);

    const app = makeApp();
    const res = await app.request(
      `/deployments/${DEPLOYMENT_ID}/logs/stream?token=${VALID_TOKEN}`,
    );
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type") ?? "";
    expect(contentType).toContain("text/event-stream");

    const text = await collectText(res);
    // Status frame first.
    expect(text).toContain("event: status");
    expect(text).toContain('"status":"live"');
    // Each log line is present.
    expect(text).toContain("event: log");
    expect(text).toContain("Cloning repo");
    expect(text).toContain("Building");
    expect(text).toContain("Deployed");
    // Terminal end frame.
    expect(text).toContain("event: end");
    expect(text).toMatch(/"status":"live"/);
  });

  test("replays existing logs for a non-terminal deployment then keeps polling", async () => {
    await seedUser();
    await seedProject();
    await seedDeployment("building");
    await seedLog("log-0001-0001-4001-8001-000000000001", "Cloning repo", "stdout", 0);

    // Flip to terminal on next poll so the stream closes quickly.
    const app = makeApp({ pollMs: 20, maxMs: 600 });
    const resPromise = app.request(
      `/deployments/${DEPLOYMENT_ID}/logs/stream?token=${VALID_TOKEN}`,
    );

    // Give the handler a moment to emit its initial frames, then flip the
    // deployment to terminal so the tail loop exits.
    await new Promise((r) => setTimeout(r, 50));
    await db
      .update(deployments)
      .set({ status: "failed" })
      .where(eq(deployments.id, DEPLOYMENT_ID));

    const res = await resPromise;
    const text = await collectText(res);
    expect(text).toContain("event: status");
    expect(text).toContain("Cloning repo");
    // The status transition fires a new status frame followed by end.
    expect(text).toContain('"status":"failed"');
    expect(text).toContain("event: end");
  });
});
