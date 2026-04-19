/**
 * BLK-009 Build Runner — real implementation.
 *
 * Given a deployment id, clones the project's git repo, runs `bun install`
 * and `bun run build`, streams stdout/stderr line-by-line into the
 * `deployment_logs` table, and hands off to the orchestrator deployer.
 * Transitions the deployment through `queued → building → deploying → live`
 * (or `failed` on any error).
 *
 * Guarantees:
 * - **Workspace isolation.** Every build gets its own tmp dir at
 *   `/tmp/crontech-build/<deploymentId>`. Always cleaned up — success
 *   and failure paths both `rm -rf` the workspace in a `finally`.
 * - **Single-node concurrency.** An in-memory Set keyed by deploymentId
 *   prevents the same deployment being built twice at the same time.
 *   Single-node only — a distributed lock is out of scope for v1.
 * - **Hard timeout.** The whole build is capped at 10 minutes. If exceeded,
 *   any live child process is killed and the deployment is marked failed.
 * - **Dependency-injectable.** `spawn`, `deploy`, and filesystem ops are
 *   all overrideable via `RunBuildOptions` so the test suite never hits
 *   real git / network / `/tmp`.
 *
 * ⚠️ Security note (flag for Craig): this runs customer-supplied code
 * (`bun install` postinstall hooks, custom build commands) on the host.
 * A real multi-tenant deployment must jail this inside Firecracker,
 * gVisor, or at minimum a Docker container with seccomp + no network
 * access to internal services. For v1 (single-tenant, Craig-only) we
 * accept the risk. See §5A in CLAUDE.md — tighten before opening signup.
 */

import { and, eq } from "drizzle-orm";
import {
  db as defaultDb,
  deploymentLogs,
  deployments,
  projects,
} from "@back-to-the-future/db";
import {
  orchestratorDeploy,
  type OrchestratorDeployInput,
  type OrchestratorDeployResult,
} from "../deploy/orchestrator-client";
import { upsertSubdomainRecord } from "./dns-helper";

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

/**
 * Minimal subprocess surface the runner needs. Matches the subset of
 * `Bun.Subprocess` we consume, typed loosely so a test double can satisfy
 * the contract without pulling in the entire Bun typing surface.
 */
export interface SpawnedProcess {
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  readonly exited: Promise<number>;
  kill(signal?: number | string): void;
}

export interface SpawnOptionsLike {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdout?: "pipe" | "inherit" | "ignore";
  stderr?: "pipe" | "inherit" | "ignore";
}

/** Signature injected via `RunBuildOptions.spawn` for testability. */
export type SpawnFn = (
  cmd: string[],
  options?: SpawnOptionsLike,
) => SpawnedProcess;

/** Filesystem operations the runner needs — injectable for tests. */
export interface BuildFs {
  mkdir(path: string, opts: { recursive: boolean }): Promise<void>;
  rm(path: string, opts: { recursive: boolean; force: boolean }): Promise<void>;
}

/** Deployer handoff — defaults to the HTTP orchestrator client. */
export type DeployFn = (
  input: OrchestratorDeployInput,
) => Promise<OrchestratorDeployResult>;

export interface RunBuildOptions {
  /** Override DB client (primarily for tests). */
  db?: DbClient;
  /** Override "now" so tests can pin timestamps. */
  now?: () => Date;
  /** Override child-process spawn so tests never hit real git/bun. */
  spawn?: SpawnFn;
  /** Override the orchestrator deploy handoff. */
  deploy?: DeployFn;
  /** Override fs ops so tests don't touch `/tmp`. */
  fs?: BuildFs;
  /** Override workspace root (default `/tmp/crontech-build`). */
  workspaceRoot?: string;
  /**
   * Hard cap on total build duration in ms. Defaults to 10 minutes.
   * Tests override to a small value to exercise the timeout branch.
   */
  totalTimeoutMs?: number;
}

export interface RunBuildResult {
  deploymentId: string;
  status: DeploymentStatus;
  buildDurationMs: number | null;
  deployUrl: string | null;
  errorMessage: string | null;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_WORKSPACE_ROOT = "/tmp/crontech-build";
const DEFAULT_TOTAL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * In-memory guard against the same deployment being built twice at once.
 * Single-node only; a multi-worker deployment must replace this with a
 * Redis/Turso-backed lock. Exported (as a getter) for test assertions.
 */
const inFlight = new Set<string>();

/** Test-only: introspect the in-flight set. */
export function _getInFlightForTests(): ReadonlySet<string> {
  return inFlight;
}

/** Test-only: reset both the queue and in-flight guard. */
export function _resetQueueForTests(): void {
  buildQueue.length = 0;
  queueRunning = false;
  inFlight.clear();
}

// ── Default spawn / fs adapters ─────────────────────────────────────

const defaultSpawn: SpawnFn = (cmd, options) => {
  // Strip undefined properties because Bun.spawn's types are strict and
  // `exactOptionalPropertyTypes` forbids passing `undefined` through.
  const spawnArgs: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdout: "pipe";
    stderr: "pipe";
  } = { stdout: "pipe", stderr: "pipe" };
  if (options?.cwd !== undefined) spawnArgs.cwd = options.cwd;
  if (options?.env !== undefined) spawnArgs.env = options.env;
  return Bun.spawn(cmd, spawnArgs) as unknown as SpawnedProcess;
};

const defaultFs: BuildFs = {
  async mkdir(path, opts) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path, opts);
  },
  async rm(path, opts) {
    const { rm } = await import("node:fs/promises");
    await rm(path, opts).catch(() => {
      /* cleanup is best-effort */
    });
  },
};

const defaultDeploy: DeployFn = (input) => orchestratorDeploy(input);

// ── Internal helpers ─────────────────────────────────────────────────

function generateLogId(): string {
  return crypto.randomUUID();
}

export async function writeLog(
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

export async function updateStatus(
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

/**
 * Drain a ReadableStream line-by-line, writing each line as a row into
 * `deployment_logs` via `writeLog`. Partial buffered output at EOF is
 * flushed as a final line. Errors on the stream are captured as an
 * `event` log so they are never silently dropped.
 */
async function streamLines(
  db: DbClient,
  deploymentId: string,
  stream: ReadableStream<Uint8Array> | null,
  kind: "stdout" | "stderr",
  now: () => Date,
): Promise<void> {
  if (!stream) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length === 0) continue;
        await writeLog(db, deploymentId, { stream: kind, line }, now());
      }
    }
    const tail = buffer + decoder.decode();
    if (tail.length > 0) {
      await writeLog(db, deploymentId, { stream: kind, line: tail }, now());
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeLog(
      db,
      deploymentId,
      { stream: "event", line: `[build-runner] ${kind} stream error: ${msg}` },
      now(),
    );
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

/**
 * Run a spawned command, streaming both stdout and stderr into
 * `deployment_logs` in real time. Rejects with a non-Error `exitCode`
 * carrier when the process exits non-zero so the caller can translate
 * to a user-visible failure log.
 */
async function runStep(
  db: DbClient,
  deploymentId: string,
  label: string,
  cmd: string[],
  options: SpawnOptionsLike,
  spawn: SpawnFn,
  now: () => Date,
): Promise<void> {
  await writeLog(
    db,
    deploymentId,
    { stream: "event", line: `[build-runner] ▶ ${label}: ${cmd.join(" ")}` },
    now(),
  );
  const proc = spawn(cmd, options);
  const outDone = streamLines(db, deploymentId, proc.stdout, "stdout", now);
  const errDone = streamLines(db, deploymentId, proc.stderr, "stderr", now);
  const exitCode = await proc.exited;
  // Give stream readers a tick to flush — `exited` may resolve before the
  // readable side EOFs on some platforms.
  await Promise.all([outDone, errDone]);

  if (exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${exitCode}`);
  }
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

// ── Public API ───────────────────────────────────────────────────────

/**
 * Run a deployment end-to-end: clone → install → build → deploy.
 *
 * Contract (preserved from the original scaffold):
 * - Status: `queued → building → deploying → live` on success,
 *   `failed` on any error, `cancelled` if the cancel flag is flipped.
 * - Writes step + stdout/stderr log rows into `deployment_logs`.
 * - Returns `{ deploymentId, status, buildDurationMs, deployUrl, errorMessage }`.
 */
export async function runBuild(
  deploymentId: string,
  options: RunBuildOptions = {},
): Promise<RunBuildResult> {
  const db = options.db ?? defaultDb;
  const now = options.now ?? ((): Date => new Date());
  const spawn = options.spawn ?? defaultSpawn;
  const deploy = options.deploy ?? defaultDeploy;
  const fs = options.fs ?? defaultFs;
  const workspaceRoot = options.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT;
  const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const startTime = now();

  // ── Concurrency guard ────────────────────────────────────────────
  if (inFlight.has(deploymentId)) {
    return {
      deploymentId,
      status: "failed",
      buildDurationMs: null,
      deployUrl: null,
      errorMessage: "build already in progress for this deployment",
    };
  }
  inFlight.add(deploymentId);

  const workspaceDir = `${workspaceRoot}/${deploymentId}`;
  let activeProc: SpawnedProcess | null = null;
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    if (activeProc) {
      try {
        activeProc.kill("SIGKILL");
      } catch {
        /* child may have already exited */
      }
    }
  }, totalTimeoutMs);

  // Wrap the default spawn so we can track the currently-live child for
  // the timeout branch. `runStep` always awaits `exited` before returning,
  // so only one child is live at any point in the serial pipeline.
  const trackedSpawn: SpawnFn = (cmd, opts) => {
    const proc = spawn(cmd, opts);
    activeProc = proc;
    return proc;
  };

  try {
    // ── 1. Load deployment + project ───────────────────────────────
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

    if (!project.repoUrl) {
      const msg = "project.repoUrl is not configured";
      await writeLog(
        db,
        deploymentId,
        { stream: "event", line: `[build-runner] ${msg}` },
        now(),
      );
      await updateStatus(db, deploymentId, "failed", {
        errorMessage: msg,
        completedAt: now(),
        finishedAt: now(),
      });
      return {
        deploymentId,
        status: "failed",
        buildDurationMs: null,
        deployUrl: null,
        errorMessage: msg,
      };
    }

    // ── 2. Transition queued → building ────────────────────────────
    const buildStartedAt = now();
    const branch = deployment.branch ?? project.repoBranch ?? "main";
    await updateStatus(db, deploymentId, "building", {
      startedAt: buildStartedAt,
    });
    await writeLog(
      db,
      deploymentId,
      {
        stream: "event",
        line: `[build-runner] starting build for ${project.name} (${branch}@${deployment.commitSha ?? "HEAD"})`,
      },
      buildStartedAt,
    );

    // ── 3. Prepare workspace ───────────────────────────────────────
    await fs.rm(workspaceDir, { recursive: true, force: true });
    await fs.mkdir(workspaceRoot, { recursive: true });

    if (await isCancelled(db, deploymentId)) {
      return await finaliseCancelled(db, deploymentId, startTime, now);
    }

    // ── 4. Git clone (shallow) ─────────────────────────────────────
    await runStep(
      db,
      deploymentId,
      "clone",
      [
        "git",
        "clone",
        "--depth",
        "1",
        "--branch",
        branch,
        project.repoUrl,
        workspaceDir,
      ],
      {},
      trackedSpawn,
      now,
    );

    if (await isCancelled(db, deploymentId)) {
      return await finaliseCancelled(db, deploymentId, startTime, now);
    }

    // ── 5. Install deps ────────────────────────────────────────────
    await runStep(
      db,
      deploymentId,
      "install",
      ["bun", "install", "--frozen-lockfile"],
      { cwd: workspaceDir },
      trackedSpawn,
      now,
    );

    if (await isCancelled(db, deploymentId)) {
      return await finaliseCancelled(db, deploymentId, startTime, now);
    }

    // ── 6. Build ───────────────────────────────────────────────────
    const buildCmd = project.buildCommand
      ? project.buildCommand.split(" ").filter((s) => s.length > 0)
      : ["bun", "run", "build"];
    await runStep(
      db,
      deploymentId,
      "build",
      buildCmd,
      { cwd: workspaceDir },
      trackedSpawn,
      now,
    );

    const buildEndedAt = now();
    const buildDurationMs = buildEndedAt.getTime() - buildStartedAt.getTime();

    if (await isCancelled(db, deploymentId)) {
      return await finaliseCancelled(db, deploymentId, startTime, now);
    }

    // ── 7. Hand off to deployer ────────────────────────────────────
    await updateStatus(db, deploymentId, "deploying");
    await writeLog(
      db,
      deploymentId,
      { stream: "event", line: "[build-runner] build succeeded — deploying" },
      now(),
    );

    const domain = `${project.slug}.crontech.ai`;
    const runtime: "bun" | "nextjs" = project.runtime === "node" ? "nextjs" : "bun";
    const deployInput: OrchestratorDeployInput = {
      appName: project.slug,
      repoUrl: project.repoUrl,
      branch,
      domain,
      port: project.port ?? 3000,
      runtime,
    };
    const deployResult = await deploy(deployInput);
    await writeLog(
      db,
      deploymentId,
      {
        stream: "event",
        line: `[build-runner] deployer returned container=${deployResult.containerId} health=${deployResult.healthCheck}`,
      },
      now(),
    );

    // ── 7b. Create/update the DNS A record for {slug}.crontech.ai ──
    // Best-effort. A DNS failure here must NOT fail the deploy — the
    // helper itself swallows errors, but we wrap in try/catch for belt
    // + braces, and emit an event log so operators can see what
    // happened without trawling stderr.
    const deployTargetIp =
      process.env["DEPLOY_TARGET_IP"] ?? "45.76.21.235";
    try {
      await upsertSubdomainRecord(project.slug, deployTargetIp, { db });
      await writeLog(
        db,
        deploymentId,
        {
          stream: "event",
          line: `Created DNS A record ${project.slug}.crontech.ai → ${deployTargetIp}`,
        },
        now(),
      );
    } catch (dnsErr) {
      const dnsMsg =
        dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
      await writeLog(
        db,
        deploymentId,
        {
          stream: "event",
          line: `[build-runner] DNS upsert failed (non-fatal): ${dnsMsg}`,
        },
        now(),
      );
    }

    // ── 8. Finalise → live ─────────────────────────────────────────
    const completedAt = now();
    const totalDurationMs = completedAt.getTime() - startTime.getTime();
    const deployUrl = `https://${project.slug}.crontech.ai`;

    // Flip previous live deployments for this project to non-current
    // BEFORE we set the new one — otherwise the filter on `isCurrent = true`
    // would also match the row we just wrote.
    await db
      .update(deployments)
      .set({ isCurrent: false })
      .where(
        and(
          eq(deployments.projectId, project.id),
          eq(deployments.isCurrent, true),
        ),
      );

    await updateStatus(db, deploymentId, "live", {
      deployUrl,
      url: deployUrl,
      buildDuration: buildDurationMs,
      duration: totalDurationMs,
      completedAt,
      finishedAt: completedAt,
      isCurrent: true,
    });

    await writeLog(
      db,
      deploymentId,
      {
        stream: "event",
        line: `[build-runner] deployment live at ${deployUrl}`,
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
  } catch (err) {
    const baseMessage = err instanceof Error ? err.message : String(err);
    const message = timedOut
      ? `build exceeded ${totalTimeoutMs}ms timeout`
      : baseMessage;

    // Every failure path: an `event` log, failed status, cleanup.
    try {
      await writeLog(
        db,
        deploymentId,
        { stream: "event", line: `[build-runner] FAILED: ${message}` },
        now(),
      );
    } catch (logErr) {
      console.warn(
        `[build-runner] could not write failure log for ${deploymentId}:`,
        logErr instanceof Error ? logErr.message : String(logErr),
      );
    }

    const failedAt = now();
    try {
      await updateStatus(db, deploymentId, "failed", {
        errorMessage: message,
        completedAt: failedAt,
        finishedAt: failedAt,
        duration: failedAt.getTime() - startTime.getTime(),
      });
    } catch (updateErr) {
      console.warn(
        `[build-runner] could not mark ${deploymentId} failed:`,
        updateErr instanceof Error ? updateErr.message : String(updateErr),
      );
    }

    return {
      deploymentId,
      status: "failed",
      buildDurationMs: null,
      deployUrl: null,
      errorMessage: message,
    };
  } finally {
    clearTimeout(timeoutHandle);
    inFlight.delete(deploymentId);
    // Always clean up the workspace — success and failure alike.
    try {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(
        `[build-runner] workspace cleanup failed for ${deploymentId}:`,
        cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      );
    }
  }
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
