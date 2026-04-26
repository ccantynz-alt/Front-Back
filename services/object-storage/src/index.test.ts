/**
 * Tests for the BLK-018 self-hosted object storage proxy + admin layer.
 *
 * Importing index.ts is safe at test time because the server only auto-
 * starts when `import.meta.main` is true (executed via `bun run`). We hit
 * `handleRequest` directly with a fabricated context and a mock fetch so
 * no real network calls happen.
 */

import { describe, expect, test } from "bun:test";
import {
  BucketDirectory,
  buildClientFromConfig,
  handleRequest,
  isAuthorised,
  loadConfig,
  timingSafeEqual,
  type ProxyConfig,
} from "./index";
import {
  clampTtl,
  isValidBucketName,
  isoBasicDate,
  ObjectStorageClient,
  parseListObjectsXml,
  sanitiseKey,
} from "./client";

// ── Helpers ─────────────────────────────────────────────────────────

const SECRET = "test-secret-do-not-use-in-prod";

function makeConfig(): ProxyConfig {
  return {
    port: 9094,
    secret: SECRET,
    minioEndpoint: "http://127.0.0.1:9000",
    region: "us-east-1",
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin-password",
    bucket: "crontech-objects",
  };
}

function authedHeaders(): HeadersInit {
  return { Authorization: `Bearer ${SECRET}` };
}

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function makeMockFetch(
  responder: (url: string, init: RequestInit | undefined) => Response,
): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = (async (input: unknown, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input);
    calls.push({ url, init });
    return responder(url, init);
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

// ── loadConfig ──────────────────────────────────────────────────────

describe("loadConfig", () => {
  test("returns default values when only required env is set", () => {
    const cfg = loadConfig({
      OBJECT_STORAGE_SECRET: "abc",
      OBJECT_STORAGE_ACCESS_KEY_ID: "ak",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "sk",
    });
    expect(cfg.port).toBe(9094);
    expect(cfg.bucket).toBe("crontech-objects");
    expect(cfg.region).toBe("us-east-1");
    expect(cfg.minioEndpoint).toBe("http://127.0.0.1:9000");
  });

  test("falls back to MINIO_ROOT_USER / MINIO_ROOT_PASSWORD", () => {
    const cfg = loadConfig({
      OBJECT_STORAGE_SECRET: "abc",
      MINIO_ROOT_USER: "ak",
      MINIO_ROOT_PASSWORD: "sk",
    });
    expect(cfg.accessKeyId).toBe("ak");
    expect(cfg.secretAccessKey).toBe("sk");
  });

  test("throws when OBJECT_STORAGE_SECRET is missing", () => {
    expect(() =>
      loadConfig({ OBJECT_STORAGE_ACCESS_KEY_ID: "x", OBJECT_STORAGE_SECRET_ACCESS_KEY: "y" }),
    ).toThrow(/OBJECT_STORAGE_SECRET/);
  });

  test("throws when credentials are missing", () => {
    expect(() => loadConfig({ OBJECT_STORAGE_SECRET: "abc" })).toThrow(
      /credentials missing/,
    );
  });

  test("respects OBJECT_STORAGE_PROXY_PORT override", () => {
    const cfg = loadConfig({
      OBJECT_STORAGE_SECRET: "abc",
      OBJECT_STORAGE_ACCESS_KEY_ID: "ak",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "sk",
      OBJECT_STORAGE_PROXY_PORT: "9999",
    });
    expect(cfg.port).toBe(9999);
  });
});

// ── timingSafeEqual + isAuthorised ──────────────────────────────────

describe("auth helpers", () => {
  test("timingSafeEqual matches identical strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });
  test("timingSafeEqual rejects mismatched lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
  test("timingSafeEqual rejects mismatched content", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });

  test("isAuthorised accepts a Bearer header with the right secret", () => {
    const req = new Request("http://x/y", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(isAuthorised(req, SECRET)).toBe(true);
  });
  test("isAuthorised rejects requests without Authorization", () => {
    const req = new Request("http://x/y");
    expect(isAuthorised(req, SECRET)).toBe(false);
  });
  test("isAuthorised rejects wrong secret", () => {
    const req = new Request("http://x/y", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(isAuthorised(req, SECRET)).toBe(false);
  });
});

// ── BucketDirectory ────────────────────────────────────────────────

describe("BucketDirectory", () => {
  test("starts empty", () => {
    expect(new BucketDirectory().list()).toEqual([]);
  });

  test("creates and lists buckets in name-sorted order", () => {
    const d = new BucketDirectory();
    d.create("zeta");
    d.create("alpha");
    d.create("mu");
    const names = d.list().map((b) => b.name);
    expect(names).toEqual(["alpha", "mu", "zeta"]);
  });

  test("create is idempotent", () => {
    const d = new BucketDirectory();
    const first = d.create("foo");
    const second = d.create("foo");
    expect(second.createdAt).toBe(first.createdAt);
    expect(d.list()).toHaveLength(1);
  });

  test("has() returns the right boolean", () => {
    const d = new BucketDirectory();
    expect(d.has("foo")).toBe(false);
    d.create("foo");
    expect(d.has("foo")).toBe(true);
  });
});

// ── handleRequest router ────────────────────────────────────────────

describe("handleRequest", () => {
  function makeDeps(
    fetchImpl: typeof fetch,
  ): { config: ProxyConfig; buckets: BucketDirectory; client: ObjectStorageClient } {
    const config = makeConfig();
    const buckets = new BucketDirectory();
    buckets.create(config.bucket);
    const client = buildClientFromConfig(config, fetchImpl);
    return { config, buckets, client };
  }

  test("GET /health is unauthenticated", async () => {
    const { fetch: mock } = makeMockFetch(() => new Response("never called"));
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/health"),
      deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; bucket: string };
    expect(body.ok).toBe(true);
    expect(body.bucket).toBe("crontech-objects");
  });

  test("non-health endpoints require auth", async () => {
    const { fetch: mock } = makeMockFetch(() => new Response("never"));
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/buckets"),
      deps,
    );
    expect(res.status).toBe(401);
  });

  test("GET /buckets returns the directory", async () => {
    const { fetch: mock } = makeMockFetch(() => new Response("never"));
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/buckets", { headers: authedHeaders() }),
      deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; buckets: { name: string }[] };
    expect(body.ok).toBe(true);
    expect(body.buckets.map((b) => b.name)).toContain("crontech-objects");
  });

  test("POST /buckets/:name creates a new bucket", async () => {
    const { fetch: mock } = makeMockFetch(() => new Response("never"));
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/buckets/my-uploads", {
        method: "POST",
        headers: authedHeaders(),
      }),
      deps,
    );
    expect(res.status).toBe(201);
    expect(deps.buckets.has("my-uploads")).toBe(true);
  });

  test("POST /buckets/:name rejects invalid names", async () => {
    const { fetch: mock } = makeMockFetch(() => new Response("never"));
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/buckets/UPPERCASE", {
        method: "POST",
        headers: authedHeaders(),
      }),
      deps,
    );
    expect(res.status).toBe(400);
  });

  test("POST /presign/put returns a signed URL with key + expiresAt", async () => {
    const { fetch: mock } = makeMockFetch(() => new Response("never"));
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/presign/put", {
        method: "POST",
        headers: { ...authedHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "uploads/hello.txt",
          contentType: "text/plain",
          expiresIn: 900,
        }),
      }),
      deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      url: string;
      key: string;
      expiresAt: string;
    };
    expect(body.ok).toBe(true);
    expect(body.url).toContain("X-Amz-Signature=");
    expect(body.url).toContain("X-Amz-Expires=900");
    expect(body.key).toBe("uploads/hello.txt");
    expect(typeof body.expiresAt).toBe("string");
    expect(Number.isFinite(Date.parse(body.expiresAt))).toBe(true);
  });

  test("POST /presign/get returns a signed URL", async () => {
    const { fetch: mock } = makeMockFetch(() => new Response("never"));
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/presign/get", {
        method: "POST",
        headers: { ...authedHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ key: "uploads/hello.txt", expiresIn: 600 }),
      }),
      deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; url: string };
    expect(body.url).toContain("X-Amz-Expires=600");
  });

  test("POST /presign/put rejects missing key", async () => {
    const { fetch: mock } = makeMockFetch(() => new Response("never"));
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/presign/put", {
        method: "POST",
        headers: { ...authedHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 600 }),
      }),
      deps,
    );
    expect(res.status).toBe(400);
  });

  test("PUT /objects/:key proxies to MinIO and returns 201", async () => {
    const { fetch: mock, calls } = makeMockFetch(
      () =>
        new Response(null, {
          status: 200,
          headers: { ETag: '"abc123"' },
        }),
    );
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/objects/foo/bar.txt", {
        method: "PUT",
        headers: { ...authedHeaders(), "Content-Type": "text/plain" },
        body: "hello world",
      }),
      deps,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; key: string; etag: string };
    expect(body.ok).toBe(true);
    expect(body.key).toBe("foo/bar.txt");
    expect(body.etag).toBe('"abc123"');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/crontech-objects/foo/bar.txt");
  });

  test("DELETE /objects/:key proxies to MinIO", async () => {
    const { fetch: mock } = makeMockFetch(
      () => new Response(null, { status: 204 }),
    );
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/objects/foo/bar.txt", {
        method: "DELETE",
        headers: authedHeaders(),
      }),
      deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; deleted: boolean };
    expect(body.deleted).toBe(true);
  });

  test("unknown route returns 404", async () => {
    const { fetch: mock } = makeMockFetch(() => new Response("never"));
    const deps = makeDeps(mock);
    const res = await handleRequest(
      new Request("http://localhost:9094/nope", { headers: authedHeaders() }),
      deps,
    );
    expect(res.status).toBe(404);
  });
});

// ── Pure client helpers ────────────────────────────────────────────

describe("client pure helpers", () => {
  test("clampTtl floors below the minimum", () => {
    expect(clampTtl(10)).toBe(60);
  });
  test("clampTtl caps above the maximum", () => {
    expect(clampTtl(99_999)).toBe(3600);
  });
  test("clampTtl floors NaN to minimum", () => {
    expect(clampTtl(Number.NaN)).toBe(60);
  });

  test("sanitiseKey strips leading slashes and traversal", () => {
    expect(sanitiseKey("///foo/bar")).toBe("foo/bar");
    expect(sanitiseKey("a/../b")).toBe("a/b");
  });
  test("sanitiseKey throws on empty", () => {
    expect(() => sanitiseKey("")).toThrow();
  });

  test("isValidBucketName accepts a healthy name", () => {
    expect(isValidBucketName("crontech-objects")).toBe(true);
  });
  test("isValidBucketName rejects uppercase", () => {
    expect(isValidBucketName("Crontech")).toBe(false);
  });
  test("isValidBucketName rejects too-short names", () => {
    expect(isValidBucketName("ab")).toBe(false);
  });
  test("isValidBucketName rejects IP-shaped names", () => {
    expect(isValidBucketName("10.0.0.1")).toBe(false);
  });

  test("isoBasicDate produces a 16-char Sigv4 timestamp", () => {
    const now = new Date(Date.UTC(2026, 3, 26, 12, 30, 0));
    expect(isoBasicDate(now)).toBe("20260426T123000Z");
  });

  test("parseListObjectsXml extracts keys and sizes", () => {
    const xml = `<?xml version="1.0"?><ListBucketResult>
      <Contents>
        <Key>uploads/a.txt</Key>
        <Size>42</Size>
        <ETag>"abc"</ETag>
        <LastModified>2026-04-26T12:00:00Z</LastModified>
      </Contents>
      <Contents>
        <Key>uploads/b.txt</Key>
        <Size>7</Size>
        <ETag>"def"</ETag>
        <LastModified>2026-04-26T12:00:01Z</LastModified>
      </Contents>
      <IsTruncated>false</IsTruncated>
    </ListBucketResult>`;
    const result = parseListObjectsXml(xml);
    expect(result.objects).toHaveLength(2);
    expect(result.objects[0]?.key).toBe("uploads/a.txt");
    expect(result.objects[0]?.size).toBe(42);
    expect(result.objects[0]?.etag).toBe("abc");
    expect(result.objects[1]?.size).toBe(7);
    expect(result.truncated).toBe(false);
  });

  test("parseListObjectsXml handles truncated true", () => {
    const xml = `<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>`;
    expect(parseListObjectsXml(xml).truncated).toBe(true);
  });

  test("ObjectStorageClient constructor validates bucket name", () => {
    expect(
      () =>
        new ObjectStorageClient({
          endpoint: "http://127.0.0.1:9000",
          region: "us-east-1",
          accessKeyId: "ak",
          secretAccessKey: "sk",
          bucket: "INVALID",
        }),
    ).toThrow(/invalid bucket name/);
  });

  test("ObjectStorageClient constructor requires credentials", () => {
    expect(
      () =>
        new ObjectStorageClient({
          endpoint: "http://127.0.0.1:9000",
          region: "us-east-1",
          accessKeyId: "",
          secretAccessKey: "sk",
          bucket: "crontech-objects",
        }),
    ).toThrow(/accessKeyId/);
  });

  test("presignPut produces a signature query and binds Content-Type when given", () => {
    const client = new ObjectStorageClient({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "ak",
      secretAccessKey: "sk",
      bucket: "crontech-objects",
    });
    const result = client.presignPut({
      key: "u/file.bin",
      expiresIn: 600,
      contentType: "application/octet-stream",
    });
    expect(result.url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(result.url).toContain("X-Amz-SignedHeaders=content-type%3Bhost");
    expect(result.url).toContain("X-Amz-Signature=");
    expect(result.key).toBe("u/file.bin");
    // Bound TTL is reflected
    expect(result.url).toContain("X-Amz-Expires=600");
  });

  test("putObject sends a Sigv4 PUT to the right URL via mock fetch", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl = (async (input: unknown, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      calls.push({ url, init });
      return new Response(null, {
        status: 200,
        headers: { ETag: '"deadbeef"' },
      });
    }) as unknown as typeof fetch;
    const client = new ObjectStorageClient({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "ak",
      secretAccessKey: "sk",
      bucket: "crontech-objects",
      fetch: fetchImpl,
    });
    const res = await client.putObject({
      key: "uploads/x.txt",
      body: "hi",
      contentType: "text/plain",
    });
    expect(res.etag).toBe('"deadbeef"');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "http://127.0.0.1:9000/crontech-objects/uploads/x.txt",
    );
    const headers = calls[0]?.init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toContain("AWS4-HMAC-SHA256");
  });

  test("listObjects parses the XML response", async () => {
    const xml = `<ListBucketResult>
      <Contents><Key>a</Key><Size>1</Size><ETag>"x"</ETag><LastModified>2026-04-26T12:00:00Z</LastModified></Contents>
      <IsTruncated>false</IsTruncated>
    </ListBucketResult>`;
    const fetchImpl = (async () =>
      new Response(xml, { status: 200 })) as unknown as typeof fetch;
    const client = new ObjectStorageClient({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "ak",
      secretAccessKey: "sk",
      bucket: "crontech-objects",
      fetch: fetchImpl,
    });
    const result = await client.listObjects({ prefix: "" });
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]?.key).toBe("a");
    expect(result.bucket).toBe("crontech-objects");
  });
});
