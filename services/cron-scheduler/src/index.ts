// ── Crontech Cron Scheduler — entrypoint ─────────────────────────────
// Boots the registry, scheduler tick-loop and HTTP control plane.
// Importable as a module so tests / other services can embed the
// engine directly without binding a TCP port.

import { Dispatcher } from "./dispatcher";
import { JobRegistry } from "./registry";
import { Scheduler, type SchedulerEvent } from "./scheduler";
import { createApi } from "./server";

export { CronParseError, parseCron, nextFire, nextFires } from "./parser";
export type { ParsedCron } from "./parser";
export { Dispatcher, computeBackoffMs } from "./dispatcher";
export type {
  DispatchContext,
  DispatchResult,
  DispatcherOptions,
  Transport,
} from "./dispatcher";
export { JobRegistry } from "./registry";
export type {
  CreateJobInput,
  DeadLetter,
  DispatchTarget,
  DispatchTargetType,
  Job,
  JobStatus,
  RetryPolicy,
  Run,
  RunStatus,
} from "./registry";
export { Scheduler } from "./scheduler";
export type { Clock, SchedulerEvent, SchedulerOptions } from "./scheduler";
export { createApi } from "./server";
export type { ApiHandler, ServerOptions } from "./server";

export interface BootOptions {
  port?: number;
  hostname?: string;
  authToken?: string;
  tickIntervalMs?: number;
  onEvent?: (event: SchedulerEvent) => void;
}

export interface CronSchedulerService {
  readonly registry: JobRegistry;
  readonly scheduler: Scheduler;
  readonly port: number;
  stop(): Promise<void>;
}

/**
 * Boot the cron-scheduler service. Returns a handle for graceful
 * shutdown. In a Cloudflare Worker / edge deployment, callers would
 * skip this entrypoint and wire `createApi` + `Scheduler` directly.
 */
export function bootCronScheduler(
  opts: BootOptions = {},
): CronSchedulerService {
  const authToken =
    opts.authToken ?? process.env["CRON_SCHEDULER_TOKEN"] ?? "";
  if (authToken.length === 0) {
    throw new Error(
      "CRON_SCHEDULER_TOKEN is required (or pass authToken explicitly)",
    );
  }
  const registry = new JobRegistry();
  const dispatcher = new Dispatcher();
  const schedulerOpts: ConstructorParameters<typeof Scheduler>[0] = {
    registry,
    dispatcher,
    tickIntervalMs: opts.tickIntervalMs ?? 1000,
  };
  if (opts.onEvent !== undefined) schedulerOpts.onEvent = opts.onEvent;
  const scheduler = new Scheduler(schedulerOpts);
  scheduler.start();

  const api = createApi({ registry, scheduler, authToken });
  const port = opts.port ?? Number(process.env["CRON_SCHEDULER_PORT"] ?? 8787);
  const hostname =
    opts.hostname ?? process.env["CRON_SCHEDULER_HOST"] ?? "0.0.0.0";

  // biome-ignore lint/suspicious/noExplicitAny: Bun global typing varies
  const bunGlobal = (globalThis as any).Bun;
  let stopServer: () => Promise<void> = async () => {};
  if (bunGlobal && typeof bunGlobal.serve === "function") {
    const server = bunGlobal.serve({
      port,
      hostname,
      fetch: (req: Request) => api.fetch(req),
    });
    stopServer = async () => {
      server.stop();
    };
  }

  return {
    registry,
    scheduler,
    port,
    async stop() {
      await scheduler.stop();
      await stopServer();
    },
  };
}

if (import.meta.main) {
  const service = bootCronScheduler();
  console.log(`cron-scheduler listening on :${service.port}`);
  const shutdown = async (signal: string) => {
    console.log(`received ${signal}, shutting down`);
    await service.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
