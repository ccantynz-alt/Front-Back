// ── Scoped Query Tests ──────────────────────────────────────────────
// Verifies that scopedDb auto-injects tenant filtering on every
// operation and that the raw db remains available for admin access.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { sites, users } from "./schema";
import { scopedDb } from "./scoped-query";

// ── Setup ───────────────────────────────────────────────────────────

const TENANT_A = "tenant-a-" + Date.now().toString(36);
const TENANT_B = "tenant-b-" + Date.now().toString(36);
let siteIdA: string;
let siteIdB: string;

beforeAll(async () => {
  // Create test users (tenants)
  await db.insert(users).values({
    id: TENANT_A,
    email: `${TENANT_A}@test.com`,
    displayName: "Tenant A",
  });
  await db.insert(users).values({
    id: TENANT_B,
    email: `${TENANT_B}@test.com`,
    displayName: "Tenant B",
  });

  // Create a site for each tenant
  siteIdA = `site-a-${Date.now().toString(36)}`;
  siteIdB = `site-b-${Date.now().toString(36)}`;

  await db.insert(sites).values({
    id: siteIdA,
    userId: TENANT_A,
    name: "Tenant A Site",
    slug: `slug-a-${Date.now().toString(36)}`,
  });
  await db.insert(sites).values({
    id: siteIdB,
    userId: TENANT_B,
    name: "Tenant B Site",
    slug: `slug-b-${Date.now().toString(36)}`,
  });
});

afterAll(async () => {
  await db.delete(sites).where(eq(sites.id, siteIdA));
  await db.delete(sites).where(eq(sites.id, siteIdB));
  await db.delete(users).where(eq(users.id, TENANT_A));
  await db.delete(users).where(eq(users.id, TENANT_B));
});

// ── Tests ───────────────────────────────────────────────────────────

describe("scopedDb", () => {
  test("select only returns rows belonging to the scoped tenant", async () => {
    const scopedA = scopedDb(db, TENANT_A);
    const rows = await scopedA.select(sites);

    // Should only see Tenant A's site
    expect(rows).toBeArray();
    for (const row of rows as Array<{ userId: string }>) {
      expect(row.userId).toBe(TENANT_A);
    }

    // Should NOT contain Tenant B's site
    const ids = (rows as Array<{ id: string }>).map((r) => r.id);
    expect(ids).not.toContain(siteIdB);
  });

  test("select from scoped tenant B does not return tenant A data", async () => {
    const scopedB = scopedDb(db, TENANT_B);
    const rows = await scopedB.select(sites);

    for (const row of rows as Array<{ userId: string }>) {
      expect(row.userId).toBe(TENANT_B);
    }

    const ids = (rows as Array<{ id: string }>).map((r) => r.id);
    expect(ids).not.toContain(siteIdA);
  });

  test("insert auto-injects tenantId", async () => {
    const scopedA = scopedDb(db, TENANT_A);
    const insertedId = `site-insert-${Date.now().toString(36)}`;
    const insertedSlug = `slug-insert-${Date.now().toString(36)}`;

    await scopedA.insert(sites, {
      id: insertedId,
      name: "Inserted via scoped",
      slug: insertedSlug,
    });

    // Verify the row has the correct userId
    const rows = await db.select().from(sites).where(eq(sites.id, insertedId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(TENANT_A);

    // Cleanup
    await db.delete(sites).where(eq(sites.id, insertedId));
  });

  test("update only affects rows belonging to the scoped tenant", async () => {
    const scopedA = scopedDb(db, TENANT_A);

    // Update Tenant A's site
    await scopedA.update(sites, { name: "Updated A" });

    // Verify A was updated
    const rowsA = await db.select().from(sites).where(eq(sites.id, siteIdA));
    expect(rowsA[0]!.name).toBe("Updated A");

    // Verify B was NOT affected
    const rowsB = await db.select().from(sites).where(eq(sites.id, siteIdB));
    expect(rowsB[0]!.name).toBe("Tenant B Site");

    // Restore
    await db.update(sites).set({ name: "Tenant A Site" }).where(eq(sites.id, siteIdA));
  });

  test("delete only removes rows belonging to the scoped tenant", async () => {
    // Create a temporary site for deletion test
    const tempId = `site-del-${Date.now().toString(36)}`;
    await db.insert(sites).values({
      id: tempId,
      userId: TENANT_A,
      name: "To Delete",
      slug: `slug-del-${Date.now().toString(36)}`,
    });

    const scopedA = scopedDb(db, TENANT_A);
    await scopedA.delete(sites, eq(sites.id, tempId));

    // Verify it was deleted
    const afterDelete = await db.select().from(sites).where(eq(sites.id, tempId));
    expect(afterDelete).toHaveLength(0);

    // Verify Tenant B's site still exists
    const bSite = await db.select().from(sites).where(eq(sites.id, siteIdB));
    expect(bSite).toHaveLength(1);
  });

  test("raw db.select() returns all tenants (admin access)", async () => {
    // Direct db access should see both tenants' data
    const allSites = await db.select().from(sites);
    const userIds = new Set(allSites.map((s) => s.userId));

    // Should contain both tenant IDs (and possibly others from other tests)
    expect(userIds.has(TENANT_A)).toBe(true);
    expect(userIds.has(TENANT_B)).toBe(true);
  });

  test("tenantId and tenantColumn are exposed on the client", () => {
    const scoped = scopedDb(db, "test-tenant-id");
    expect(scoped.tenantId).toBe("test-tenant-id");
    expect(scoped.tenantColumn).toBe("userId");
  });

  test("custom tenantColumn name works", () => {
    const scoped = scopedDb(db, "test-tenant-id", "tenantId");
    expect(scoped.tenantColumn).toBe("tenantId");
  });
});
