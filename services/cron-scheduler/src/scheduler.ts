// ── Crontech Cron Scheduler — tick loop ──────────────────────────────
// 1-second resolution scheduler. On each tick:
//   1. Recompute `nextRunAt` for every active job that has none.
//   2. For every active job whose `nextRunAt <= now`, dispatch it.
//   3. After dispatch, record the run, retry on failure with exponential
//      backoff per the job's retryPolicy (waiting between attempts is
//      done in-tick — this keeps retry semantics predictable in tests
//      that drive the clock manually).
//   4. After successful run OR retry exhaustion, recompute the next
//      fire-time. Exhausted runs land in the dead-letter list.

import {
  computeBackoffMs,
  Dispatcher,
  type DispatchResult,
} from "./dispatcher";
import { nextFire } from "./parser";
import type { Job, JobRegistry, Run, RunStatus } from "./registry";

export interface Clock {
  now(): number;
  /** Resolves after `ms` milliseconds of wall-time has elapsed. */
  sleep(ms: number): Promise<void>;
}

const SYSTEM_CLOCK: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export interface SchedulerOptions {
  registry: JobRegistry;
  dispatcher?: Dispatcher;
  clock?: Clock;
  /** Tick interval in ms. Defaults to 1000ms. */
  tickIntervalMs?: number;
  /** Hook called on every state transition — useful for v2 AI optimiser. */
  onEvent?: (event: SchedulerEvent) => void;
}

export type SchedulerEvent =
  | { kind: "scheduled"; jobId: string; nextRunAt: number }
  | { kind: "dispatching"; jobId: string; runId: string; attempt: number }
  | { kind: "run-complete"; jobId: string; run: Run }
  | { kind: "dead-letter"; jobId: string; runId: string; error: string }
  | { kind: "skipped"; jobId: string; reason: "paused" | "no-next-fire" };

export class Scheduler {
  private readonly registry: JobRegistry;
  private readonly dispatcher: Dispatcher;
  private readonly clock: Clock;
  private readonly tickIntervalMs: number;
  private readonly onEvent: (event: SchedulerEvent) => void;
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private stopResolver: (() => void) | null = null;

  constructor(opts: SchedulerOptions) {
    this.registry = opts.registry;
    this.dispatcher = opts.dispatcher ?? new Dispatcher();
    this.clock = opts.clock ?? SYSTEM_CLOCK;
    this.tickIntervalMs = opts.tickIntervalMs ?? 1000;
    this.onEvent = opts.onEvent ?? (() => {});
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.stopResolver?.();
    if (this.loopPromise) await this.loopPromise;
    this.loopPromise = null;
    this.stopResolver = null;
  }

  /**
   * Run a single tick — exposed for test harnesses driving the clock
   * manually. Production callers should use start()/stop().
   */
  async tick(): Promise<void> {
    const now = this.clock.now();
    const jobs = this.registry.listJobs({ status: "active" });
    for (const job of jobs) {
      if (job.nextRunAt === null) {
        this.scheduleNext(job, now);
        continue;
      }
      if (job.nextRunAt <= now) {
        await this.executeWithRetry(job, job.nextRunAt);
        // Re-fetch in case status changed mid-execute (e.g. paused).
        const current = this.registry.getJob(job.jobId);
        if (current && current.status === "active") {
          this.scheduleNext(current, this.clock.now());
        }
      }
    }
  }

  /** Manually trigger a job NOW, bypassing schedule. */
  async triggerNow(jobId: string): Promise<Run | null> {
    const job = this.registry.getJob(jobId);
    if (!job) return null;
    const before = this.registry.listRuns(jobId).length;
    await this.executeWithRetry(job, this.clock.now());
    const runs = this.registry.listRuns(jobId);
    return runs.length > before ? (runs[runs.length - 1] ?? null) : null;
  }

  /** Recompute `nextRunAt` for a job — useful after CRUD updates. */
  refreshNextFire(jobId: string): void {
    const job = this.registry.getJob(jobId);
    if (!job) return;
    if (job.status !== "active") {
      this.registry.setNextRunAt(jobId, null);
      return;
    }
    this.scheduleNext(job, this.clock.now());
  }

  private scheduleNext(job: Job, after: number): void {
    const next = nextFire(job.parsed, { timezone: job.tz, after });
    this.registry.setNextRunAt(job.jobId, next);
    if (next !== null) {
      this.onEvent({ kind: "scheduled", jobId: job.jobId, nextRunAt: next });
    } else {
      this.onEvent({
        kind: "skipped",
        jobId: job.jobId,
        reason: "no-next-fire",
      });
    }
  }

  private async executeWithRetry(
    job: Job,
    scheduledFor: number,
  ): Promise<void> {
    const maxAttempts = Math.max(1, job.retryPolicy.maxAttempts);
    let lastError = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Re-check status: pause during retry should abort further attempts.
      const current = this.registry.getJob(job.jobId);
      if (!current) return;
      if (current.status !== "active") {
        this.onEvent({
          kind: "skipped",
          jobId: job.jobId,
          reason: "paused",
        });
        return;
      }

      const runId = this.registry.generateRunId();
      this.onEvent({
        kind: "dispatching",
        jobId: job.jobId,
        runId,
        attempt,
      });

      const startedAt = this.clock.now();
      const result = await this.dispatcher.dispatch(current.target, {
        jobId: current.jobId,
        tenantId: current.tenantId,
        attempt,
        scheduledFor,
      });
      const finishedAt = this.clock.now();

      const run = buildRun({
        runId,
        job: current,
        attempt,
        startedAt,
        finishedAt,
        result,
        terminal: result.ok || attempt >= maxAttempts,
      });
      this.registry.recordRun(run);
      this.registry.markRan(current.jobId, startedAt);
      this.onEvent({ kind: "run-complete", jobId: current.jobId, run });

      if (result.ok) return;

      lastError = result.error;
      if (attempt >= maxAttempts) {
        this.registry.recordDeadLetter({
          jobId: current.jobId,
          tenantId: current.tenantId,
          runId,
          attempts: attempt,
          lastError,
          failedAt: finishedAt,
        });
        this.onEvent({
          kind: "dead-letter",
          jobId: current.jobId,
          runId,
          error: lastError,
        });
        return;
      }

      const backoff = computeBackoffMs(current.retryPolicy, attempt);
      if (backoff > 0) await this.clock.sleep(backoff);
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        // Never let the loop die — log via event hook and continue.
        this.onEvent({
          kind: "dead-letter",
          jobId: "<scheduler>",
          runId: "<loop>",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await this.sleepInterruptible(this.tickIntervalMs);
    }
  }

  private sleepInterruptible(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), ms);
      this.stopResolver = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

function buildRun(params: {
  runId: string;
  job: Job;
  attempt: number;
  startedAt: number;
  finishedAt: number;
  result: DispatchResult;
  terminal: boolean;
}): Run {
  const status: RunStatus = params.result.ok
    ? "ok"
    : params.result.reason === "timeout"
      ? "timeout"
      : "failed";
  const run: Run = {
    runId: params.runId,
    jobId: params.job.jobId,
    tenantId: params.job.tenantId,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    status,
    attempt: params.attempt,
    terminal: params.terminal,
  };
  if (params.result.ok) {
    run.response = {
      statusCode: params.result.statusCode,
      bodyPreview: params.result.bodyPreview,
    };
  } else {
    run.error = params.result.error;
    if (params.result.statusCode !== undefined) {
      run.response = {
        statusCode: params.result.statusCode,
        bodyPreview: params.result.bodyPreview ?? "",
      };
    }
  }
  return run;
}
