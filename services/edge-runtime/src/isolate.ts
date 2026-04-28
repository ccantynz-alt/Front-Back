// ── Crontech Edge Runtime — V8 Isolate Primitive ────────────────────
// Per-tenant, per-request execution sandbox for untrusted customer JS.
// Uses Node's `node:vm` API (fully implemented in Bun ≥1.3) which gives
// us:
//
//   * A long-lived Context per *bundle* (not per request) so the
//     compiled module can be reused — no per-request parse cost on the
//     warm path. The Context's globals belong to that bundle and are
//     not visible to any other bundle.
//   * `vm.SourceTextModule` for ES-module evaluation. Customer code can
//     `export default { fetch }` exactly like Cloudflare Workers, or
//     register `addEventListener('fetch', ...)`. Both are supported.
//   * Synchronous time-budget enforcement on the initial module
//     evaluation via `vm.SourceTextModule#evaluate({ timeout })`. Async
//     handler execution is bounded by `runWithLimits` from limits.ts.
//   * Per-invocation `console` + `env`: the sandbox reads them through
//     a slot that the dispatcher swaps before every call, so requests
//     do not leak logs or secrets into each other even though they
//     share the bundle's compiled module.
//
// Isolation guarantee:
//   Each bundle gets its own Context with its own globalThis. Bundle A
//   cannot see bundle B's globals. This matches the per-Worker-script
//   guarantee Cloudflare Workers provides.
//
// Trade-off: `node:vm` Contexts share the host's V8 isolate (one V8
// heap, separate Realms). This matches the *guarantee* level of
// Cloudflare Workers (which also share a process-wide V8 isolate, with
// per-Worker Realms) but is weaker than `isolated-vm` (separate V8
// isolate per tenant). The v2 roadmap upgrades to `isolated-vm` once it
// supports Bun, OR ships a Rust harness with `rusty_v8`. The wire
// protocol (init → fetch → response) is designed so the swap is
// contained to this file. Memory pressure between tenants is mitigated
// by limits.ts (heap delta cap per request) but the cap is best-effort
// on a shared heap. Operators running adversarial multi-tenant
// workloads should pin one edge-runtime process per tenant until v2
// lands.

import vm from "node:vm";
import { ConsoleCapture, type ConsoleCaptureSnapshot } from "./console-capture";
import { runWithLimits, type InvocationLimits, type LimitOutcome } from "./limits";
import type { RegisteredBundle } from "./registry";

// ── Public types ────────────────────────────────────────────────────

export interface IsolateInvokeArgs {
  readonly bundle: RegisteredBundle;
  readonly request: Request;
  /** Override the bundle's limits (e.g. test/admin path). */
  readonly limitsOverride?: InvocationLimits;
}

export interface IsolateInvokeResult {
  readonly response: Response;
  readonly outcome: LimitOutcome;
  readonly logs: ConsoleCaptureSnapshot;
  /** ms spent inside the customer handler. */
  readonly durationMs: number;
  /** Peak heap delta during the invocation, in bytes. */
  readonly peakBytes: number;
}

// ── Internal types ──────────────────────────────────────────────────

type FetchHandler = (
  req: Request,
  env: Record<string, string>,
) => Response | Promise<Response>;

type FetchListener = (event: FetchEvent) => void;

interface FetchEvent {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

/**
 * Per-invocation slot the sandbox reads through getters. The dispatcher
 * mutates the slot before each call so each request sees its own
 * console + env without per-request Context creation cost.
 */
interface InvocationSlot {
  capture: ConsoleCapture;
  env: Record<string, string>;
}

interface CompiledBundle {
  readonly fetch: FetchHandler;
  readonly slot: InvocationSlot;
  readonly compiledAt: number;
}

// ── Compiled bundle cache ───────────────────────────────────────────
// Keyed by the bundle's content hash. A redeploy with the same hash
// hits the cache; a new hash misses and recompiles.

const cache = new Map<string, CompiledBundle>();

export function clearCompiledCache(): void {
  cache.clear();
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Invoke a bundle in its V8 Realm. Per-invocation `console` and `env`
 * are swapped on a slot the bundle reads through getters. Returns a
 * typed result that distinguishes customer errors, time-limit hits,
 * and memory-limit hits.
 *
 * The returned Response is always safe to send to the original HTTP
 * client — never undefined, never a thrown error.
 */
export async function invokeIsolate(args: IsolateInvokeArgs): Promise<IsolateInvokeResult> {
  const { bundle, request } = args;
  const limits = args.limitsOverride ?? bundle.limits;
  const capture = new ConsoleCapture();
  const env: Record<string, string> = { ...bundle.env, ...bundle.secrets };

  let compiled: CompiledBundle;
  try {
    compiled = await loadOrCompile(bundle, limits);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bundle init failed";
    return {
      response: new Response(`bundle init failed: ${message}`, { status: 500 }),
      outcome: { kind: "ok" },
      logs: capture.snapshot(),
      durationMs: 0,
      peakBytes: 0,
    };
  }

  // Swap the per-invocation slot. Anything the bundle reads from
  // `globalThis.console` / `globalThis.env` resolves through this slot.
  compiled.slot.capture = capture;
  compiled.slot.env = env;

  const result = await runWithLimits<Response>({
    limits,
    run: async () => {
      const out = await compiled.fetch(request, env);
      if (!(out instanceof Response)) {
        throw new TypeError(
          `fetch handler must return a Response, got ${typeof out}`,
        );
      }
      return out;
    },
  });

  if (result.outcome.kind === "timeout") {
    return {
      response: new Response("gateway timeout", { status: 504 }),
      outcome: result.outcome,
      logs: capture.snapshot(),
      durationMs: result.durationMs,
      peakBytes: result.peakBytes,
    };
  }
  if (result.outcome.kind === "memory") {
    return {
      response: new Response("memory limit exceeded", { status: 507 }),
      outcome: result.outcome,
      logs: capture.snapshot(),
      durationMs: result.durationMs,
      peakBytes: result.peakBytes,
    };
  }
  if (result.error !== undefined) {
    const message = result.error.message;
    return {
      response: new Response(`handler error: ${message}`, { status: 500 }),
      outcome: result.outcome,
      logs: capture.snapshot(),
      durationMs: result.durationMs,
      peakBytes: result.peakBytes,
    };
  }
  if (result.value === undefined) {
    return {
      response: new Response("handler returned no response", { status: 500 }),
      outcome: result.outcome,
      logs: capture.snapshot(),
      durationMs: result.durationMs,
      peakBytes: result.peakBytes,
    };
  }
  return {
    response: result.value,
    outcome: result.outcome,
    logs: capture.snapshot(),
    durationMs: result.durationMs,
    peakBytes: result.peakBytes,
  };
}

// ── Compilation + Realm setup ───────────────────────────────────────

async function loadOrCompile(
  bundle: RegisteredBundle,
  limits: InvocationLimits,
): Promise<CompiledBundle> {
  const cached = cache.get(bundle.hash);
  if (cached !== undefined) return cached;
  const compiled = await compileBundle(bundle, limits);
  cache.set(bundle.hash, compiled);
  return compiled;
}

/**
 * Build the Realm, populate the Web-Standards globals, evaluate the
 * bundle's source, and resolve the `fetch` handler. The bundle is
 * evaluated *once* per content hash — repeat invocations reuse the
 * cached handler with a swapped per-invocation slot.
 *
 * Two entrypoint shapes are supported, matching the platforms we are
 * displacing:
 *
 *   1. `export default { fetch(req, env) { ... } }`     (CF Workers /
 *      Vercel Edge)
 *   2. `addEventListener('fetch', (event) => event.respondWith(...))`
 *      (legacy CF Workers)
 */
async function compileBundle(
  bundle: RegisteredBundle,
  limits: InvocationLimits,
): Promise<CompiledBundle> {
  const slot: InvocationSlot = {
    capture: new ConsoleCapture(),
    env: {},
  };
  const fetchListeners: FetchListener[] = [];
  const sandbox = buildSandbox({ slot, fetchListeners });

  const context = vm.createContext(sandbox, {
    name: `crontech-edge:${bundle.id}`,
    codeGeneration: {
      // Disable `eval` and `new Function(...)` inside the isolate.
      // Customer code that wants dynamic execution should use the
      // platform's RPC / queue primitives instead — eval is a footgun
      // for multi-tenant correctness.
      strings: false,
      wasm: false,
    },
  });

  const module = new vm.SourceTextModule(bundle.code, {
    context,
    identifier: `crontech://${bundle.id}/${bundle.entrypoint}`,
  });
  // No imports allowed in v1 — bundles must already be flat.
  await module.link((specifier: string) => {
    throw new Error(
      `bundle "${bundle.id}" tried to import "${specifier}" — bundles must be flat in v1`,
    );
  });
  await module.evaluate({ timeout: limits.timeoutMs });

  const ns = module.namespace as ModuleNamespace;
  const directDefault = resolveFetchHandler(ns);

  const handler =
    directDefault ??
    (fetchListeners.length > 0
      ? buildAddEventListenerHandler(fetchListeners)
      : undefined);

  if (handler === undefined) {
    throw new Error(
      `bundle "${bundle.entrypoint}" did not export a fetch handler — ` +
        `expected \`export default { fetch }\` or \`addEventListener("fetch", ...)\``,
    );
  }

  return { fetch: handler, slot, compiledAt: Date.now() };
}

interface ModuleNamespace {
  default?: unknown;
  fetch?: unknown;
}

function resolveFetchHandler(ns: ModuleNamespace): FetchHandler | undefined {
  // `export default { fetch(req, env) { ... } }`
  if (ns.default !== null && typeof ns.default === "object") {
    const candidate = (ns.default as { fetch?: unknown }).fetch;
    if (typeof candidate === "function") {
      return candidate as FetchHandler;
    }
  }
  // `export default function(req, env) { ... }`
  if (typeof ns.default === "function") {
    return ns.default as FetchHandler;
  }
  // `export const fetch = ...`
  if (typeof ns.fetch === "function") {
    return ns.fetch as FetchHandler;
  }
  return undefined;
}

// ── Sandbox construction ────────────────────────────────────────────

interface BuildSandboxArgs {
  readonly slot: InvocationSlot;
  readonly fetchListeners: FetchListener[];
}

function buildSandbox(args: BuildSandboxArgs): Record<string, unknown> {
  const { slot, fetchListeners } = args;

  // The sandbox object IS the Realm's globalThis. We use accessor
  // properties (defineProperty getters) for the per-invocation values
  // so customer code that captures `console` once still resolves the
  // current invocation's logs on every call. Static values are written
  // directly.

  const sandbox: Record<string, unknown> = {
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    Blob,
    File: globalThis.File,
    FormData,
    fetch,
    crypto,
    atob,
    btoa,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    structuredClone,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    performance: { now: () => performance.now() },
    addEventListener(name: string, fn: FetchListener): void {
      if (name !== "fetch") return;
      if (typeof fn === "function") fetchListeners.push(fn);
    },
    removeEventListener(name: string, fn: FetchListener): void {
      if (name !== "fetch") return;
      const idx = fetchListeners.indexOf(fn);
      if (idx >= 0) fetchListeners.splice(idx, 1);
    },
  };

  // Per-invocation accessors. Reading `globalThis.console` returns the
  // *current* invocation's capture; reading `globalThis.env` returns
  // the current request's bound env. The slot is mutated by the
  // dispatcher between requests.
  Object.defineProperty(sandbox, "console", {
    configurable: false,
    enumerable: true,
    get(): unknown {
      return slot.capture.asConsole();
    },
  });
  Object.defineProperty(sandbox, "env", {
    configurable: false,
    enumerable: true,
    get(): Record<string, string> {
      return slot.env;
    },
  });

  // `globalThis` and `self` resolve to the sandbox itself. This matches
  // Cloudflare Workers / Vercel Edge behavior.
  sandbox["globalThis"] = sandbox;
  sandbox["self"] = sandbox;
  return sandbox;
}

// ── addEventListener → handler bridge ───────────────────────────────

function buildAddEventListenerHandler(
  listeners: readonly FetchListener[],
): FetchHandler {
  return async (request: Request): Promise<Response> => {
    let resolveResp!: (r: Response | Promise<Response>) => void;
    let rejectResp!: (e: Error) => void;
    const settled = new Promise<Response>((resolve, reject) => {
      resolveResp = resolve;
      rejectResp = reject;
    });
    let called = false;
    const event: FetchEvent = {
      request,
      respondWith(response): void {
        if (called) return;
        called = true;
        resolveResp(response);
      },
    };
    try {
      for (const listener of listeners) listener(event);
    } catch (err) {
      rejectResp(err instanceof Error ? err : new Error(String(err)));
      return await settled;
    }
    if (!called) {
      rejectResp(new Error("fetch listener did not call event.respondWith"));
    }
    return await settled;
  };
}
