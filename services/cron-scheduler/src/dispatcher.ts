// ── Crontech Cron Scheduler — dispatcher ─────────────────────────────
// Thin abstraction over HTTP fetch so tests can substitute a mock
// transport. The dispatcher itself does not implement retry: it just
// performs ONE attempt and reports the result. Retry / backoff /
// dead-letter logic lives in the scheduler tick-loop so retry state is
// observable and pause/resume can preempt cleanly.

import type { DispatchTarget } from "./registry";

export interface DispatchOk {
  ok: true;
  statusCode: number;
  bodyPreview: string;
}

export interface DispatchFail {
  ok: false;
  reason: "http-error" | "timeout" | "network";
  statusCode?: number;
  error: string;
  bodyPreview?: string;
}

export type DispatchResult = DispatchOk | DispatchFail;

export interface DispatchContext {
  jobId: string;
  tenantId: string;
  attempt: number;
  scheduledFor: number;
}

export type Transport = (
  target: DispatchTarget,
  ctx: DispatchContext,
  signal: AbortSignal,
) => Promise<{ status: number; body: string }>;

export interface DispatcherOptions {
  transport?: Transport;
  /** Per-attempt timeout. Defaults to 30s. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class Dispatcher {
  private readonly transport: Transport;
  private readonly timeoutMs: number;

  constructor(opts: DispatcherOptions = {}) {
    this.transport = opts.transport ?? defaultFetchTransport;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async dispatch(
    target: DispatchTarget,
    ctx: DispatchContext,
  ): Promise<DispatchResult> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await this.transport(target, ctx, ac.signal);
      const preview = res.body.slice(0, 256);
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, statusCode: res.status, bodyPreview: preview };
      }
      return {
        ok: false,
        reason: "http-error",
        statusCode: res.status,
        error: `HTTP ${res.status}`,
        bodyPreview: preview,
      };
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || ac.signal.aborted);
      if (isAbort) {
        return {
          ok: false,
          reason: "timeout",
          error: `dispatch timed out after ${this.timeoutMs}ms`,
        };
      }
      return {
        ok: false,
        reason: "network",
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

const defaultFetchTransport: Transport = async (target, ctx, signal) => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-cron-job-id": ctx.jobId,
    "x-cron-tenant-id": ctx.tenantId,
    "x-cron-attempt": String(ctx.attempt),
    "x-cron-scheduled-for": String(ctx.scheduledFor),
    ...(target.headers ?? {}),
  };
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers,
    body:
      target.payload === undefined ? "{}" : JSON.stringify(target.payload),
    signal,
  });
  const body = await res.text();
  return { status: res.status, body };
};

/** Compute exponential backoff (in ms) for retry attempt N (1-indexed). */
export function computeBackoffMs(
  policy: { backoffMs: number; maxBackoffMs?: number },
  attempt: number,
): number {
  if (attempt < 1) return 0;
  const base = policy.backoffMs * 2 ** (attempt - 1);
  const cap = policy.maxBackoffMs ?? 5 * 60_000;
  return Math.min(base, cap);
}
