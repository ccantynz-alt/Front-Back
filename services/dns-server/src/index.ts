// ── Crontech Authoritative DNS Server — entrypoint ───────────────────
// Spins up UDP + TCP listeners on port 53 (by default), wires a
// resolver backed by a ZoneStore supplied by the caller (the DB agent
// provides the real impl against Drizzle), and handles graceful
// shutdown on SIGTERM / SIGINT.
//
// This module is also importable: callers can `import { startDnsServer }
// from "@back-to-the-future/dns-server"` to embed the engine in another
// service (tests, the build-runner, etc.).

import { ResponseCache } from "./cache";
import { Metrics } from "./metrics";
import { Resolver, type ResolverOptions, type ZoneStore } from "./resolver";
import { startTcpListener, type TcpListener } from "./tcp";
import { startUdpListener, type UdpListener } from "./udp";

export { ResponseCache } from "./cache";
export { Metrics, defaultMetrics } from "./metrics";
export { Resolver, DEFAULT_TTL_SECONDS } from "./resolver";
export type { ResolveResult, ResolverOptions, ZoneStore, ZoneStoreRecord } from "./resolver";
export * from "./protocol";

export interface DnsServerOptions {
  store: ZoneStore;
  hostname?: string;
  port?: number;
  resolver?: ResolverOptions;
  cache?: ResponseCache;
  metrics?: Metrics;
  /** Disable the UDP listener (tests). */
  disableUdp?: boolean;
  /** Disable the TCP listener (tests). */
  disableTcp?: boolean;
  logger?: Pick<Console, "error" | "warn" | "log">;
}

export interface DnsServer {
  readonly hostname: string;
  readonly udpPort: number | null;
  readonly tcpPort: number | null;
  readonly metrics: Metrics;
  readonly cache: ResponseCache;
  stop(): Promise<void>;
}

export async function startDnsServer(options: DnsServerOptions): Promise<DnsServer> {
  const hostname = options.hostname ?? process.env["DNS_BIND_HOST"] ?? "0.0.0.0";
  const port = options.port ?? Number(process.env["DNS_BIND_PORT"] ?? 53);
  const cache = options.cache ?? new ResponseCache();
  const metrics = options.metrics ?? new Metrics();
  const logger = options.logger ?? console;
  const resolver = new Resolver(options.store, options.resolver ?? {});

  let udp: UdpListener | null = null;
  let tcp: TcpListener | null = null;

  if (!options.disableUdp) {
    udp = await startUdpListener({
      hostname,
      port,
      resolver,
      metrics,
      cache,
      logger,
    });
    logger.log(`[dns] UDP listening on ${hostname}:${udp.port}`);
  }

  if (!options.disableTcp) {
    tcp = startTcpListener({
      hostname,
      port,
      resolver,
      metrics,
      cache,
      logger,
    });
    logger.log(`[dns] TCP listening on ${hostname}:${tcp.port}`);
  }

  const stop = async (): Promise<void> => {
    logger.log("[dns] shutting down...");
    if (udp !== null) {
      udp.close();
      udp = null;
    }
    if (tcp !== null) {
      tcp.stop();
      tcp = null;
    }
    logger.log("[dns] stopped");
  };

  return {
    hostname,
    udpPort: udp?.port ?? null,
    tcpPort: tcp?.port ?? null,
    metrics,
    cache,
    stop,
  };
}

// ── CLI entrypoint ───────────────────────────────────────────────────
// Only runs when this file is invoked directly (bun run src/index.ts).
// A ZoneStore implementation is required; in production the build-
// runner injects one. If the module is imported, this block is skipped.

if (import.meta.main) {
  const fallbackStore: ZoneStore = {
    async findRecords(): Promise<[]> {
      return [];
    },
    async findZoneApex(): Promise<undefined> {
      return undefined;
    },
    async hasName(): Promise<boolean> {
      return false;
    },
  };

  console.warn(
    "[dns] starting with an EMPTY ZoneStore. Wire a real implementation via startDnsServer().",
  );

  const server = await startDnsServer({ store: fallbackStore });

  const shutdown = async (signal: string): Promise<void> => {
    console.info(`[dns] received ${signal}`);
    await server.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}
