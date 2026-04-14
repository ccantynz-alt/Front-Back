import { describe, test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { db } from "@back-to-the-future/db";
import { tenants } from "@back-to-the-future/db/schema";
import { subdomainRouter, invalidateTenantCache, type TenantEnv } from "./subdomain";

// ── Test Hono app ────────────────────────────────────────────────────

function createTestApp(): Hono<TenantEnv> {
  const app = new Hono<TenantEnv>();
  app.use("*", subdomainRouter);
  app.get("/api/whoami", (c) => {
    const tenantSlug = c.get("tenantSlug") ?? null;
    const tenantId = c.get("tenantId") ?? null;
    return c.json({ tenantSlug, tenantId });
  });
  return app;
}

async function request(
  app: Hono<TenantEnv>,
  path: string,
  host: string,
): Promise<Response> {
  return app.request(path, {
    headers: { host },
  });
}

// ── Setup ────────────────────────────────────────────────────────────

let acmeTenantId: string;

beforeAll(async () => {
  // Seed a known tenant for subdomain resolution
  acmeTenantId = crypto.randomUUID();
  await db.insert(tenants).values({
    id: acmeTenantId,
    name: "Acme Corp",
    slug: "acme",
    plan: "pro",
    ownerEmail: "acme@example.com",
    customDomain: "acme.example.com",
    status: "active",
    createdAt: new Date(),
  });
  // Clear cache to ensure clean state
  invalidateTenantCache("acme");
});

// ── Subdomain Routing Tests ──────────────────────────────────────────

describe("Subdomain routing", () => {
  test("extracts subdomain and resolves tenant", async () => {
    const app = createTestApp();
    invalidateTenantCache("acme");
    const res = await request(app, "/api/whoami", "acme.crontech.ai");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantSlug: string | null; tenantId: string | null };
    expect(body.tenantSlug).toBe("acme");
    expect(body.tenantId).toBe(acmeTenantId);
  });

  test("returns 404 for unknown subdomain", async () => {
    const app = createTestApp();
    const res = await request(app, "/api/whoami", "nonexistent.crontech.ai");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("TENANT_NOT_FOUND");
  });

  test("bare domain passes through without tenant context", async () => {
    const app = createTestApp();
    const res = await request(app, "/api/whoami", "crontech.ai");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantSlug: string | null; tenantId: string | null };
    expect(body.tenantSlug).toBeNull();
    expect(body.tenantId).toBeNull();
  });

  test("localhost passes through without tenant context", async () => {
    const app = createTestApp();
    const res = await request(app, "/api/whoami", "localhost");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantSlug: string | null; tenantId: string | null };
    expect(body.tenantSlug).toBeNull();
    expect(body.tenantId).toBeNull();
  });

  test("custom domain resolves to correct tenant", async () => {
    const app = createTestApp();
    const res = await request(app, "/api/whoami", "acme.example.com");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantSlug: string | null; tenantId: string | null };
    expect(body.tenantSlug).toBe("acme");
    expect(body.tenantId).toBe(acmeTenantId);
  });

  test("IP addresses pass through without tenant context", async () => {
    const app = createTestApp();
    const res = await request(app, "/api/whoami", "192.168.1.1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantSlug: string | null; tenantId: string | null };
    expect(body.tenantSlug).toBeNull();
    expect(body.tenantId).toBeNull();
  });

  test("crontech.dev base domain also works for subdomain extraction", async () => {
    const app = createTestApp();
    invalidateTenantCache("acme");
    const res = await request(app, "/api/whoami", "acme.crontech.dev");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantSlug: string | null; tenantId: string | null };
    expect(body.tenantSlug).toBe("acme");
    expect(body.tenantId).toBe(acmeTenantId);
  });

  test("host with port is handled correctly", async () => {
    const app = createTestApp();
    invalidateTenantCache("acme");
    const res = await request(app, "/api/whoami", "acme.crontech.ai:3001");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantSlug: string | null; tenantId: string | null };
    expect(body.tenantSlug).toBe("acme");
    expect(body.tenantId).toBe(acmeTenantId);
  });
});
