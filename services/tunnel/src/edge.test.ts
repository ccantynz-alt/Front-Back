// ── Edge daemon unit tests ──────────────────────────────────────────
//
// Covers: protocol parsing + auth, hostname registry insert/displace/
// remove semantics, request id correlation, timeout rejection, and
// the 502 fallback path when no origin is registered. No sockets bound.

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  type OriginConnection,
  OriginRegistry,
  authenticateProtocol,
  forwardThroughOrigin,
  parseProtocol,
} from "./edge";
import {
  type ResponseFrame,
  bodyToBase64,
  decodeRequest,
  encodeResponse,
} from "./frame";

const SECRET = "shared-secret-value";

function makeFakeConn(id: string): {
  conn: OriginConnection;
  outbox: Uint8Array[];
  closed: boolean;
} {
  const outbox: Uint8Array[] = [];
  let closed = false;
  const conn: OriginConnection = {
    id,
    send(buf) {
      outbox.push(buf);
    },
    close() {
      closed = true;
    },
  };
  return {
    conn,
    outbox,
    get closed() {
      return closed;
    },
  };
}

describe("edge: protocol parsing", () => {
  test("parses a well-formed protocol value", () => {
    const claims = parseProtocol(`crontech-tunnel.v1.${SECRET}.demo.crontech.app`);
    expect(claims).not.toBeNull();
    expect(claims?.secret).toBe(SECRET);
    expect(claims?.hostname).toBe("demo.crontech.app");
  });

  test("rejects null/empty values", () => {
    expect(parseProtocol(null)).toBeNull();
    expect(parseProtocol("")).toBeNull();
    expect(parseProtocol(undefined)).toBeNull();
  });

  test("rejects unknown prefixes", () => {
    expect(parseProtocol(`crontech-tunnel.v0.${SECRET}.host`)).toBeNull();
    expect(parseProtocol("rogue-protocol")).toBeNull();
  });

  test("rejects malformed claims", () => {
    expect(parseProtocol("crontech-tunnel.v1.")).toBeNull();
    expect(parseProtocol("crontech-tunnel.v1.secret-only")).toBeNull();
    expect(parseProtocol("crontech-tunnel.v1..hostname-only")).toBeNull();
  });
});

describe("edge: protocol auth", () => {
  test("accepts matching secret", () => {
    const claims = parseProtocol(`crontech-tunnel.v1.${SECRET}.demo`);
    expect(authenticateProtocol(claims, SECRET)).toBe(true);
  });

  test("rejects mismatched secret", () => {
    const claims = parseProtocol(`crontech-tunnel.v1.wrong-secret.demo`);
    expect(authenticateProtocol(claims, SECRET)).toBe(false);
  });

  test("rejects null claims", () => {
    expect(authenticateProtocol(null, SECRET)).toBe(false);
  });

  test("rejects empty expected secret", () => {
    const claims = parseProtocol(`crontech-tunnel.v1.${SECRET}.demo`);
    expect(authenticateProtocol(claims, "")).toBe(false);
  });
});

describe("edge: registry semantics", () => {
  test("registers and looks up by hostname", () => {
    const registry = new OriginRegistry();
    const a = makeFakeConn("conn-a");
    registry.register("demo.crontech.app", a.conn);
    expect(registry.get("demo.crontech.app")?.id).toBe("conn-a");
    expect(registry.size()).toBe(1);
  });

  test("displaces and closes a previous connection on the same hostname", () => {
    const registry = new OriginRegistry();
    const a = makeFakeConn("conn-a");
    const b = makeFakeConn("conn-b");
    registry.register("demo", a.conn);
    registry.register("demo", b.conn);
    expect(a.closed).toBe(true);
    expect(registry.get("demo")?.id).toBe("conn-b");
    expect(registry.size()).toBe(1);
  });

  test("unregister only removes the matching connection id", () => {
    const registry = new OriginRegistry();
    const a = makeFakeConn("conn-a");
    const b = makeFakeConn("conn-b");
    registry.register("demo", a.conn);
    // A stale unregister with the wrong id leaves the registry alone.
    registry.unregister("demo", b.conn);
    expect(registry.get("demo")?.id).toBe("conn-a");
    registry.unregister("demo", a.conn);
    expect(registry.get("demo")).toBeUndefined();
  });

  test("trackPending / resolvePending correlates by request id", () => {
    const registry = new OriginRegistry();
    const collected: ResponseFrame[] = [];
    registry.trackPending("req-1", {
      resolve: (res) => {
        collected.push(res);
      },
      reject: () => undefined,
    });
    expect(registry.pendingCount()).toBe(1);
    const frame: ResponseFrame = {
      type: "response",
      id: "req-1",
      status: 200,
      headers: {},
      body: "",
    };
    const ok = registry.resolvePending("req-1", frame);
    expect(ok).toBe(true);
    expect(collected).toHaveLength(1);
    expect(collected[0]).toEqual(frame);
    expect(registry.pendingCount()).toBe(0);
  });

  test("resolvePending on an unknown id is a no-op", () => {
    const registry = new OriginRegistry();
    const frame: ResponseFrame = {
      type: "response",
      id: "ghost",
      status: 200,
      headers: {},
      body: "",
    };
    expect(registry.resolvePending("ghost", frame)).toBe(false);
  });

  test("rejectPending fires the reject side", () => {
    const registry = new OriginRegistry();
    const errors: Error[] = [];
    registry.trackPending("req-2", {
      resolve: () => undefined,
      reject: (err) => {
        errors.push(err);
      },
    });
    expect(registry.rejectPending("req-2", new Error("boom"))).toBe(true);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect(errors[0]?.message).toBe("boom");
  });
});

describe("edge: forwardThroughOrigin", () => {
  test("returns 502 when no origin is registered for the hostname", async () => {
    const registry = new OriginRegistry();
    const req = new Request("http://demo.crontech.app/", {
      headers: { host: "demo.crontech.app" },
    });
    const res = await forwardThroughOrigin(req, registry);
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("no origin registered");
  });

  test("frames an inbound request and resolves it from the registry", async () => {
    const registry = new OriginRegistry();
    const fake = makeFakeConn("conn-a");
    registry.register("demo.crontech.app", fake.conn);

    // Drive the response side as soon as we see the outbound frame.
    const responsePromise = (async () => {
      // Yield once so the request is queued before we respond.
      await Promise.resolve();
      // Wait until something has been sent. We deliberately spin a few
      // microtasks rather than rely on real timers.
      for (let i = 0; i < 100 && fake.outbox.length === 0; i++) {
        await Promise.resolve();
      }
      expect(fake.outbox.length).toBeGreaterThan(0);
      const sent = fake.outbox[0];
      expect(sent).toBeDefined();
      if (!sent) {
        throw new Error("no outbound frame");
      }
      const decoded = decodeRequest(sent);
      const responseFrame: ResponseFrame = {
        type: "response",
        id: decoded.id,
        status: 200,
        headers: { "x-served-by": "test" },
        body: bodyToBase64(new TextEncoder().encode("ok")),
      };
      // Simulate the origin replying — the daemon would normally call
      // resolvePending after decodeResponse on the WebSocket message.
      const handled = registry.resolvePending(decoded.id, responseFrame);
      expect(handled).toBe(true);
      // Sanity: encodeResponse must not throw on the same frame.
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
    const fake = makeFakeConn("conn-a");
    registry.register("demo.crontech.app", fake.conn);

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
});
