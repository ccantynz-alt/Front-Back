// ── Crontech Worker Runtime — Process supervisor ────────────────────
// Spawns and supervises a long-lived customer process. Tracks status,
// restarts on crash with exponential backoff, kills on memory overrun,
// and forwards stdout/stderr into the log ring buffer.
//
// All side effects (spawning, timers, memory polling) are injected so
// the unit tests can drive the supervisor deterministically without
// touching the real OS.

import { computeBackoff } from "./backoff";
import { LogRingBuffer } from "./logs";
import type { RegisteredWorker } from "./registry";
import type { LogStream } from "./schema";

// ── Injected primitives ─────────────────────────────────────────────

/**
 * Minimal subset of `Bun.Subprocess` we depend on. Lets the test suite
 * substitute a deterministic fake without pulling in real spawn.
 */
export interface SupervisedProcess {
  readonly pid: number;
  /** Resolves with the exit code (`null` if killed by signal). */
  readonly exited: Promise<number | null>;
  /** Send SIGTERM (or another signal) to the process. */
  kill(signal?: number | NodeJS.Signals): void;
  /** Async iterator over stdout lines (already split). */
  readStdout(onLine: (text: string) => void): void;
  /** Async iterator over stderr lines (already split). */
  readStderr(onLine: (text: string) => void): void;
  /** Resident set size in bytes. Best-effort; -1 if unavailable. */
  readMemoryRss(): number;
}

export interface SpawnArgs {
  readonly worker: RegisteredWorker;
  readonly workdir: string;
}

/** Pluggable spawner. v1 production wraps `Bun.spawn`. */
export type ProcessSpawner = (args: SpawnArgs) => Promise<SupervisedProcess>;

/** Pluggable tarball fetch + extract. v1 production wraps `fetch` + tar. */
export type TarballPreparer = (args: {
  readonly worker: RegisteredWorker;
}) => Promise<{ readonly workdir: string }>;

export interface TimerLike {
  setTimeout(fn: () => void, ms: number): { cancel(): void };
  setInterval(fn: () => void, ms: number): { cancel(): void };
  now(): number;
}

export const realTimers: TimerLike = {
  setTimeout(fn, ms) {
    const id = setTimeout(fn, ms);
    return {
      cancel() {
        clearTimeout(id);
      },
    };
  },
  setInterval(fn, ms) {
    const id = setInterval(fn, ms);
    return {
      cancel() {
        clearInterval(id);
      },
    };
  },
  now() {
    return Date.now();
  },
};

// ── State ───────────────────────────────────────────────────────────

export interface SupervisorState {
  readonly status:
    | "starting"
    | "running"
    | "crashed"
    | "stopped"
    | "failed";
  readonly pid: number | null;
  readonly startedAt: number | null;
  readonly restarts: number;
  readonly lastExitCode: number | null;
  readonly lastExitSignal: string | null;
  readonly nextRestartAt: number | null;
}

const INITIAL_STATE: SupervisorState = Object.freeze({
  status: "stopped",
  pid: null,
  startedAt: null,
  restarts: 0,
  lastExitCode: null,
  lastExitSignal: null,
  nextRestartAt: null,
});

export interface SupervisorOptions {
  readonly worker: RegisteredWorker;
  readonly logs: LogRingBuffer;
  readonly spawn: ProcessSpawner;
  readonly prepare: TarballPreparer;
  readonly timers?: TimerLike;
  /** Memory RSS sampling interval. Default 1s. */
  readonly memorySampleIntervalMs?: number;
  /** Cap for crash restarts before the worker is marked `failed`. */
  readonly maxRestarts?: number;
  readonly onStateChange?: (state: SupervisorState) => void;
  readonly logger?: Pick<Console, "error" | "warn" | "log">;
}

const DEFAULT_MEMORY_SAMPLE_MS = 1_000;
const DEFAULT_MAX_RESTARTS = 50;

// ── Supervisor ──────────────────────────────────────────────────────

export class Supervisor {
  private state: SupervisorState = INITIAL_STATE;
  private readonly worker: RegisteredWorker;
  private readonly logs: LogRingBuffer;
  private readonly spawn: ProcessSpawner;
  private readonly prepare: TarballPreparer;
  private readonly timers: TimerLike;
  private readonly memorySampleMs: number;
  private readonly maxRestarts: number;
  private readonly onStateChange?: (state: SupervisorState) => void;
  private readonly logger: Pick<Console, "error" | "warn" | "log">;

  private current: SupervisedProcess | null = null;
  private memorySampler: { cancel(): void } | null = null;
  private restartTimer: { cancel(): void } | null = null;
  private softKillTimer: { cancel(): void } | null = null;
  private intentionalStop = false;

  constructor(opts: SupervisorOptions) {
    this.worker = opts.worker;
    this.logs = opts.logs;
    this.spawn = opts.spawn;
    this.prepare = opts.prepare;
    this.timers = opts.timers ?? realTimers;
    this.memorySampleMs = opts.memorySampleIntervalMs ?? DEFAULT_MEMORY_SAMPLE_MS;
    this.maxRestarts = opts.maxRestarts ?? DEFAULT_MAX_RESTARTS;
    if (opts.onStateChange !== undefined) this.onStateChange = opts.onStateChange;
    this.logger = opts.logger ?? console;
  }

  snapshot(): SupervisorState {
    return this.state;
  }

  // ── Public lifecycle ──────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state.status === "running" || this.state.status === "starting") {
      return;
    }
    this.intentionalStop = false;
    await this.spawnOnce(/* asRestart */ false);
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    this.cancelRestartTimer();
    if (this.current === null) {
      this.transition({
        ...this.state,
        status: "stopped",
        nextRestartAt: null,
      });
      return;
    }
    const proc = this.current;
    proc.kill("SIGTERM");
    // Schedule SIGKILL after the configured grace period.
    this.softKillTimer = this.timers.setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // Process may have already exited between SIGTERM and now.
      }
    }, this.worker.gracePeriodMs);
    try {
      await proc.exited;
    } finally {
      this.softKillTimer?.cancel();
      this.softKillTimer = null;
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    this.intentionalStop = false;
    await this.spawnOnce(/* asRestart */ true);
  }

  // ── Internal ──────────────────────────────────────────────────────

  private async spawnOnce(asRestart: boolean): Promise<void> {
    this.transition({
      ...this.state,
      status: "starting",
      pid: null,
      lastExitCode: null,
      lastExitSignal: null,
      nextRestartAt: null,
      ...(asRestart ? { restarts: this.state.restarts + 1 } : {}),
    });

    let workdir: string;
    try {
      const prepared = await this.prepare({ worker: this.worker });
      workdir = prepared.workdir;
    } catch (err) {
      const message = err instanceof Error ? err.message : "tarball prepare failed";
      this.logs.append("stderr", `[runtime] tarball prepare failed: ${message}`);
      this.handleExit(/* code */ 1, /* signal */ null);
      return;
    }

    let proc: SupervisedProcess;
    try {
      proc = await this.spawn({ worker: this.worker, workdir });
    } catch (err) {
      const message = err instanceof Error ? err.message : "spawn failed";
      this.logs.append("stderr", `[runtime] spawn failed: ${message}`);
      this.handleExit(/* code */ 1, /* signal */ null);
      return;
    }

    this.current = proc;
    const startedAt = this.timers.now();
    this.transition({
      ...this.state,
      status: "running",
      pid: proc.pid,
      startedAt,
    });

    const onLine = (stream: LogStream) => (text: string) => {
      this.logs.append(stream, text);
    };
    proc.readStdout(onLine("stdout"));
    proc.readStderr(onLine("stderr"));

    // Memory watchdog.
    this.memorySampler = this.timers.setInterval(() => {
      if (this.current !== proc) return;
      const rss = proc.readMemoryRss();
      if (rss < 0) return;
      if (rss > this.worker.limits.memBytes) {
        this.logs.append(
          "stderr",
          `[runtime] memory limit exceeded: rss=${rss} limit=${this.worker.limits.memBytes} — killing`,
        );
        try {
          proc.kill("SIGKILL");
        } catch {
          // already exited
        }
      }
    }, this.memorySampleMs);

    // Wall-clock timeout for finite jobs.
    let timeoutTimer: { cancel(): void } | null = null;
    if (this.worker.limits.timeoutMs !== undefined) {
      const ms = this.worker.limits.timeoutMs;
      timeoutTimer = this.timers.setTimeout(() => {
        if (this.current !== proc) return;
        this.logs.append("stderr", `[runtime] wall-clock timeout after ${ms}ms — killing`);
        try {
          proc.kill("SIGKILL");
        } catch {
          // already exited
        }
      }, ms);
    }

    // Wait for exit and route through the policy engine.
    proc.exited
      .then((code) => {
        timeoutTimer?.cancel();
        this.memorySampler?.cancel();
        this.memorySampler = null;
        if (this.current === proc) this.current = null;
        // Bun's exited resolves to `null` when the process was killed
        // by signal; we surface that as a synthetic SIGKILL marker.
        const exitCode = code ?? 0;
        const signal = code === null ? "SIGKILL" : null;
        this.handleExit(exitCode, signal);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "exited rejected";
        this.logger.error(`[worker-runtime] exit handler error: ${message}`);
      });
  }

  private handleExit(code: number, signal: string | null): void {
    const intentional = this.intentionalStop;
    const policy = this.worker.restartPolicy;
    const isFailure = code !== 0 || signal !== null;

    let nextStatus: SupervisorState["status"];
    let scheduleRestart = false;
    if (intentional) {
      nextStatus = "stopped";
    } else if (policy === "never") {
      nextStatus = isFailure ? "crashed" : "stopped";
    } else if (policy === "on-failure" && !isFailure) {
      nextStatus = "stopped";
    } else if (this.state.restarts >= this.maxRestarts) {
      nextStatus = "failed";
      this.logs.append(
        "stderr",
        `[runtime] exhausted ${this.maxRestarts} restart attempts — marking failed`,
      );
    } else {
      nextStatus = "crashed";
      scheduleRestart = true;
    }

    let nextRestartAt: number | null = null;
    if (scheduleRestart) {
      const delay = computeBackoff(this.state.restarts + 1);
      nextRestartAt = this.timers.now() + delay;
      this.cancelRestartTimer();
      this.restartTimer = this.timers.setTimeout(() => {
        this.restartTimer = null;
        // Only restart if state is still crashed and not intentionally
        // stopped between scheduling and firing.
        if (this.intentionalStop) return;
        if (this.state.status !== "crashed") return;
        void this.spawnOnce(/* asRestart */ true).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "restart failed";
          this.logger.error(`[worker-runtime] restart error: ${message}`);
        });
      }, delay);
    }

    this.transition({
      ...this.state,
      status: nextStatus,
      pid: null,
      lastExitCode: code,
      lastExitSignal: signal,
      nextRestartAt,
    });
  }

  private cancelRestartTimer(): void {
    if (this.restartTimer !== null) {
      this.restartTimer.cancel();
      this.restartTimer = null;
    }
  }

  private transition(next: SupervisorState): void {
    this.state = next;
    if (this.onStateChange !== undefined) {
      try {
        this.onStateChange(next);
      } catch (err) {
        const message = err instanceof Error ? err.message : "listener threw";
        this.logger.warn(`[worker-runtime] state listener error: ${message}`);
      }
    }
  }
}
