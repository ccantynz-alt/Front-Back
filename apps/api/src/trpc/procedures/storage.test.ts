/**
 * BLK-018 — Tests for the admin-only storage.getSignedUploadUrl tRPC
 * procedure. Verifies:
 *   1. Non-admin callers are rejected by the adminProcedure middleware.
 *   2. PRECONDITION_FAILED is thrown when the self-hosted backend env
 *      vars are not set.
 *   3. Admins receive a presigned URL + key + expiresAt when env vars
 *      are configured.
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "bun:test";
import { eq } from "drizzle-orm";
import {
  db,
  users,
  sessions,
  scopedDb,
} from "@back-to-the-future/db";
import { appRouter } from "../router";
import { createSession } from "../../auth/session";
import type { TRPCContext } from "../context";

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

async function createUser(role: "admin" | "viewer"): Promise<string> {
  const id = `storage-blk018-${role}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  await db.insert(users).values({
    id,
    email: `${id}@example.com`,
    displayName: `Storage BLK-018 ${role}`,
    role,
  });
  return id;
}

async function cleanupUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ── Env var lifecycle ────────────────────────────────────────────────
//
// BLK-018 reads OBJECT_STORAGE_* directly from process.env on every call
// (via createClientFromEnv). Tests must save + restore the values to
// avoid leaking state across files.

const ENV_KEYS = [
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_REGION",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "MINIO_ROOT_USER",
  "MINIO_ROOT_PASSWORD",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

// ── Suite ────────────────────────────────────────────────────────────

describe("storage.getSignedUploadUrl — BLK-018", () => {
  const allUsers: string[] = [];

  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    for (const id of allUsers.splice(0)) await cleanupUser(id);
  });

  test("non-admin callers are rejected", async () => {
    const userId = await createUser("viewer");
    allUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    let threw = false;
    try {
      await caller.storage.getSignedUploadUrl({
        key: "uploads/test.txt",
        contentType: "text/plain",
      });
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message.toLowerCase()).toContain("admin");
    }
    expect(threw).toBe(true);
  });

  test("admin receives PRECONDITION_FAILED when backend not configured", async () => {
    const userId = await createUser("admin");
    allUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    let threw = false;
    try {
      await caller.storage.getSignedUploadUrl({
        key: "uploads/test.txt",
      });
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("not configured");
    }
    expect(threw).toBe(true);
  });

  test("admin receives a signed URL when backend is configured", async () => {
    process.env["OBJECT_STORAGE_ENDPOINT"] = "http://127.0.0.1:9000";
    process.env["OBJECT_STORAGE_REGION"] = "us-east-1";
    process.env["OBJECT_STORAGE_BUCKET"] = "crontech-objects";
    process.env["OBJECT_STORAGE_ACCESS_KEY_ID"] = "minioadmin";
    process.env["OBJECT_STORAGE_SECRET_ACCESS_KEY"] = "minioadmin-password";

    const userId = await createUser("admin");
    allUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    const res = await caller.storage.getSignedUploadUrl({
      key: "uploads/test.bin",
      contentType: "application/octet-stream",
      expiresIn: 600,
    });
    expect(typeof res.url).toBe("string");
    expect(res.url).toContain("X-Amz-Signature=");
    expect(res.url).toContain("X-Amz-Expires=600");
    expect(res.key).toBe("uploads/test.bin");
    expect(typeof res.expiresAt).toBe("string");
    expect(Number.isFinite(Date.parse(res.expiresAt))).toBe(true);
  });

  test("admin can omit contentType and still get a signed URL", async () => {
    process.env["OBJECT_STORAGE_ENDPOINT"] = "http://127.0.0.1:9000";
    process.env["OBJECT_STORAGE_REGION"] = "us-east-1";
    process.env["OBJECT_STORAGE_BUCKET"] = "crontech-objects";
    process.env["OBJECT_STORAGE_ACCESS_KEY_ID"] = "minioadmin";
    process.env["OBJECT_STORAGE_SECRET_ACCESS_KEY"] = "minioadmin-password";

    const userId = await createUser("admin");
    allUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    const res = await caller.storage.getSignedUploadUrl({
      key: "uploads/no-content-type.bin",
    });
    expect(res.url).toContain("X-Amz-Signature=");
    expect(res.url).toContain("X-Amz-Expires=900");
  });
});
