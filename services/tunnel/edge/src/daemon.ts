// ── Reverse-tunnel: edge daemon (v1) ───────────────────────────────
//
// Runs on the Crontech edge. Accepts persistent WebSocket connections
// from origin daemons (control plane) and exposes a public HTTP
// listener (data plane) that forwards inbound traffic to the matching
// origin over the tunnel.
//
// Two listeners share this process:
//
//   - Control port (default 9094) — origin daemons handshake here.
//     The first frame on every accepted socket MUST be an `advertise`
//     frame whose `id` is the signed token. Anything else gets the
//     socket closed with code 4401.
//   - Public port  (default 9095) — public HTTP. Caddy/Cloudflare
//     usually fronts this for TLS termination.
//
// The split keeps origin handshakes off the public surface: only the
// public port faces the internet.
// ─────────────────────────────────────────────────────────────────────

import {
  type Frame,
  type PingFrame,
  type PongFrame,
  type ShutdownFrame,
  decodeFrame,
  encodeFrame,
  generateRequestId,
} from "../../shared/frame";
import { verifyHandshake } from "./accept";
import { OriginRegistry, type OriginConnection } from "./registry";

export interface TunnelLogger {
  log(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const NULL_LOGGER: TunnelLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

// ── Connection-side state machine ──────────────────────────────────

type ConnState = "awaiting-advertise" | "open" | "closed";

interface ConnRecord {
  readonly socketId: string;
  state: ConnState;
  registered: OriginConnection | null;
  hostnames: readonly string[];
  send(buf: Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
}

// ── Public API: handle one socket lifecycle ────────────────────────
//
// `acceptConnection` is the abstraction the runtime calls per accepted
// WebSocket. It is fully decoupled from Bun.serve so tests can drive
// it with synthetic frames.
// ─────────────────────────────────────────────────────────────────────

export interface SocketSink {
  send(buf: Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
}

export interface AcceptOptions {
  readonly registry: OriginRegistry;
  readonly sharedSecret: string;
  readonly logger?: TunnelLogger;
  readonly nowSeconds?: () => number;
}

export interface ConnectionHandle {
  /** Receive a frame from the remote origin. */
  onFrame(buf: Uint8Array): Promise<void>;
  /** The remote socket closed (or we closed it). */
  onClose(): void;
  /** Diagnostic info. */
  status(): {
    readonly socketId: string;
    readonly state: ConnState;
    readonly hostnames: readonly string[];
  };
}

export function acceptConnection(
  sink: SocketSink,
  options: AcceptOptions,
): ConnectionHandle {
  const logger = options.logger ?? NULL_LOGGER;
  const socketId = generateRequestId();
  const record: ConnRecord = {
    socketId,
    state: "awaiting-advertise",
    registered: null,
    hostnames: [],
    send: (buf) => sink.send(buf),
    close: (code, reason) => sink.close(code, reason),
  };

  return {
    status: () => ({
      socketId: record.socketId,
      state: record.state,
      hostnames: record.hostnames,
    }),
    async onFrame(buf) {
      let frame: Frame;
      try {
        frame = decodeFrame(buf);
      } catch (err) {
        logger.warn(`[tunnel/edge:${socketId}] decode error: ${(err as Error).message}`);
        return;
      }
      if (record.state === "awaiting-advertise") {
        await handleHandshakeFrame(frame, record, options);
        return;
      }
      if (record.state === "closed") {
        return;
      }
      handleOpenFrame(frame, record, options);
    },
    onClose() {
      if (record.registered) {
        options.registry.unregister(record.registered);
      }
      record.state = "closed";
      logger.log(
        `[tunnel/edge:${socketId}] disconnected; ` +
          `hostnameCount=${options.registry.hostnameCount()} ` +
          `connectionCount=${options.registry.connectionCount()}`,
      );
    },
  };
}

async function handleHandshakeFrame(
  frame: Frame,
  record: ConnRecord,
  options: AcceptOptions,
): Promise<void> {
  const logger = options.logger ?? NULL_LOGGER;
  if (frame.type !== "advertise") {
    logger.warn(`[tunnel/edge:${record.socketId}] expected advertise, got ${frame.type}`);
    record.close(4400, "expected advertise frame");
    record.state = "closed";
    return;
  }
  const token = frame.id;
  const result = await verifyHandshake(
    token,
    frame.hostnames,
    options.sharedSecret,
    options.nowSeconds ? { nowSeconds: options.nowSeconds() } : {},
  );
  if (!result.ok) {
    logger.warn(`[tunnel/edge:${record.socketId}] handshake rejected: ${result.reason}`);
    record.close(4401, result.reason);
    record.state = "closed";
    return;
  }
  record.hostnames = frame.hostnames;
  const conn: OriginConnection = {
    id: record.socketId,
    originId: result.claims.id,
    hostnames: frame.hostnames,
    send: (buf) => record.send(buf),
    close: (code, reason) => record.close(code, reason),
  };
  options.registry.register(conn);
  record.registered = conn;
  record.state = "open";
  logger.log(
    `[tunnel/edge:${record.socketId}] handshake accepted: originId=${result.claims.id} ` +
      `hostnames=${frame.hostnames.join(",")}`,
  );
}

function handleOpenFrame(frame: Frame, record: ConnRecord, options: AcceptOptions): void {
  const logger = options.logger ?? NULL_LOGGER;
  switch (frame.type) {
    case "response":
      options.registry.resolvePending(frame.id, frame);
      return;
    case "ping":
      replyPong(frame, record);
      return;
    case "pong":
      // Reserved for future edge-initiated heartbeats.
      return;
    case "shutdown":
      logger.log(
        `[tunnel/edge:${record.socketId}] origin requested shutdown: ${(frame as ShutdownFrame).reason}`,
      );
      record.close(1000, "origin shutdown");
      record.state = "closed";
      return;
    case "advertise":
      logger.warn(
        `[tunnel/edge:${record.socketId}] late advertise frame ignored`,
      );
      return;
    case "request":
      // Origin → edge requests are not in scope for v1; ignore.
      return;
    default: {
      const exhaustive: never = frame;
      void exhaustive;
      return;
    }
  }
}

function replyPong(ping: PingFrame, record: ConnRecord): void {
  const pong: PongFrame = {
    type: "pong",
    id: ping.id,
    timestamp: Date.now(),
  };
  try {
    record.send(encodeFrame(pong));
  } catch {
    // socket closing
  }
}
