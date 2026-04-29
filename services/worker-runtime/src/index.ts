// ── Crontech Worker Runtime — v1 entrypoint ────────────────────────
// HTTP control plane for long-running customer worker processes.
//
// This is the "background worker" / "queue consumer" / "WebSocket
// daemon" service type that competitors (Render, Heroku, Fly.io) call
// out as a first-class deploy target. v1 ships:
//
//   * Worker registry (in-memory) with strict Zod-validated registration
//   * Process supervision with crash detection + exponential restart
//   * Soft-kill (SIGTERM → grace period → SIGKILL) on /stop
//   * Best-effort RSS memory enforcement (v2: cgroups)
//   * Optional wall-clock timeout for finite jobs
//   * Per-worker log ring buffer (10K lines per stream) + SSE streaming
//   * Bearer-token auth on every control-plane route
//
// Routes (all served on 127.0.0.1:${WORKER_RUNTIME_PORT ?? 9097}):
//
//   GET    /health                       — liveness probe (unauthenticated)
//   POST   /workers                      — register a new worker
//   GET    /workers                      — list workers
//   GET    /workers/:workerId            — worker detail + state
//   DELETE /workers/:workerId            — deregister (stops first)
//   POST   /workers/:workerId/start      — spawn the process
//   POST   /workers/:workerId/stop       — graceful stop
//   POST   /workers/:workerId/restart    — stop + start
//   GET    /workers/:workerId/logs       — log snapshot or SSE stream
//
// Auth: every route except `/health` requires
//   Authorization: Bearer ${WORKER_RUNTIME_TOKEN}

import { z } from "zod";
import { LogRingBuffer } from "./logs";
import {
  WorkerRegistry,
  fromRegistration,
  summarise,
  type RegistryEntry,
} from "./registry";
import { WorkerRegistrationSchema } from "./schema";
import {
  Supervisor,
  type ProcessSpawner,
  type SupervisorOptions,
  type TarballPreparer,
} from "./supervisor";
import { defaultSpawnProcess } from "./spawner";
import { defaultPrepareTarball } from "./tarball";

// ── Config ──────────────────────────────────────────────────────────

const DEFAULT_PORT = 9097;

export interface WorkerRuntimeOptions {
  hostname?: string;
  port?: number;
  token?: string;
  registry?: WorkerRegistry;
  spawn?: ProcessSpawner;
  prepare?: TarballPreparer;
  /** Forwarded to every Supervisor created here. */
  supervisorDefaults?: Pick<
    SupervisorOptions,
    "memorySampleIntervalMs" | "maxRestarts" | "timers"
  >;
  logger?: Pick<Console, "error" | "warn" | "log">;
}

export interface WorkerRuntimeServer {
  readonly hostname: string;
  readonly port: number;
  readonly registry: WorkerRegistry;
  stop(): Promise<void>;
}

// ── Auth ────────────────────────────────────────────────────────────

function requireAuth(req: Request, token: string): Response | null {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  if (header.length !== expected.length) {
    return new Response("unauthorized", { status: 401 });
  }
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0 ? null : new Response("unauthorized", { status: 401 });
}

// ── Path routing ────────────────────────────────────────────────────

type RouteKind =
  | "health"
  | "list"
  | "register"
  | "get"
  | "delete"
  | "start"
  | "stop"
  | "restart"
  | "logs"
  | "unknown";

interface ParsedRoute {
  kind: RouteKind;
  workerId?: string;
}

export function parseRoute(method: string, pathname: string): ParsedRoute {
  if (method === "GET" && pathname === "/health") return { kind: "health" };
  if (method === "GET" && pathname === "/workers") return { kind: "list" };
  if (method === "POST" && pathname === "/workers") return { kind: "register" };
  const detail = /^\/workers\/([^/]+)$/.exec(pathname);
  if (detail !== null) {
    const id = detail[1];
    if (id !== undefined) {
      if (method === "GET") return { kind: "get", workerId: id };
      if (method === "DELETE") return { kind: "delete", workerId: id };
    }
  }
  const action = /^\/workers\/([^/]+)\/(start|stop|restart)$/.exec(pathname);
  if (action !== null && method === "POST") {
    const id = action[1];
    const verb = action[2];
    if (id !== undefined && verb !== undefined) {
      return { kind: verb as "start" | "stop" | "restart", workerId: id };
    }
  }
  const logs = /^\/workers\/([^/]+)\/logs$/.exec(pathname);
  if (logs !== null && method === "GET") {
    const id = logs[1];
    if (id !== undefined) return { kind: "logs", workerId: id };
  }
  return { kind: "unknown" };
}

// ── Handlers ────────────────────────────────────────────────────────

interface RuntimeContext {
  registry: WorkerRegistry;
  spawn: ProcessSpawner;
  prepare: TarballPreparer;
  supervisorDefaults: WorkerRuntimeOptions["supervisorDefaults"];
  logger: Pick<Console, "error" | "warn" | "log">;
}

async function handleRegister(req: Request, ctx: RuntimeContext): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const parsed = WorkerRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const reg = parsed.data;
  if (ctx.registry.get(reg.workerId) !== undefined) {
    return Response.json(
      { error: "already_registered", workerId: reg.workerId },
      { status: 409 },
    );
  }
  const worker = fromRegistration(reg);
  const logs = new LogRingBuffer();
  const baseOpts: SupervisorOptions = {
    worker,
    logs,
    spawn: ctx.spawn,
    prepare: ctx.prepare,
    ...(ctx.supervisorDefaults?.memorySampleIntervalMs !== undefined
      ? { memorySampleIntervalMs: ctx.supervisorDefaults.memorySampleIntervalMs }
      : {}),
    ...(ctx.supervisorDefaults?.maxRestarts !== undefined
      ? { maxRestarts: ctx.supervisorDefaults.maxRestarts }
      : {}),
    ...(ctx.supervisorDefaults?.timers !== undefined
      ? { timers: ctx.supervisorDefaults.timers }
      : {}),
  };
  const supervisor = new Supervisor(baseOpts);
  const entry: RegistryEntry = { worker, supervisor, logs };
  ctx.registry.set(entry);
  return Response.json(summarise(entry), { status: 201 });
}

function handleGet(workerId: string, ctx: RuntimeContext): Response {
  const entry = ctx.registry.get(workerId);
  if (entry === undefined) return new Response("not found", { status: 404 });
  return Response.json(summarise(entry));
}

async function handleDelete(workerId: string, ctx: RuntimeContext): Promise<Response> {
  const entry = ctx.registry.get(workerId);
  if (entry === undefined) return new Response("not found", { status: 404 });
  await entry.supervisor.stop();
  ctx.registry.delete(workerId);
  return new Response(null, { status: 204 });
}

async function handleAction(
  kind: "start" | "stop" | "restart",
  workerId: string,
  ctx: RuntimeContext,
): Promise<Response> {
  const entry = ctx.registry.get(workerId);
  if (entry === undefined) return new Response("not found", { status: 404 });
  try {
    if (kind === "start") await entry.supervisor.start();
    else if (kind === "stop") await entry.supervisor.stop();
    else await entry.supervisor.restart();
  } catch (err) {
    const message = err instanceof Error ? err.message : `${kind} failed`;
    ctx.logger.error(`[worker-runtime] ${kind} ${workerId}: ${message}`);
    return Response.json({ error: kind, message }, { status: 500 });
  }
  return Response.json(summarise(entry));
}

function handleLogs(req: Request, workerId: string, ctx: RuntimeContext): Response {
  const entry = ctx.registry.get(workerId);
  if (entry === undefined) return new Response("not found", { status: 404 });
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  let since: number | undefined;
  if (sinceParam !== null) {
    const n = Number(sinceParam);
    if (!Number.isFinite(n) || n < 0) {
      return Response.json({ error: "invalid_since" }, { status: 400 });
    }
    since = n;
  }
  const follow = url.searchParams.get("follow") === "1";
  if (!follow) {
    const lines = entry.logs.snapshot(since);
    return Response.json({
      workerId,
      count: lines.length,
      lines,
    });
  }
  // SSE stream — send a backlog frame, then live frames per subscriber.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      for (const line of entry.logs.snapshot(since)) send(line);
      const unsub = entry.logs.subscribe((line) => {
        send(line);
      });
      const close = (): void => {
        unsub();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", close, { once: true });
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

// ── Server ──────────────────────────────────────────────────────────

export async function startWorkerRuntime(
  options: WorkerRuntimeOptions = {},
): Promise<WorkerRuntimeServer> {
  const hostname =
    options.hostname ?? process.env["WORKER_RUNTIME_HOST"] ?? "127.0.0.1";
  const port =
    options.port ?? Number(process.env["WORKER_RUNTIME_PORT"] ?? DEFAULT_PORT);
  const token = options.token ?? process.env["WORKER_RUNTIME_TOKEN"] ?? "";
  if (token.length === 0) {
    throw new Error("WORKER_RUNTIME_TOKEN must be set");
  }
  const registry = options.registry ?? new WorkerRegistry();
  const spawn = options.spawn ?? defaultSpawnProcess;
  const prepare = options.prepare ?? defaultPrepareTarball;
  const logger = options.logger ?? console;
  const ctx: RuntimeContext = {
    registry,
    spawn,
    prepare,
    supervisorDefaults: options.supervisorDefaults,
    logger,
  };

  const server = Bun.serve({
    hostname,
    port,
    fetch: async (req) => {
      const url = new URL(req.url);
      const route = parseRoute(req.method, url.pathname);

      if (route.kind === "health") {
        return Response.json({
          status: "ok",
          service: "worker-runtime",
          workers: registry.size(),
          timestamp: new Date().toISOString(),
        });
      }

      const denied = requireAuth(req, token);
      if (denied !== null) return denied;

      switch (route.kind) {
        case "list":
          return Response.json({ workers: registry.list() });
        case "register":
          return handleRegister(req, ctx);
        case "get":
          if (route.workerId === undefined) break;
          return handleGet(route.workerId, ctx);
        case "delete":
          if (route.workerId === undefined) break;
          return handleDelete(route.workerId, ctx);
        case "start":
        case "stop":
        case "restart":
          if (route.workerId === undefined) break;
          return handleAction(route.kind, route.workerId, ctx);
        case "logs":
          if (route.workerId === undefined) break;
          return handleLogs(req, route.workerId, ctx);
        case "unknown":
          break;
      }
      return new Response("not found", { status: 404 });
    },
  });

  logger.log(
    `[worker-runtime] listening on http://${server.hostname}:${server.port}`,
  );

  return {
    hostname: server.hostname ?? hostname,
    port: server.port ?? port,
    registry,
    async stop() {
      // Tear down every supervised process before closing the listener
      // so we don't leak children when the runtime exits.
      const stops: Promise<void>[] = [];
      for (const entry of registry) {
        stops.push(entry.supervisor.stop());
      }
      await Promise.allSettled(stops);
      server.stop();
      await Promise.resolve();
    },
  };
}

// ── Public re-exports ───────────────────────────────────────────────

export { LogRingBuffer, MAX_LINES_PER_STREAM } from "./logs";
export type { LogSubscriber } from "./logs";
export {
  WorkerRegistry,
  fromRegistration,
  summarise,
} from "./registry";
export type {
  RegisteredWorker,
  PublicWorkerSummary,
  RegistryEntry,
} from "./registry";
export {
  WorkerIdSchema,
  TenantIdSchema,
  WorkerLimitsSchema,
  WorkerRegistrationSchema,
  RestartPolicySchema,
  WorkerStatusSchema,
} from "./schema";
export type {
  WorkerId,
  TenantId,
  WorkerLimits,
  WorkerRegistration,
  RestartPolicy,
  WorkerStatus,
  LogStream,
  LogLine,
} from "./schema";
export {
  Supervisor,
  realTimers,
} from "./supervisor";
export type {
  ProcessSpawner,
  SupervisedProcess,
  SupervisorOptions,
  SupervisorState,
  TarballPreparer,
  TimerLike,
  SpawnArgs,
} from "./supervisor";
export { computeBackoff, BASE_BACKOFF_MS, MAX_BACKOFF_MS } from "./backoff";
export { defaultSpawnProcess } from "./spawner";
export { defaultPrepareTarball } from "./tarball";

// ── Standalone runner ───────────────────────────────────────────────

const RuntimeEnvSchema = z.object({
  WORKER_RUNTIME_HOST: z.string().min(1).optional(),
  WORKER_RUNTIME_PORT: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1).max(65535))
    .optional(),
  WORKER_RUNTIME_TOKEN: z.string().min(8),
});

if (import.meta.main) {
  const env = RuntimeEnvSchema.safeParse(process.env);
  if (!env.success) {
    console.error("[worker-runtime] env validation failed:", env.error.issues);
    process.exit(1);
  }
  const opts: WorkerRuntimeOptions = { token: env.data.WORKER_RUNTIME_TOKEN };
  if (env.data.WORKER_RUNTIME_HOST !== undefined) opts.hostname = env.data.WORKER_RUNTIME_HOST;
  if (env.data.WORKER_RUNTIME_PORT !== undefined) opts.port = env.data.WORKER_RUNTIME_PORT;
  await startWorkerRuntime(opts);
}
