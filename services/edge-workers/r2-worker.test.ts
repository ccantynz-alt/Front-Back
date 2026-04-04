import { describe, test, expect, beforeEach } from "bun:test";
import app from "./r2-worker";

// ── Mock R2 Object ──────────────────────────────────────────────────

interface MockR2ObjectBody {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
  body: ReadableStream;
}

class MockR2Bucket {
  private store = new Map<
    string,
    { data: ArrayBuffer; contentType?: string; uploaded: Date }
  >();

  async get(key: string): Promise<MockR2ObjectBody | null> {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      key,
      size: item.data.byteLength,
      etag: `"${key}-etag"`,
      httpEtag: `"${key}-etag"`,
      uploaded: item.uploaded,
      httpMetadata: { contentType: item.contentType },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(item.data));
          controller.close();
        },
      }),
    };
  }

  async head(
    key: string,
  ): Promise<Omit<MockR2ObjectBody, "body"> | null> {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      key,
      size: item.data.byteLength,
      etag: `"${key}-etag"`,
      httpEtag: `"${key}-etag"`,
      uploaded: item.uploaded,
      httpMetadata: { contentType: item.contentType },
    };
  }

  async put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ etag: string }> {
    this.store.set(key, {
      data: value,
      contentType: options?.httpMetadata?.contentType,
      uploaded: new Date(),
    });
    return { etag: `"${key}-etag"` };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    objects: Array<{ key: string; size: number; etag: string; uploaded: Date }>;
    truncated: boolean;
    cursor?: string;
  }> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 100;
    const objects: Array<{ key: string; size: number; etag: string; uploaded: Date }> = [];

    for (const [key, item] of this.store) {
      if (key.startsWith(prefix)) {
        objects.push({
          key,
          size: item.data.byteLength,
          etag: `"${key}-etag"`,
          uploaded: item.uploaded,
        });
      }
    }

    const limited = objects.slice(0, limit);
    return {
      objects: limited,
      truncated: objects.length > limit,
      cursor: objects.length > limit ? "next-cursor" : undefined,
    };
  }

  clear(): void {
    this.store.clear();
  }
}

// ── Test Helpers ────────────────────────────────────────────────────

let mockBucket: MockR2Bucket;

function env(): Record<string, unknown> {
  return { R2_BUCKET: mockBucket, ENVIRONMENT: "test" };
}

/** Helper to make requests via Hono's fetch handler with env bindings */
async function req(path: string, init?: RequestInit): Promise<Response> {
  const request = new Request(`http://localhost${path}`, init);
  return app.fetch(request, env() as never);
}

beforeEach(() => {
  mockBucket = new MockR2Bucket();
});

// ── Health Check ────────────────────────────────────────────────────

describe("R2 worker - health check", () => {
  test("GET /health returns ok status", async () => {
    const res = await req("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("r2-worker");
  });
});

// ── PUT - Store Object ──────────────────────────────────────────────

describe("R2 worker - PUT /:key", () => {
  test("stores an object and returns metadata", async () => {
    const data = new TextEncoder().encode("hello world");
    const res = await req("/sites/index.html", {
      method: "PUT",
      body: data,
      headers: { "Content-Type": "text/html" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; size: number; contentType: string };
    expect(body.key).toBe("sites/index.html");
    expect(body.size).toBe(data.byteLength);
    expect(body.contentType).toBe("text/html");
  });

  test("infers content type from extension", async () => {
    const data = new TextEncoder().encode('{"a":1}');
    const res = await req("/data/config.json", {
      method: "PUT",
      body: data,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { contentType: string };
    expect(body.contentType).toBe("application/json");
  });
});

// ── GET - Fetch Object ────────────────────────────────────────��─────

describe("R2 worker - GET /:key", () => {
  test("returns stored object with correct headers", async () => {
    const data = new TextEncoder().encode("<h1>Hello</h1>");
    await mockBucket.put("sites/index.html", data.buffer as ArrayBuffer, {
      httpMetadata: { contentType: "text/html" },
    });

    const res = await req("/sites/index.html");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    const text = await res.text();
    expect(text).toBe("<h1>Hello</h1>");
  });

  test("returns 404 for non-existent key", async () => {
    const res = await req("/nonexistent.txt");
    expect(res.status).toBe(404);
  });

  test("infers content type from extension", async () => {
    const data = new TextEncoder().encode("body { color: red; }");
    await mockBucket.put("style.css", data.buffer as ArrayBuffer);

    const res = await req("/style.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/css");
  });
});

// ── DELETE - Remove Object ──────────────────────────────────────────

describe("R2 worker - DELETE /:key", () => {
  test("deletes existing object", async () => {
    const data = new TextEncoder().encode("delete me");
    await mockBucket.put("temp.txt", data.buffer as ArrayBuffer);

    const res = await req("/temp.txt", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: boolean; key: string };
    expect(body.deleted).toBe(true);
    expect(body.key).toBe("temp.txt");

    const head = await mockBucket.head("temp.txt");
    expect(head).toBeNull();
  });

  test("succeeds even when key does not exist (idempotent)", async () => {
    const res = await req("/nonexistent.txt", { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});

// ── List Objects ────────────────────────────────────────────────────

describe("R2 worker - GET /list", () => {
  test("lists all objects", async () => {
    const data = new TextEncoder().encode("x");
    await mockBucket.put("a.txt", data.buffer as ArrayBuffer);
    await mockBucket.put("b.txt", data.buffer as ArrayBuffer);

    const res = await req("/list");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { objects: Array<{ key: string }>; truncated: boolean };
    expect(body.objects.length).toBe(2);
    expect(body.truncated).toBe(false);
  });

  test("filters by prefix", async () => {
    const data = new TextEncoder().encode("x");
    await mockBucket.put("sites/a.html", data.buffer as ArrayBuffer);
    await mockBucket.put("sites/b.html", data.buffer as ArrayBuffer);
    await mockBucket.put("other/c.txt", data.buffer as ArrayBuffer);

    const res = await req("/list?prefix=sites/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { objects: Array<{ key: string }> };
    expect(body.objects.length).toBe(2);
    expect(body.objects.every((o) => o.key.startsWith("sites/"))).toBe(true);
  });
});

// ── Full CRUD Lifecycle ─────────────────────────────────────────────

describe("R2 worker - CRUD lifecycle", () => {
  test("PUT -> GET -> DELETE -> GET 404", async () => {
    const content = new TextEncoder().encode("lifecycle test");

    // PUT
    const putRes = await req("/lifecycle.txt", {
      method: "PUT",
      body: content,
      headers: { "Content-Type": "text/plain" },
    });
    expect(putRes.status).toBe(200);

    // GET
    const getRes = await req("/lifecycle.txt");
    expect(getRes.status).toBe(200);
    const text = await getRes.text();
    expect(text).toBe("lifecycle test");

    // DELETE
    const delRes = await req("/lifecycle.txt", { method: "DELETE" });
    expect(delRes.status).toBe(200);

    // GET should 404
    const get404 = await req("/lifecycle.txt");
    expect(get404.status).toBe(404);
  });
});
