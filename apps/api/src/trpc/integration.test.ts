import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { db, scopedDb, sessions, users } from "@back-to-the-future/db";
import { eq } from "drizzle-orm";
import { generateCsrfToken } from "../auth/csrf";
import { createSession } from "../auth/session";
import type { TRPCContext } from "./context";
import { appRouter } from "./router";

// ── Test Helpers ─────────────────────────────────────────────────────

function createTestContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
  const userId = overrides.userId ?? null;
  return {
    db,
    userId,
    sessionToken: null,
    csrfToken: null,
    serviceKey: null,
    scopedDb: userId ? scopedDb(db, userId) : null,
    ...overrides,
  };
}

const caller = appRouter.createCaller;

const TEST_USER_EMAIL = `test-trpc-${Date.now()}@example.com`;
let testUserId: string;
let testSessionToken: string;

async function createTestUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: TEST_USER_EMAIL,
    displayName: "Test tRPC User",
  });
  return id;
}

async function cleanupTestUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ── Health Endpoint ──────────────────────────────────────────────────

describe("tRPC Health Endpoint", () => {
  test("health returns ok status", async () => {
    const ctx = createTestContext();
    const result = await caller(ctx).health();
    expect(result).toEqual({ status: "ok" });
  });

  test("hello returns greeting", async () => {
    const ctx = createTestContext();
    const result = await caller(ctx).hello({ name: "World" });
    expect(result).toEqual({ greeting: "Hello, World!" });
  });
});

// ── Users CRUD ───────────────────────────────────────────────────────

describe("tRPC Users CRUD", () => {
  const testUserIds: string[] = [];

  // Admin user created before each test to satisfy adminProcedure auth gate
  let adminUserId: string;
  let adminSessionToken: string;
  const ADMIN_EMAIL = `admin-crud-${Date.now()}@example.com`;

  beforeEach(async () => {
    adminUserId = crypto.randomUUID();
    await db.insert(users).values({
      id: adminUserId,
      email: ADMIN_EMAIL,
      displayName: "Admin Test User",
      role: "admin",
    });
    adminSessionToken = await createSession(adminUserId, db);
  });

  afterEach(async () => {
    for (const id of testUserIds) {
      await db.delete(sessions).where(eq(sessions.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
    testUserIds.length = 0;
    // Clean up the admin user and its session
    await db.delete(sessions).where(eq(sessions.userId, adminUserId));
    await db.delete(users).where(eq(users.id, adminUserId));
  });

  test("create user and get by id", async () => {
    const ctx = createTestContext({
      userId: adminUserId,
      sessionToken: adminSessionToken,
    });
    const email = `crud-test-${Date.now()}@example.com`;

    const created = await caller(ctx).users.create({
      email,
      displayName: "CRUD Test User",
    });

    testUserIds.push(created.id);

    expect(created.email).toBe(email);
    expect(created.displayName).toBe("CRUD Test User");
    expect(created.id).toBeString();

    const fetched = await caller(ctx).users.getById({ id: created.id });
    expect(fetched.email).toBe(email);
  });

  test("list users returns paginated results", async () => {
    const ctx = createTestContext({
      userId: adminUserId,
      sessionToken: adminSessionToken,
    });
    const email = `list-test-${Date.now()}@example.com`;

    const created = await caller(ctx).users.create({
      email,
      displayName: "List Test User",
    });
    testUserIds.push(created.id);

    const result = await caller(ctx).users.list({ limit: 10 });
    expect(result.items).toBeArray();
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  test("update user modifies fields", async () => {
    const ctx = createTestContext({
      userId: adminUserId,
      sessionToken: adminSessionToken,
    });
    const email = `update-test-${Date.now()}@example.com`;

    const created = await caller(ctx).users.create({
      email,
      displayName: "Before Update",
    });
    testUserIds.push(created.id);

    const updated = await caller(ctx).users.update({
      id: created.id,
      displayName: "After Update",
    });

    expect(updated.displayName).toBe("After Update");
    expect(updated.email).toBe(email);
  });

  test("delete user removes it", async () => {
    const ctx = createTestContext({
      userId: adminUserId,
      sessionToken: adminSessionToken,
    });
    const email = `delete-test-${Date.now()}@example.com`;

    const created = await caller(ctx).users.create({
      email,
      displayName: "Delete Test User",
    });

    const result = await caller(ctx).users.delete({ id: created.id });
    expect(result.success).toBe(true);

    // Verify it is gone
    try {
      await caller(ctx).users.getById({ id: created.id });
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err).toBeDefined();
    }
  });
});

// ── Billing Procedures ───────────────────────────────────────────────

describe("tRPC Billing", () => {
  beforeEach(async () => {
    testUserId = await createTestUser();
    testSessionToken = await createSession(testUserId, db);
  });

  afterEach(async () => {
    await cleanupTestUser(testUserId);
  });

  test("getPlans returns plan list (public)", async () => {
    const ctx = createTestContext();
    const plans = await caller(ctx).billing.getPlans();
    expect(plans).toBeArray();
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans[0]?.name).toBeString();
  });

  test("getSubscription requires auth", async () => {
    const ctx = createTestContext(); // No userId
    try {
      await caller(ctx).billing.getSubscription();
      expect(true).toBe(false); // Should not reach
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });

  test("getSubscription works with valid session", async () => {
    const ctx = createTestContext({
      userId: testUserId,
      sessionToken: testSessionToken,
    });
    const sub = await caller(ctx).billing.getSubscription();
    expect(sub.status).toBe("free");
    expect(sub.userId).toBe(testUserId);
  });
});

// ── Feature Flags ────────────────────────────────────────────────────

describe("tRPC Feature Flags", () => {
  test("getAll returns array of flags", async () => {
    const ctx = createTestContext();
    const flags = await caller(ctx).featureFlags.getAll();
    expect(flags).toBeArray();
    // At least the pre-defined flags should exist
    expect(flags.length).toBeGreaterThanOrEqual(1);
  });

  test("isEnabled returns boolean for known flag", async () => {
    const ctx = createTestContext();
    const result = await caller(ctx).featureFlags.isEnabled({ key: "ai.client_inference" });
    expect(result.key).toBe("ai.client_inference");
    expect(typeof result.enabled).toBe("boolean");
  });

  test("isEnabled returns false for unknown flag", async () => {
    const ctx = createTestContext();
    const result = await caller(ctx).featureFlags.isEnabled({ key: "nonexistent.flag" });
    expect(result.enabled).toBe(false);
  });

  test("evaluate returns flag details", async () => {
    const ctx = createTestContext();
    const result = await caller(ctx).featureFlags.evaluate({ flagKey: "ai.client_inference" });
    expect(result.key).toBe("ai.client_inference");
    expect(result.flag).not.toBeNull();
    expect(result.flag?.key).toBe("ai.client_inference");
  });
});

// ── Protected Procedure Rejection ────────────────────────────────────

describe("Protected Procedures Reject Unauthenticated Calls", () => {
  test("auth.me rejects without session", async () => {
    const ctx = createTestContext();
    try {
      await caller(ctx).auth.me();
      expect(true).toBe(false); // Should not reach
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });

  test("auth.logout rejects without session", async () => {
    const ctx = createTestContext();
    try {
      await caller(ctx).auth.logout();
      expect(true).toBe(false); // Should not reach
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });

  test("billing.getSubscription rejects without session", async () => {
    const ctx = createTestContext();
    try {
      await caller(ctx).billing.getSubscription();
      expect(true).toBe(false); // Should not reach
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });

  test("collab.createRoom rejects without session", async () => {
    const ctx = createTestContext();
    try {
      await caller(ctx).collab.createRoom({ name: "test" });
      expect(true).toBe(false); // Should not reach
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });
});

// ── Auth Procedures ──────────────────────────────────────────────────

describe("tRPC Auth Procedures", () => {
  test("csrfToken returns a token", async () => {
    const ctx = createTestContext();
    const result = await caller(ctx).auth.csrfToken();
    expect(result.token).toBeString();
    expect(result.token.length).toBe(64);
  });

  test("register.start requires CSRF token", async () => {
    const ctx = createTestContext(); // No CSRF token
    try {
      await caller(ctx).auth.register.start({
        email: "csrf-test@example.com",
        displayName: "CSRF Test",
      });
      expect(true).toBe(false);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toContain("CSRF");
    }
  });

  test("login.start requires CSRF token", async () => {
    const ctx = createTestContext(); // No CSRF token
    try {
      await caller(ctx).auth.login.start({ email: "csrf-test@example.com" });
      expect(true).toBe(false);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toContain("CSRF");
    }
  });

  test("register.start works with valid CSRF token", async () => {
    const csrfToken = generateCsrfToken();
    const email = `reg-csrf-${Date.now()}@example.com`;
    const ctx = createTestContext({ csrfToken });

    const result = await caller(ctx).auth.register.start({
      email,
      displayName: "CSRF Valid Test",
    });

    expect(result.options).toBeDefined();
    expect(result.userId).toBeString();

    // Cleanup the created user
    await db.delete(users).where(eq(users.id, result.userId));
  });

  test("auth.me works with valid session", async () => {
    const userId = await createTestUser();
    const token = await createSession(userId, db);

    const ctx = createTestContext({
      userId,
      sessionToken: token,
    });

    const user = await caller(ctx).auth.me();
    expect(user.id).toBe(userId);
    expect(user.email).toBe(TEST_USER_EMAIL);

    await cleanupTestUser(userId);
  });

  test("auth.logout invalidates session", async () => {
    const userId = await createTestUser();
    const token = await createSession(userId, db);

    const ctx = createTestContext({
      userId,
      sessionToken: token,
    });

    const result = await caller(ctx).auth.logout();
    expect(result.success).toBe(true);

    // Session should be invalid now
    const validatedUserId = await import("./context").then(() =>
      import("../auth/session").then((m) => m.validateSession(token, db)),
    );
    expect(validatedUserId).toBeNull();

    await cleanupTestUser(userId);
  });
});
