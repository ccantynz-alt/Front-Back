import { and, asc, desc, eq, gt } from "drizzle-orm";
import { buildLogs, buildRuns, buildSteps, db } from "@back-to-the-future/db";

type Database = typeof db;

export interface RunSummary {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly status: string;
  readonly actorLabel: string | null;
  readonly gitBranch: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly error: string | null;
}

export interface RunDetail extends RunSummary {
  readonly metadata: Record<string, unknown> | null;
  readonly steps: ReadonlyArray<StepDetail>;
}

export interface StepDetail {
  readonly id: string;
  readonly seq: number;
  readonly name: string;
  readonly status: string;
  readonly exitCode: number | null;
  readonly error: string | null;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
}

export interface LogEntry {
  readonly id: string;
  readonly stepId: string | null;
  readonly seq: number;
  readonly stream: string;
  readonly line: string;
  readonly timestamp: Date;
}

export async function listRuns(
  database: Database,
  options: { limit?: number } = {},
): Promise<ReadonlyArray<RunSummary>> {
  const limit = options.limit ?? 50;
  const rows = await database
    .select({
      id: buildRuns.id,
      kind: buildRuns.kind,
      title: buildRuns.title,
      status: buildRuns.status,
      actorLabel: buildRuns.actorLabel,
      gitBranch: buildRuns.gitBranch,
      startedAt: buildRuns.startedAt,
      endedAt: buildRuns.endedAt,
      error: buildRuns.error,
    })
    .from(buildRuns)
    .orderBy(desc(buildRuns.startedAt))
    .limit(limit);
  return rows;
}

export async function getRun(
  database: Database,
  runId: string,
): Promise<RunDetail | null> {
  const rows = await database
    .select()
    .from(buildRuns)
    .where(eq(buildRuns.id, runId))
    .limit(1);
  const run = rows[0];
  if (!run) return null;

  const steps = await database
    .select({
      id: buildSteps.id,
      seq: buildSteps.seq,
      name: buildSteps.name,
      status: buildSteps.status,
      exitCode: buildSteps.exitCode,
      error: buildSteps.error,
      startedAt: buildSteps.startedAt,
      endedAt: buildSteps.endedAt,
    })
    .from(buildSteps)
    .where(eq(buildSteps.runId, runId))
    .orderBy(asc(buildSteps.seq));

  let metadata: Record<string, unknown> | null = null;
  if (run.metadata) {
    try {
      metadata = JSON.parse(run.metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }

  return {
    id: run.id,
    kind: run.kind,
    title: run.title,
    status: run.status,
    actorLabel: run.actorLabel,
    gitBranch: run.gitBranch,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    error: run.error,
    metadata,
    steps,
  };
}

/**
 * Fetch logs for a run since the last known sequence number. The stream
 * handler passes `sinceSeq` from the last tick to get just the tail.
 */
export async function tailLogs(
  database: Database,
  runId: string,
  sinceSeq: number,
  limit = 200,
): Promise<ReadonlyArray<LogEntry>> {
  const rows = await database
    .select({
      id: buildLogs.id,
      stepId: buildLogs.stepId,
      seq: buildLogs.seq,
      stream: buildLogs.stream,
      line: buildLogs.line,
      timestamp: buildLogs.timestamp,
    })
    .from(buildLogs)
    .where(and(eq(buildLogs.runId, runId), gt(buildLogs.seq, sinceSeq)))
    .orderBy(asc(buildLogs.seq))
    .limit(limit);
  return rows;
}
