// ── Per-Project OTel Attribution ────────────────────────────────────
//
// Attaches a `project_id` attribute to every metric sample (and every
// span) emitted during a request that is scoped to a specific project.
//
// WHY THIS EXISTS
//   `apps/api/src/trpc/procedures/metrics.ts` (shipped in commit
//   `291d1dc`) queries Mimir with PromQL expressions of the shape
//   `http_request_count_total{project_id="…"}`. For those queries to
//   return real samples — and for `/projects/[id]/metrics` to stop
//   showing "No metrics yet" — the pipeline has to actually tag the
//   emitted series with a `project_id`. The OTel SDK exports every
//   metric with its attribute set; this module is the plumbing that
//   makes sure the right attribute is on the stack when the exporter
//   records a sample.
//
// HOW IT WORKS
//   We use Node/Bun's AsyncLocalStorage to carry a per-request
//   `projectId` through the async boundary between Hono middleware →
//   tRPC middleware → procedure → metric emission. ALS is the right
//   primitive here because:
//     1. It's native to Node/Bun (no extra dependency)
//     2. It survives `await` boundaries (OTel's own context-async-hooks
//        package uses the same mechanism)
//     3. It's a no-op when nothing has been pushed onto it, so the
//        existing "no project scope" code paths keep behaving exactly
//        as they do today
//
//   Two integration points:
//     • A Hono middleware wraps every request. It inspects the URL for
//       a `:projectId` path segment; if found it enters an ALS scope
//       for the duration of `next()`.
//     • A tRPC middleware looks at the procedure input. If it contains
//       a `projectId` field that parses as a string (the convention
//       across our router — see `projects.ts`, `deployments.ts`,
//       `metrics.ts`) it enters an ALS scope for the duration of
//       `next()`.
//
//   Callers that record metrics (e.g. `httpRequestCount.add(...)`) can
//   pull the current `projectId` via `getCurrentProjectId()` and merge
//   it into their attribute bag. `withProjectAttrs(base)` is a small
//   helper that does this in one call.
//
// HONEST FALLBACK
//   If a request does not belong to a project, nothing on the stack
//   sets an ALS frame, and `getCurrentProjectId()` returns `undefined`.
//   Metric samples are emitted without a `project_id` label — exactly
//   as they are today — and the per-project Mimir query returns an
//   empty result set. The `/projects/[id]/metrics` page honours that
//   empty state. No synthetic data is invented anywhere.

import { AsyncLocalStorage } from "node:async_hooks";

// ── ALS frame shape ──────────────────────────────────────────────────
interface ProjectAttributionFrame {
  projectId: string;
}

const storage = new AsyncLocalStorage<ProjectAttributionFrame>();

// ── Public API ───────────────────────────────────────────────────────

/**
 * Run `fn` inside an async context where `getCurrentProjectId()` will
 * resolve to `projectId`. Safe to nest — an inner call overrides the
 * outer frame for the duration of its callback.
 */
export function runWithProjectId<T>(projectId: string, fn: () => T): T {
  return storage.run({ projectId }, fn);
}

/**
 * Returns the `projectId` associated with the current async context,
 * or `undefined` when no frame has been pushed. Never throws.
 */
export function getCurrentProjectId(): string | undefined {
  return storage.getStore()?.projectId;
}

/**
 * Merge the current project id into a metric-attribute record.
 * Callers pass the base attributes they were already going to emit;
 * this helper adds `project_id` when, and only when, one is in scope.
 *
 * Designed to be dropped in at metric emission sites:
 *
 *     httpRequestCount.add(1, withProjectAttrs({ method, path }));
 */
export function withProjectAttrs<
  T extends Record<string, string | number | boolean>,
>(base: T): T & { project_id?: string } {
  const projectId = getCurrentProjectId();
  if (!projectId) return base;
  return { ...base, project_id: projectId };
}

// ── Hono middleware ──────────────────────────────────────────────────
//
// Extracts `projectId` from the URL path. Our conventional routes put
// the project id in the second path segment after the resource name,
// e.g. `/api/projects/:projectId/...` or `/api/deployments/:projectId/...`
// (deployments in our tRPC model are keyed to a project). We also
// accept a trusted `x-project-id` header so service-to-service callers
// and the terminal WebSocket (which encodes projectId in the URL) keep
// working.
//
// This is intentionally duck-typed — it asks for the `req.path` and
// `req.header(name)` surface of `hono.Context` without naming the
// class, so the middleware is trivial to unit-test with a fake.

const PROJECT_ROUTE_PATTERNS: readonly RegExp[] = [
  // /api/projects/<uuid>/... or /projects/<uuid>/...
  /\/projects\/([0-9a-f-]{8,64})(?:\/|$)/i,
  // /api/deployments/<uuid>/... where uuid is the projectId for the
  // terminal / deployment log stream. If future routes use a different
  // id shape (e.g. deployment ids that are not project ids) they must
  // set the header instead.
  /\/terminal\/([0-9a-f-]{8,64})(?:\/|$)/i,
];

function extractProjectIdFromPath(path: string): string | undefined {
  for (const pattern of PROJECT_ROUTE_PATTERNS) {
    const match = pattern.exec(path);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/** Minimal shape of `hono.Context` the middleware needs. */
interface MinimalHonoContext {
  req: {
    path: string;
    header: (name: string) => string | undefined;
  };
}

type Next = () => Promise<void>;

/**
 * Hono middleware that attaches a project-scoped ALS frame when the
 * request targets a project. Safe to mount as a top-level `app.use`
 * — a request with no project in scope falls through unchanged.
 */
export function projectAttributionMiddleware() {
  return async function projectAttribution(
    c: MinimalHonoContext,
    next: Next,
  ): Promise<void> {
    const fromHeader = c.req.header("x-project-id");
    const fromPath = extractProjectIdFromPath(c.req.path);
    const projectId = fromHeader ?? fromPath;

    if (!projectId) {
      await next();
      return;
    }
    await runWithProjectId(projectId, next);
  };
}

// ── tRPC middleware ──────────────────────────────────────────────────
//
// tRPC middleware receives `{ ctx, next, rawInput }`. We never touch
// `ctx`, we just read `rawInput` and wrap `next()`. We do NOT validate
// the shape here — Zod on the procedure handles that. We do a cheap
// duck-type check so a malformed input (non-object, missing `projectId`)
// simply skips attribution rather than throwing.

interface TrpcMiddlewareArgs {
  getRawInput?: () => Promise<unknown>;
  rawInput?: unknown;
  next: () => Promise<unknown>;
}

function readProjectIdFromInput(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = (raw as Record<string, unknown>)["projectId"];
  if (typeof candidate !== "string" || candidate.length === 0) {
    return undefined;
  }
  return candidate;
}

/**
 * Core projection of the tRPC middleware for testing purposes. The
 * real tRPC `middleware(fn)` wrapper is applied in `trpc/init.ts`.
 */
export async function projectAttributionTrpcMiddleware(
  args: TrpcMiddlewareArgs,
): Promise<unknown> {
  // tRPC v11 exposes input as either a resolved value (`rawInput`) or
  // a lazy getter (`getRawInput`). Support both so this module is
  // robust across minor version drift. A parser error in `getRawInput`
  // is swallowed — Zod on the procedure itself is the source of truth
  // for input validation errors, and we never want attribution plumbing
  // to mutate the failure mode of the handler.
  let raw: unknown;
  if (args.rawInput !== undefined) {
    raw = args.rawInput;
  } else if (args.getRawInput) {
    try {
      raw = await args.getRawInput();
    } catch {
      raw = undefined;
    }
  }

  const projectId = readProjectIdFromInput(raw);
  if (!projectId) {
    return args.next();
  }

  return runWithProjectId(projectId, () => args.next());
}
