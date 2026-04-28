// ── Persistent Disks — Service Entrypoint ─────────────────────────────
// Wires the registry + server + driver together into a runnable Bun
// process. Other Crontech services import the named exports rather
// than spawning this process.

import { LocalLoopbackDriver, NfsDriver, type DiskDriver } from "./driver";
import { buildApp } from "./server";
import { DEFAULT_QUOTA_BYTES } from "./types";

export * from "./types";
export * from "./driver";
export * from "./registry";
export { buildApp } from "./server";
export type { BuildAppOptions, BuiltApp } from "./server";

export interface StartOptions {
  port?: number;
  hostname?: string;
  authToken?: string;
  defaultQuotaBytes?: number;
  driver?: DiskDriver;
}

export interface RunningServer {
  readonly port: number;
  readonly hostname: string;
  stop(): Promise<void>;
}

export async function startDisksControlPlane(
  opts: StartOptions = {},
): Promise<RunningServer> {
  const hostname = opts.hostname ?? process.env["DISKS_HOST"] ?? "127.0.0.1";
  const port = opts.port ?? Number(process.env["DISKS_PORT"] ?? 9300);
  const authToken =
    opts.authToken ?? process.env["DISKS_CONTROL_TOKEN"] ?? "";
  if (!authToken) {
    throw new Error(
      "DISKS_CONTROL_TOKEN is required (or pass authToken explicitly)",
    );
  }
  const quota =
    opts.defaultQuotaBytes ??
    Number(process.env["DISKS_DEFAULT_QUOTA_BYTES"] ?? DEFAULT_QUOTA_BYTES);
  const driver = opts.driver ?? buildDriverFromEnv();

  const { app } = buildApp({
    driver,
    authToken,
    defaultQuotaBytes: quota,
  });

  const bunGlobal = (globalThis as { Bun?: { serve: (cfg: unknown) => { stop: () => void; port: number } } }).Bun;
  if (!bunGlobal) {
    throw new Error("startDisksControlPlane requires the Bun runtime");
  }
  const server = bunGlobal.serve({
    hostname,
    port,
    fetch: app.fetch,
  });

  console.log(`[persistent-disks] listening on ${hostname}:${server.port}`);

  return {
    hostname,
    port: server.port,
    async stop() {
      server.stop();
    },
  };
}

function buildDriverFromEnv(): DiskDriver {
  const kind = process.env["DISKS_DRIVER"] ?? "local-loopback";
  switch (kind) {
    case "nfs": {
      const exportRoot = process.env["DISKS_NFS_EXPORT_ROOT"];
      if (!exportRoot) {
        throw new Error("DISKS_NFS_EXPORT_ROOT required for nfs driver");
      }
      return new NfsDriver({ exportRoot });
    }
    case "local-loopback": {
      const rootDir =
        process.env["DISKS_LOOPBACK_ROOT"] ?? "/var/lib/crontech/disks";
      return new LocalLoopbackDriver({ rootDir });
    }
    default:
      throw new Error(`unknown DISKS_DRIVER ${kind}`);
  }
}

if (import.meta.main) {
  startDisksControlPlane().catch((err: unknown) => {
    console.error("[persistent-disks] fatal", err);
    process.exit(1);
  });
}
