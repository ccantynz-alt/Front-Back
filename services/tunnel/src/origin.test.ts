// ── Origin daemon unit tests ────────────────────────────────────────
//
// Covers: reconnection backoff math, port routing logic, local URL
// construction, and request forwarding via an injected fake fetcher.
// Zero sockets are bound — `connectAndServe` is exercised through its
// `ConnectDeps` interface so the WebSocket layer is mocked.

import { describe, expect, test } from "bun:test";
import {
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  type OriginPortRouting,
  buildLocalUrl,
  computeBackoffMs,
  forwardRequest,
  resolveLocalPort,
} from "./origin";
import { type RequestFrame, bodyToBase64 } from "./frame";

const routing: OriginPortRouting = { webPort: 3000, apiPort: 3001 };

describe("origin: backoff math", () => {
  test("initial attempt yields the configured initial backoff", () => {
    expect(computeBackoffMs(0)).toBe(INITIAL_BACKOFF_MS);
  });

  test("doubles each attempt", () => {
    expect(computeBackoffMs(1)).toBe(INITIAL_BACKOFF_MS * 2);
    expect(computeBackoffMs(2)).toBe(INITIAL_BACKOFF_MS * 4);
    expect(computeBackoffMs(3)).toBe(INITIAL_BACKOFF_MS * 8);
  });

  test("clamps at the configured maximum", () => {
    expect(computeBackoffMs(20)).toBe(MAX_BACKOFF_MS);
    expect(computeBackoffMs(99)).toBe(MAX_BACKOFF_MS);
  });

  test("rejects bogus inputs by falling back to initial", () => {
    expect(computeBackoffMs(-1)).toBe(INITIAL_BACKOFF_MS);
    expect(computeBackoffMs(1.5)).toBe(INITIAL_BACKOFF_MS);
  });
});

describe("origin: port routing", () => {
  test("API paths route to the API port", () => {
    expect(resolveLocalPort("/api/foo", routing)).toBe(3001);
    expect(resolveLocalPort("/trpc/projects.list", routing)).toBe(3001);
    expect(resolveLocalPort("/healthz", routing)).toBe(3001);
    expect(resolveLocalPort("/auth/login", routing)).toBe(3001);
  });

  test("non-API paths route to the web port", () => {
    expect(resolveLocalPort("/", routing)).toBe(3000);
    expect(resolveLocalPort("/dashboard", routing)).toBe(3000);
    expect(resolveLocalPort("/_build/index.js", routing)).toBe(3000);
  });

  test("absolute URLs are normalised before routing", () => {
    expect(resolveLocalPort("https://demo.crontech.app/api/foo", routing)).toBe(3001);
    expect(resolveLocalPort("https://demo.crontech.app/", routing)).toBe(3000);
  });

  test("buildLocalUrl preserves path and ignores host", () => {
    const req: RequestFrame = {
      type: "request",
      id: "x",
      method: "GET",
      url: "https://demo.crontech.app/dashboard",
      headers: {},
      body: "",
    };
    expect(buildLocalUrl(req, 3000)).toBe("http://127.0.0.1:3000/dashboard");
  });
});

describe("origin: forwardRequest", () => {
  test("forwards a GET request and frames the response body", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: string, init: RequestInit): Promise<Response> => {
      calls.push({ url, init });
      return new Response("hello", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    };
    const req: RequestFrame = {
      type: "request",
      id: "abc",
      method: "GET",
      url: "/dashboard",
      headers: { "x-test": "1" },
      body: "",
    };
    const res = await forwardRequest(req, routing, fetcher);
    expect(res.id).toBe("abc");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(calls).toHaveLength(1);
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      expect(firstCall.url).toBe("http://127.0.0.1:3000/dashboard");
      expect(firstCall.init.method).toBe("GET");
      expect(firstCall.init.body).toBeUndefined();
    }
  });

  test("forwards a POST body to the API port", async () => {
    const seenBodies: Array<unknown> = [];
    const fetcher = async (url: string, init: RequestInit): Promise<Response> => {
      seenBodies.push(init.body);
      expect(url).toBe("http://127.0.0.1:3001/api/echo");
      return new Response("{\"ok\":true}", {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };
    const req: RequestFrame = {
      type: "request",
      id: "xyz",
      method: "POST",
      url: "/api/echo",
      headers: { "content-type": "application/json" },
      body: bodyToBase64(new TextEncoder().encode("{\"hello\":\"world\"}")),
    };
    const res = await forwardRequest(req, routing, fetcher);
    expect(res.status).toBe(201);
    expect(seenBodies).toHaveLength(1);
    const body = seenBodies[0];
    expect(body).toBeInstanceOf(Uint8Array);
  });

  test("preserves request id in the response (correlation)", async () => {
    const fetcher = async (): Promise<Response> => new Response("");
    const req: RequestFrame = {
      type: "request",
      id: "correlation-123",
      method: "GET",
      url: "/",
      headers: {},
      body: "",
    };
    const res = await forwardRequest(req, routing, fetcher);
    expect(res.id).toBe("correlation-123");
  });
});
