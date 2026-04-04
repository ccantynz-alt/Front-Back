import { describe, test, expect } from "bun:test";
import app from "../index";

// ── Deploy Route Input Validation Tests ─────────────────────────────
// Tests that verify input validation on deploy endpoints.
// Actual deployment requires Cloudflare credentials, so we test
// the validation layer and error responses.

describe("POST /api/deploy/create", () => {
  test("rejects empty body", async () => {
    const res = await app.request("/api/deploy/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation error");
  });

  test("rejects name that is too long", async () => {
    const res = await app.request("/api/deploy/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "a".repeat(100) }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty name", async () => {
    const res = await app.request("/api/deploy/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/deploy/build", () => {
  test("rejects missing layout", async () => {
    const res = await app.request("/api/deploy/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "test" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects missing projectName", async () => {
    const res = await app.request("/api/deploy/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layout: {
          title: "Test",
          description: "Test",
          components: [],
        },
      }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty projectName", async () => {
    const res = await app.request("/api/deploy/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layout: {
          title: "Test",
          description: "Test",
          components: [],
        },
        projectName: "",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/deploy/status/:id", () => {
  test("rejects missing projectName query", async () => {
    const res = await app.request("/api/deploy/status/test-id");
    expect(res.status).toBe(400);
  });

  test("rejects empty projectName", async () => {
    const res = await app.request("/api/deploy/status/test-id?projectName=");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/deploy/domain", () => {
  test("rejects missing projectName", async () => {
    const res = await app.request("/api/deploy/domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "example.com" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects missing domain", async () => {
    const res = await app.request("/api/deploy/domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "test" }),
    });
    expect(res.status).toBe(400);
  });
});
