// ── Crontech Edge Runtime — v0 Entrypoint ───────────────────────────
// HTTP dispatcher for self-hosted, V8-isolate-style edge execution.
// v0 implementation — Bun Worker threads stand in for true V8 isolates.
// See `docs/EDGE_RUNTIME_V0.md` for the architecture, the v0/v1 split,
// and the isolation trade-off.
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
// in v0. The deploy agent and the local dev tooling are the only
// expected clients; multi-tenant auth lands in v1.

import { z } from "zod";
import {
  type WorkerMessage,
  type WorkerReply,
  WorkerReplySchema,
  computeBundleHash,
  serialiseRequest,
} from "./dispatch";
import { BundleRegistry, BundleSchema, type RegisteredBundle } from "./registry";

// ── Configuration ────────────────────────────────────────────────────

const DEFAULT_PORT = 9096;
const DEFAULT_INVOKE_TIMEOUT_MS = 5_000;

export interface EdgeRuntimeOptions {
  hostname?: string;
  port?: number;
  secret?: string;
  registry?: BundleRegistry;
  /** Hard timeout per invocation. Defaults to 5s. */
  invokeTimeoutMs?: number;
  /**
   * Worker spawner. The default uses real Bun Workers loading
   * `worker-host.ts`. Tests inject a mock so suites stay fast and
   * deterministic.
   */
  spawnWorker?: WorkerSpawner;
  logger?: Pick<Console, "error" | "warn" | "log">;
}

export interface EdgeRuntimeServer {
  readonly hostname: string;
  readonly port: number;
  readonly registry: BundleRegistry;
  stop(): Promise<void>;
}

export interface RuntimeWorker {
  postMessage(msg: WorkerMessage): void;
  onMessage(handler: (reply: WorkerReply) => void): void;
  terminate(): Promise<void> | void;
}

export type WorkerSpawner = () => RuntimeWorker;

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

// ── Admin schemas ────────────────────────────────────────────────────

const AdminBundleInputSchema = BundleSchema;

// ── Worker spawning (default impl) ──────────────────────────────────

function defaultSpawnWorker(): RuntimeWorker {
  // Bun's Worker constructor is the only place we touch the actual
  // runtime sandbox. Everything else stays pure / mockable.
  const url = new URL("./worker-host.ts", import.meta.url);
  const worker = new Worker(url.href, { type: "module" });
  let listener: ((reply: WorkerReply) => void) | null = null;
  worker.onmessage = (ev: MessageEvent<unknown>): void => {
    if (listener === null) return;
    const parsed = WorkerReplySchema.safeParse(ev.data);
    if (!parsed.success) {
      listener({ type: "error", message: `invalid worker reply: ${parsed.error.message}` });
      return;
    }
    listener(parsed.data);
  };
  return {
    postMessage(msg) {
      worker.postMessage(msg);
    },
    onMessage(handler) {
      listener = handler;
    },
    terminate() {
      worker.terminate();
    },
  };
}

// ── Per-invocation worker lifecycle ─────────────────────────────────

interface InvokeArgs {
  bundle: RegisteredBundle;
  request: Request;
  spawn: WorkerSpawner;
  timeoutMs: number;
}

async function invokeBundle(args: InvokeArgs): Promise<Response> {
  const { bundle, request, spawn, timeoutMs } = args;
  const worker = spawn();
  const replyQueue: WorkerReply[] = [];
  const waiters: ((reply: WorkerReply) => void)[] = [];

  worker.onMessage((reply) => {
    const next = waiters.shift();
    if (next) next(reply);
    else replyQueue.push(reply);
  });

  const nextReply = (): Promise<WorkerReply> =>
    new Promise((resolve) => {
      const queued = replyQueue.shift();
      if (queued) resolve(queued);
      else waiters.push(resolve);
    });

  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("worker timeout")), timeoutMs);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e: unknown) => {
          clearTimeout(t);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });

  try {
    worker.postMessage({ type: "init", code: bundle.code, entrypoint: bundle.entrypoint });
    const initReply = await withTimeout(nextReply());
    if (initReply.type === "error") {
      return new Response(`bundle init failed: ${initReply.message}`, { status: 500 });
    }
    if (initReply.type !== "ready") {
      return new Response("unexpected worker reply during init", { status: 500 });
    }

    const serialised = await serialiseRequest(request);
    worker.postMessage({ type: "invoke", request: serialised });
    const invokeReply = await withTimeout(nextReply());
    if (invokeReply.type === "error") {
      return new Response(`handler error: ${invokeReply.message}`, { status: 500 });
    }
    if (invokeReply.type !== "response") {
      return new Response("unexpected worker reply during invoke", { status: 500 });
    }
    const { response } = invokeReply;
    const headers = new Headers();
    for (const [k, v] of response.headers) headers.append(k, v);
    const body =
      response.bodyBase64.length === 0 ? null : Buffer.from(response.bodyBase64, "base64");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "dispatch failed";
    if (message === "worker timeout") {
      return new Response("gateway timeout", { status: 504 });
    }
    return new Response(`dispatch error: ${message}`, { status: 500 });
  } finally {
    await worker.terminate();
  }
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
  const spawn = options.spawnWorker ?? defaultSpawnWorker;
  const logger = options.logger ?? console;

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
          bundles: registry.size(),
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
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const parsed = AdminBundleInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "validation_failed", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        const { id, code, entrypoint } = parsed.data;
        const hash = computeBundleHash({ id, entrypoint, code });
        const bundle: RegisteredBundle = {
          id,
          code,
          entrypoint,
          hash,
          registeredAt: Date.now(),
        };
        registry.set(bundle);
        return Response.json(
          {
            id: bundle.id,
            entrypoint: bundle.entrypoint,
            hash: bundle.hash,
            registeredAt: bundle.registeredAt,
            codeBytes: bundle.code.length,
          },
          { status: 201 },
        );
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
          return await invokeBundle({ bundle, request: req, spawn, timeoutMs });
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
    `[edge-runtime] listening on http://${server.hostname}:${server.port} (timeout=${timeoutMs}ms)`,
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

export { BundleRegistry, BundleSchema, BundleIdSchema } from "./registry";
export type { BundleId, BundleInput, RegisteredBundle, PublicBundleSummary } from "./registry";
export { computeBundleHash } from "./dispatch";

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
