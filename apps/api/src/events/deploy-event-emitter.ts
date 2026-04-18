/**
 * Deploy event emitter — Signal Bus P1, events E3 (`deploy.succeeded`) and
 * E4 (`deploy.failed`). Fire-and-forget HTTP POST to Gluecron's event bus.
 *
 * Wire contract reference — Crontech's OWN copy per the HTTP-only coupling
 * rule. We do NOT import types or code from the Gluecron repo. If Gluecron
 * changes its wire shape, that is a contract breach on their side and this
 * file stays frozen until a new contract is negotiated with Craig.
 *
 *   POST  ${GLUECRON_EVENT_URL}/api/events/deploy
 *   Authorization: Bearer ${CRONTECH_EVENT_TOKEN}
 *   Content-Type:  application/json
 *
 *   {
 *     event:         "deploy.succeeded" | "deploy.failed",
 *     eventId:       "<uuid-v4>",          // required — idempotency key,
 *                                          // MUST be the same on retry.
 *     repository:    "owner/name",         // required
 *     sha:           "<40-hex>",           // required
 *     environment:   "production",         // required
 *     deploymentId:  "<crontech-id>",      // required — internal record ID
 *     durationMs:    <int>,                // optional
 *     errorCategory: "build|runtime|timeout|config",  // required on failed
 *     errorSummary:  "<string ≤500 chars>",           // required on failed
 *     logsUrl:       "<string>",           // optional
 *     timestamp:     "<ISO-8601>"          // required
 *   }
 *
 *   → 200 { ok: true, duplicate: false }
 *   → 200 { ok: true, duplicate: true }   // idempotent
 *   → 401 invalid bearer
 *   → 400 malformed payload
 *
 * Scope: these events are emitted ONLY for deploys triggered via the
 * push-webhook path (apps/api/src/webhooks/gluecron-push.ts). Admin-initiated
 * deploys via the tenant.deploy tRPC mutation are intentionally NOT tracked
 * by these events. Rationale: admin deploys can target any repo URL (GitHub,
 * Gluecron, or BYO) and Gluecron has no deployments row to correlate the event
 * against. Event emission for admin deploys would generate orphan signal on
 * the receiver side. If this scope ever changes, tenant.deploy's input schema
 * must grow a sha field — that is a §0.7 HARD GATE change and requires Craig
 * auth.
 *
 * Design rules for this module:
 *   1. NEVER throws. The deploy path must not care whether Gluecron is up.
 *   2. If either env var is missing, log ONCE and no-op. Never spam logs.
 *   3. 10-second hard timeout via `AbortSignal.timeout`. We are willing to
 *      lose an event entirely rather than slow down the deploy flow.
 *   4. `eventId` is generated once per call and sent as-is — the caller
 *      may retry by invoking the emitter again, which generates a NEW
 *      eventId. True retry-with-same-eventId would require persistence
 *      we explicitly do not have on Crontech side per the task spec.
 */

const ENDPOINT_PATH = "/api/events/deploy";
const FETCH_TIMEOUT_MS = 10_000;
const ENVIRONMENT = "production" as const;

/** One-shot warning so missing-env-var noise never floods the logs. */
let missingEnvWarned = false;

// ── Public input shapes ─────────────────────────────────────────────

export interface EmitDeploySucceededInput {
  repository: string;
  sha: string;
  deploymentId: string;
  durationMs?: number;
  logsUrl?: string;
}

export type DeployErrorCategory = "build" | "runtime" | "timeout" | "config";

export interface EmitDeployFailedInput {
  repository: string;
  sha: string;
  deploymentId: string;
  errorCategory: DeployErrorCategory;
  errorSummary: string;
  durationMs?: number;
  logsUrl?: string;
}

// ── Dependency seam (tests inject `fetchImpl` / `getEnv`) ───────────

type FetchLike = typeof fetch;

export interface EmitDeps {
  /** Override for unit tests; defaults to `globalThis.fetch`. */
  fetchImpl?: FetchLike;
  /** Override for unit tests; defaults to `process.env[name]`. */
  getEnv?: (name: string) => string | undefined;
  /** Override for unit tests; defaults to `crypto.randomUUID`. */
  uuid?: () => string;
  /** Override for unit tests; defaults to `() => new Date().toISOString()`. */
  now?: () => string;
}

// ── Internal helpers ────────────────────────────────────────────────

function readEnv(deps: EmitDeps): { url: string; token: string } | null {
  const getEnv = deps.getEnv ?? ((n) => process.env[n]);
  const rawUrl = getEnv("GLUECRON_EVENT_URL");
  const token = getEnv("CRONTECH_EVENT_TOKEN");
  if (!rawUrl || !token) {
    if (!missingEnvWarned) {
      missingEnvWarned = true;
      console.warn(
        "[deploy-event-emitter] GLUECRON_EVENT_URL and/or CRONTECH_EVENT_TOKEN are unset — deploy events will not be emitted. This warning fires once per process.",
      );
    }
    return null;
  }
  // Strip any trailing slash so the joined URL is always well-formed.
  const url = rawUrl.replace(/\/+$/, "");
  return { url, token };
}

interface WirePayload {
  event: "deploy.succeeded" | "deploy.failed";
  eventId: string;
  repository: string;
  sha: string;
  environment: "production";
  deploymentId: string;
  timestamp: string;
  durationMs?: number;
  logsUrl?: string;
  errorCategory?: DeployErrorCategory;
  errorSummary?: string;
}

async function postEvent(
  payload: WirePayload,
  deps: EmitDeps,
): Promise<void> {
  const env = readEnv(deps);
  if (!env) return;

  const fetchImpl = deps.fetchImpl ?? fetch;

  try {
    const res = await fetchImpl(`${env.url}${ENDPOINT_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Read body best-effort for a useful log line, but do not throw.
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* ignore — body read failures are not actionable here */
      }
      console.warn(
        `[deploy-event-emitter] ${payload.event} POST failed (status ${res.status}): ${detail.slice(0, 200)}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[deploy-event-emitter] ${payload.event} POST threw: ${message}`,
    );
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Fire E3 `deploy.succeeded` to Gluecron. Returns a `Promise<void>` that
 * resolves on send/failure alike — callers SHOULD `void emitDeploySucceeded(…)`
 * unless they explicitly want to wait (tests do).
 */
export async function emitDeploySucceeded(
  input: EmitDeploySucceededInput,
  deps: EmitDeps = {},
): Promise<void> {
  const uuid = deps.uuid ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date().toISOString());

  const payload: WirePayload = {
    event: "deploy.succeeded",
    eventId: uuid(),
    repository: input.repository,
    sha: input.sha,
    environment: ENVIRONMENT,
    deploymentId: input.deploymentId,
    timestamp: now(),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.logsUrl !== undefined ? { logsUrl: input.logsUrl } : {}),
  };

  await postEvent(payload, deps);
}

/**
 * Fire E4 `deploy.failed` to Gluecron. `errorCategory` + `errorSummary` are
 * required per the wire contract. Summary is truncated to 500 chars to
 * match the downstream validation — sending longer summaries gets a 400.
 */
export async function emitDeployFailed(
  input: EmitDeployFailedInput,
  deps: EmitDeps = {},
): Promise<void> {
  const uuid = deps.uuid ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date().toISOString());

  const payload: WirePayload = {
    event: "deploy.failed",
    eventId: uuid(),
    repository: input.repository,
    sha: input.sha,
    environment: ENVIRONMENT,
    deploymentId: input.deploymentId,
    timestamp: now(),
    errorCategory: input.errorCategory,
    errorSummary: input.errorSummary.slice(0, 500),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.logsUrl !== undefined ? { logsUrl: input.logsUrl } : {}),
  };

  await postEvent(payload, deps);
}

/**
 * Classify an orchestrator-call failure into one of the four wire-contract
 * error categories. Exported so the call-site wiring can reuse the same
 * logic for consistency; NOT part of the public emitter API but useful to
 * have alongside the emit functions.
 *
 *   - `AbortError`                → "timeout"
 *   - HTTP 4xx (from TRPCError)   → "config"
 *   - HTTP 5xx (from TRPCError)   → "runtime"
 *   - anything else               → "build"
 */
export function classifyDeployError(err: unknown): DeployErrorCategory {
  // Timeout — AbortSignal.timeout rejects with a DOMException named "AbortError"
  // (in Bun/Node 20+, `err.name === "TimeoutError"` when the signal itself
  // timed out; treat both as "timeout").
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "timeout";
    }
    const message = err.message.toLowerCase();
    // `orchestratorFetch` throws TRPCError with `Orchestrator error <status>`
    // or the orchestrator's own error string. Pattern-match on the status.
    const match = /orchestrator error (\d{3})/i.exec(err.message);
    if (match) {
      const status = Number(match[1]);
      if (status >= 400 && status < 500) return "config";
      if (status >= 500 && status < 600) return "runtime";
    }
    if (message.includes("timeout") || message.includes("timed out")) {
      return "timeout";
    }
  }
  return "build";
}

/**
 * Test-only reset for the missing-env one-shot warning latch. Not part of
 * the runtime public API — the production path never needs to unlatch it.
 * @internal
 */
export function __resetMissingEnvWarnedForTests(): void {
  missingEnvWarned = false;
}
