// ── Origin daemon state-machine tests ──────────────────────────────
//
// We drive `OriginDaemon` through a synthetic `SocketLike` that lets
// the test simulate: socket open, inbound request frames, ping/pong
// exchange, abrupt close (reconnect), and graceful stop.

import { describe, expect, test } from "bun:test";
import {
  OriginDaemon,
  type OriginDaemonConfig,
  type OriginDeps,
  type SocketLike,
  DEFAULT_CONFIG,
} from "../src/daemon";
import { DEFAULT_ROUTING } from "../src/routing";
import {
  type AdvertiseFrame,
  type Frame,
  type RequestFrame,
  decodeFrame,
  encodeFrame,
} from "../../shared/frame";

const SECRET = "shared-secret";

class FakeSocket implements SocketLike {
  binaryType: "arraybuffer" | "blob" | "nodebuffer" = "arraybuffer";
  readonly outbound: Uint8Array[] = [];
  closed = false;
  private listeners = {
    open: [] as Array<() => void>,
    message: [] as Array<(ev: { data: ArrayBuffer | Uint8Array | string }) => void>,
    close: [] as Array<() => void>,
    error: [] as Array<() => void>,
  };

  send(data: Uint8Array<ArrayBuffer>): void {
    if (this.closed) {
      throw new Error("socket closed");
    }
    this.outbound.push(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const l of this.listeners.close) l();
  }

  addEventListener(type: "open" | "message" | "close" | "error", listener: unknown): void {
    if (type === "open") {
      this.listeners.open.push(listener as () => void);
      return;
    }
    if (type === "message") {
      this.listeners.message.push(
        listener as (ev: { data: ArrayBuffer | Uint8Array | string }) => void,
      );
      return;
    }
    if (type === "close") {
      this.listeners.close.push(listener as () => void);
      return;
    }
    if (type === "error") {
      this.listeners.error.push(listener as () => void);
      return;
    }
  }

  emitOpen(): void {
    for (const l of this.listeners.open) l();
  }

  emitMessage(data: Uint8Array): void {
    for (const l of this.listeners.message) l({ data: data as Uint8Array });
  }

  drainOutbound(): Frame[] {
    const out = this.outbound.map((b) => decodeFrame(b));
    this.outbound.length = 0;
    return out;
  }
}

interface TimerHandle {
  fn: () => void;
  delay: number;
  fired: boolean;
}

function makeFakeTimers(): {
  setTimeout: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout: (h: unknown) => void;
  setInterval: (fn: () => void, ms: number) => TimerHandle;
  clearInterval: (h: unknown) => void;
  fireAll: () => void;
  count: () => number;
} {
  const handles = new Set<TimerHandle>();
  return {
    setTimeout(fn, delay) {
      const h: TimerHandle = { fn, delay, fired: false };
      handles.add(h);
      return h;
    },
    clearTimeout(h) {
      handles.delete(h as TimerHandle);
    },
    setInterval(fn, delay) {
      const h: TimerHandle = { fn, delay, fired: false };
      handles.add(h);
      return h;
    },
    clearInterval(h) {
      handles.delete(h as TimerHandle);
    },
    fireAll() {
      for (const h of handles) {
        if (!h.fired) {
          h.fired = true;
          h.fn();
        }
      }
    },
    count() {
      return handles.size;
    },
  };
}

function makeConfig(overrides: Partial<OriginDaemonConfig> = {}): OriginDaemonConfig {
  return {
    edgeUrl: "wss://edge.test",
    sharedSecret: SECRET,
    originId: "origin-test",
    hostnames: ["demo.crontech.app"],
    routing: DEFAULT_ROUTING,
    pingIntervalMs: DEFAULT_CONFIG.pingIntervalMs,
    pingTimeoutMs: DEFAULT_CONFIG.pingTimeoutMs,
    maxInFlight: 8,
    drainMs: 100,
    ...overrides,
  };
}

function makeDeps(socket: FakeSocket, fetcher: OriginDeps["fetcher"]): {
  deps: OriginDeps;
  timers: ReturnType<typeof makeFakeTimers>;
} {
  const timers = makeFakeTimers();
  const deps: OriginDeps = {
    openSocket: () => socket,
    fetcher,
    setTimeout: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimeout: (h) => timers.clearTimeout(h),
    setInterval: (fn, ms) => timers.setInterval(fn, ms),
    clearInterval: (h) => timers.clearInterval(h),
    now: () => Date.now(),
  };
  return { deps, timers };
}

describe("origin/daemon: handshake", () => {
  test("first frame after connect is a signed advertise frame", async () => {
    const socket = new FakeSocket();
    const fetcher = async (): Promise<Response> => new Response("");
    const { deps } = makeDeps(socket, fetcher);
    const daemon = new OriginDaemon(makeConfig(), deps);
    daemon.start();
    socket.emitOpen();
    // The signing is async — let microtasks settle.
    await new Promise<void>((r) => setTimeout(r, 5));

    const sent = socket.drainOutbound();
    expect(sent).toHaveLength(1);
    const first = sent[0];
    expect(first).toBeDefined();
    if (!first) throw new Error("no advertise frame");
    expect(first.type).toBe("advertise");
    const advertise = first as AdvertiseFrame;
    expect(advertise.hostnames).toEqual(["demo.crontech.app"]);
    // The token is HMAC-signed, so it must contain the dot separator.
    expect(advertise.id).toContain(".");
  });

  test("status reports open after handshake", async () => {
    const socket = new FakeSocket();
    const fetcher = async (): Promise<Response> => new Response("");
    const { deps } = makeDeps(socket, fetcher);
    const daemon = new OriginDaemon(makeConfig(), deps);
    daemon.start();
    socket.emitOpen();
    await new Promise<void>((r) => setTimeout(r, 5));
    expect(daemon.status().state).toBe("open");
  });
});

describe("origin/daemon: multiplexed request handling", () => {
  test("two concurrent requests both produce response frames", async () => {
    const socket = new FakeSocket();
    let activeFetches = 0;
    let maxActive = 0;
    const fetcher = async (url: string): Promise<Response> => {
      activeFetches += 1;
      maxActive = Math.max(maxActive, activeFetches);
      // Stagger so both are in-flight concurrently.
      await new Promise<void>((r) => setTimeout(r, 5));
      activeFetches -= 1;
      return new Response(`served ${url}`, { status: 200 });
    };
    const { deps } = makeDeps(socket, fetcher);
    const daemon = new OriginDaemon(makeConfig({ maxInFlight: 16 }), deps);
    daemon.start();
    socket.emitOpen();
    await new Promise<void>((r) => setTimeout(r, 5));
    socket.drainOutbound(); // discard advertise

    const req1: RequestFrame = {
      type: "request",
      id: "r-1",
      hostname: "demo.crontech.app",
      method: "GET",
      url: "/page-a",
      headers: {},
      body: "",
    };
    const req2: RequestFrame = { ...req1, id: "r-2", url: "/page-b" };
    socket.emitMessage(encodeFrame(req1));
    socket.emitMessage(encodeFrame(req2));

    // Wait for both responses.
    await new Promise<void>((r) => setTimeout(r, 50));
    const responses = socket.drainOutbound().filter((f) => f.type === "response");
    const ids = new Set(responses.map((f) => f.id));
    expect(ids.has("r-1")).toBe(true);
    expect(ids.has("r-2")).toBe(true);
    expect(maxActive).toBeGreaterThanOrEqual(2);
  });

  test("503 reply when the in-flight ceiling is exceeded", async () => {
    const socket = new FakeSocket();
    let release: () => void = () => undefined;
    const block = new Promise<void>((r) => {
      release = r;
    });
    const fetcher = async (): Promise<Response> => {
      await block;
      return new Response("ok", { status: 200 });
    };
    const { deps } = makeDeps(socket, fetcher);
    const daemon = new OriginDaemon(makeConfig({ maxInFlight: 1 }), deps);
    daemon.start();
    socket.emitOpen();
    await new Promise<void>((r) => setTimeout(r, 5));
    socket.drainOutbound();

    const req1: RequestFrame = {
      type: "request",
      id: "r-1",
      hostname: "demo.crontech.app",
      method: "GET",
      url: "/",
      headers: {},
      body: "",
    };
    const req2: RequestFrame = { ...req1, id: "r-2" };
    socket.emitMessage(encodeFrame(req1));
    // r-2 hits ceiling because r-1 hasn't returned yet.
    socket.emitMessage(encodeFrame(req2));
    await new Promise<void>((r) => setTimeout(r, 5));

    const sent = socket.drainOutbound();
    const r2reply = sent.find((f) => f.type === "response" && f.id === "r-2");
    expect(r2reply).toBeDefined();
    if (r2reply && r2reply.type === "response") {
      expect(r2reply.status).toBe(503);
    }
    release();
    await new Promise<void>((r) => setTimeout(r, 10));
  });
});

describe("origin/daemon: reconnect", () => {
  test("scheduling a reconnect after socket close", async () => {
    const socket = new FakeSocket();
    const fetcher = async (): Promise<Response> => new Response("");
    const { deps, timers } = makeDeps(socket, fetcher);
    const daemon = new OriginDaemon(makeConfig(), deps);
    daemon.start();
    socket.emitOpen();
    await new Promise<void>((r) => setTimeout(r, 5));
    expect(daemon.status().state).toBe("open");

    socket.close(); // simulate dropped connection
    await new Promise<void>((r) => setTimeout(r, 5));
    expect(daemon.status().state).toBe("connecting");
    // A reconnect timer must be scheduled.
    expect(timers.count()).toBeGreaterThan(0);
  });

  test("graceful stop ends in stopped state", async () => {
    const socket = new FakeSocket();
    const fetcher = async (): Promise<Response> => new Response("");
    const { deps } = makeDeps(socket, fetcher);
    const daemon = new OriginDaemon(makeConfig({ drainMs: 25 }), deps);
    daemon.start();
    socket.emitOpen();
    await new Promise<void>((r) => setTimeout(r, 5));
    socket.drainOutbound();

    await daemon.stop("test");
    expect(daemon.status().state).toBe("stopped");
    // A shutdown frame should have been emitted.
    const tail = socket.drainOutbound();
    const last = tail.find((f) => f.type === "shutdown");
    expect(last).toBeDefined();
  });
});
