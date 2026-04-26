// ── Reverse-tunnel: edge daemon ──────────────────────────────────────
//
// Runs on the Crontech edge runtime (BLK-017). Accepts persistent
// WebSocket connections from origin daemons and exposes a public
// HTTP listener that forwards inbound traffic to the matching origin
// over the tunnel.
//
// Two listeners share this process:
//   - `TUNNEL_EDGE_CONTROL_PORT` (default 9094) — origin daemons
//     register here. Authentication happens via the
//     `Sec-WebSocket-Protocol` field carrying
//     `crontech-tunnel.v1.<shared-secret>.<hostname>`.
//   - `TUNNEL_EDGE_PUBLIC_PORT`  (default 9095) — inbound HTTP from
//     the public network (typically fronted by Caddy for TLS).
//
// The split keeps origin handshakes off the public surface: only the
// public port faces the internet.
// ─────────────────────────────────────────────────────────────────────

import {
  type RequestFrame,
  type ResponseFrame,
  bodyFromBase64,
  bodyToBase64,
  decodeResponse,
  encodeRequest,
  generateRequestId,
} from "./frame";
import { timingSafeEqual } from "./auth";

// ── Sub-protocol parsing ────────────────────────────────────────────

const PROTOCOL_PREFIX = "crontech-tunnel.v1.";

export interface ProtocolClaims {
  readonly secret: string;
  readonly hostname: string;
}

/**
 * Parse the `Sec-WebSocket-Protocol` value an origin presents at
 * upgrade. Returns the claimed shared secret and hostname, or null
 * if the format is wrong. Always pure — no I/O.
 */
export function parseProtocol(value: string | null | undefined): ProtocolClaims | null {
  if (!value) {
    return null;
  }
  if (!value.startsWith(PROTOCOL_PREFIX)) {
    return null;
  }
  const rest = value.slice(PROTOCOL_PREFIX.length);
  const dotIdx = rest.indexOf(".");
  if (dotIdx <= 0 || dotIdx === rest.length - 1) {
    return null;
  }
  const secret = rest.slice(0, dotIdx);
  const hostname = rest.slice(dotIdx + 1);
  if (secret.length === 0 || hostname.length === 0) {
    return null;
  }
  return { secret, hostname };
}

/**
 * Authenticate a parsed protocol claim. Constant-time comparison.
 */
export function authenticateProtocol(
  claims: ProtocolClaims | null,
  expectedSecret: string,
): boolean {
  if (!claims) {
    return false;
  }
  if (expectedSecret.length === 0) {
    return false;
  }
  return timingSafeEqual(claims.secret, expectedSecret);
}

// ── Origin connection registry ──────────────────────────────────────
//
// Tracks live origin WebSocket connections by hostname. v0 supports a
// single origin per hostname — a second origin claiming the same
// hostname displaces the first. Multi-origin failover is BLK-019 v1.

export interface OriginConnection {
  /** Send a binary frame to this origin. */
  send(buf: Uint8Array): void;
  /** Mark the connection as closed. Used by the registry on drop. */
  close(): void;
  /** Stable identifier for diagnostics. */
  readonly id: string;
}

export interface PendingRequest {
  resolve(res: ResponseFrame): void;
  reject(err: Error): void;
}

export class OriginRegistry {
  private readonly connections = new Map<string, OriginConnection>();
  private readonly pending = new Map<string, PendingRequest>();

  register(hostname: string, conn: OriginConnection): void {
    const previous = this.connections.get(hostname);
    if (previous && previous.id !== conn.id) {
      previous.close();
    }
    this.connections.set(hostname, conn);
  }

  unregister(hostname: string, conn: OriginConnection): void {
    const current = this.connections.get(hostname);
    if (current && current.id === conn.id) {
      this.connections.delete(hostname);
    }
  }

  get(hostname: string): OriginConnection | undefined {
    return this.connections.get(hostname);
  }

  size(): number {
    return this.connections.size;
  }

  trackPending(id: string, pending: PendingRequest): void {
    this.pending.set(id, pending);
  }

  resolvePending(id: string, res: ResponseFrame): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }
    this.pending.delete(id);
    entry.resolve(res);
    return true;
  }

  rejectPending(id: string, err: Error): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }
    this.pending.delete(id);
    entry.reject(err);
    return true;
  }

  pendingCount(): number {
    return this.pending.size;
  }
}

// ── Request forwarding ──────────────────────────────────────────────

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface ForwardOptions {
  readonly timeoutMs?: number;
}

/**
 * Forward an inbound HTTP request through the matching origin
 * connection and await the response frame. Returns a Web Response.
 *
 * Pure with respect to the registry — the registry is the only side
 * effect, which makes this easy to test with a fake origin connection.
 */
export async function forwardThroughOrigin(
  request: Request,
  registry: OriginRegistry,
  options: ForwardOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const conn = registry.get(host);
  if (!conn) {
    return new Response(`no origin registered for ${host}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const id = generateRequestId();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const bodyBuf = new Uint8Array(await request.arrayBuffer());
  const frame: RequestFrame = {
    type: "request",
    id,
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers,
    body: bodyToBase64(bodyBuf),
  };

  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const responsePromise = new Promise<ResponseFrame>((resolve, reject) => {
    registry.trackPending(id, { resolve, reject });
    const timer = setTimeout(() => {
      if (registry.rejectPending(id, new Error("origin response timeout"))) {
        // marker — no extra work
      }
    }, timeoutMs);
    // Best-effort cleanup if Bun supports `unref`
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      const maybeUnref = (timer as { unref?: () => void }).unref;
      if (typeof maybeUnref === "function") {
        maybeUnref.call(timer);
      }
    }
  });

  conn.send(encodeRequest(frame));

  try {
    const responseFrame = await responsePromise;
    return new Response(bodyFromBase64(responseFrame.body), {
      status: responseFrame.status,
      headers: responseFrame.headers,
    });
  } catch (err) {
    return new Response(`tunnel error: ${(err as Error).message}`, {
      status: 504,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

// ── Daemon (runtime entrypoint) ─────────────────────────────────────

interface EdgeConfig {
  readonly sharedSecret: string;
  readonly controlPort: number;
  readonly publicPort: number;
}

function loadConfig(): EdgeConfig {
  const sharedSecret = process.env["TUNNEL_SHARED_SECRET"];
  if (!sharedSecret) {
    throw new Error("TUNNEL_SHARED_SECRET is required");
  }
  const controlPort = Number(process.env["TUNNEL_EDGE_CONTROL_PORT"] ?? "9094");
  const publicPort = Number(process.env["TUNNEL_EDGE_PUBLIC_PORT"] ?? "9095");
  if (!Number.isInteger(controlPort) || controlPort <= 0) {
    throw new Error(`TUNNEL_EDGE_CONTROL_PORT must be a positive integer, got ${controlPort}`);
  }
  if (!Number.isInteger(publicPort) || publicPort <= 0) {
    throw new Error(`TUNNEL_EDGE_PUBLIC_PORT must be a positive integer, got ${publicPort}`);
  }
  return { sharedSecret, controlPort, publicPort };
}

interface BunWsContext {
  hostname: string;
  conn: OriginConnection;
}

function startServers(config: EdgeConfig, registry: OriginRegistry): void {
  // Control plane: origin WebSocket registrations.
  Bun.serve<BunWsContext, never>({
    port: config.controlPort,
    hostname: process.env["TUNNEL_EDGE_HOSTNAME"] ?? "0.0.0.0",
    fetch(req, server) {
      const protocolHeader = req.headers.get("sec-websocket-protocol");
      const claims = parseProtocol(protocolHeader);
      if (!authenticateProtocol(claims, config.sharedSecret)) {
        return new Response("unauthorized", { status: 401 });
      }
      // Non-null after authenticateProtocol — but narrow explicitly.
      if (!claims) {
        return new Response("unauthorized", { status: 401 });
      }
      const id = generateRequestId();
      const ctx: BunWsContext = {
        hostname: claims.hostname,
        conn: { id, send: () => undefined, close: () => undefined },
      };
      const ok = server.upgrade(req, {
        data: ctx,
        headers: { "sec-websocket-protocol": protocolHeader ?? "" },
      });
      if (ok) {
        return undefined;
      }
      return new Response("upgrade required", { status: 426 });
    },
    websocket: {
      open(ws) {
        const ctx = ws.data;
        const conn: OriginConnection = {
          id: ctx.conn.id,
          send: (buf) => {
            ws.send(buf);
          },
          close: () => {
            ws.close();
          },
        };
        ctx.conn = conn;
        registry.register(ctx.hostname, conn);
        console.log(
          `[tunnel/edge] origin connected: hostname=${ctx.hostname} id=${conn.id} ` +
            `total=${registry.size()}`,
        );
      },
      message(_ws, message) {
        const buf = normaliseInbound(message);
        if (!buf) {
          return;
        }
        let frame: ResponseFrame;
        try {
          frame = decodeResponse(buf);
        } catch (err) {
          console.warn(`[tunnel/edge] decode error: ${(err as Error).message}`);
          return;
        }
        registry.resolvePending(frame.id, frame);
      },
      close(ws) {
        const ctx = ws.data;
        registry.unregister(ctx.hostname, ctx.conn);
        console.log(
          `[tunnel/edge] origin disconnected: hostname=${ctx.hostname} id=${ctx.conn.id} ` +
            `total=${registry.size()}`,
        );
      },
    },
  });

  // Public plane: inbound HTTP requests routed through the tunnel.
  Bun.serve({
    port: config.publicPort,
    hostname: "0.0.0.0",
    async fetch(req) {
      return forwardThroughOrigin(req, registry);
    },
  });

  console.log(
    `[tunnel/edge] control on :${config.controlPort}, public on :${config.publicPort}`,
  );
}

function normaliseInbound(data: string | Buffer | Uint8Array | ArrayBuffer): Uint8Array | null {
  if (typeof data === "string") {
    // Strings are not valid frames in v0.
    return null;
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  // Bun.Buffer extends Uint8Array, so the Uint8Array check above
  // already covers Buffer instances. Anything else is unexpected.
  return null;
}

// ── Entrypoint ──────────────────────────────────────────────────────

if (import.meta.main) {
  const config = loadConfig();
  const registry = new OriginRegistry();
  startServers(config, registry);
}
