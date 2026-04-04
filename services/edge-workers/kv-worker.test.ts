import { describe, test, expect, beforeEach } from "bun:test";
import app from "./kv-worker";

interface KVEntry {
  value: string;
  expiration?: number;
  metadata?: Record<string, unknown>;
}

class MockKVNamespace {
  private store = new Map<string, KVEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiration && entry.expiration < Date.now() / 1000) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, unknown> }): Promise<void> {
    const entry: KVEntry = { value };
    if (options?.expirationTtl) entry.expiration = Math.floor(Date.now() / 1000) + options.expirationTtl;
    if (options?.metadata) entry.metadata = options.metadata;
    this.store.set(key, entry);
  }

  async delete(key: string): Promise<void> { this.store.delete(key); }

  async list(options?: { prefix?: string; limit?: number }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: Record<string, unknown> }>;
    list_complete: boolean;
    cursor?: string;
  }> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 100;
    const keys: Array<{ name: string; expiration?: number; metadata?: Record<string, unknown> }> = [];
    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix)) keys.push({ name: key, expiration: entry.expiration, metadata: entry.metadata });
    }
    const limited = keys.slice(0, limit);
    return { keys: limited, list_complete: keys.length <= limit };
  }

  clear(): void { this.store.clear(); }
}

let mockKV: MockKVNamespace;

async function req(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init), { KV_NAMESPACE: mockKV, ENVIRONMENT: "test" } as never);
}

beforeEach(() => { mockKV = new MockKVNamespace(); });

describe("KV worker - health", () => {
  test("GET /health returns ok", async () => {
    const res = await req("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("kv-worker");
  });
});

describe("KV worker - PUT /kv/:key", () => {
  test("stores a value", async () => {
    const res = await req("/kv/my-key", { method: "PUT", body: JSON.stringify({ value: { hello: "world" } }), headers: { "Content-Type": "application/json" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; key: string };
    expect(body.success).toBe(true);
    expect(body.key).toBe("my-key");
  });
});

describe("KV worker - GET /kv/:key", () => {
  test("returns stored JSON value", async () => {
    await mockKV.put("test-key", JSON.stringify({ foo: "bar" }));
    const res = await req("/kv/test-key");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; value: { foo: string } };
    expect(body.key).toBe("test-key");
    expect(body.value).toEqual({ foo: "bar" });
  });

  test("returns 404 for non-existent key", async () => {
    const res = await req("/kv/missing");
    expect(res.status).toBe(404);
  });
});

describe("KV worker - DELETE /kv/:key", () => {
  test("deletes existing key", async () => {
    await mockKV.put("delete-me", "bye");
    const res = await req("/kv/delete-me", { method: "DELETE" });
    expect(res.status).toBe(200);
    const getRes = await req("/kv/delete-me");
    expect(getRes.status).toBe(404);
  });
});

describe("KV worker - GET /kv/list", () => {
  test("lists all keys", async () => {
    await mockKV.put("a", "1");
    await mockKV.put("b", "2");
    const res = await req("/kv/list");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<{ name: string }> };
    expect(body.keys.length).toBe(2);
  });

  test("filters by prefix", async () => {
    await mockKV.put("flags:a", "1");
    await mockKV.put("flags:b", "2");
    await mockKV.put("config:c", "3");
    const res = await req("/kv/list?prefix=flags:");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<{ name: string }> };
    expect(body.keys.length).toBe(2);
  });
});

describe("KV worker - GET /flags", () => {
  test("returns all feature flags", async () => {
    await mockKV.put("flags:dark-mode", JSON.stringify(true));
    await mockKV.put("flags:beta", JSON.stringify(false));
    const res = await req("/flags");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { flags: Record<string, unknown> };
    expect(body.flags["dark-mode"]).toBe(true);
    expect(body.flags["beta"]).toBe(false);
  });
});

describe("KV worker - GET /flags/:key", () => {
  test("returns a specific flag", async () => {
    await mockKV.put("flags:dark-mode", JSON.stringify(true));
    const res = await req("/flags/dark-mode");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; value: boolean };
    expect(body.key).toBe("dark-mode");
    expect(body.value).toBe(true);
  });

  test("returns 404 for non-existent flag", async () => {
    const res = await req("/flags/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("KV worker - CRUD lifecycle", () => {
  test("PUT -> GET -> DELETE -> GET 404", async () => {
    const putRes = await req("/kv/lc", { method: "PUT", body: JSON.stringify({ value: "test" }), headers: { "Content-Type": "application/json" } });
    expect(putRes.status).toBe(200);
    const getRes = await req("/kv/lc");
    expect(getRes.status).toBe(200);
    const delRes = await req("/kv/lc", { method: "DELETE" });
    expect(delRes.status).toBe(200);
    const get404 = await req("/kv/lc");
    expect(get404.status).toBe(404);
  });
});
