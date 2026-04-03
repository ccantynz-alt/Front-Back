import { describe, test, expect } from "bun:test";
import app from "../index";

// ── NOTE ────────────────────────────────────────────────────────────
// The vector routes hit Qdrant / embedding services which are not
// available in the test environment. Valid inputs will return 500
// (service unreachable). We test:
//   1. Input validation (400 for bad input)
//   2. Route existence (not 404)
//   3. Error responses are well-formed JSON
// ────────────────────────────────────────────────────────────────────

function jsonPost(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── POST /api/ai/vectors/index ──────────────────────────────────────

describe("POST /api/ai/vectors/index", () => {
  test("returns 400 for empty content", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/index", { content: "" }),
    );
    // 400 (validation) or 429 (rate limited when run with full suite)
    expect([400, 429]).toContain(res.status);
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("returns 400 for missing content field", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/index", {}),
    );
    expect([400, 429]).toContain(res.status);
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).toBe("Invalid input");
      expect(body.details).toBeDefined();
    }
  });

  test("route exists and does not 404 for valid input", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/index", {
        content: "Test content for indexing",
        contentType: "page",
      }),
    );
    // Will be 200 (if Qdrant is up) or 500 (service unavailable), never 404
    expect(res.status).not.toBe(404);
    const body = await res.json();
    // Response is always JSON
    expect(typeof body).toBe("object");
  });

  test("returns JSON content type for errors", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/index", { content: "" }),
    );
    if (res.status !== 429) {
      expect(res.headers.get("content-type")).toContain("application/json");
    }
  });

  test("validation error details contain field information", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/index", {}),
    );
    expect([400, 429]).toContain(res.status);
    if (res.status === 400) {
      const body = await res.json();
      expect(body.details).toBeDefined();
      expect(body.details.fieldErrors || body.details.formErrors).toBeDefined();
    }
  });
});

// ── POST /api/ai/vectors/search ─────────────────────────────────────

describe("POST /api/ai/vectors/search", () => {
  test("returns 400 for empty query", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/search", { query: "" }),
    );
    expect([400, 429]).toContain(res.status);
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).toBeDefined();
    }
  });

  test("returns 400 for missing query", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/search", {}),
    );
    expect([400, 429]).toContain(res.status);
  });

  test("route exists for valid query", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/search", { query: "test search" }),
    );
    expect(res.status).not.toBe(404);
    if (res.status !== 429) {
      expect(res.headers.get("content-type")).toContain("application/json");
    }
  });

  test("accepts filters structure without error", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/search", {
        query: "test",
        filters: { userId: "user-1", contentType: "page" },
      }),
    );
    // Route accepts the input (not a 400 validation error)
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(404);
  });
});

// ── POST /api/ai/vectors/hybrid-search ──────────────────────────────

describe("POST /api/ai/vectors/hybrid-search", () => {
  test("returns 400 for empty query", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/hybrid-search", { query: "" }),
    );
    expect([400, 429]).toContain(res.status);
  });

  test("returns 400 for missing query", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/hybrid-search", {}),
    );
    expect([400, 429]).toContain(res.status);
  });

  test("route exists for valid query", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/hybrid-search", { query: "test" }),
    );
    expect(res.status).not.toBe(404);
  });

  test("accepts keywordBoost parameter", async () => {
    const res = await app.request(
      jsonPost("/api/ai/vectors/hybrid-search", {
        query: "test",
        keywordBoost: 0.5,
      }),
    );
    // Not a validation error
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(404);
  });
});

// ── GET /api/ai/vectors/collections ─────────────────────────────────

describe("GET /api/ai/vectors/collections", () => {
  test("route exists and returns JSON", async () => {
    const res = await app.request("/api/ai/vectors/collections");
    // 200 if Qdrant available, 500 if not — never 404
    expect(res.status).not.toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// ── DELETE /api/ai/vectors/:contentId ───────────────────────────────

describe("DELETE /api/ai/vectors/:contentId", () => {
  test("route exists and returns JSON", async () => {
    const res = await app.request("/api/ai/vectors/content-123", {
      method: "DELETE",
    });
    // 200 if Qdrant available, 500 if not — never 404
    expect(res.status).not.toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("returns well-formed JSON response", async () => {
    const res = await app.request("/api/ai/vectors/test-content-456", {
      method: "DELETE",
    });
    const body = await res.json();
    expect(typeof body).toBe("object");
    // If success: { success: true, deleted: N }
    // If error: { error: "message" }
    expect(body.success !== undefined || body.error !== undefined).toBe(true);
  });
});
