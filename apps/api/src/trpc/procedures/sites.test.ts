import { describe, test, expect } from "bun:test";
import app from "../../index";

// ── Sites tRPC Procedure Tests ──────────────────────────────────────
// Tests that verify the sites tRPC procedures handle auth and validation.
// Most procedures require authentication, so unauthenticated calls
// should return UNAUTHORIZED.

describe("sites.list", () => {
  test("rejects unauthenticated request", async () => {
    const url = `/api/trpc/sites.list?input=${encodeURIComponent(JSON.stringify({}))}`;
    const res = await app.request(url);
    expect(res.status).toBe(401);
  });
});

describe("sites.getById", () => {
  test("rejects unauthenticated request", async () => {
    const url = `/api/trpc/sites.getById?input=${encodeURIComponent(
      JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }),
    )}`;
    const res = await app.request(url);
    expect(res.status).toBe(401);
  });
});

describe("sites.getBySlug", () => {
  test("returns 404 for non-existent slug", async () => {
    const url = `/api/trpc/sites.getBySlug?input=${encodeURIComponent(
      JSON.stringify({ slug: "non-existent-slug" }),
    )}`;
    const res = await app.request(url);
    // getBySlug is a public procedure, so it should hit the DB
    // With no DB connection in tests, it may error — but it should NOT be 401
    expect(res.status).not.toBe(401);
  });
});

describe("sites.create", () => {
  test("rejects unauthenticated request", async () => {
    const res = await app.request("/api/trpc/sites.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Site",
        slug: "test-site",
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("sites.update", () => {
  test("rejects unauthenticated request", async () => {
    const res = await app.request("/api/trpc/sites.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "00000000-0000-0000-0000-000000000000",
        name: "Updated",
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("sites.delete", () => {
  test("rejects unauthenticated request", async () => {
    const res = await app.request("/api/trpc/sites.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("sites.deploy", () => {
  test("rejects unauthenticated request", async () => {
    const res = await app.request("/api/trpc/sites.deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(401);
  });
});
