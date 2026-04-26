// ── Dispatch helper unit tests ──────────────────────────────────────
// Pure transforms. No worker spawning here.

import { describe, expect, test } from "bun:test";
import {
  computeBundleHash,
  deserialiseRequest,
  deserialiseResponse,
  serialiseRequest,
  serialiseResponse,
} from "./dispatch";

describe("serialiseRequest / deserialiseRequest", () => {
  test("round-trips a GET with query string and headers", async () => {
    const orig = new Request("https://example.com/run/demo/path?q=1", {
      method: "GET",
      headers: { "X-Trace": "abc", Accept: "application/json" },
    });
    const wire = await serialiseRequest(orig);
    expect(wire.method).toBe("GET");
    expect(wire.url).toBe("https://example.com/run/demo/path?q=1");
    expect(wire.bodyBase64).toBe("");
    // Headers are normalised to lowercase keys.
    const headerMap = new Map(wire.headers);
    expect(headerMap.get("x-trace")).toBe("abc");
    expect(headerMap.get("accept")).toBe("application/json");

    const restored = deserialiseRequest(wire);
    expect(restored.method).toBe("GET");
    expect(restored.url).toBe("https://example.com/run/demo/path?q=1");
    expect(restored.headers.get("x-trace")).toBe("abc");
  });

  test("round-trips a POST with a binary body", async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 0xff, 0xfe]);
    const orig = new Request("https://example.com/run/demo", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    const wire = await serialiseRequest(orig);
    expect(wire.bodyBase64.length).toBeGreaterThan(0);

    const restored = deserialiseRequest(wire);
    expect(restored.method).toBe("POST");
    const restoredBytes = new Uint8Array(await restored.arrayBuffer());
    expect(restoredBytes).toEqual(bytes);
  });

  test("does not attach a body to GET/HEAD on rebuild", async () => {
    const wire = await serialiseRequest(new Request("https://x.test/a", { method: "GET" }));
    const wireWithBody = { ...wire, bodyBase64: Buffer.from("x").toString("base64") };
    const restored = deserialiseRequest(wireWithBody);
    expect(restored.method).toBe("GET");
    const buf = await restored.arrayBuffer();
    expect(buf.byteLength).toBe(0);
  });
});

describe("serialiseResponse / deserialiseResponse", () => {
  test("round-trips a JSON response with status and headers", async () => {
    const orig = Response.json({ hello: "world" }, { status: 201 });
    const wire = await serialiseResponse(orig);
    expect(wire.status).toBe(201);
    expect(wire.bodyBase64.length).toBeGreaterThan(0);

    const restored = deserialiseResponse(wire);
    expect(restored.status).toBe(201);
    const text = await restored.text();
    expect(JSON.parse(text)).toEqual({ hello: "world" });
  });

  test("round-trips an empty response without a body", async () => {
    const orig = new Response(null, { status: 204 });
    const wire = await serialiseResponse(orig);
    expect(wire.bodyBase64).toBe("");

    const restored = deserialiseResponse(wire);
    expect(restored.status).toBe(204);
    const buf = await restored.arrayBuffer();
    expect(buf.byteLength).toBe(0);
  });

  test("preserves binary bytes exactly", async () => {
    const bytes = new Uint8Array([10, 20, 30, 0xfa, 0xfb, 0xfc]);
    const orig = new Response(bytes, { status: 200 });
    const wire = await serialiseResponse(orig);
    const restored = deserialiseResponse(wire);
    const restoredBytes = new Uint8Array(await restored.arrayBuffer());
    expect(restoredBytes).toEqual(bytes);
  });
});

describe("computeBundleHash", () => {
  test("returns a 64-char lowercase hex sha256 string", () => {
    const hash = computeBundleHash({
      id: "demo",
      entrypoint: "worker.js",
      code: "export default () => new Response('hi')",
    });
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  test("is deterministic across calls", () => {
    const args = { id: "demo", entrypoint: "worker.js", code: "export default null" };
    expect(computeBundleHash(args)).toBe(computeBundleHash(args));
  });

  test("differs when the id changes", () => {
    const a = computeBundleHash({ id: "a", entrypoint: "x", code: "y" });
    const b = computeBundleHash({ id: "b", entrypoint: "x", code: "y" });
    expect(a).not.toBe(b);
  });

  test("differs when the entrypoint changes", () => {
    const a = computeBundleHash({ id: "x", entrypoint: "a.js", code: "y" });
    const b = computeBundleHash({ id: "x", entrypoint: "b.js", code: "y" });
    expect(a).not.toBe(b);
  });

  test("differs when the code changes", () => {
    const a = computeBundleHash({ id: "x", entrypoint: "x", code: "alpha" });
    const b = computeBundleHash({ id: "x", entrypoint: "x", code: "beta" });
    expect(a).not.toBe(b);
  });

  test("length-prefixing prevents boundary collisions", () => {
    // Without length-prefixing, ("ab", "cd") and ("a", "bcd") would
    // collide if naively concatenated.
    const a = computeBundleHash({ id: "ab", entrypoint: "cd", code: "ef" });
    const b = computeBundleHash({ id: "a", entrypoint: "bcd", code: "ef" });
    expect(a).not.toBe(b);
  });
});
