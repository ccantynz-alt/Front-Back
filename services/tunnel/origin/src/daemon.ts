// ── Reverse-tunnel: origin daemon (v1) ──────────────────────────────
//
// Runs on the customer origin host. Opens a persistent outbound
// WebSocket to the Crontech edge, presents an HMAC-signed token,
// advertises the hostnames it serves, then serves multiplexed inbound
// HTTP frames concurrently.
//
// Design contract:
//
//   1. Outbound only. The origin host opens NO public ports. The
//      tunnel daemon's only network activity is dialling the edge.
//   2. Mutual auth via signed token (see ../../shared/auth.ts).
//   3. Multiplexed: many concurrent in-flight requests share one
//      WebSocket. Each request is correlated by `id`; the handler is
//      `await`ed but does not block the receive loop.
//   4. Heartbeat: ping every `pingIntervalMs`; if no pong within
//      `pingTimeoutMs` we tear down the socket and reconnect.
//   5. Auto-reconnect with exponential backoff + full jitter.
//   6. Graceful shutdown: on SIGTERM/SIGINT, send a `shutdown` frame,
//      drain in-flight requests up to `drainMs`, close cleanly, exit 0.
//
// Wire layer: WebSocket. Bun ships a native client, runs in Node 22+,
// and traverses every NAT/CDN/proxy combination because it tunnels
// over HTTPS. We chose WS over QUIC because Cloudflare-fronted edges
// already terminate WS at the CDN tier — we get free WAF, free DDoS
// scrubbing, free TLS, free observability. QUIC is on the roadmap for
// when we host our own edge POPs.
// ─────────────────────────────────────────────────────────────────────

import {
  type AdvertiseFrame,
  type Frame,
  type PingFrame,
  type PongFrame,
  type RequestFrame,
  type ResponseFrame,
  type ShutdownFrame,
  bodyToBase64,
  decodeFrame,
  encodeFrame,
  generateRequestId,
} from "../../shared/frame";
import {
  type TunnelClaims,
  generateNonce,
  signTunnelToken,
} from "../../shared/auth";
import { computeBackoffMs } from "./backoff";
import { type LocalFetcher, forwardRequest } from "./forward";
import { type RoutingConfig } from "./routing";

// ── Logger ──────────────────────────────────────────────────────────

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

// ── Configuration ──────────────────────────────────────────────────

export interface OriginDaemonConfig {
  /** wss://edge.crontech.app/tunnel — the edge control endpoint. */
  readonly edgeUrl: string;
  /** Stable origin id. Echoed in logs + dashboards. */
  readonly originId: string;
  /** Hostnames this origin serves (advertised on every connect). */
  readonly hostnames: readonly string[];
  /** Shared HMAC secret. Provisioned out-of-band. */
  readonly sharedSecret: string;
  /** Local-port routing rules. */
  readonly routing: RoutingConfig;
  /** Heartbeat cadence. */
  readonly pingIntervalMs: number;
  /** Time after a sent ping before we declare the link dead. */
  readonly pingTimeoutMs: number;
  /** Max concurrent in-flight requests. Backpressure ceiling. */
  readonly maxInFlight: number;
  /** Drain window on graceful shutdown. */
  readonly drainMs: number;
}

export const DEFAULT_CONFIG = {
  pingIntervalMs: 15_000,
  pingTimeoutMs: 30_000,
  maxInFlight: 256,
  drainMs: 10_000,
} as const;

// ── Runtime dependencies (mockable for tests) ───────────────────────

export interface SocketLike {
  binaryType: "arraybuffer" | "blob" | "nodebuffer";
  send(data: Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "close", listener: () => void): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (ev: { data: ArrayBuffer | Uint8Array | string }) => void,
  ): void;
}

export interface OriginDeps {
  readonly openSocket: (url: string) => SocketLike;
  readonly fetcher: LocalFetcher;
  readonly setTimeout: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly setInterval: (fn: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
  readonly now: () => number;
  readonly logger?: TunnelLogger;
}

// ── Daemon state machine ───────────────────────────────────────────

export type DaemonState =
  | "idle"
  | "connecting"
  | "authenticating"
  | "open"
  | "closing"
  | "stopped";

export interface DaemonStatus {
  readonly state: DaemonState;
  readonly attempt: number;
  readonly inFlight: number;
  readonly hostnames: readonly string[];
  readonly originId: string;
}

/**
 * The origin daemon. Hold one of these per host. Call `start()` to
 * begin connecting; call `stop()` for graceful shutdown.
 */
export class OriginDaemon {
  private readonly config: OriginDaemonConfig;
  private readonly deps: OriginDeps;
  private readonly logger: TunnelLogger;

  private state: DaemonState = "idle";
  private attempt = 0;
  private socket: SocketLike | null = null;
  private inFlight = new Set<string>();
  private pingTimer: unknown = null;
  private pongDeadline: unknown = null;
  private reconnectTimer: unknown = null;
  private outstandingPing: { id: string; sentAt: number } | null = null;

  constructor(config: OriginDaemonConfig, deps: OriginDeps) {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger ?? NULL_LOGGER;
  }

  status(): DaemonStatus {
    return {
      state: this.state,
      attempt: this.attempt,
      inFlight: this.inFlight.size,
      hostnames: this.config.hostnames,
      originId: this.config.originId,
    };
  }

  /** Begin connecting. Idempotent — re-calling while open is a no-op. */
  start(): void {
    if (this.state !== "idle" && this.state !== "stopped") {
      return;
    }
    this.state = "connecting";
    this.attempt = 0;
    void this.connect();
  }

  /** Graceful shutdown. Sends a shutdown frame, drains, closes. */
  async stop(reason = "origin shutdown"): Promise<void> {
    if (this.state === "stopped") {
      return;
    }
    this.state = "closing";
    this.cancelTimers();
    if (this.socket) {
      const frame: ShutdownFrame = {
        type: "shutdown",
        id: generateRequestId(),
        reason,
      };
      try {
        this.socket.send(encodeFrame(frame));
      } catch (err) {
        this.logger.warn(`[tunnel/origin] failed to send shutdown: ${(err as Error).message}`);
      }
    }
    await this.drain(this.config.drainMs);
    if (this.socket) {
      try {
        this.socket.close(1000, "graceful shutdown");
      } catch {
        // already closed
      }
      this.socket = null;
    }
    this.state = "stopped";
    this.logger.log("[tunnel/origin] stopped");
  }

  // ── connect / authenticate ───────────────────────────────────────

  private async connect(): Promise<void> {
    if (this.state === "stopped" || this.state === "closing") {
      return;
    }
    this.logger.log(
      `[tunnel/origin] dialling ${this.config.edgeUrl} (attempt ${this.attempt + 1})`,
    );
    let socket: SocketLike;
    try {
      socket = this.deps.openSocket(this.config.edgeUrl);
    } catch (err) {
      this.logger.error(`[tunnel/origin] dial failed: ${(err as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.state = "authenticating";

    socket.addEventListener("open", () => {
      void this.handleOpen();
    });
    socket.addEventListener("message", (ev) => {
      this.handleMessage(ev.data);
    });
    socket.addEventListener("close", () => {
      this.handleClose();
    });
    socket.addEventListener("error", () => {
      this.logger.warn("[tunnel/origin] socket error (will close)");
    });
  }

  private async handleOpen(): Promise<void> {
    if (!this.socket) {
      return;
    }
    const claims: TunnelClaims = {
      id: this.config.originId,
      ts: Math.floor(this.deps.now() / 1000),
      nonce: generateNonce(),
      hostnames: this.config.hostnames,
    };
    let token: string;
    try {
      token = await signTunnelToken(claims, this.config.sharedSecret);
    } catch (err) {
      this.logger.error(`[tunnel/origin] token sign failed: ${(err as Error).message}`);
      this.socket.close(1011, "auth-sign-failed");
      return;
    }
    // First frame on the socket MUST be the advertise frame, with the
    // token in the `id` field per the wire protocol.
    const advertise: AdvertiseFrame = {
      type: "advertise",
      id: token,
      hostnames: this.config.hostnames,
    };
    try {
      this.socket.send(encodeFrame(advertise));
    } catch (err) {
      this.logger.error(`[tunnel/origin] advertise send failed: ${(err as Error).message}`);
      return;
    }
    this.state = "open";
    this.attempt = 0;
    this.startHeartbeat();
    this.logger.log(
      `[tunnel/origin] connected as ${this.config.originId} ` +
        `serving ${this.config.hostnames.join(", ")}`,
    );
  }

  // ── inbound frames ───────────────────────────────────────────────

  private handleMessage(data: ArrayBuffer | Uint8Array | string): void {
    const buf = toUint8Array(data);
    if (!buf) {
      return;
    }
    let frame: Frame;
    try {
      frame = decodeFrame(buf);
    } catch (err) {
      this.logger.warn(`[tunnel/origin] decode error: ${(err as Error).message}`);
      return;
    }
    switch (frame.type) {
      case "request":
        this.handleRequest(frame);
        return;
      case "ping":
        this.replyPong(frame);
        return;
      case "pong":
        this.handlePong(frame);
        return;
      case "shutdown":
        this.logger.warn(`[tunnel/origin] edge requested shutdown: ${frame.reason}`);
        return;
      case "advertise":
      case "response":
        // Origin never receives advertise/response frames; ignore.
        return;
      default: {
        const exhaustive: never = frame;
        void exhaustive;
        return;
      }
    }
  }

  private handleRequest(req: RequestFrame): void {
    if (this.inFlight.size >= this.config.maxInFlight) {
      this.replyError(req, 503, "tunnel origin busy");
      return;
    }
    this.inFlight.add(req.id);
    void (async () => {
      try {
        const res = await forwardRequest(req, this.config.routing, this.deps.fetcher);
        this.sendIfOpen(encodeFrame(res));
      } catch (err) {
        const errFrame: ResponseFrame = {
          type: "response",
          id: req.id,
          status: 502,
          headers: { "content-type": "text/plain; charset=utf-8" },
          body: bodyToBase64(
            new TextEncoder().encode(`tunnel origin upstream error: ${(err as Error).message}`),
          ),
        };
        this.sendIfOpen(encodeFrame(errFrame));
      } finally {
        this.inFlight.delete(req.id);
      }
    })();
  }

  private replyError(req: RequestFrame, status: number, message: string): void {
    const frame: ResponseFrame = {
      type: "response",
      id: req.id,
      status,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: bodyToBase64(new TextEncoder().encode(message)),
    };
    this.sendIfOpen(encodeFrame(frame));
  }

  private replyPong(ping: PingFrame): void {
    const pong: PongFrame = {
      type: "pong",
      id: ping.id,
      timestamp: this.deps.now(),
    };
    this.sendIfOpen(encodeFrame(pong));
  }

  private handlePong(pong: PongFrame): void {
    if (this.outstandingPing && this.outstandingPing.id === pong.id) {
      this.outstandingPing = null;
      if (this.pongDeadline) {
        this.deps.clearTimeout(this.pongDeadline);
        this.pongDeadline = null;
      }
    }
  }

  // ── heartbeat ────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.cancelTimers();
    this.pingTimer = this.deps.setInterval(() => {
      this.sendPing();
    }, this.config.pingIntervalMs);
  }

  private sendPing(): void {
    if (this.state !== "open" || !this.socket) {
      return;
    }
    const id = generateRequestId();
    const ping: PingFrame = { type: "ping", id, timestamp: this.deps.now() };
    this.outstandingPing = { id, sentAt: this.deps.now() };
    this.sendIfOpen(encodeFrame(ping));
    this.pongDeadline = this.deps.setTimeout(() => {
      this.logger.warn("[tunnel/origin] pong timeout — tearing socket");
      this.outstandingPing = null;
      if (this.socket) {
        try {
          this.socket.close(4000, "pong-timeout");
        } catch {
          // ignore
        }
      }
    }, this.config.pingTimeoutMs);
  }

  // ── lifecycle ────────────────────────────────────────────────────

  private handleClose(): void {
    this.socket = null;
    this.cancelTimers();
    if (this.state === "closing" || this.state === "stopped") {
      return;
    }
    this.logger.log("[tunnel/origin] socket closed; will reconnect");
    this.state = "connecting";
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.state === "stopped") {
      return;
    }
    const delay = computeBackoffMs(this.attempt);
    this.attempt += 1;
    this.logger.log(`[tunnel/origin] reconnect in ${delay}ms (attempt ${this.attempt})`);
    this.reconnectTimer = this.deps.setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private cancelTimers(): void {
    if (this.pingTimer) {
      this.deps.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongDeadline) {
      this.deps.clearTimeout(this.pongDeadline);
      this.pongDeadline = null;
    }
    if (this.reconnectTimer) {
      this.deps.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private sendIfOpen(buf: Uint8Array<ArrayBuffer>): void {
    if (!this.socket) {
      return;
    }
    try {
      this.socket.send(buf);
    } catch (err) {
      this.logger.warn(`[tunnel/origin] send failed: ${(err as Error).message}`);
    }
  }

  private async drain(maxMs: number): Promise<void> {
    if (this.inFlight.size === 0) {
      return;
    }
    const start = this.deps.now();
    while (this.inFlight.size > 0 && this.deps.now() - start < maxMs) {
      await new Promise<void>((resolve) => {
        this.deps.setTimeout(resolve, 25);
      });
    }
    if (this.inFlight.size > 0) {
      this.logger.warn(
        `[tunnel/origin] drain timeout: ${this.inFlight.size} in-flight requests dropped`,
      );
    }
  }
}

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  return null;
}
