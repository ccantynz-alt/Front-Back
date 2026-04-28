// ── Test helpers — deterministic supervisor harness ────────────────
// A fake spawner and a fake clock used across the test suite so we
// never depend on real process spawning or wall-clock timers.

import type {
  ProcessSpawner,
  SupervisedProcess,
  TarballPreparer,
  TimerLike,
} from "../src/supervisor";

export interface FakeProcessHandle {
  readonly process: SupervisedProcess;
  emitStdout(line: string): void;
  emitStderr(line: string): void;
  exit(code: number): void;
  killedSignals: (string | number)[];
  rss: number;
}

export function createFakeProcess(pid: number): FakeProcessHandle {
  let stdoutListener: ((line: string) => void) | null = null;
  let stderrListener: ((line: string) => void) | null = null;
  let resolveExit: ((code: number | null) => void) | null = null;
  const killedSignals: (string | number)[] = [];
  const exited = new Promise<number | null>((resolve) => {
    resolveExit = resolve;
  });
  const handle: FakeProcessHandle = {
    process: {
      pid,
      exited,
      kill(signal) {
        killedSignals.push(signal ?? "default");
        // SIGKILL terminates immediately with code null (signal exit).
        if (signal === "SIGKILL" || signal === 9) {
          resolveExit?.(null);
          resolveExit = null;
        }
      },
      readStdout(onLine) {
        stdoutListener = onLine;
      },
      readStderr(onLine) {
        stderrListener = onLine;
      },
      readMemoryRss() {
        return handle.rss;
      },
    },
    emitStdout(line) {
      stdoutListener?.(line);
    },
    emitStderr(line) {
      stderrListener?.(line);
    },
    exit(code) {
      resolveExit?.(code);
      resolveExit = null;
    },
    killedSignals,
    rss: -1,
  };
  return handle;
}

export interface FakeSpawnerControl {
  readonly spawner: ProcessSpawner;
  /** All processes spawned, in order. */
  readonly processes: FakeProcessHandle[];
  /** Resolves with the next spawn (waits for it to happen). */
  nextSpawn(): Promise<FakeProcessHandle>;
  /** Force the next spawn() call to throw. */
  failNextSpawn(message: string): void;
}

export function createFakeSpawner(): FakeSpawnerControl {
  const processes: FakeProcessHandle[] = [];
  const pending: ((handle: FakeProcessHandle) => void)[] = [];
  let nextPid = 1000;
  let failNext: string | null = null;

  const spawner: ProcessSpawner = async () => {
    if (failNext !== null) {
      const message = failNext;
      failNext = null;
      throw new Error(message);
    }
    const handle = createFakeProcess(nextPid++);
    processes.push(handle);
    const waiter = pending.shift();
    if (waiter !== undefined) waiter(handle);
    return handle.process;
  };

  return {
    spawner,
    processes,
    nextSpawn() {
      const idx = processes.length;
      if (processes[idx] !== undefined) {
        // already spawned
        const existing = processes[idx];
        if (existing !== undefined) return Promise.resolve(existing);
      }
      return new Promise((resolve) => {
        pending.push(resolve);
      });
    },
    failNextSpawn(message) {
      failNext = message;
    },
  };
}

export const noopPrepare: TarballPreparer = async () =>
  Promise.resolve({ workdir: "/tmp/fake-workdir" });

export function failingPrepare(message: string): TarballPreparer {
  return async () => {
    throw new Error(message);
  };
}

// ── Fake clock ──────────────────────────────────────────────────────

interface ScheduledTask {
  id: number;
  fireAt: number;
  fn: () => void;
  intervalMs: number | null;
  cancelled: boolean;
}

export interface FakeClock extends TimerLike {
  /** Advance the fake clock, firing any tasks whose fireAt <= new now. */
  advance(ms: number): void;
  /** Number of currently scheduled tasks. */
  pending(): number;
}

export function createFakeClock(start: number = 0): FakeClock {
  let current = start;
  let nextId = 1;
  const tasks: ScheduledTask[] = [];

  const schedule = (
    fn: () => void,
    ms: number,
    intervalMs: number | null,
  ): { cancel(): void } => {
    const task: ScheduledTask = {
      id: nextId++,
      fireAt: current + ms,
      fn,
      intervalMs,
      cancelled: false,
    };
    tasks.push(task);
    return {
      cancel() {
        task.cancelled = true;
      },
    };
  };

  return {
    setTimeout(fn, ms) {
      return schedule(fn, ms, null);
    },
    setInterval(fn, ms) {
      return schedule(fn, ms, ms);
    },
    now() {
      return current;
    },
    advance(ms) {
      const target = current + ms;
      // Fire tasks in order until we reach target.
      // Tasks may schedule new tasks; loop until none are due.
      for (;;) {
        const due = tasks.find((t) => !t.cancelled && t.fireAt <= target);
        if (due === undefined) break;
        // Move clock to the task's fireAt before firing so handlers
        // observe the right "now()".
        current = due.fireAt;
        if (due.intervalMs !== null) {
          due.fireAt = current + due.intervalMs;
        } else {
          due.cancelled = true;
        }
        try {
          due.fn();
        } catch {
          // Swallow handler errors so a buggy task doesn't break other
          // pending tasks during a single advance() call.
        }
      }
      current = target;
    },
    pending() {
      return tasks.filter((t) => !t.cancelled).length;
    },
  };
}

// ── Async test util ─────────────────────────────────────────────────

/** Resolve after all currently-queued microtasks have run. */
export function flushMicrotasks(rounds = 5): Promise<void> {
  let p: Promise<void> = Promise.resolve();
  for (let i = 0; i < rounds; i++) {
    p = p.then(() => Promise.resolve());
  }
  return p;
}
