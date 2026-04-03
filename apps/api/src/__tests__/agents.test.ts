import { describe, test, expect } from "bun:test";
import app from "../index";

// ── NOTE ────────────────────────────────────────────────────────────
// Agent routes are rate-limited to 20 req/min in the AI middleware.
// Tests that send valid input may receive 429 after the quota is
// exhausted. We test input validation first (these return 400 before
// the rate limiter fires), then test route existence / response
// format with tolerance for 429.
// ────────────────────────────────────────────────────────────────────

function jsonPost(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── POST /api/ai/agents/run — Input Validation ─────────────────────

describe("POST /api/ai/agents/run — validation", () => {
  test("returns 400 for empty message", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/run", { message: "" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
    expect(body.details).toBeDefined();
  });

  test("returns 400 for missing message", async () => {
    const res = await app.request(jsonPost("/api/ai/agents/run", {}));
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid computeTier", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/run", {
        message: "Test",
        computeTier: "quantum",
      }),
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 for maxTokens above 16384", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/run", {
        message: "Test",
        maxTokens: 20000,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 for negative maxTokens", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/run", {
        message: "Test",
        maxTokens: -1,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 for temperature above 2", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/run", {
        message: "Test",
        temperature: 3.0,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 for negative temperature", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/run", {
        message: "Test",
        temperature: -0.5,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid specialist", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/run", {
        message: "Test",
        specialist: "unknown-agent",
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ── POST /api/ai/agents/run — Success Path ─────────────────────────

describe("POST /api/ai/agents/run — success", () => {
  test("returns SSE stream for valid input", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/run", {
        message: "Build me a landing page",
      }),
    );
    // 200 for SSE stream, or 429 if rate limited
    if (res.status === 200) {
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      expect(res.headers.get("cache-control")).toContain("no-cache");
      const runId = res.headers.get("x-run-id");
      expect(runId).toBeTruthy();
      expect(runId!.startsWith("run_")).toBe(true);

      const text = await res.text();
      expect(text).toContain("data: ");
    } else {
      // Rate limited — acceptable in test suite
      expect(res.status).toBe(429);
    }
  });

  test("accepts valid specialist parameters without 400", async () => {
    for (const specialist of ["general", "tech-scout", "site-architect", "video-director"]) {
      const res = await app.request(
        jsonPost("/api/ai/agents/run", {
          message: "Test " + specialist,
          specialist,
        }),
      );
      // Never a validation error
      expect(res.status).not.toBe(400);
      // Could be 200 (SSE) or 429 (rate limited)
      expect([200, 429]).toContain(res.status);
    }
  });

  test("accepts requireApprovalFor array", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/run", {
        message: "Deploy the website",
        requireApprovalFor: ["deploy", "delete"],
      }),
    );
    expect(res.status).not.toBe(400);
    expect([200, 429]).toContain(res.status);
  });
});

// ── POST /api/ai/agents/plan — Input Validation ────────────────────

describe("POST /api/ai/agents/plan — validation", () => {
  test("returns 400 for empty message", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/plan", { message: "" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("returns 400 for missing message", async () => {
    const res = await app.request(jsonPost("/api/ai/agents/plan", {}));
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid computeTier", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/plan", {
        message: "Test",
        computeTier: "local",
      }),
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 for temperature above 2", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/plan", {
        message: "Test",
        temperature: 5.0,
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ── POST /api/ai/agents/plan — Success Path ────────────────────────

describe("POST /api/ai/agents/plan — success", () => {
  test("route exists for valid input", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/plan", {
        message: "Build a blog with auth",
      }),
    );
    // Not a validation error, not 404
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(404);
    // 200 or 500 (LLM unavailable) or 429 (rate limited)
    expect([200, 429, 500]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.plan)).toBe(true);
    }
  });

  test("returns JSON content type", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/plan", { message: "Test" }),
    );
    if (res.status !== 429) {
      expect(res.headers.get("content-type")).toContain("application/json");
    }
  });
});

// ── GET /api/ai/agents/status/:id ───────────────────────────────────

describe("GET /api/ai/agents/status/:id", () => {
  test("returns 404 for nonexistent run", async () => {
    const res = await app.request("/api/ai/agents/status/run_nonexistent");
    // 404 or 429 if rate limited
    expect([404, 429]).toContain(res.status);
    if (res.status === 404) {
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error).toContain("not found");
    }
  });

  test("returns JSON content type", async () => {
    const res = await app.request("/api/ai/agents/status/run_123");
    if (res.status !== 429) {
      expect(res.headers.get("content-type")).toContain("application/json");
    }
  });
});

// ── POST /api/ai/agents/approve/:id ────────────────────────────────

describe("POST /api/ai/agents/approve/:id", () => {
  test("returns 404 for nonexistent run", async () => {
    const res = await app.request(
      jsonPost("/api/ai/agents/approve/run_nonexistent", { approved: true }),
    );
    // 404 or 429 if rate limited
    expect([404, 429]).toContain(res.status);
  });
});
