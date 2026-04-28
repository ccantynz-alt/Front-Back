import { describe, expect, test } from "bun:test";
import { createEdgeRuntimeHttpClient } from "../src/clients/edge-runtime";
import type { FetchLike } from "../src/clients/fetch";
import { createObjectStorageHttpClient } from "../src/clients/object-storage";
import { createSecretsVaultHttpClient } from "../src/clients/secrets-vault";
import { createTunnelHttpClient } from "../src/clients/tunnel";

interface CapturedCall {
  url: string;
  init: RequestInit | undefined;
}

const fakeFetch = (
  responder: (url: string, init: RequestInit | undefined) => Response,
): { fetch: FetchLike; calls: CapturedCall[] } => {
  const calls: CapturedCall[] = [];
  const f: FetchLike = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    return responder(url, init);
  };
  return { fetch: f, calls };
};

describe("HTTP client wrappers", () => {
  test("object-storage client speaks PUT /buckets/:bucket/:key", async () => {
    const { fetch: f, calls } = fakeFetch(() =>
      Response.json({ bucket: "bundles", key: "k", etag: "e1" }),
    );
    const client = createObjectStorageHttpClient({
      baseUrl: "https://os.test",
      authToken: "tok",
      fetch: f,
    });
    const res = await client.put({
      bucket: "bundles",
      key: "k",
      body: new Uint8Array([1, 2]),
      sha256: "deadbeef",
    });
    expect(res.etag).toBe("e1");
    expect(calls[0]?.url).toBe("https://os.test/buckets/bundles/k");
    expect(calls[0]?.init?.method).toBe("PUT");
  });

  test("object-storage client tolerates 404 on delete", async () => {
    const { fetch: f } = fakeFetch(
      () => new Response(null, { status: 404 }),
    );
    const client = createObjectStorageHttpClient({
      baseUrl: "https://os.test",
      authToken: "tok",
      fetch: f,
    });
    await client.delete({ bucket: "bundles", key: "k" });
  });

  test("edge-runtime client posts to /admin/bundles", async () => {
    const { fetch: f, calls } = fakeFetch(() =>
      Response.json({
        bundleId: "bdl_x",
        hash: "h",
        status: "registered",
      }),
    );
    const client = createEdgeRuntimeHttpClient({
      baseUrl: "https://er.test",
      authToken: "tok",
      fetch: f,
    });
    const res = await client.registerBundle({
      id: "bdl_x",
      hash: "h",
      code: "//",
      env: {},
      secrets: {},
      limits: { cpuMs: 50, memoryMb: 128 },
    });
    expect(res.bundleId).toBe("bdl_x");
    expect(calls[0]?.url).toBe("https://er.test/admin/bundles");
    expect(calls[0]?.init?.method).toBe("POST");
  });

  test("tunnel client posts swap with previous bundle echo", async () => {
    const { fetch: f, calls } = fakeFetch(() =>
      Response.json({ previousBundleId: "bdl_old" }),
    );
    const client = createTunnelHttpClient({
      baseUrl: "https://t.test",
      authToken: "tok",
      fetch: f,
    });
    const res = await client.swap({
      hostname: "h.test",
      bundleId: "bdl_new",
    });
    expect(res.previousBundleId).toBe("bdl_old");
    expect(calls[0]?.url).toBe("https://t.test/routes/swap");
  });

  test("secrets-vault client lists keys then fetches bundle", async () => {
    const { fetch: f, calls } = fakeFetch((url) => {
      if (url.endsWith("/secrets")) {
        return Response.json({ tenantId: "t1", keys: ["DB_URL", "API_KEY"] });
      }
      return Response.json({
        tenantId: "t1",
        env: { DB_URL: "postgres://...", API_KEY: "sk-..." },
      });
    });
    const client = createSecretsVaultHttpClient({
      baseUrl: "https://sv.test",
      authToken: "tok",
      fetch: f,
    });
    const res = await client.fetchBundle({
      tenantId: "t1",
      projectId: "p1",
      sha: "abc",
    });
    expect(res.env).toEqual({});
    expect(res.secrets.DB_URL).toBe("postgres://...");
    expect(res.secrets.API_KEY).toBe("sk-...");
    expect(calls[0]?.url).toBe("https://sv.test/tenants/t1/secrets");
    expect(calls[1]?.url).toBe("https://sv.test/tenants/t1/secrets/bundle");
    expect(calls[1]?.init?.method).toBe("POST");
  });

  test("secrets-vault client returns empty bundle when tenant has no keys", async () => {
    const { fetch: f, calls } = fakeFetch(() =>
      Response.json({ tenantId: "t1", keys: [] }),
    );
    const client = createSecretsVaultHttpClient({
      baseUrl: "https://sv.test",
      authToken: "tok",
      fetch: f,
    });
    const res = await client.fetchBundle({
      tenantId: "t1",
      projectId: "p1",
      sha: "abc",
    });
    expect(res.env).toEqual({});
    expect(res.secrets).toEqual({});
    expect(calls).toHaveLength(1);
  });

  test("clients surface non-2xx as errors", async () => {
    const { fetch: f } = fakeFetch(
      () => new Response("nope", { status: 500 }),
    );
    const client = createObjectStorageHttpClient({
      baseUrl: "https://os.test",
      authToken: "tok",
      fetch: f,
    });
    await expect(
      client.put({ bucket: "b", key: "k", body: new Uint8Array() }),
    ).rejects.toThrow(/PUT failed: 500/);
  });
});
