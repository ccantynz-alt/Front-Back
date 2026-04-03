import { describe, test, expect } from "bun:test";
import app from "../index";

// ── Helpers ─────────────────────────────────────────────────────────

function trpcGet(procedure: string, input?: unknown): string {
  const base = `/api/trpc/${procedure}`;
  if (input === undefined) return base;
  return `${base}?input=${encodeURIComponent(JSON.stringify(input))}`;
}

// ── flags.getAll ────────────────────────────────────────────────────

describe("flags.getAll", () => {
  test("returns 200 with a record of flag values", async () => {
    const res = await app.request(trpcGet("flags.getAll"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const flags = body.result?.data;
    expect(flags).toBeDefined();
    expect(typeof flags).toBe("object");
  });

  test("returns expected flag keys", async () => {
    const res = await app.request(trpcGet("flags.getAll"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const flags = body.result?.data;

    const expectedKeys = [
      "ai_multi_agent",
      "webgpu_inference",
      "collab_ai_participants",
      "video_processing",
      "qdrant_search",
      "advanced_rag",
      "stripe_billing",
      "beta_features",
    ];

    for (const key of expectedKeys) {
      expect(flags).toHaveProperty(key);
    }
  });

  test("flag values are booleans or strings", async () => {
    const res = await app.request(trpcGet("flags.getAll"));
    expect(res.status).toBe(200);
    const body = await res.json();
    const flags = body.result?.data;

    for (const [, value] of Object.entries(flags)) {
      expect(typeof value === "boolean" || typeof value === "string").toBe(
        true,
      );
    }
  });

  test("webgpu_inference defaults to true", async () => {
    const res = await app.request(trpcGet("flags.getAll"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result?.data?.webgpu_inference).toBe(true);
  });

  test("does not require authentication (public procedure)", async () => {
    const res = await app.request(trpcGet("flags.getAll"));
    expect(res.status).toBe(200);
  });
});

// ── flags.get ───────────────────────────────────────────────────────

describe("flags.get", () => {
  test("returns single flag value for known flag", async () => {
    const res = await app.request(
      trpcGet("flags.get", { key: "webgpu_inference" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.result?.data;

    expect(data).toBeDefined();
    expect(data.key).toBe("webgpu_inference");
    expect(typeof data.value === "boolean" || typeof data.value === "string").toBe(true);
    expect(typeof data.description).toBe("string");
    expect(data.description.length).toBeGreaterThan(0);
  });

  test("returns false for unknown flag key", async () => {
    const res = await app.request(
      trpcGet("flags.get", { key: "nonexistent_flag" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.result?.data;

    expect(data.key).toBe("nonexistent_flag");
    expect(data.value).toBe(false);
    expect(data.description).toBe("Unknown flag");
  });

  test("rejects empty key", async () => {
    const res = await app.request(trpcGet("flags.get", { key: "" }));
    expect(res.status).toBe(400);
  });

  test("rejects missing key", async () => {
    const res = await app.request(trpcGet("flags.get", {}));
    expect(res.status).toBe(400);
  });

  test("returns correct value for ai_multi_agent flag", async () => {
    const res = await app.request(
      trpcGet("flags.get", { key: "ai_multi_agent" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.result?.data;

    expect(data.key).toBe("ai_multi_agent");
    expect(typeof data.value).toBe("boolean");
  });

  test("returns correct value for stripe_billing flag", async () => {
    const res = await app.request(
      trpcGet("flags.get", { key: "stripe_billing" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result?.data?.key).toBe("stripe_billing");
  });

  test("does not require authentication (public procedure)", async () => {
    const res = await app.request(
      trpcGet("flags.get", { key: "beta_features" }),
    );
    expect(res.status).toBe(200);
  });
});

// ── Flag evaluation consistency ─────────────────────────────────────

describe("flag evaluation context", () => {
  test("getAll and get return consistent values", async () => {
    const allRes = await app.request(trpcGet("flags.getAll"));
    expect(allRes.status).toBe(200);
    const allBody = await allRes.json();
    const allFlags = allBody.result?.data;

    for (const key of ["webgpu_inference", "ai_multi_agent", "beta_features"]) {
      const singleRes = await app.request(trpcGet("flags.get", { key }));
      expect(singleRes.status).toBe(200);
      const singleBody = await singleRes.json();
      expect(singleBody.result?.data?.value).toBe(allFlags[key]);
    }
  });
});
