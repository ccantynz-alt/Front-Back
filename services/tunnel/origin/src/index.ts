// ── Reverse-tunnel origin daemon — runtime entrypoint ──────────────
//
// Reads configuration from the environment, wires up real timers and
// the platform `fetch` implementation, installs SIGTERM/SIGINT
// handlers for graceful shutdown, and starts the daemon.
//
// Run with: `bun run start:origin`
// ─────────────────────────────────────────────────────────────────────

import { OriginDaemon, type OriginDaemonConfig, type TunnelLogger, DEFAULT_CONFIG } from "./daemon";
import { DEFAULT_ROUTING, type RoutingConfig, type RouteRule } from "./routing";

export { OriginDaemon, DEFAULT_CONFIG } from "./daemon";
export {
  DEFAULT_ROUTING,
  buildLocalUrl,
  extractPath,
  resolveLocalPort,
  type RouteRule,
  type RoutingConfig,
} from "./routing";
export { computeBackoffMs, computeBaseBackoffMs, INITIAL_BACKOFF_MS, MAX_BACKOFF_MS } from "./backoff";
export { forwardRequest, type LocalFetcher } from "./forward";

function loadConfigFromEnv(): OriginDaemonConfig {
  const env = (k: string): string | undefined => process.env[k];
  const required = (k: string): string => {
    const v = env(k);
    if (!v) {
      throw new Error(`${k} is required`);
    }
    return v;
  };
  const edgeUrl = required("TUNNEL_EDGE_URL");
  const sharedSecret = required("TUNNEL_SHARED_SECRET");
  const originId = env("TUNNEL_ORIGIN_ID") ?? `origin-${process.pid}`;

  // Hostnames: comma-separated list. Single TUNNEL_HOSTNAME accepted
  // for backwards compatibility with v0.
  const rawHostnames = env("TUNNEL_HOSTNAMES") ?? env("TUNNEL_HOSTNAME");
  if (!rawHostnames) {
    throw new Error("TUNNEL_HOSTNAMES (or legacy TUNNEL_HOSTNAME) is required");
  }
  const hostnames = rawHostnames
    .split(",")
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
  if (hostnames.length === 0) {
    throw new Error("TUNNEL_HOSTNAMES resolved to an empty list");
  }

  const routing: RoutingConfig = parseRoutingFromEnv() ?? DEFAULT_ROUTING;

  const pingIntervalMs = parsePositiveInt("TUNNEL_PING_INTERVAL_MS", DEFAULT_CONFIG.pingIntervalMs);
  const pingTimeoutMs = parsePositiveInt("TUNNEL_PING_TIMEOUT_MS", DEFAULT_CONFIG.pingTimeoutMs);
  const maxInFlight = parsePositiveInt("TUNNEL_MAX_INFLIGHT", DEFAULT_CONFIG.maxInFlight);
  const drainMs = parsePositiveInt("TUNNEL_DRAIN_MS", DEFAULT_CONFIG.drainMs);

  return {
    edgeUrl,
    sharedSecret,
    originId,
    hostnames,
    routing,
    pingIntervalMs,
    pingTimeoutMs,
    maxInFlight,
    drainMs,
  };
}

function parsePositiveInt(name: string, fallback: number): number {
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

function parseRoutingFromEnv(): RoutingConfig | null {
  // Optional override:
  //   TUNNEL_ROUTES="/api:3001,/trpc:3001,/healthz:3001"
  //   TUNNEL_DEFAULT_PORT=3000
  const raw = process.env["TUNNEL_ROUTES"];
  const defaultPortRaw = process.env["TUNNEL_DEFAULT_PORT"];
  if (!raw && !defaultPortRaw) {
    return null;
  }
  const defaultPort = defaultPortRaw ? Number(defaultPortRaw) : 3000;
  if (!Number.isInteger(defaultPort) || defaultPort <= 0) {
    throw new Error(`TUNNEL_DEFAULT_PORT must be a positive integer, got ${defaultPortRaw}`);
  }
  const rules: RouteRule[] = [];
  if (raw) {
    for (const entry of raw.split(",")) {
      const [prefix, portStr] = entry.split(":");
      if (!prefix || !portStr) {
        throw new Error(`TUNNEL_ROUTES entry malformed: ${entry}`);
      }
      const port = Number(portStr);
      if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`TUNNEL_ROUTES port must be a positive integer: ${entry}`);
      }
      rules.push({ pathPrefix: prefix.trim(), port });
    }
  }
  return { rules, defaultPort };
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

if (import.meta.main) {
  const config = loadConfigFromEnv();
  const logger = makeStdLogger();
  const daemon = new OriginDaemon(config, {
    openSocket: (url) => {
      const ws = new WebSocket(url);
      // The Bun/browser WebSocket type does not exactly match SocketLike
      // because of the `data` event shape; we wrap it minimally.
      return {
        get binaryType() {
          return ws.binaryType as "arraybuffer" | "blob";
        },
        set binaryType(v) {
          ws.binaryType = v;
        },
        send: (data) => ws.send(data),
        close: (code, reason) => ws.close(code, reason),
        addEventListener: (type, listener) => {
          if (type === "message") {
            ws.addEventListener("message", (ev) => {
              (listener as (e: { data: ArrayBuffer | Uint8Array | string }) => void)({
                data: ev.data as ArrayBuffer | Uint8Array | string,
              });
            });
            return;
          }
          ws.addEventListener(type, listener as EventListener);
        },
      };
    },
    fetcher: (url, init) => fetch(url, init),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    now: () => Date.now(),
    logger,
  });

  const shutdown = (signal: string): void => {
    logger.log(`[tunnel/origin] received ${signal}, shutting down`);
    void daemon.stop(`origin received ${signal}`).then(() => {
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  daemon.start();
  logger.log(
    `[tunnel/origin] started; serving ${config.hostnames.join(", ")} via ${config.edgeUrl}`,
  );
}
