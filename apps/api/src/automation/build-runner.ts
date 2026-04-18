/**
 * BLK-009 Build Runner — scaffold.
 *
 * Given a deployment id, clones the project's git repo, runs `bun install`
 * and `bun run build`, and captures stdout/stderr line-by-line into the
 * `deployment_logs` table. Updates the deployment's status as it progresses
 * through queued → building → deploying → live (or failed on error).
 *
 * NOTE — this file is scaffolded for BLK-009. The actual spawn/clone logic
 * is not wired yet (the surrounding backend needs to land first). Every
 * step currently logs via `console.log` + writes a `deployment_logs` row
 * so upstream consumers (webhook receiver, tRPC procedures, Theatre SSE)
 * can be built and tested against the real runner shape without
 * side-effects on the host.
 */

import { and, eq } from "drizzle-orm";
import { db as defaultDb, deployments, deploymentLogs, projects } from "@back-to-the-future/db";

export type DbClient = typeof defaultDb;

/** Status values the runner transitions a deployment through. */
export type DeploymentStatus =
  | "queued"
  | "building"
  | "deploying"
  | "live"
  | "failed"
  | "rolled_back"
  | "cancelled";

/** A single log line captured during a build. */
export interface BuildLogEntry {
  stream: "stdout" | "stderr" | "event";
  line: string;
}

export interface RunBuildOptions {
  /** Override DB client (primarily for tests). */
  db?: DbClient;
  /** Override "now" so tests can pin timestamps. */
  now?: () => Date;
}

export interface RunBuildResult {
  deploymentId: string;
  status: DeploymentStatus;
  buildDurationMs: number | null;
  deployUrl: string | null;
  errorMessage: string | null;
}

// ── Internal helpers ─────────────────────────────────────────────────

function generateLogId(): string {
  return crypto.randomUUID();
}

async function writeLog(
  db: DbClient,
  deploymentId: string,
  entry: BuildLogEntry,
  now: Date,
): Promise<void> {
  await db.insert(deploymentLogs).values({
    id: generateLogId(),
    deploymentId,
    stream: entry.stream,
    line: entry.line,
    timestamp: now,
  });
}

async function updateStatus(
  db: DbClient,
  deploymentId: string,
  status: DeploymentStatus,
  patch: Partial<typeof deployments.$inferInsert> = {},
): Promise<void> {
  await db
    .update(deployments)
    .set({ status, ...patch })
    .where(eq(deployments.id, deploymentId));
}

async function loadDeployment(
  db: DbClient,
  deploymentId: string,
): Promise<typeof deployments.$inferSelect | null> {
  const rows = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);
  return rows[0] ?? null;
}

async function loadProject(
  db: DbClient,
  projectId: string,
): Promise<typeof projects.$inferSelect | null> {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function isCancelled(
  db: DbClient,
  deploymentId: string,
): Promise<boolean> {
  const rows = await db
    .select({
      cancelRequestedAt: deployments.cancelRequestedAt,
      status: deployments.status,
    })
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  return row.cancelRequestedAt !== null || row.status === "cancelled";
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Run a deployment end-to-end: clone → install → build → deploy.
 *
 * SCAFFOLD: the actual child_process/spawn logic is intentionally stubbed
 * with console.log + log-row inserts so the surrounding pipeline can be
 * wired first. The step sequence and error handling below is the final
 * shape — replace the per-step "TODO: spawn …" blocks once the orchestrator
 * contract is finalised.
 */
export async function runBuild(
  deploymentId: string,
  options: RunBuildOptions = {},
): Promise<RunBuildResult> {
  const db = options.db ?? defaultDb;
  const now = options.now ?? ((): Date => new Date());
  const startTime = now();

  // ── 1. Load deployment + project ─────────────────────────────────
  const deployment = await loadDeployment(db, deploymentId);
  if (!deployment) {
    return {
      deploymentId,
      status: "failed",
      buildDurationMs: null,
      deployUrl: null,
      errorMessage: "deployment not found",
    };
  }

  const project = await loadProject(db, deployment.projectId);
  if (!project) {
    await updateStatus(db, deploymentId, "failed", {
      errorMessage: "project not found",
      completedAt: now(),
      finishedAt: now(),
    });
    return {
      deploymentId,
      status: "failed",
      buildDurationMs: null,
      deployUrl: null,
      errorMessage: "project not found",
    };
  }

  // ── 2. Transition queued → building ──────────────────────────────
  const buildStartedAt = now();
  await updateStatus(db, deploymentId, "building", {
    startedAt: buildStartedAt,
  });
  await writeLog(
    db,
    deploymentId,
    {
      stream: "event",
      line: `[build-runner] starting build for ${project.name} (${deployment.branch ?? "main"}@${deployment.commitSha ?? "HEAD"})`,
    },
    buildStartedAt,
  );

  // ── 3. Step: git clone (SCAFFOLD) ────────────────────────────────
  console.log(
    `[build-runner] step=clone deployment=${deploymentId} repo=${project.repoUrl ?? "<none>"} branch=${deployment.branch ?? "main"}`,
  );
  await writeLog(
    db,
    deploymentId,
    {
      stream: "stdout",
      line: `git clone ${project.repoUrl ?? "<no repo configured>"} --branch ${deployment.branch ?? "main"}`,
    },
    now(),
  );

  if (await isCancelled(db, deploymentId)) {
    return finaliseCancelled(db, deploymentId, startTime, now);
  }

  // ── 4. Step: bun install (SCAFFOLD) ──────────────────────────────
  console.log(`[build-runner] step=install deployment=${deploymentId}`);
  await writeLog(
    db,
    deploymentId,
    {
      stream: "stdout",
      line: project.installCommand ?? "bun install",
    },
    now(),
  );

  if (await isCancelled(db, deploymentId)) {
    return finaliseCancelled(db, deploymentId, startTime, now);
  }

  // ── 5. Step: bun run build (SCAFFOLD) ────────────────────────────
  console.log(`[build-runner] step=build deployment=${deploymentId}`);
  await writeLog(
    db,
    deploymentId,
    {
      stream: "stdout",
      line: project.buildCommand ?? "bun run build",
    },
    now(),
  );

  const buildEndedAt = now();
  const buildDurationMs = buildEndedAt.getTime() - buildStartedAt.getTime();

  if (await isCancelled(db, deploymentId)) {
    return finaliseCancelled(db, deploymentId, startTime, now);
  }

  // ── 6. Step: deploy (SCAFFOLD) ───────────────────────────────────
  console.log(`[build-runner] step=deploy deployment=${deploymentId}`);
  await updateStatus(db, deploymentId, "deploying");
  await writeLog(
    db,
    deploymentId,
    { stream: "event", line: "[build-runner] build succeeded — deploying" },
    now(),
  );

  // ── 7. Finalise → live ───────────────────────────────────────────
  const completedAt = now();
  const totalDurationMs = completedAt.getTime() - startTime.getTime();
  const deployUrl = project.slug
    ? `https://${project.slug}.crontech.ai`
    : null;

  await updateStatus(db, deploymentId, "live", {
    deployUrl,
    url: deployUrl,
    buildDuration: buildDurationMs,
    duration: totalDurationMs,
    completedAt,
    finishedAt: completedAt,
    isCurrent: true,
  });

  // Any previous "live" deployments for this project become non-current.
  await db
    .update(deployments)
    .set({ isCurrent: false })
    .where(
      and(
        eq(deployments.projectId, project.id),
        eq(deployments.isCurrent, true),
      ),
    );
  // Re-flag the just-completed deployment as current (the previous UPDATE
  // cleared it in the same statement).
  await db
    .update(deployments)
    .set({ isCurrent: true })
    .where(eq(deployments.id, deploymentId));

  await writeLog(
    db,
    deploymentId,
    {
      stream: "event",
      line: `[build-runner] deployment live at ${deployUrl ?? "<no domain>"}`,
    },
    completedAt,
  );

  return {
    deploymentId,
    status: "live",
    buildDurationMs,
    deployUrl,
    errorMessage: null,
  };
}

async function finaliseCancelled(
  db: DbClient,
  deploymentId: string,
  startTime: Date,
  now: () => Date,
): Promise<RunBuildResult> {
  const endedAt = now();
  const totalDurationMs = endedAt.getTime() - startTime.getTime();
  await updateStatus(db, deploymentId, "cancelled", {
    completedAt: endedAt,
    finishedAt: endedAt,
    duration: totalDurationMs,
  });
  await writeLog(
    db,
    deploymentId,
    { stream: "event", line: "[build-runner] build cancelled" },
    endedAt,
  );
  return {
    deploymentId,
    status: "cancelled",
    buildDurationMs: null,
    deployUrl: null,
    errorMessage: null,
  };
}

// ── Queue ────────────────────────────────────────────────────────────

/**
 * Minimal in-memory build queue. Self-hosted Vultr box has one worker for
 * now — queued deployments drain serially so we do not blow out memory
 * racing multiple `bun install`s. Cloudflare Workers never calls this; the
 * queue only runs when the long-lived Bun process is alive.
 */
const buildQueue: string[] = [];
let queueRunning = false;

export function enqueueBuild(deploymentId: string): void {
  buildQueue.push(deploymentId);
  void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (buildQueue.length > 0) {
      const next = buildQueue.shift();
      if (!next) break;
      try {
        await runBuild(next);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[build-runner] runBuild failed for ${next}:`, message);
      }
    }
  } finally {
    queueRunning = false;
  }
}

/** Test-only: reset the in-memory queue. */
export function _resetQueueForTests(): void {
  buildQueue.length = 0;
  queueRunning = false;
}
