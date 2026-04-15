import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { buildLogs, buildRuns, buildSteps, db } from "@back-to-the-future/db";
import type {
  LogStream,
  RunHandle,
  StartRunInput,
  StepHandle,
} from "./types";

type Database = typeof db;

/**
 * Start a new build-theatre run. Every long-running platform operation
 * (deploy, ingest, migration, voice dispatch, CI gate, agent run) should
 * open a run, emit steps as it progresses, and close the run on completion.
 *
 * Usage:
 * ```
 * const run = await startRun(db, { kind: "ingest", title: "Flywheel ingest" });
 * try {
 *   await run.step("scan transcripts", async (step) => {
 *     await step.log("found 11 files");
 *   });
 *   await run.succeed();
 * } catch (err) {
 *   await run.fail(err);
 *   throw err;
 * }
 * ```
 */
export async function startRun(
  database: Database,
  input: StartRunInput,
): Promise<RunHandle> {
  const id = randomUUID();
  const now = new Date();

  await database.insert(buildRuns).values({
    id,
    kind: input.kind,
    title: input.title,
    status: "running",
    actorUserId: input.actorUserId ?? null,
    actorLabel: input.actorLabel ?? null,
    gitBranch: input.gitBranch ?? null,
    gitSha: input.gitSha ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    startedAt: now,
  });

  const runLogCounter = { value: 0 };

  async function runLog(line: string, stream: LogStream = "stdout"): Promise<void> {
    runLogCounter.value += 1;
    await database.insert(buildLogs).values({
      id: randomUUID(),
      runId: id,
      stepId: null,
      seq: runLogCounter.value,
      stream,
      line,
      timestamp: new Date(),
    });
  }

  async function succeed(): Promise<void> {
    await database
      .update(buildRuns)
      .set({ status: "succeeded", endedAt: new Date() })
      .where(eq(buildRuns.id, id));
  }

  async function fail(error: Error | string): Promise<void> {
    const message = error instanceof Error ? error.message : error;
    await database
      .update(buildRuns)
      .set({ status: "failed", error: message, endedAt: new Date() })
      .where(eq(buildRuns.id, id));
  }

  async function cancel(): Promise<void> {
    await database
      .update(buildRuns)
      .set({ status: "cancelled", endedAt: new Date() })
      .where(eq(buildRuns.id, id));
  }

  async function isCancelRequested(): Promise<boolean> {
    const row = await database
      .select({ cancel: buildRuns.cancelRequestedAt })
      .from(buildRuns)
      .where(eq(buildRuns.id, id))
      .limit(1);
    return row.length > 0 && row[0]?.cancel != null;
  }

  let stepCounter = 0;

  async function step<T>(
    name: string,
    fn: (step: StepHandle) => Promise<T>,
  ): Promise<T> {
    stepCounter += 1;
    const stepId = randomUUID();
    const startedAt = new Date();
    const stepLogCounter = { value: 0 };

    await database.insert(buildSteps).values({
      id: stepId,
      runId: id,
      seq: stepCounter,
      name,
      status: "running",
      startedAt,
    });

    const handle: StepHandle = {
      id: stepId,
      runId: id,
      name,
      async log(line: string, stream: LogStream = "stdout"): Promise<void> {
        stepLogCounter.value += 1;
        await database.insert(buildLogs).values({
          id: randomUUID(),
          runId: id,
          stepId,
          seq: stepLogCounter.value,
          stream,
          line,
          timestamp: new Date(),
        });
      },
      async succeed(): Promise<void> {
        await database
          .update(buildSteps)
          .set({ status: "succeeded", endedAt: new Date() })
          .where(eq(buildSteps.id, stepId));
      },
      async fail(error: Error | string, exitCode?: number): Promise<void> {
        const msg = error instanceof Error ? error.message : error;
        await database
          .update(buildSteps)
          .set({
            status: "failed",
            error: msg,
            exitCode: exitCode ?? null,
            endedAt: new Date(),
          })
          .where(eq(buildSteps.id, stepId));
      },
      async skip(reason?: string): Promise<void> {
        await database
          .update(buildSteps)
          .set({
            status: "skipped",
            error: reason ?? null,
            endedAt: new Date(),
          })
          .where(eq(buildSteps.id, stepId));
      },
    };

    try {
      const result = await fn(handle);
      await handle.succeed();
      return result;
    } catch (err) {
      await handle.fail(err instanceof Error ? err : String(err));
      throw err;
    }
  }

  return {
    id,
    kind: input.kind,
    step,
    log: runLog,
    succeed,
    fail,
    cancel,
    isCancelRequested,
  };
}

/**
 * Mark a run for cancellation. The running producer is expected to poll
 * `isCancelRequested()` at safe checkpoints and exit cleanly.
 */
export async function requestCancel(
  database: Database,
  runId: string,
): Promise<void> {
  await database
    .update(buildRuns)
    .set({ cancelRequestedAt: new Date() })
    .where(eq(buildRuns.id, runId));
}
