// ── Reverse-tunnel edge daemon — runtime entrypoint ────────────────
//
// Reads configuration from the environment, starts the Bun control
// (WebSocket) and public (HTTP) servers, registers the registry,
// installs SIGTERM/SIGINT handlers.
//
// Run with: `bun run start:edge`
// ─────────────────────────────────────────────────────────────────────

import { acceptConnection, type ConnectionHandle, type TunnelLogger } from "./daemon";
import { OriginRegistry } from "./registry";
import { forwardThroughOrigin } from "./forward";

export {
  type ConnectionHandle,
  type TunnelLogger,
  type SocketSink,
  type AcceptOptions,
  acceptConnection,
} from "./daemon";
export {
  OriginRegistry,
  type OriginConnection,
  type PendingRequest,
} from "./registry";
export {
  DEFAULT_REQUEST_TIMEOUT_MS,
  type ForwardOptions,
  forwardThroughOrigin,
} from "./forward";
export { verifyHandshake, type AcceptResult } from "./accept";

interface EdgeConfig {
  readonly sharedSecret: string;
  readonly controlPort: number;
  readonly publicPort: number;
  readonly bindHostname: string;
}

function loadConfigFromEnv(): EdgeConfig {
  const sharedSecret = process.env["TUNNEL_SHARED_SECRET"];
  if (!sharedSecret) {
    throw new Error("TUNNEL_SHARED_SECRET is required");
  }
  const controlPort = parsePort("TUNNEL_EDGE_CONTROL_PORT", 9094);
  const publicPort = parsePort("TUNNEL_EDGE_PUBLIC_PORT", 9095);
  const bindHostname = process.env["TUNNEL_EDGE_HOSTNAME"] ?? "0.0.0.0";
  return { sharedSecret, controlPort, publicPort, bindHostname };
}

function parsePort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got ${raw}`);
  }
  return n;
}

function makeStdLogger(): TunnelLogger {
  return {
    log: (msg) => {
      process.stdout.write(`${msg}\n`);
    },
    warn: (msg) => {
      process.stderr.write(`${msg}\n`);
    },
    error: (msg) => {
      process.stderr.write(`${msg}\n`);
    },
  };
}

interface BunWsContext {
  handle: ConnectionHandle | null;
}

if (import.meta.main) {
  const config = loadConfigFromEnv();
  const logger = makeStdLogger();
  const registry = new OriginRegistry();

  // Use a dynamic require so this module remains importable on Node
  // (where `Bun.serve` is undefined). At runtime the daemon is only
  // ever booted under Bun, where the global is available.
  const bunGlobal = (globalThis as unknown as { Bun?: typeof Bun }).Bun;
  if (!bunGlobal) {
    throw new Error("edge daemon must be run under Bun (Bun.serve is required)");
  }

  // Control plane: origin handshakes.
  bunGlobal.serve<BunWsContext, never>({
    port: config.controlPort,
    hostname: config.bindHostname,
    fetch(req, server) {
      const ctx: BunWsContext = { handle: null };
      const ok = server.upgrade(req, { data: ctx });
      if (ok) {
        return undefined;
      }
      return new Response("upgrade required", { status: 426 });
    },
    websocket: {
      open(ws) {
        ws.binaryType = "arraybuffer";
        const handle = acceptConnection(
          {
            send: (buf) => {
              ws.send(buf);
            },
            close: (code, reason) => {
              ws.close(code, reason);
            },
          },
          { registry, sharedSecret: config.sharedSecret, logger },
        );
        ws.data.handle = handle;
      },
      message(ws, message) {
        const buf = normaliseInbound(message);
        if (!buf) {
          return;
        }
        const handle = ws.data.handle;
        if (!handle) {
          return;
        }
        void handle.onFrame(buf);
      },
      close(ws) {
        ws.data.handle?.onClose();
      },
    },
  });

  // Public plane: inbound HTTP.
  bunGlobal.serve({
    port: config.publicPort,
    hostname: "0.0.0.0",
    async fetch(req) {
      return forwardThroughOrigin(req, registry);
    },
  });

  logger.log(
    `[tunnel/edge] control on :${config.controlPort}, public on :${config.publicPort}`,
  );

  const shutdown = (signal: string): void => {
    logger.log(`[tunnel/edge] received ${signal}, exiting`);
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
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
