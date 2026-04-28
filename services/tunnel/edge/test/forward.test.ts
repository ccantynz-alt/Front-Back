import { describe, expect, test } from "bun:test";
import { DEFAULT_REQUEST_TIMEOUT_MS, forwardThroughOrigin } from "../src/forward";
import { OriginRegistry, type OriginConnection } from "../src/registry";
import {
  type ResponseFrame,
  bodyToBase64,
  decodeRequest,
  encodeResponse,
} from "../../shared/frame";

function makeConn(id: string, hostnames: string[]): {
  conn: OriginConnection;
  outbox: Uint8Array[];
} {
  const outbox: Uint8Array[] = [];
  return {
    outbox,
    conn: {
      id,
      originId: `origin-${id}`,
      hostnames,
      send: (buf) => {
        outbox.push(buf);
      },
      close: () => undefined,
    },
  };
}

describe("edge/forward: 502 fallback", () => {
  test("returns 502 when no origin is registered for the hostname", async () => {
    const registry = new OriginRegistry();
    const req = new Request("http://demo.crontech.app/", {
      headers: { host: "demo.crontech.app" },
    });
    const res = await forwardThroughOrigin(req, registry);
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("no origin registered");
  });
});

describe("edge/forward: end-to-end", () => {
  test("frames an inbound request and resolves it from the registry", async () => {
    const registry = new OriginRegistry();
    const fake = makeConn("conn-a", ["demo.crontech.app"]);
    registry.register(fake.conn);

    const responsePromise = (async () => {
      await Promise.resolve();
      for (let i = 0; i < 100 && fake.outbox.length === 0; i++) {
        await Promise.resolve();
      }
      const sent = fake.outbox[0];
      if (!sent) throw new Error("no outbound frame");
      const decoded = decodeRequest(sent);
      const responseFrame: ResponseFrame = {
        type: "response",
        id: decoded.id,
        status: 200,
        headers: { "x-served-by": "test" },
        body: bodyToBase64(new TextEncoder().encode("ok")),
      };
      registry.resolvePending(decoded.id, responseFrame);
      encodeResponse(responseFrame);
    })();

    const req = new Request("http://demo.crontech.app/api/ping", {
      method: "POST",
      headers: { host: "demo.crontech.app", "content-type": "text/plain" },
      body: "ping-body",
    });
    const res = await forwardThroughOrigin(req, registry);
    await responsePromise;
    expect(res.status).toBe(200);
    expect(res.headers.get("x-served-by")).toBe("test");
    expect(await res.text()).toBe("ok");
  });

  test("times out when origin never responds", async () => {
    const registry = new OriginRegistry();
    const fake = makeConn("conn-a", ["demo.crontech.app"]);
    registry.register(fake.conn);

    const req = new Request("http://demo.crontech.app/", {
      headers: { host: "demo.crontech.app" },
    });
    const res = await forwardThroughOrigin(req, registry, { timeoutMs: 25 });
    expect(res.status).toBe(504);
    expect(await res.text()).toContain("timeout");
  });

  test("default timeout constant is non-zero", () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });

  test("hostnameOverride bypasses the host header", async () => {
    const registry = new OriginRegistry();
    const fake = makeConn("conn-a", ["override.crontech.app"]);
    registry.register(fake.conn);
    const req = new Request("http://localhost/", { headers: { host: "localhost" } });

    const responsePromise = (async () => {
      for (let i = 0; i < 100 && fake.outbox.length === 0; i++) {
        await Promise.resolve();
      }
      const sent = fake.outbox[0];
      if (!sent) return;
      const decoded = decodeRequest(sent);
      registry.resolvePending(decoded.id, {
        type: "response",
        id: decoded.id,
        status: 200,
        headers: {},
        body: "",
      });
    })();

    const res = await forwardThroughOrigin(req, registry, {
      hostnameOverride: "override.crontech.app",
    });
    await responsePromise;
    expect(res.status).toBe(200);
  });
});
