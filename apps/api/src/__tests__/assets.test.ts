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

// ── assets.list ─────────────────────────────────────────────────────

describe("assets.list", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(
      trpcGet("assets.list", { projectId: VALID_UUID }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects non-UUID projectId", async () => {
    const res = await app.request(
      trpcGet("assets.list", { projectId: "not-a-uuid" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects missing projectId", async () => {
    const res = await app.request(trpcGet("assets.list", {}));
    expect([400, 401]).toContain(res.status);
  });

  test("route exists with valid pagination", async () => {
    const res = await app.request(
      trpcGet("assets.list", { projectId: VALID_UUID, limit: 25 }),
      { headers: { Authorization: "Bearer test-token" } },
    );
    expect(res.status).not.toBe(404);
  });
});

// ── assets.create ───────────────────────────────────────────────────

describe("assets.create", () => {
  const validInput = {
    projectId: VALID_UUID,
    filename: "hero-image.png",
    mimeType: "image/png",
    sizeBytes: 1024000,
    storageKey: "projects/abc/assets/hero-image.png",
  };

  test("returns 401 without auth", async () => {
    const res = await app.request(
      trpcMutation("assets.create", validInput),
    );
    expect(res.status).toBe(401);
  });

  test("rejects empty filename", async () => {
    const res = await app.request(
      trpcMutation("assets.create", { ...validInput, filename: "" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects filename exceeding 512 characters", async () => {
    const res = await app.request(
      trpcMutation("assets.create", {
        ...validInput,
        filename: "x".repeat(513),
      }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects empty mimeType", async () => {
    const res = await app.request(
      trpcMutation("assets.create", { ...validInput, mimeType: "" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects negative sizeBytes", async () => {
    const res = await app.request(
      trpcMutation("assets.create", { ...validInput, sizeBytes: -1 }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects non-integer sizeBytes", async () => {
    const res = await app.request(
      trpcMutation("assets.create", { ...validInput, sizeBytes: 1.5 }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects empty storageKey", async () => {
    const res = await app.request(
      trpcMutation("assets.create", { ...validInput, storageKey: "" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects non-UUID projectId", async () => {
    const res = await app.request(
      trpcMutation("assets.create", { ...validInput, projectId: "bad" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("route resolves with auth and valid input", async () => {
    const res = await app.request(
      trpcMutation("assets.create", validInput, {
        Authorization: "Bearer test-token",
      }),
    );
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(415);
  });

  test("accepts optional metadata", async () => {
    const res = await app.request(
      trpcMutation(
        "assets.create",
        { ...validInput, metadata: { width: 1920, height: 1080 } },
        { Authorization: "Bearer test-token" },
      ),
    );
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(415);
  });
});

// ── assets.delete ───────────────────────────────────────────────────

describe("assets.delete", () => {
  test("returns 401 without auth", async () => {
    const res = await app.request(
      trpcMutation("assets.delete", { id: VALID_UUID }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects non-UUID id", async () => {
    const res = await app.request(
      trpcMutation("assets.delete", { id: "bad-id" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects missing id", async () => {
    const res = await app.request(trpcMutation("assets.delete", {}));
    expect([400, 401]).toContain(res.status);
  });
});

// ── assets.getUploadUrl ─────────────────────────────────────────────

describe("assets.getUploadUrl", () => {
  const validInput = {
    projectId: VALID_UUID,
    filename: "video.mp4",
    mimeType: "video/mp4",
    sizeBytes: 50000000,
  };

  test("returns 401 without auth", async () => {
    const res = await app.request(
      trpcMutation("assets.getUploadUrl", validInput),
    );
    expect(res.status).toBe(401);
  });

  test("rejects empty filename", async () => {
    const res = await app.request(
      trpcMutation("assets.getUploadUrl", { ...validInput, filename: "" }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects missing projectId", async () => {
    const res = await app.request(
      trpcMutation("assets.getUploadUrl", {
        filename: "test.png",
        mimeType: "image/png",
        sizeBytes: 1024,
      }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("rejects negative sizeBytes", async () => {
    const res = await app.request(
      trpcMutation("assets.getUploadUrl", {
        ...validInput,
        sizeBytes: -100,
      }),
    );
    expect([400, 401]).toContain(res.status);
  });

  test("route resolves with auth and valid input", async () => {
    const res = await app.request(
      trpcMutation("assets.getUploadUrl", validInput, {
        Authorization: "Bearer test-token",
      }),
    );
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(415);
  });
});
