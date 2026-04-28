// ── Object Storage — server tests ─────────────────────────────────────
// Drives the HTTP layer end-to-end against the FilesystemDriver. Covers
// PUT/GET/DELETE/HEAD, multipart upload, signed URLs, auth rejection,
// bucket policies, and large-object streaming.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AuthIdentity,
  FilesystemDriver,
  InMemoryPolicyStore,
  createServer,
  sign,
  staticVerifier,
  toQueryString,
} from "../src";

// ── Test fixtures ───────────────────────────────────────────────────

const SIGNING_SECRET = "test-signing-secret";

const writerIdentity: AuthIdentity = {
  principal: "writer",
  writableBuckets: new Set(["alpha"]),
  readableBuckets: new Set(["alpha"]),
};

const readerIdentity: AuthIdentity = {
  principal: "reader",
  writableBuckets: new Set(),
  readableBuckets: new Set(["alpha"]),
};

let tmpRoot = "";
let driver: FilesystemDriver;
let app: ReturnType<typeof createServer>;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "obj-store-test-"));
  driver = new FilesystemDriver(tmpRoot);
  await driver.ensureBucket("alpha");
  await driver.ensureBucket("public");

  const verifier = staticVerifier(
    new Map([
      ["writer-key", writerIdentity],
      ["reader-key", readerIdentity],
    ]),
  );
  const policies = new InMemoryPolicyStore();
  await policies.set({ bucket: "public", visibility: "public-read" });

  app = createServer({
    driver,
    policies,
    verifier,
    signingSecret: SIGNING_SECRET,
  });
});

afterAll(async () => {
  if (tmpRoot) {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

function authedRequest(input: string, init: RequestInit & { key?: string } = {}): Request {
  const { key = "writer-key", headers, ...rest } = init;
  const merged = new Headers(headers);
  merged.set("Authorization", `Bearer ${key}`);
  return new Request(`http://localhost${input}`, { ...rest, headers: merged });
}

function anonymousRequest(input: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${input}`, init);
}

// ── Tests ───────────────────────────────────────────────────────────

describe("health check", () => {
  test("returns ok", async () => {
    const res = await app.fetch(anonymousRequest("/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("PUT object", () => {
  test("uploads a single-part object and returns its sha256 etag", async () => {
    const body = new TextEncoder().encode("hello world");
    const expectedHash = createHash("sha256").update(body).digest("hex");

    const res = await app.fetch(
      authedRequest("/buckets/alpha/hello.txt", {
        method: "PUT",
        body,
        headers: { "content-type": "text/plain" },
      }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { etag: string; size: number };
    expect(json.etag).toBe(expectedHash);
    expect(json.size).toBe(body.byteLength);
    expect(res.headers.get("etag")).toBe(`"${expectedHash}"`);
  });

  test("rejects unauthenticated writes", async () => {
    const res = await app.fetch(
      anonymousRequest("/buckets/alpha/anon.txt", {
        method: "PUT",
        body: new TextEncoder().encode("nope"),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects writers without bucket membership", async () => {
    const res = await app.fetch(
      authedRequest("/buckets/alpha/reader-write.txt", {
        method: "PUT",
        body: new TextEncoder().encode("nope"),
        key: "reader-key",
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET object", () => {
  test("returns object body and metadata", async () => {
    const payload = "fetch-me";
    await app.fetch(
      authedRequest("/buckets/alpha/get-me.txt", {
        method: "PUT",
        body: new TextEncoder().encode(payload),
        headers: { "content-type": "text/plain" },
      }),
    );
    const res = await app.fetch(authedRequest("/buckets/alpha/get-me.txt"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(payload);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(res.headers.get("etag")).toBe(
      `"${createHash("sha256").update(payload).digest("hex")}"`,
    );
  });

  test("returns 404 for missing object", async () => {
    const res = await app.fetch(authedRequest("/buckets/alpha/does-not-exist.txt"));
    expect(res.status).toBe(404);
  });

  test("public-read bucket allows anonymous GETs", async () => {
    // Need to seed via direct driver write since 'public' has no writer.
    await driver.putObject(
      "public",
      "anon.txt",
      new TextEncoder().encode("anyone"),
      { contentType: "text/plain" },
    );
    const res = await app.fetch(anonymousRequest("/buckets/public/anon.txt"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("anyone");
  });

  test("private bucket rejects anonymous GETs", async () => {
    const res = await app.fetch(anonymousRequest("/buckets/alpha/get-me.txt"));
    expect(res.status).toBe(401);
  });
});

describe("HEAD object", () => {
  test("returns metadata without body", async () => {
    const payload = "head-me";
    await app.fetch(
      authedRequest("/buckets/alpha/head.txt", {
        method: "PUT",
        body: new TextEncoder().encode(payload),
      }),
    );
    const res = await app.fetch(authedRequest("/buckets/alpha/head.txt", { method: "HEAD" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(payload.length));
  });
});

describe("DELETE object", () => {
  test("removes the object", async () => {
    await app.fetch(
      authedRequest("/buckets/alpha/delete-me.txt", {
        method: "PUT",
        body: new TextEncoder().encode("bye"),
      }),
    );
    const del = await app.fetch(
      authedRequest("/buckets/alpha/delete-me.txt", { method: "DELETE" }),
    );
    expect(del.status).toBe(204);
    const after = await app.fetch(authedRequest("/buckets/alpha/delete-me.txt"));
    expect(after.status).toBe(404);
  });
});

describe("multipart upload", () => {
  test("complete flow: init, upload parts, complete", async () => {
    const initRes = await app.fetch(
      authedRequest("/buckets/alpha/multipart.bin?uploads", { method: "POST" }),
    );
    expect(initRes.status).toBe(200);
    const init = (await initRes.json()) as { uploadId: string };
    expect(init.uploadId).toBeString();

    // Two parts of distinct sizes.
    const part1 = new Uint8Array(1024).fill(0xab);
    const part2 = new Uint8Array(2048).fill(0xcd);

    const part1Res = await app.fetch(
      authedRequest(
        `/buckets/alpha/multipart.bin?partNumber=1&uploadId=${encodeURIComponent(init.uploadId)}`,
        { method: "PUT", body: part1 },
      ),
    );
    expect(part1Res.status).toBe(200);
    const part1Body = (await part1Res.json()) as { etag: string; size: number };
    expect(part1Body.size).toBe(1024);

    const part2Res = await app.fetch(
      authedRequest(
        `/buckets/alpha/multipart.bin?partNumber=2&uploadId=${encodeURIComponent(init.uploadId)}`,
        { method: "PUT", body: part2 },
      ),
    );
    expect(part2Res.status).toBe(200);
    const part2Body = (await part2Res.json()) as { etag: string; size: number };

    const complete = await app.fetch(
      authedRequest(`/buckets/alpha/multipart.bin?uploadId=${encodeURIComponent(init.uploadId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parts: [
            { partNumber: 1, etag: part1Body.etag },
            { partNumber: 2, etag: part2Body.etag },
          ],
        }),
      }),
    );
    expect(complete.status).toBe(200);
    const completed = (await complete.json()) as { size: number; etag: string };
    expect(completed.size).toBe(part1.byteLength + part2.byteLength);

    // Concatenated body must hash deterministically.
    const merged = new Uint8Array(part1.byteLength + part2.byteLength);
    merged.set(part1, 0);
    merged.set(part2, part1.byteLength);
    expect(completed.etag).toBe(createHash("sha256").update(merged).digest("hex"));

    // Object is fetchable.
    const get = await app.fetch(authedRequest("/buckets/alpha/multipart.bin"));
    expect(get.status).toBe(200);
    const buf = new Uint8Array(await get.arrayBuffer());
    expect(buf.byteLength).toBe(merged.byteLength);
  });

  test("rejects part upload with unknown uploadId", async () => {
    const res = await app.fetch(
      authedRequest("/buckets/alpha/multipart-bogus.bin?partNumber=1&uploadId=does-not-exist", {
        method: "PUT",
        body: new Uint8Array(8),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("complete with mismatched part etag returns 400", async () => {
    const initRes = await app.fetch(
      authedRequest("/buckets/alpha/multipart-bad.bin?uploads", { method: "POST" }),
    );
    const init = (await initRes.json()) as { uploadId: string };
    await app.fetch(
      authedRequest(
        `/buckets/alpha/multipart-bad.bin?partNumber=1&uploadId=${encodeURIComponent(init.uploadId)}`,
        { method: "PUT", body: new TextEncoder().encode("real") },
      ),
    );
    const complete = await app.fetch(
      authedRequest(
        `/buckets/alpha/multipart-bad.bin?uploadId=${encodeURIComponent(init.uploadId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            parts: [{ partNumber: 1, etag: "0".repeat(64) }],
          }),
        },
      ),
    );
    expect(complete.status).toBe(400);
  });

  test("abort multipart deletes the upload state", async () => {
    const initRes = await app.fetch(
      authedRequest("/buckets/alpha/multipart-abort.bin?uploads", { method: "POST" }),
    );
    const init = (await initRes.json()) as { uploadId: string };
    const abort = await app.fetch(
      authedRequest(`/buckets/alpha/multipart-abort.bin?uploadId=${encodeURIComponent(init.uploadId)}`, {
        method: "DELETE",
      }),
    );
    expect(abort.status).toBe(204);
    // Subsequent part upload to the same uploadId fails.
    const partRes = await app.fetch(
      authedRequest(
        `/buckets/alpha/multipart-abort.bin?partNumber=1&uploadId=${encodeURIComponent(init.uploadId)}`,
        { method: "PUT", body: new Uint8Array(4) },
      ),
    );
    expect(partRes.status).toBe(404);
  });
});

describe("signed URLs", () => {
  test("anonymous GET via valid signature succeeds", async () => {
    const payload = "signed-content";
    await app.fetch(
      authedRequest("/buckets/alpha/signed.txt", {
        method: "PUT",
        body: new TextEncoder().encode(payload),
      }),
    );
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const signed = sign(
      {
        method: "GET",
        bucket: "alpha",
        key: "signed.txt",
        expiresAt,
        principal: "writer",
      },
      SIGNING_SECRET,
    );
    const res = await app.fetch(
      anonymousRequest(`/buckets/alpha/signed.txt?${toQueryString(signed)}`),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(payload);
  });

  test("expired signature is rejected", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 1;
    const signed = sign(
      {
        method: "GET",
        bucket: "alpha",
        key: "any.txt",
        expiresAt,
        principal: "writer",
      },
      SIGNING_SECRET,
    );
    const res = await app.fetch(
      anonymousRequest(`/buckets/alpha/any.txt?${toQueryString(signed)}`),
    );
    expect(res.status).toBe(403);
  });

  test("tampered signature is rejected", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const signed = sign(
      {
        method: "GET",
        bucket: "alpha",
        key: "any.txt",
        expiresAt,
        principal: "writer",
      },
      "wrong-secret",
    );
    const res = await app.fetch(
      anonymousRequest(`/buckets/alpha/any.txt?${toQueryString(signed)}`),
    );
    expect(res.status).toBe(403);
  });

  test("/buckets/:bucket/sign mints a working URL", async () => {
    const payload = "minted";
    await app.fetch(
      authedRequest("/buckets/alpha/minted.txt", {
        method: "PUT",
        body: new TextEncoder().encode(payload),
      }),
    );
    const signRes = await app.fetch(
      authedRequest("/buckets/alpha/sign?key=minted.txt&method=GET&ttl=60"),
    );
    expect(signRes.status).toBe(200);
    const minted = (await signRes.json()) as { url: string };
    const fetchRes = await app.fetch(anonymousRequest(minted.url));
    expect(fetchRes.status).toBe(200);
    expect(await fetchRes.text()).toBe(payload);
  });
});

describe("bucket policy management", () => {
  test("setting policy requires write access", async () => {
    const res = await app.fetch(
      authedRequest("/buckets/alpha/policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility: "public-read" }),
        key: "reader-key",
      }),
    );
    expect(res.status).toBe(403);
  });

  test("writer can set bucket policy", async () => {
    const res = await app.fetch(
      authedRequest("/buckets/alpha/policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility: "authenticated" }),
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe("large object streaming", () => {
  test("uploads and downloads a 4 MiB object intact", async () => {
    const big = new Uint8Array(4 * 1024 * 1024);
    for (let i = 0; i < big.byteLength; i += 1) {
      big[i] = i & 0xff;
    }
    const expectedHash = createHash("sha256").update(big).digest("hex");

    const putRes = await app.fetch(
      authedRequest("/buckets/alpha/large.bin", { method: "PUT", body: big }),
    );
    expect(putRes.status).toBe(201);

    const getRes = await app.fetch(authedRequest("/buckets/alpha/large.bin"));
    expect(getRes.status).toBe(200);
    const back = new Uint8Array(await getRes.arrayBuffer());
    expect(back.byteLength).toBe(big.byteLength);
    expect(createHash("sha256").update(back).digest("hex")).toBe(expectedHash);
  });
});

describe("object keys with slashes", () => {
  test("nested-key PUT/GET round-trips", async () => {
    const key = "deeply/nested/path/file.txt";
    await app.fetch(
      authedRequest(`/buckets/alpha/${key}`, {
        method: "PUT",
        body: new TextEncoder().encode("nested"),
      }),
    );
    const res = await app.fetch(authedRequest(`/buckets/alpha/${key}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("nested");
  });
});
