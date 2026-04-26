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

import { type ResponseFrame, decodeResponse, generateRequestId } from "./frame";
import {
  type OriginConnection,
  OriginRegistry,
  authenticateProtocol,
  parseProtocol,
} from "./registry";
import { forwardThroughOrigin } from "./forward";

// Re-exports preserve the public surface for tests + downstream callers.
export {
  authenticateProtocol,
  parseProtocol,
  type ProtocolClaims,
  type OriginConnection,
  type PendingRequest,
  OriginRegistry,
} from "./registry";
export {
  DEFAULT_REQUEST_TIMEOUT_MS,
  type ForwardOptions,
  forwardThroughOrigin,
} from "./forward";

// ── Logger surface ──────────────────────────────────────────────────

export interface TunnelLogger {
  log(msg: string): void;
  warn(msg: string): void;
}

// ── Daemon configuration ────────────────────────────────────────────

interface EdgeConfig {
  readonly sharedSecret: string;
  readonly controlPort: number;
  readonly publicPort: number;
  readonly bindHostname: string;
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
  const bindHostname = process.env["TUNNEL_EDGE_HOSTNAME"] ?? "0.0.0.0";
  return { sharedSecret, controlPort, publicPort, bindHostname };
}

// ── WebSocket server scaffolding ────────────────────────────────────

interface BunWsContext {
  hostname: string;
  conn: OriginConnection;
}

function startServers(
  config: EdgeConfig,
  registry: OriginRegistry,
  logger: TunnelLogger,
): void {
  // Control plane: origin WebSocket registrations.
  Bun.serve<BunWsContext, never>({
    port: config.controlPort,
    hostname: config.bindHostname,
    fetch(req, server) {
      const protocolHeader = req.headers.get("sec-websocket-protocol");
      const claims = parseProtocol(protocolHeader);
      if (!authenticateProtocol(claims, config.sharedSecret) || !claims) {
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
        logger.log(
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
          logger.warn(`[tunnel/edge] decode error: ${(err as Error).message}`);
          return;
        }
        registry.resolvePending(frame.id, frame);
      },
      close(ws) {
        const ctx = ws.data;
        registry.unregister(ctx.hostname, ctx.conn);
        logger.log(
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

  logger.log(
    `[tunnel/edge] control on :${config.controlPort}, public on :${config.publicPort}`,
  );
}

function normaliseInbound(
  data: string | Buffer | Uint8Array | ArrayBuffer,
): Uint8Array | null {
  if (typeof data === "string") {
    return null;
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return null;
}

// ── Entrypoint ──────────────────────────────────────────────────────

if (import.meta.main) {
  const config = loadConfig();
  const registry = new OriginRegistry();
  const logger: TunnelLogger = {
    log: (msg) => {
      process.stdout.write(`${msg}\n`);
    },
    warn: (msg) => {
      process.stderr.write(`${msg}\n`);
    },
  };
  startServers(config, registry, logger);
}
