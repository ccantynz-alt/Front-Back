// ── Crontech Cron Scheduler — job & run registry ─────────────────────
// In-memory registry of cron jobs and their execution history. The
// registry is intentionally storage-agnostic: a future migration to
// Drizzle/Turso/D1 swaps the implementation behind the `JobStore`
// interface without touching the scheduler or HTTP API.

import { type ParsedCron, parseCron } from "./parser";

export type DispatchTargetType = "edge-runtime" | "worker" | "webhook";

export interface DispatchTarget {
  type: DispatchTargetType;
  endpoint: string;
  payload?: unknown;
  headers?: Record<string, string>;
}

export interface RetryPolicy {
  maxAttempts: number;
  /** Initial backoff delay; exponential factor of 2 between attempts. */
  backoffMs: number;
  /** Hard cap on a single backoff interval. Defaults to 5 minutes. */
  maxBackoffMs?: number;
}

export type JobStatus = "active" | "paused";

export interface Job {
  jobId: string;
  tenantId: string;
  cronExpr: string;
  tz: string;
  target: DispatchTarget;
  retryPolicy: RetryPolicy;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  /** Cached parsed cron — never serialized to clients. */
  parsed: ParsedCron;
}

export type RunStatus = "ok" | "failed" | "timeout";

export interface Run {
  runId: string;
  jobId: string;
  tenantId: string;
  startedAt: number;
  finishedAt: number;
  status: RunStatus;
  attempt: number;
  /** True if this is the final attempt (success OR exhausted retries). */
  terminal: boolean;
  response?: { statusCode: number; bodyPreview: string };
  error?: string;
}

export interface DeadLetter {
  jobId: string;
  tenantId: string;
  runId: string;
  attempts: number;
  lastError: string;
  failedAt: number;
}

export interface CreateJobInput {
  jobId?: string;
  tenantId: string;
  cronExpr: string;
  tz?: string;
  target: DispatchTarget;
  retryPolicy?: Partial<RetryPolicy>;
  status?: JobStatus;
}

const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1_000,
  maxBackoffMs: 5 * 60_000,
};

export class JobRegistry {
  private readonly jobs = new Map<string, Job>();
  private readonly runs = new Map<string, Run[]>();
  private readonly deadLetters: DeadLetter[] = [];
  private readonly idGen: () => string;
  private readonly now: () => number;

  constructor(opts: { now?: () => number; idGen?: () => string } = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.idGen =
      opts.idGen ??
      (() =>
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  }

  createJob(input: CreateJobInput): Job {
    const parsed = parseCron(input.cronExpr);
    const tz = input.tz ?? "UTC";
    // Validate timezone eagerly — Intl throws on unknown zones.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });

    const jobId = input.jobId ?? this.idGen();
    if (this.jobs.has(jobId)) {
      throw new Error(`job "${jobId}" already exists`);
    }
    const ts = this.now();
    const job: Job = {
      jobId,
      tenantId: input.tenantId,
      cronExpr: input.cronExpr,
      tz,
      target: structuredClone(input.target),
      retryPolicy: { ...DEFAULT_RETRY, ...(input.retryPolicy ?? {}) },
      status: input.status ?? "active",
      createdAt: ts,
      updatedAt: ts,
      lastRunAt: null,
      nextRunAt: null,
      parsed,
    };
    this.jobs.set(jobId, job);
    this.runs.set(jobId, []);
    return job;
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  deleteJob(jobId: string): boolean {
    const removed = this.jobs.delete(jobId);
    this.runs.delete(jobId);
    return removed;
  }

  setStatus(jobId: string, status: JobStatus): Job {
    const job = this.requireJob(jobId);
    job.status = status;
    job.updatedAt = this.now();
    return job;
  }

  setNextRunAt(jobId: string, nextRunAt: number | null): void {
    const job = this.requireJob(jobId);
    job.nextRunAt = nextRunAt;
  }

  markRan(jobId: string, lastRunAt: number): void {
    const job = this.requireJob(jobId);
    job.lastRunAt = lastRunAt;
  }

  listJobs(filter?: { tenantId?: string; status?: JobStatus }): Job[] {
    const out: Job[] = [];
    for (const job of this.jobs.values()) {
      if (filter?.tenantId !== undefined && job.tenantId !== filter.tenantId) {
        continue;
      }
      if (filter?.status !== undefined && job.status !== filter.status) {
        continue;
      }
      out.push(job);
    }
    return out;
  }

  recordRun(run: Run): void {
    const list = this.runs.get(run.jobId);
    if (!list) {
      throw new Error(`unknown job "${run.jobId}"`);
    }
    list.push(run);
    if (list.length > 500) {
      list.splice(0, list.length - 500);
    }
  }

  listRuns(jobId: string, since?: number): Run[] {
    const list = this.runs.get(jobId) ?? [];
    if (since === undefined) return [...list];
    return list.filter((r) => r.startedAt >= since);
  }

  recordDeadLetter(entry: DeadLetter): void {
    this.deadLetters.push(entry);
    if (this.deadLetters.length > 1000) {
      this.deadLetters.splice(0, this.deadLetters.length - 1000);
    }
  }

  listDeadLetters(filter?: { tenantId?: string }): DeadLetter[] {
    if (!filter?.tenantId) return [...this.deadLetters];
    return this.deadLetters.filter((d) => d.tenantId === filter.tenantId);
  }

  generateRunId(): string {
    return this.idGen();
  }

  private requireJob(jobId: string): Job {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`unknown job "${jobId}"`);
    return job;
  }
}
