// ── Crontech Edge Runtime — v1 Entrypoint ───────────────────────────
// HTTP dispatcher for self-hosted, V8-Realm edge execution.
//
// v1 ships:
//   * Per-request V8 Realm via `node:vm` Contexts (see isolate.ts)
//   * Web Standards `fetch` handler (`export default { fetch }` and
//     `addEventListener("fetch", ...)`)
//   * Per-tenant env + secret injection on `globalThis.env`
//   * Per-request time + memory limits (default 30s / 128MB)
//   * Per-request console capture for log streaming
//   * Compiled-bundle cache keyed by content hash (sub-ms warm path)
//
// Routes (all served on 127.0.0.1:${EDGE_RUNTIME_PORT ?? 9096}):
//
//   POST   /admin/bundles        — register/replace a bundle
//   GET    /admin/bundles        — list registered bundles
//   DELETE /admin/bundles/:id    — remove a bundle
//   *      /run/:id/*            — dispatch the request to the bundle
//   GET    /health               — liveness probe (unauthenticated)
//
// Auth: every `/admin/*` and `/run/*` request must present
//   `Authorization: Bearer ${EDGE_RUNTIME_SECRET}`
// in v1. The deploy agent and the local dev tooling are the only
// expected clients; multi-tenant per-bundle bearer auth lands in v2.

import { z } from "zod";
import { computeBundleHash } from "./dispatch";
import {
  type WorkerSpawner,
  defaultSpawnWorker,
  invokeBundle,
} from "./invoke";
import { type IsolateInvokeResult } from "./isolate";
import { DEFAULT_LIMITS } from "./limits";
import {
  BundleRegistry,
  BundleSchema,
  type RegisteredBundle,
  withDefaultLimits,
} from "./registry";

// ── Configuration ────────────────────────────────────────────────────

const DEFAULT_PORT = 9096;
const DEFAULT_INVOKE_TIMEOUT_MS = 5_000;

export interface EdgeRuntimeOptions {
  hostname?: string;
  port?: number;
  secret?: string;
  registry?: BundleRegistry;
  /** Hard timeout per legacy-worker invocation. Defaults to 5s. */
  invokeTimeoutMs?: number;
  /**
   * Worker spawner (legacy v0 path). When set, dispatch routes through
   * Bun Workers — kept so existing tests with mocked workers continue
   * to pass. When omitted, the v1 V8-Realm isolate path is used.
   */
  spawnWorker?: WorkerSpawner;
  /**
   * Force the legacy Bun-Worker path even without a custom spawner.
   * Defaults to `false` — production traffic goes through the isolate.
   */
  useLegacyWorker?: boolean;
  /** Receives per-invocation logs (production: forward to Loki). */
  onInvocation?: (event: InvocationEvent) => void;
  logger?: Pick<Console, "error" | "warn" | "log">;
}

export interface InvocationEvent {
  readonly bundleId: string;
  readonly result: IsolateInvokeResult;
}

export interface EdgeRuntimeServer {
  readonly hostname: string;
  readonly port: number;
  readonly registry: BundleRegistry;
  stop(): Promise<void>;
}

// ── Auth ─────────────────────────────────────────────────────────────

function requireAuth(req: Request, secret: string): Response | null {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) {
    return new Response("unauthorized", { status: 401 });
  }
  // Constant-time-ish comparison; both strings are the same length here.
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0 ? null : new Response("unauthorized", { status: 401 });
}

// ── Path routing ────────────────────────────────────────────────────

interface ParsedPath {
  kind: "health" | "list" | "upsert" | "delete" | "run" | "unknown";
  bundleId?: string;
}

export function parsePath(method: string, pathname: string): ParsedPath {
  if (method === "GET" && pathname === "/health") return { kind: "health" };
  if (method === "GET" && pathname === "/admin/bundles") return { kind: "list" };
  if (method === "POST" && pathname === "/admin/bundles") return { kind: "upsert" };
  const del = /^\/admin\/bundles\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && del) {
    const id = del[1];
    if (id !== undefined) return { kind: "delete", bundleId: id };
  }
  const run = /^\/run\/([^/]+)(?:\/.*)?$/.exec(pathname);
  if (run) {
    const id = run[1];
    if (id !== undefined) return { kind: "run", bundleId: id };
  }
  return { kind: "unknown" };
}

// ── Admin handlers ──────────────────────────────────────────────────

async function handleUpsert(
  req: Request,
  registry: BundleRegistry,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const parsed = BundleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { id, code, entrypoint, env, secrets, limits } = parsed.data;
  const hash = computeBundleHash({ id, entrypoint, code });
  const bundle: RegisteredBundle = {
    id,
    code,
    entrypoint,
    hash,
    registeredAt: Date.now(),
    env,
    secrets,
    limits: withDefaultLimits(limits),
  };
  registry.set(bundle);
  return Response.json(
    {
      id: bundle.id,
      entrypoint: bundle.entrypoint,
      hash: bundle.hash,
      registeredAt: bundle.registeredAt,
      codeBytes: bundle.code.length,
      envKeys: Object.keys(bundle.env).sort(),
      secretKeys: Object.keys(bundle.secrets).sort(),
      limits: bundle.limits,
    },
    { status: 201 },
  );
}

// ── Server ───────────────────────────────────────────────────────────

export async function startEdgeRuntime(
  options: EdgeRuntimeOptions = {},
): Promise<EdgeRuntimeServer> {
  const hostname = options.hostname ?? process.env["EDGE_RUNTIME_HOST"] ?? "127.0.0.1";
  const port = options.port ?? Number(process.env["EDGE_RUNTIME_PORT"] ?? DEFAULT_PORT);
  const secret = options.secret ?? process.env["EDGE_RUNTIME_SECRET"] ?? "";
  if (secret.length === 0) {
    throw new Error("EDGE_RUNTIME_SECRET must be set");
  }
  const registry = options.registry ?? new BundleRegistry();
  const timeoutMs = options.invokeTimeoutMs ?? DEFAULT_INVOKE_TIMEOUT_MS;
  const useLegacy = options.useLegacyWorker === true || options.spawnWorker !== undefined;
  const spawn: WorkerSpawner | undefined = useLegacy
    ? options.spawnWorker ?? defaultSpawnWorker
    : undefined;
  const logger = options.logger ?? console;
  const onInvocation = options.onInvocation;

  const server = Bun.serve({
    hostname,
    port,
    fetch: async (req) => {
      const url = new URL(req.url);
      const route = parsePath(req.method, url.pathname);

      if (route.kind === "health") {
        return Response.json({
          status: "ok",
          service: "edge-runtime",
          mode: useLegacy ? "legacy-worker" : "v8-realm",
          bundles: registry.size(),
          defaultLimits: DEFAULT_LIMITS,
          timestamp: new Date().toISOString(),
        });
      }

      // All other routes require auth.
      const denied = requireAuth(req, secret);
      if (denied !== null) return denied;

      if (route.kind === "list") {
        return Response.json({ bundles: registry.list() });
      }

      if (route.kind === "upsert") {
        return handleUpsert(req, registry);
      }

      if (route.kind === "delete" && route.bundleId !== undefined) {
        const removed = registry.delete(route.bundleId);
        if (!removed) return new Response("not found", { status: 404 });
        return new Response(null, { status: 204 });
      }

      if (route.kind === "run" && route.bundleId !== undefined) {
        const bundle = registry.get(route.bundleId);
        if (bundle === undefined) return new Response("bundle not found", { status: 404 });
        try {
          const args: Parameters<typeof invokeBundle>[0] = {
            bundle,
            request: req,
            timeoutMs,
          };
          if (spawn !== undefined) args.spawn = spawn;
          if (onInvocation !== undefined) {
            args.onLogs = (result): void => onInvocation({ bundleId: bundle.id, result });
          }
          return await invokeBundle(args);
        } catch (err) {
          const message = err instanceof Error ? err.message : "dispatch failed";
          logger.error(`[edge-runtime] dispatch error for ${bundle.id}: ${message}`);
          return new Response("internal error", { status: 500 });
        }
      }

      return new Response("not found", { status: 404 });
    },
  });

  logger.log(
    `[edge-runtime] listening on http://${server.hostname}:${server.port} ` +
      `mode=${useLegacy ? "legacy-worker" : "v8-realm"} timeout=${timeoutMs}ms`,
  );

  return {
    hostname: server.hostname ?? hostname,
    port: server.port ?? port,
    registry,
    async stop() {
      server.stop();
      await Promise.resolve();
    },
  };
}

// ── Public re-exports ───────────────────────────────────────────────

export { BundleRegistry, BundleSchema, BundleIdSchema, withDefaultLimits } from "./registry";
export type {
  BundleId,
  BundleInput,
  RegisteredBundle,
  PublicBundleSummary,
} from "./registry";
export { computeBundleHash } from "./dispatch";
export type { RuntimeWorker, WorkerSpawner } from "./invoke";
export { invokeIsolate, clearCompiledCache } from "./isolate";
export type { IsolateInvokeArgs, IsolateInvokeResult } from "./isolate";
export { DEFAULT_LIMITS, runWithLimits } from "./limits";
export type { InvocationLimits, LimitOutcome } from "./limits";
export { ConsoleCapture } from "./console-capture";
export type { CapturedLogLine, ConsoleCaptureSnapshot } from "./console-capture";

// ── Standalone runner ───────────────────────────────────────────────
// Validate env up-front with Zod when this file is the entrypoint, so
// misconfiguration fails the boot loud.

const RuntimeEnvSchema = z.object({
  EDGE_RUNTIME_HOST: z.string().min(1).optional(),
  EDGE_RUNTIME_PORT: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1).max(65535))
    .optional(),
  EDGE_RUNTIME_SECRET: z.string().min(8),
  EDGE_RUNTIME_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .pipe(z.number().int().min(100).max(60_000))
    .optional(),
});

if (import.meta.main) {
  const env = RuntimeEnvSchema.safeParse(process.env);
  if (!env.success) {
    console.error("[edge-runtime] env validation failed:", env.error.issues);
    process.exit(1);
  }
  const opts: EdgeRuntimeOptions = { secret: env.data.EDGE_RUNTIME_SECRET };
  if (env.data.EDGE_RUNTIME_HOST !== undefined) opts.hostname = env.data.EDGE_RUNTIME_HOST;
  if (env.data.EDGE_RUNTIME_PORT !== undefined) opts.port = env.data.EDGE_RUNTIME_PORT;
  if (env.data.EDGE_RUNTIME_TIMEOUT_MS !== undefined)
    opts.invokeTimeoutMs = env.data.EDGE_RUNTIME_TIMEOUT_MS;
  await startEdgeRuntime(opts);
}
