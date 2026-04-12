import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@back-to-the-future/db";
import { tenants, users } from "@back-to-the-future/db/schema";

// ── Helpers ──────────────────────────────────────────────────────────

async function seedAdminUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: "admin@crontech.ai",
    displayName: "Admin",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

async function seedTenant(slug: string, customDomain?: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(tenants).values({
    id,
    name: `Tenant ${slug}`,
    slug,
    plan: "pro",
    ownerEmail: "owner@example.com",
    customDomain: customDomain ?? null,
    status: "active",
    createdAt: new Date(),
  });
  return id;
}

// ── Tenant Provisioning Tests ────────────────────────────────────────

describe("Tenant provisioning", () => {
  beforeAll(async () => {
    await seedAdminUser();
  });

  test("slug uniqueness: duplicate slug is rejected", async () => {
    const slug = "unique-test-slug";
    await seedTenant(slug);

    // Attempt to insert a second tenant with the same slug
    let threw = false;
    try {
      await db.insert(tenants).values({
        id: crypto.randomUUID(),
        name: "Duplicate",
        slug,
        plan: "free",
        ownerEmail: "dup@example.com",
        customDomain: null,
        status: "provisioning",
        createdAt: new Date(),
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("successful provision: tenant is inserted with correct fields", async () => {
    const id = crypto.randomUUID();
    const slug = "success-provision";
    await db.insert(tenants).values({
      id,
      name: "Test Tenant",
      slug,
      plan: "starter",
      ownerEmail: "test@example.com",
      customDomain: "custom.example.com",
      status: "provisioning",
      createdAt: new Date(),
    });

    // Update to active (simulating provision step 5)
    await db
      .update(tenants)
      .set({ status: "active" })
      .where(eq(tenants.id, id));

    const rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    const tenant = rows[0];
    expect(tenant).toBeDefined();
    expect(tenant!.name).toBe("Test Tenant");
    expect(tenant!.slug).toBe(slug);
    expect(tenant!.plan).toBe("starter");
    expect(tenant!.ownerEmail).toBe("test@example.com");
    expect(tenant!.customDomain).toBe("custom.example.com");
    expect(tenant!.status).toBe("active");
  });

  test("plan validation: only valid plans are accepted by schema", () => {
    const { z } = require("zod");
    const planSchema = z.enum(["free", "starter", "pro", "enterprise"]);

    expect(planSchema.safeParse("free").success).toBe(true);
    expect(planSchema.safeParse("starter").success).toBe(true);
    expect(planSchema.safeParse("pro").success).toBe(true);
    expect(planSchema.safeParse("enterprise").success).toBe(true);
    expect(planSchema.safeParse("invalid").success).toBe(false);
    expect(planSchema.safeParse("").success).toBe(false);
  });

  test("list tenants: returns all inserted tenants", async () => {
    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        plan: tenants.plan,
        status: tenants.status,
        createdAt: tenants.createdAt,
        customDomain: tenants.customDomain,
      })
      .from(tenants);

    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.id).toBeDefined();
      expect(row.slug).toBeDefined();
    }
  });

  test("getBySlug: returns tenant for existing slug", async () => {
    const slug = "get-by-slug-test";
    await seedTenant(slug);

    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        plan: tenants.plan,
        status: tenants.status,
        customDomain: tenants.customDomain,
      })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    expect(rows[0]).toBeDefined();
    expect(rows[0]!.slug).toBe(slug);
    expect(rows[0]!.plan).toBe("pro");
  });

  test("getBySlug: returns empty for non-existent slug", async () => {
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, "does-not-exist-xyz"))
      .limit(1);

    expect(rows.length).toBe(0);
  });
});
