import { beforeEach, describe, expect, test } from "bun:test";
import { Dispatcher, computeBackoffMs } from "./dispatcher";
import { type DispatchTarget, JobRegistry } from "./registry";
import { type Clock, Scheduler } from "./scheduler";

interface MockClock extends Clock {
  advance(ms: number): void;
  set(ms: number): void;
}

function makeClock(start: number): MockClock {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      // In tests, advance the virtual clock instead of really sleeping.
      t += ms;
    },
    advance(ms) {
      t += ms;
    },
    set(ms) {
      t = ms;
    },
  };
}

function makeTarget(overrides: Partial<DispatchTarget> = {}): DispatchTarget {
  return {
    type: "webhook",
    endpoint: "https://example.test/hook",
    payload: { ping: 1 },
    ...overrides,
  };
}

interface TransportRecord {
  attempt: number;
  scheduledFor: number;
}

function makeFlakeyDispatcher(failuresBeforeSuccess: number): {
  calls: TransportRecord[];
  dispatcher: Dispatcher;
} {
  const calls: TransportRecord[] = [];
  let remaining = failuresBeforeSuccess;
  const dispatcher = new Dispatcher({
    transport: async (_target, ctx) => {
      calls.push({ attempt: ctx.attempt, scheduledFor: ctx.scheduledFor });
      if (remaining > 0) {
        remaining--;
        return { status: 503, body: "service unavailable" };
      }
      return { status: 200, body: "ok" };
    },
  });
  return { calls, dispatcher };
}

describe("Scheduler tick-loop", () => {
  let clock: MockClock;
  let registry: JobRegistry;
  beforeEach(() => {
    clock = makeClock(Date.UTC(2026, 0, 1, 12, 0, 0));
    registry = new JobRegistry({ now: () => clock.now() });
  });

  test("dispatches a due job once on tick", async () => {
    const { calls, dispatcher } = makeFlakeyDispatcher(0);
    const scheduler = new Scheduler({ registry, dispatcher, clock });

    const job = registry.createJob({
      tenantId: "t1",
      cronExpr: "* * * * *",
      target: makeTarget(),
    });

    // First tick: no nextRunAt set yet — schedules.
    await scheduler.tick();
    expect(registry.getJob(job.jobId)?.nextRunAt).not.toBeNull();

    // Advance past the next run.
    const nextAt = registry.getJob(job.jobId)?.nextRunAt as number;
    clock.set(nextAt + 100);
    await scheduler.tick();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.attempt).toBe(1);
    const runs = registry.listRuns(job.jobId);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("ok");
  });

  test("retries on failure with exponential backoff", async () => {
    const { calls, dispatcher } = makeFlakeyDispatcher(2);
    const scheduler = new Scheduler({ registry, dispatcher, clock });

    const job = registry.createJob({
      tenantId: "t1",
      cronExpr: "* * * * *",
      target: makeTarget(),
      retryPolicy: { maxAttempts: 3, backoffMs: 1_000 },
    });

    await scheduler.tick();
    const due = registry.getJob(job.jobId)?.nextRunAt as number;
    clock.set(due + 50);
    const startTs = clock.now();
    await scheduler.tick();

    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.attempt)).toEqual([1, 2, 3]);

    // Backoff should have advanced the virtual clock by 1s + 2s = 3s.
    expect(clock.now() - startTs).toBeGreaterThanOrEqual(3_000);

    const runs = registry.listRuns(job.jobId);
    expect(runs).toHaveLength(3);
    expect(runs[0]?.status).toBe("failed");
    expect(runs[1]?.status).toBe("failed");
    expect(runs[2]?.status).toBe("ok");
    expect(runs[2]?.terminal).toBe(true);
  });

  test("dead-letters jobs that exhaust retries", async () => {
    const calls: TransportRecord[] = [];
    const dispatcher = new Dispatcher({
      transport: async (_t, ctx) => {
        calls.push({ attempt: ctx.attempt, scheduledFor: ctx.scheduledFor });
        return { status: 500, body: "boom" };
      },
    });
    const scheduler = new Scheduler({ registry, dispatcher, clock });

    const job = registry.createJob({
      tenantId: "tenant-x",
      cronExpr: "* * * * *",
      target: makeTarget(),
      retryPolicy: { maxAttempts: 2, backoffMs: 100 },
    });
    await scheduler.tick();
    const due = registry.getJob(job.jobId)?.nextRunAt as number;
    clock.set(due + 50);
    await scheduler.tick();

    expect(calls).toHaveLength(2);
    const dead = registry.listDeadLetters({ tenantId: "tenant-x" });
    expect(dead).toHaveLength(1);
    expect(dead[0]?.attempts).toBe(2);
    expect(dead[0]?.lastError).toMatch(/HTTP 500/);
  });

  test("paused jobs are skipped", async () => {
    const { calls, dispatcher } = makeFlakeyDispatcher(0);
    const scheduler = new Scheduler({ registry, dispatcher, clock });

    const job = registry.createJob({
      tenantId: "t1",
      cronExpr: "* * * * *",
      target: makeTarget(),
      status: "paused",
    });
    await scheduler.tick();
    expect(registry.getJob(job.jobId)?.nextRunAt).toBeNull();

    clock.advance(5 * 60 * 1000);
    await scheduler.tick();
    expect(calls).toHaveLength(0);
  });

  test("resumed jobs reschedule and dispatch", async () => {
    const { calls, dispatcher } = makeFlakeyDispatcher(0);
    const scheduler = new Scheduler({ registry, dispatcher, clock });

    const job = registry.createJob({
      tenantId: "t1",
      cronExpr: "* * * * *",
      target: makeTarget(),
      status: "paused",
    });
    registry.setStatus(job.jobId, "active");
    scheduler.refreshNextFire(job.jobId);

    const due = registry.getJob(job.jobId)?.nextRunAt as number;
    clock.set(due + 50);
    await scheduler.tick();
    expect(calls).toHaveLength(1);
  });

  test("manual trigger fires immediately even outside schedule window", async () => {
    const { calls, dispatcher } = makeFlakeyDispatcher(0);
    const scheduler = new Scheduler({ registry, dispatcher, clock });
    const job = registry.createJob({
      tenantId: "t1",
      cronExpr: "0 0 1 1 *", // once a year
      target: makeTarget(),
    });
    const run = await scheduler.triggerNow(job.jobId);
    expect(calls).toHaveLength(1);
    expect(run?.status).toBe("ok");
  });

  test("after a successful run, nextRunAt advances to the next match", async () => {
    const { dispatcher } = makeFlakeyDispatcher(0);
    const scheduler = new Scheduler({ registry, dispatcher, clock });
    const job = registry.createJob({
      tenantId: "t1",
      cronExpr: "* * * * *",
      target: makeTarget(),
    });
    await scheduler.tick();
    const firstNext = registry.getJob(job.jobId)?.nextRunAt as number;
    clock.set(firstNext + 50);
    await scheduler.tick();
    const secondNext = registry.getJob(job.jobId)?.nextRunAt as number;
    expect(secondNext).toBeGreaterThan(firstNext);
  });
});

describe("computeBackoffMs", () => {
  test("doubles each attempt and respects the cap", () => {
    expect(computeBackoffMs({ backoffMs: 1000 }, 1)).toBe(1000);
    expect(computeBackoffMs({ backoffMs: 1000 }, 2)).toBe(2000);
    expect(computeBackoffMs({ backoffMs: 1000 }, 3)).toBe(4000);
    expect(computeBackoffMs({ backoffMs: 1000, maxBackoffMs: 3000 }, 5)).toBe(
      3000,
    );
  });
});
