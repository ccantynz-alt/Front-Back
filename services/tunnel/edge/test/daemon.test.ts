// ── Edge daemon end-to-end tests ───────────────────────────────────
//
// Drives `acceptConnection` directly with synthetic frames to exercise:
//
//   - Handshake happy path (signed advertise → registered)
//   - Auth-failure handshake (bad signature → close 4401)
//   - Request/response correlation through the registry
//   - Ping/pong reply
//   - Late advertise frames are ignored
//   - End-to-end "edge receives HTTP, tunnels to origin, returns response"

import { describe, expect, test } from "bun:test";
import { acceptConnection, type SocketSink } from "../src/daemon";
import { OriginRegistry } from "../src/registry";
import { forwardThroughOrigin } from "../src/forward";
import { generateNonce, signTunnelToken } from "../../shared/auth";
import {
  type AdvertiseFrame,
  type Frame,
  type PingFrame,
  type RequestFrame,
  type ResponseFrame,
  bodyFromBase64,
  bodyToBase64,
  decodeFrame,
  decodeRequest,
  encodeFrame,
} from "../../shared/frame";

const SECRET = "edge-secret";

interface FakeSink extends SocketSink {
  outbound: Uint8Array[];
  closed: { code?: number; reason?: string } | null;
}

function makeSink(): FakeSink {
  const outbound: Uint8Array[] = [];
  let closed: { code?: number; reason?: string } | null = null;
  const sink: FakeSink = {
    outbound,
    get closed() {
      return closed;
    },
    set closed(v) {
      closed = v;
    },
    send(buf) {
      outbound.push(buf);
    },
    close(code, reason) {
      const update: { code?: number; reason?: string } = {};
      if (code !== undefined) update.code = code;
      if (reason !== undefined) update.reason = reason;
      closed = update;
    },
  };
  return sink;
}

async function buildAdvertise(
  hostnames: string[],
  secret: string,
  originId = "vps-1",
): Promise<AdvertiseFrame> {
  const token = await signTunnelToken(
    {
      id: originId,
      ts: Math.floor(Date.now() / 1000),
      nonce: generateNonce(),
      hostnames,
    },
    secret,
  );
  return { type: "advertise", id: token, hostnames };
}

describe("edge/daemon: handshake", () => {
  test("happy path registers the origin", async () => {
    const registry = new OriginRegistry();
    const sink = makeSink();
    const handle = acceptConnection(sink, { registry, sharedSecret: SECRET });
    const advertise = await buildAdvertise(["demo.crontech.app"], SECRET);
    await handle.onFrame(encodeFrame(advertise));
    expect(handle.status().state).toBe("open");
    expect(registry.get("demo.crontech.app")).toBeDefined();
    expect(sink.closed).toBeNull();
  });

  test("rejects bad signature with 4401 close", async () => {
    const registry = new OriginRegistry();
    const sink = makeSink();
    const handle = acceptConnection(sink, { registry, sharedSecret: SECRET });
    const advertise = await buildAdvertise(["demo.crontech.app"], "wrong-secret");
    await handle.onFrame(encodeFrame(advertise));
    expect(sink.closed?.code).toBe(4401);
    expect(handle.status().state).toBe("closed");
    expect(registry.connectionCount()).toBe(0);
  });

  test("closes if first frame is not advertise", async () => {
    const registry = new OriginRegistry();
    const sink = makeSink();
    const handle = acceptConnection(sink, { registry, sharedSecret: SECRET });
    const ping: PingFrame = { type: "ping", id: "p", timestamp: Date.now() };
    await handle.onFrame(encodeFrame(ping));
    expect(sink.closed?.code).toBe(4400);
  });

  test("late advertise frames are ignored, not re-handshaked", async () => {
    const registry = new OriginRegistry();
    const sink = makeSink();
    const handle = acceptConnection(sink, { registry, sharedSecret: SECRET });
    const first = await buildAdvertise(["demo.crontech.app"], SECRET);
    await handle.onFrame(encodeFrame(first));
    const second = await buildAdvertise(["other.crontech.app"], SECRET, "vps-2");
    await handle.onFrame(encodeFrame(second));
    // Still bound to the first advertised hostname.
    expect(registry.get("demo.crontech.app")).toBeDefined();
    expect(registry.get("other.crontech.app")).toBeUndefined();
  });
});

describe("edge/daemon: control frames after handshake", () => {
  test("ping is replied with pong on the same id", async () => {
    const registry = new OriginRegistry();
    const sink = makeSink();
    const handle = acceptConnection(sink, { registry, sharedSecret: SECRET });
    await handle.onFrame(encodeFrame(await buildAdvertise(["demo"], SECRET)));
    sink.outbound.length = 0;
    const ping: PingFrame = { type: "ping", id: "ping-xyz", timestamp: 1 };
    await handle.onFrame(encodeFrame(ping));
    expect(sink.outbound.length).toBe(1);
    const sentBuf = sink.outbound[0];
    expect(sentBuf).toBeDefined();
    if (!sentBuf) throw new Error("no pong");
    const decoded: Frame = decodeFrame(sentBuf);
    expect(decoded.type).toBe("pong");
    if (decoded.type === "pong") {
      expect(decoded.id).toBe("ping-xyz");
    }
  });

  test("response frames resolve pending requests", async () => {
    const registry = new OriginRegistry();
    const sink = makeSink();
    const handle = acceptConnection(sink, { registry, sharedSecret: SECRET });
    await handle.onFrame(encodeFrame(await buildAdvertise(["demo.crontech.app"], SECRET)));

    const collected: ResponseFrame[] = [];
    registry.trackPending("rid-1", {
      resolve: (r) => collected.push(r),
      reject: () => undefined,
      connectionId: handle.status().socketId,
    });
    const res: ResponseFrame = {
      type: "response",
      id: "rid-1",
      status: 200,
      headers: {},
      body: "",
    };
    await handle.onFrame(encodeFrame(res));
    expect(collected).toHaveLength(1);
    expect(collected[0]?.id).toBe("rid-1");
  });

  test("disconnect rejects in-flight pendings", async () => {
    const registry = new OriginRegistry();
    const sink = makeSink();
    const handle = acceptConnection(sink, { registry, sharedSecret: SECRET });
    await handle.onFrame(encodeFrame(await buildAdvertise(["demo"], SECRET)));
    const errors: Error[] = [];
    registry.trackPending("rid-2", {
      resolve: () => undefined,
      reject: (err) => errors.push(err),
      connectionId: handle.status().socketId,
    });
    handle.onClose();
    expect(errors).toHaveLength(1);
    expect(registry.connectionCount()).toBe(0);
  });
});

describe("edge/daemon: end-to-end HTTP-through-tunnel", () => {
  test("public Request → framed → origin reply → public Response", async () => {
    const registry = new OriginRegistry();
    const sink = makeSink();
    const handle = acceptConnection(sink, { registry, sharedSecret: SECRET });
    await handle.onFrame(encodeFrame(await buildAdvertise(["demo.crontech.app"], SECRET)));
    sink.outbound.length = 0;

    const driveOrigin = (async () => {
      // Wait for the outbound request frame to appear.
      for (let i = 0; i < 100 && sink.outbound.length === 0; i++) {
        await new Promise<void>((r) => setTimeout(r, 5));
      }
      const buf = sink.outbound[0];
      if (!buf) throw new Error("no outbound frame");
      const decoded: RequestFrame = decodeRequest(buf);
      // Simulate origin responding via the registry the way the real
      // daemon would after decoding a `response` WebSocket message.
      const resFrame: ResponseFrame = {
        type: "response",
        id: decoded.id,
        status: 200,
        headers: { "content-type": "text/plain" },
        body: bodyToBase64(new TextEncoder().encode("hello-from-origin")),
      };
      await handle.onFrame(encodeFrame(resFrame));
      // sanity: ensure body decodes back
      expect(new TextDecoder().decode(bodyFromBase64(resFrame.body))).toBe(
        "hello-from-origin",
      );
    })();

    const req = new Request("http://demo.crontech.app/api/echo", {
      method: "POST",
      headers: { host: "demo.crontech.app", "content-type": "text/plain" },
      body: "ping",
    });
    const res = await forwardThroughOrigin(req, registry);
    await driveOrigin;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello-from-origin");
  });
});
