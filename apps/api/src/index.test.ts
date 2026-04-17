import { describe, test, expect } from "bun:test";
import { app } from "./index";

// ── Health endpoint ──────────────────────────────────────────────────

describe("GET /api/health", () => {
  test("returns 200 with status ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("returns a valid ISO timestamp", async () => {
    const res = await app.request("/api/health");
    const body = await res.json();
    expect(body.timestamp).toBeDefined();
    const date = new Date(body.timestamp);
    expect(date.toISOString()).toBe(body.timestamp);
  });

  test("returns JSON content type", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// ── tRPC health procedure ────────────────────────────────────────────

describe("tRPC health procedure", () => {
  test("returns status ok", async () => {
    const res = await app.request("/api/trpc/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data).toEqual({ status: "ok" });
  });
});

// ── tRPC hello procedure ─────────────────────────────────────────────

describe("tRPC hello procedure", () => {
  test("returns greeting for valid input", async () => {
    const url = `/api/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: "World" }))}`;
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data).toEqual({ greeting: "Hello, World!" });
  });

  test("returns greeting with special characters in name", async () => {
    const url = `/api/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: "O'Brien" }))}`;
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.greeting).toBe("Hello, O'Brien!");
  });

  test("returns greeting with empty string name", async () => {
    const url = `/api/trpc/hello?input=${encodeURIComponent(JSON.stringify({ name: "" }))}`;
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.greeting).toBe("Hello, !");
  });

  test("returns error for missing name field", async () => {
    const url = `/api/trpc/hello?input=${encodeURIComponent(JSON.stringify({}))}`;
    const res = await app.request(url);
    // tRPC returns 400 for input validation errors
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ── 404 handling ─────────────────────────────────────────────────────

describe("unknown routes", () => {
  test("returns 404 for unknown API path", async () => {
    const res = await app.request("/api/nonexistent");
    expect(res.status).toBe(404);
  });
});
