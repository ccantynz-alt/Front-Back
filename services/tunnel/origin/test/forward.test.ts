import { describe, expect, test } from "bun:test";
import { forwardRequest } from "../src/forward";
import { DEFAULT_ROUTING } from "../src/routing";
import { type RequestFrame, bodyToBase64 } from "../../shared/frame";

describe("origin/forward: forwardRequest", () => {
  test("forwards a GET and frames the response", async () => {
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
      hostname: "demo.crontech.app",
      method: "GET",
      url: "/dashboard",
      headers: { "x-test": "1" },
      body: "",
    };
    const res = await forwardRequest(req, DEFAULT_ROUTING, fetcher);
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
      return new Response('{"ok":true}', {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };
    const req: RequestFrame = {
      type: "request",
      id: "xyz",
      hostname: "demo.crontech.app",
      method: "POST",
      url: "/api/echo",
      headers: { "content-type": "application/json" },
      body: bodyToBase64(new TextEncoder().encode('{"hello":"world"}')),
    };
    const res = await forwardRequest(req, DEFAULT_ROUTING, fetcher);
    expect(res.status).toBe(201);
    expect(seenBodies).toHaveLength(1);
    expect(seenBodies[0]).toBeInstanceOf(Uint8Array);
  });

  test("preserves request id in the response (correlation)", async () => {
    const fetcher = async (): Promise<Response> => new Response("");
    const req: RequestFrame = {
      type: "request",
      id: "correlation-123",
      hostname: "demo.crontech.app",
      method: "GET",
      url: "/",
      headers: {},
      body: "",
    };
    const res = await forwardRequest(req, DEFAULT_ROUTING, fetcher);
    expect(res.id).toBe("correlation-123");
  });
});
