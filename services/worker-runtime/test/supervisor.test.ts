import { beforeEach, describe, expect, test } from "bun:test";
import { LogRingBuffer } from "../src/logs";
import { fromRegistration, type RegisteredWorker } from "../src/registry";
import { WorkerRegistrationSchema } from "../src/schema";
import { Supervisor } from "../src/supervisor";
import {
  createFakeClock,
  createFakeSpawner,
  failingPrepare,
  flushMicrotasks,
  noopPrepare,
} from "./helpers";

const VALID_SHA = "b".repeat(64);

function makeWorker(overrides: Partial<{
  restartPolicy: "always" | "on-failure" | "never";
  memBytes: number;
  timeoutMs: number;
  gracePeriodMs: number;
}> = {}): RegisteredWorker {
  const base: Record<string, unknown> = {
    workerId: "worker-1",
    tenantId: "tenant-1",
    tarballUrl: "https://cdn.example.com/x.tar.gz",
    sha256: VALID_SHA,
    command: ["./run.sh"],
  };
  if (overrides.restartPolicy !== undefined) base["restartPolicy"] = overrides.restartPolicy;
  if (overrides.gracePeriodMs !== undefined) base["gracePeriodMs"] = overrides.gracePeriodMs;
  const limits: Record<string, unknown> = {};
  if (overrides.memBytes !== undefined) limits["memBytes"] = overrides.memBytes;
  if (overrides.timeoutMs !== undefined) limits["timeoutMs"] = overrides.timeoutMs;
  if (Object.keys(limits).length > 0) base["limits"] = limits;
  return fromRegistration(WorkerRegistrationSchema.parse(base));
}

let logs: LogRingBuffer;

beforeEach(() => {
  logs = new LogRingBuffer();
});

describe("Supervisor.start", () => {
  test("transitions starting → running on successful spawn", async () => {
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker(),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: createFakeClock(),
    });
    expect(sup.snapshot().status).toBe("stopped");
    await sup.start();
    await flushMicrotasks();
    const state = sup.snapshot();
    expect(state.status).toBe("running");
    expect(state.pid).toBe(1000);
    expect(spawner.processes).toHaveLength(1);
  });

  test("idempotent — calling start twice does not double-spawn", async () => {
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker(),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: createFakeClock(),
    });
    await sup.start();
    await sup.start();
    expect(spawner.processes).toHaveLength(1);
  });

  test("logs and marks crashed when prepare fails (on-failure policy)", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({ restartPolicy: "on-failure" }),
      logs,
      spawn: spawner.spawner,
      prepare: failingPrepare("cdn down"),
      timers: clock,
    });
    await sup.start();
    await flushMicrotasks();
    const state = sup.snapshot();
    expect(state.status).toBe("crashed");
    expect(state.lastExitCode).toBe(1);
    const errs = logs.snapshot().filter((l) => l.stream === "stderr");
    expect(errs.some((l) => l.text.includes("cdn down"))).toBe(true);
  });
});

describe("Supervisor crash + restart", () => {
  test("on-failure: schedules restart after exponential backoff, succeeds", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({ restartPolicy: "on-failure" }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
    });
    await sup.start();
    await flushMicrotasks();
    expect(sup.snapshot().status).toBe("running");
    // Crash first proc.
    spawner.processes[0]?.exit(7);
    await flushMicrotasks();
    let state = sup.snapshot();
    expect(state.status).toBe("crashed");
    expect(state.lastExitCode).toBe(7);
    expect(state.nextRestartAt).not.toBeNull();
    // Advance past first backoff (1s).
    clock.advance(1_000);
    await flushMicrotasks();
    state = sup.snapshot();
    expect(state.status).toBe("running");
    expect(state.restarts).toBe(1);
    expect(spawner.processes).toHaveLength(2);
  });

  test("on-failure: clean exit code 0 transitions to stopped, no restart", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({ restartPolicy: "on-failure" }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
    });
    await sup.start();
    await flushMicrotasks();
    spawner.processes[0]?.exit(0);
    await flushMicrotasks();
    const state = sup.snapshot();
    expect(state.status).toBe("stopped");
    expect(state.nextRestartAt).toBeNull();
  });

  test("always: clean exit triggers restart anyway", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({ restartPolicy: "always" }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
    });
    await sup.start();
    await flushMicrotasks();
    spawner.processes[0]?.exit(0);
    await flushMicrotasks();
    expect(sup.snapshot().status).toBe("crashed");
    clock.advance(1_000);
    await flushMicrotasks();
    expect(sup.snapshot().status).toBe("running");
  });

  test("never: crash transitions to crashed, no restart scheduled", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({ restartPolicy: "never" }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
    });
    await sup.start();
    await flushMicrotasks();
    spawner.processes[0]?.exit(2);
    await flushMicrotasks();
    expect(sup.snapshot().status).toBe("crashed");
    expect(sup.snapshot().nextRestartAt).toBeNull();
    clock.advance(60_000);
    await flushMicrotasks();
    expect(spawner.processes).toHaveLength(1);
  });

  test("backoff doubles on repeated crashes", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({ restartPolicy: "always" }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
    });
    await sup.start();
    await flushMicrotasks();
    // Crash 1
    spawner.processes[0]?.exit(1);
    await flushMicrotasks();
    expect(sup.snapshot().nextRestartAt).toBe(1_000);
    clock.advance(1_000);
    await flushMicrotasks();
    // Crash 2
    spawner.processes[1]?.exit(1);
    await flushMicrotasks();
    const second = sup.snapshot();
    expect(second.nextRestartAt).toBe(clock.now() + 2_000);
    clock.advance(2_000);
    await flushMicrotasks();
    // Crash 3
    spawner.processes[2]?.exit(1);
    await flushMicrotasks();
    expect(sup.snapshot().nextRestartAt).toBe(clock.now() + 4_000);
  });

  test("marks failed after max restarts", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({ restartPolicy: "always" }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
      maxRestarts: 2,
    });
    await sup.start();
    await flushMicrotasks();
    // Crash 1 → restart scheduled
    spawner.processes[0]?.exit(1);
    await flushMicrotasks();
    clock.advance(1_000);
    await flushMicrotasks();
    // Crash 2 → restart scheduled (restart count now 2)
    spawner.processes[1]?.exit(1);
    await flushMicrotasks();
    clock.advance(2_000);
    await flushMicrotasks();
    // Crash 3 → exhausted
    spawner.processes[2]?.exit(1);
    await flushMicrotasks();
    expect(sup.snapshot().status).toBe("failed");
  });
});

describe("Supervisor.stop", () => {
  test("sends SIGTERM then resolves on exit", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({ restartPolicy: "always", gracePeriodMs: 5_000 }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
    });
    await sup.start();
    await flushMicrotasks();
    const proc = spawner.processes[0];
    expect(proc).toBeDefined();
    const stopPromise = sup.stop();
    // SIGTERM queued; cooperative exit
    proc?.exit(0);
    await stopPromise;
    expect(proc?.killedSignals).toContain("SIGTERM");
    expect(sup.snapshot().status).toBe("stopped");
  });

  test("escalates to SIGKILL after grace period", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({ restartPolicy: "always", gracePeriodMs: 1_000 }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
    });
    await sup.start();
    await flushMicrotasks();
    const proc = spawner.processes[0];
    const stopPromise = sup.stop();
    // Process refuses to exit; advance past grace period.
    clock.advance(1_000);
    await stopPromise;
    expect(proc?.killedSignals).toEqual(
      expect.arrayContaining(["SIGTERM", "SIGKILL"]),
    );
    expect(sup.snapshot().status).toBe("stopped");
  });

  test("intentional stop is not interpreted as a crash for restart policy", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({ restartPolicy: "always", gracePeriodMs: 100 }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
    });
    await sup.start();
    await flushMicrotasks();
    const stopPromise = sup.stop();
    spawner.processes[0]?.exit(1); // exit non-zero — but it's intentional
    await stopPromise;
    expect(sup.snapshot().status).toBe("stopped");
    expect(sup.snapshot().nextRestartAt).toBeNull();
    clock.advance(60_000);
    await flushMicrotasks();
    expect(spawner.processes).toHaveLength(1);
  });
});

describe("Supervisor memory enforcement", () => {
  test("kills the process when RSS exceeds the limit", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({
        restartPolicy: "never",
        memBytes: 64 * 1024 * 1024,
      }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
      memorySampleIntervalMs: 50,
    });
    await sup.start();
    await flushMicrotasks();
    const proc = spawner.processes[0];
    expect(proc).toBeDefined();
    if (proc !== undefined) proc.rss = 128 * 1024 * 1024;
    clock.advance(50);
    await flushMicrotasks();
    expect(proc?.killedSignals).toContain("SIGKILL");
    const errs = logs.snapshot().filter((l) => l.stream === "stderr");
    expect(errs.some((l) => l.text.includes("memory limit exceeded"))).toBe(true);
  });

  test("does not kill when RSS is unavailable (-1)", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({
        restartPolicy: "always",
        memBytes: 16 * 1024 * 1024,
      }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
      memorySampleIntervalMs: 25,
    });
    await sup.start();
    await flushMicrotasks();
    // Default rss is -1 — supervisor should skip the kill.
    clock.advance(500);
    await flushMicrotasks();
    expect(spawner.processes[0]?.killedSignals).not.toContain("SIGKILL");
    expect(sup.snapshot().status).toBe("running");
  });
});

describe("Supervisor wall-clock timeout", () => {
  test("kills after timeoutMs for finite jobs", async () => {
    const clock = createFakeClock();
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker({
        restartPolicy: "never",
        timeoutMs: 5_000,
      }),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: clock,
    });
    await sup.start();
    await flushMicrotasks();
    clock.advance(5_000);
    await flushMicrotasks();
    expect(spawner.processes[0]?.killedSignals).toContain("SIGKILL");
  });
});

describe("Supervisor log streaming", () => {
  test("forwards stdout/stderr lines into the ring buffer", async () => {
    const spawner = createFakeSpawner();
    const sup = new Supervisor({
      worker: makeWorker(),
      logs,
      spawn: spawner.spawner,
      prepare: noopPrepare,
      timers: createFakeClock(),
    });
    await sup.start();
    await flushMicrotasks();
    spawner.processes[0]?.emitStdout("hello world");
    spawner.processes[0]?.emitStderr("oops");
    const snap = logs.snapshot();
    expect(snap.map((l) => `${l.stream}:${l.text}`)).toEqual([
      "stdout:hello world",
      "stderr:oops",
    ]);
  });
});
