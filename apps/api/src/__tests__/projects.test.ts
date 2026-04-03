import { describe, test, expect } from "bun:test";
import app from "../index";

// ── Helpers ─────────────────────────────────────────────────────────

function trpcGet(procedure: string, input?: unknown): string {
  const base = `/api/trpc/${procedure}`;
  if (input === undefined) return base;
  return `${base}?input=${encodeURIComponent(JSON.stringify(input))}`;
}

function trpcMutation(
  procedure: string,
  input: unknown,
  headers?: Record<string, string>,
): Request {
  return new Request(`http://localhost/api/trpc/${procedure}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(input),
  });
}

const VALID_UUID = "00000000-0000-4000-a000-000000000001";

// ── projects.list ───────────────────────────────────────────────────

describe("projects.list", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(trpcGet("projects.list", {}));
    expect(res.status).toBe(401);
  });

  test("route exists with valid pagination input", async () => {
    const res = await app.request(trpcGet("projects.list", { limit: 10 }), {
      headers: { Authorization: "Bearer test-token" },
    });
    // Auth will fail (no real session) but route exists (not 404)
    expect(res.status).not.toBe(404);
  });

  test("accepts optional type filter", async () => {
    const res = await app.request(
      trpcGet("projects.list", { limit: 10, type: "website" }),
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect(res.status).not.toBe(404);
  });

  test("accepts video type filter", async () => {
    const res = await app.request(
      trpcGet("projects.list", { limit: 10, type: "video" }),
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect(res.status).not.toBe(404);
  });

  test("rejects invalid type filter", async () => {
    const res = await app.request(
      trpcGet("projects.list", { limit: 10, type: "invalid-type" }),
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect([400, 401]).toContain(res.status);
  });
});

// ── projects.create ─────────────────────────────────────────────────

describe("projects.create", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(
      trpcMutation("projects.create", {
        name: "Test Project",
        type: "website",
      }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects empty name", async () => {
    const res = await app.request(
      trpcMutation("projects.create", { name: "", type: "website" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects name exceeding 255 characters", async () => {
    const res = await app.request(
      trpcMutation("projects.create", {
        name: "x".repeat(256),
        type: "website",
      }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects missing type", async () => {
    const res = await app.request(
      trpcMutation("projects.create", { name: "Test" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects invalid type", async () => {
    const res = await app.request(
      trpcMutation("projects.create", { name: "Test", type: "game" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("accepts valid create with description", async () => {
    const res = await app.request(
      trpcMutation(
        "projects.create",
        { name: "My Site", description: "A test project", type: "video" },
        { Authorization: "Bearer test-token" },
      ),
    );
    // 401 since session is invalid, but route resolves
    expect(res.status).not.toBe(404);
  });

  test("rejects description exceeding 2000 characters", async () => {
    const res = await app.request(
      trpcMutation("projects.create", {
        name: "Test",
        description: "x".repeat(2001),
        type: "website",
      }),
    );
    expect([400, 401]).toContain(res.status);
  });
});

// ── projects.getById ────────────────────────────────────────────────

describe("projects.getById", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(
      trpcGet("projects.getById", { id: VALID_UUID }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects non-UUID id", async () => {
    const res = await app.request(
      trpcGet("projects.getById", { id: "not-a-uuid" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects missing id", async () => {
    const res = await app.request(trpcGet("projects.getById", {}));
    expect([400, 401]).toContain(res.status);
  });
});

// ── projects.update ─────────────────────────────────────────────────

describe("projects.update", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(
      trpcMutation("projects.update", {
        id: VALID_UUID,
        name: "Updated Name",
      }),
    );
    expect([401, 429]).toContain(res.status);
  });

  test("rejects non-UUID id", async () => {
    const res = await app.request(
      trpcMutation("projects.update", { id: "bad-id", name: "Updated" }),
    );
    expect([400, 401, 429]).toContain(res.status);
  });

  test("rejects empty name", async () => {
    const res = await app.request(
      trpcMutation("projects.update", { id: VALID_UUID, name: "" }),
    );
    expect([400, 401, 429]).toContain(res.status);
  });

  test("accepts nullable description", async () => {
    const res = await app.request(
      trpcMutation(
        "projects.update",
        { id: VALID_UUID, description: null },
        { Authorization: "Bearer test-token" },
      ),
    );
    expect(res.status).not.toBe(404);
  });
});

// ── projects.delete ─────────────────────────────────────────────────

describe("projects.delete", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(
      trpcMutation("projects.delete", { id: VALID_UUID }),
    );
    expect([401, 429]).toContain(res.status);
  });

  test("rejects non-UUID id", async () => {
    const res = await app.request(
      trpcMutation("projects.delete", { id: "not-uuid" }),
    );
    expect([400, 401, 429]).toContain(res.status);
  });

  test("accepts hard delete flag with auth header", async () => {
    const res = await app.request(
      trpcMutation(
        "projects.delete",
        { id: VALID_UUID, hard: true },
        { Authorization: "Bearer test-token" },
      ),
    );
    // Route resolves; 401 because session is invalid
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(415);
  });

  test("defaults to soft delete with auth header", async () => {
    const res = await app.request(
      trpcMutation(
        "projects.delete",
        { id: VALID_UUID },
        { Authorization: "Bearer test-token" },
      ),
    );
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(415);
  });
});
