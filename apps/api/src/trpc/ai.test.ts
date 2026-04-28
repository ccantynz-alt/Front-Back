import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { db, scopedDb, sessions, siteVersions, sites, users } from "@back-to-the-future/db";
import { eq } from "drizzle-orm";
import { createSession } from "../auth/session";
import type { TRPCContext } from "./context";
import { appRouter } from "./router";

// ── Helpers ───────────────────────────────────────────────────────────────

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

async function createTestUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `test-ai-${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}@example.com`,
    displayName: "Test AI User",
  });
  return id;
}

async function cleanupTestUser(userId: string): Promise<void> {
  const userSites = await db.select({ id: sites.id }).from(sites).where(eq(sites.userId, userId));
  for (const s of userSites) {
    await db.delete(siteVersions).where(eq(siteVersions.siteId, s.id));
  }
  await db.delete(sites).where(eq(sites.userId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

function uniqueSlug(): string {
  return `test-site-${Date.now().toString(36)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`;
}

// ── ai.siteBuilder procedures ──────────────────────────────────────

describe("tRPC ai.siteBuilder", () => {
  let testUserId: string;
  let testSessionToken: string;

  beforeEach(async () => {
    testUserId = await createTestUser();
    testSessionToken = await createSession(testUserId, db);
  });

  afterEach(async () => {
    await cleanupTestUser(testUserId);
  });

  test("generate rejects unauthenticated callers", async () => {
    const ctx = createTestContext();
    try {
      await caller(ctx).ai.siteBuilder.generate({
        prompt: "A simple landing page",
      });
      expect(true).toBe(false);
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });

  test("generate returns a valid PageLayout (stub fallback when no API key)", async () => {
    const ctx = createTestContext({
      userId: testUserId,
      sessionToken: testSessionToken,
    });
    const result = await caller(ctx).ai.siteBuilder.generate({
      prompt: "A simple SaaS landing page with a hero and a CTA",
    });

    expect(result.layout).toBeDefined();
    expect(result.layout.title).toBeString();
    expect(result.layout.components).toBeArray();
    expect(result.layout.components.length).toBeGreaterThanOrEqual(1);
    expect(["ai", "stub"]).toContain(result.source);
  });

  test("save persists a new site with version 1", async () => {
    const ctx = createTestContext({
      userId: testUserId,
      sessionToken: testSessionToken,
    });

    const generated = await caller(ctx).ai.siteBuilder.generate({
      prompt: "A minimal one-page portfolio",
    });

    const slug = uniqueSlug();
    const saved = await caller(ctx).ai.siteBuilder.save({
      name: "Portfolio",
      slug,
      description: "Test portfolio site",
      prompt: "A minimal one-page portfolio",
      layout: generated.layout,
    });

    expect(saved.siteId).toBeString();
    expect(saved.versionId).toBeString();
    expect(saved.version).toBe(1);

    // Verify it lands in the DB
    const rows = await db.select().from(sites).where(eq(sites.id, saved.siteId));
    expect(rows.length).toBe(1);
    expect(rows[0]?.userId).toBe(testUserId);
    expect(rows[0]?.slug).toBe(slug);
  });

  test("save rejects duplicate slugs", async () => {
    const ctx = createTestContext({
      userId: testUserId,
      sessionToken: testSessionToken,
    });

    const generated = await caller(ctx).ai.siteBuilder.generate({
      prompt: "Landing page",
    });
    const slug = uniqueSlug();

    await caller(ctx).ai.siteBuilder.save({
      name: "First",
      slug,
      layout: generated.layout,
    });

    try {
      await caller(ctx).ai.siteBuilder.save({
        name: "Second",
        slug,
        layout: generated.layout,
      });
      expect(true).toBe(false);
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("CONFLICT");
    }
  });

  test("addVersion appends a new version to an existing site", async () => {
    const ctx = createTestContext({
      userId: testUserId,
      sessionToken: testSessionToken,
    });

    const generated = await caller(ctx).ai.siteBuilder.generate({
      prompt: "Initial layout",
    });
    const saved = await caller(ctx).ai.siteBuilder.save({
      name: "Versioned Site",
      slug: uniqueSlug(),
      layout: generated.layout,
    });

    const next = await caller(ctx).ai.siteBuilder.addVersion({
      siteId: saved.siteId,
      prompt: "Updated layout",
      layout: generated.layout,
      generatedBy: "user",
    });

    expect(next.version).toBe(2);
    expect(next.versionId).toBeString();
  });

  test("addVersion rejects callers that do not own the site", async () => {
    const ctx = createTestContext({
      userId: testUserId,
      sessionToken: testSessionToken,
    });
    const generated = await caller(ctx).ai.siteBuilder.generate({
      prompt: "Some site",
    });
    const saved = await caller(ctx).ai.siteBuilder.save({
      name: "Owned Site",
      slug: uniqueSlug(),
      layout: generated.layout,
    });

    // Another user
    const otherUserId = await createTestUser();
    const otherToken = await createSession(otherUserId, db);
    const otherCtx = createTestContext({
      userId: otherUserId,
      sessionToken: otherToken,
    });

    try {
      await caller(otherCtx).ai.siteBuilder.addVersion({
        siteId: saved.siteId,
        layout: generated.layout,
      });
      expect(true).toBe(false);
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("FORBIDDEN");
    } finally {
      await cleanupTestUser(otherUserId);
    }
  });

  test("listSites returns only the caller's sites", async () => {
    const ctx = createTestContext({
      userId: testUserId,
      sessionToken: testSessionToken,
    });

    const generated = await caller(ctx).ai.siteBuilder.generate({
      prompt: "A page",
    });
    await caller(ctx).ai.siteBuilder.save({
      name: "Mine",
      slug: uniqueSlug(),
      layout: generated.layout,
    });

    const list = await caller(ctx).ai.siteBuilder.listSites();
    expect(list).toBeArray();
    expect(list.length).toBeGreaterThanOrEqual(1);
    for (const s of list) {
      expect(s.userId).toBe(testUserId);
    }
  });

  test("getSite returns the site with its latest parsed layout", async () => {
    const ctx = createTestContext({
      userId: testUserId,
      sessionToken: testSessionToken,
    });

    const generated = await caller(ctx).ai.siteBuilder.generate({
      prompt: "A page to fetch",
    });
    const saved = await caller(ctx).ai.siteBuilder.save({
      name: "Fetchable",
      slug: uniqueSlug(),
      layout: generated.layout,
    });

    const fetched = await caller(ctx).ai.siteBuilder.getSite({ id: saved.siteId });
    expect(fetched.site.id).toBe(saved.siteId);
    expect(fetched.latestVersion).not.toBeNull();
    expect(fetched.latestVersion?.version).toBe(1);
    expect(fetched.layout).not.toBeNull();
    expect(fetched.layout?.components).toBeArray();
  });

  test("getSite rejects callers that do not own the site", async () => {
    const ctx = createTestContext({
      userId: testUserId,
      sessionToken: testSessionToken,
    });
    const generated = await caller(ctx).ai.siteBuilder.generate({
      prompt: "A private page",
    });
    const saved = await caller(ctx).ai.siteBuilder.save({
      name: "Private",
      slug: uniqueSlug(),
      layout: generated.layout,
    });

    const otherUserId = await createTestUser();
    const otherToken = await createSession(otherUserId, db);
    const otherCtx = createTestContext({
      userId: otherUserId,
      sessionToken: otherToken,
    });

    try {
      await caller(otherCtx).ai.siteBuilder.getSite({ id: saved.siteId });
      expect(true).toBe(false);
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("NOT_FOUND");
    } finally {
      await cleanupTestUser(otherUserId);
    }
  });
});

// ── ai.constraintSolver procedures ────────────────────────────────────
// The constraint solver requires a live AI provider key to generate
// layouts. In the test environment (no ANTHROPIC_API_KEY / OPENAI_API_KEY)
// it throws PRECONDITION_FAILED — which is the correct behaviour and
// what these tests validate. Auth enforcement is tested independently.

describe("tRPC ai.constraintSolver", () => {
  let testUserId: string;
  let testSessionToken: string;

  beforeEach(async () => {
    testUserId = await createTestUser();
    testSessionToken = await createSession(testUserId, db);
  });

  afterEach(async () => {
    await cleanupTestUser(testUserId);
  });

  test("generateLayout rejects unauthenticated callers", async () => {
    const ctx = createTestContext();
    try {
      await caller(ctx).ai.constraintSolver.generateLayout({
        intent: "A simple landing page",
      });
      expect(true).toBe(false);
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });

  test("generateLayout throws PRECONDITION_FAILED when no provider is configured", async () => {
    // In CI / local test environments neither ANTHROPIC_API_KEY nor
    // OPENAI_API_KEY is set, so the constraint solver should surface a
    // clear PRECONDITION_FAILED rather than a cryptic 500.
    const ctx = createTestContext({
      userId: testUserId,
      sessionToken: testSessionToken,
    });

    // Only run this assertion when no key is present — if a real key IS
    // present the call would succeed (or fail with a real API error).
    const hasKey =
      (process.env.ANTHROPIC_API_KEY?.length ?? 0) > 5 ||
      (process.env.OPENAI_API_KEY?.length ?? 0) > 5;

    if (!hasKey) {
      try {
        await caller(ctx).ai.constraintSolver.generateLayout({
          intent: "A minimal page",
        });
        expect(true).toBe(false);
      } catch (err: unknown) {
        const error = err as { code?: string };
        expect(error.code).toBe("PRECONDITION_FAILED");
      }
    } else {
      // If a key IS available, just verify the procedure is callable and
      // returns a shape that looks like a PageLayout.
      const result = await caller(ctx).ai.constraintSolver.generateLayout({
        intent: "A minimal page with a heading",
      });
      expect(result.layout).toBeDefined();
      expect(result.layout.title).toBeString();
      expect(Array.isArray(result.layout.components)).toBe(true);
    }
  });

  test("generateLayoutStream rejects unauthenticated callers", async () => {
    const ctx = createTestContext();
    try {
      // The async generator should still enforce auth before yielding
      // any value — reject at the procedure boundary, not mid-stream.
      const gen = caller(ctx).ai.constraintSolver.generateLayoutStream({
        intent: "A page",
      });
      // Await the generator itself (tRPC wraps it in a promise for mutations)
      await gen;
      expect(true).toBe(false);
    } catch (err: unknown) {
      const error = err as { code?: string };
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });
});
