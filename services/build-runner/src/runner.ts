// ── BuildRunner ────────────────────────────────────────────────────────
// The pipeline:
//   1. Validate the request (Zod) and create workspace tmpdir
//   2. git clone shallow at the requested sha
//   3. Detect framework
//   4. Restore node_modules cache (if hit)
//   5. Run install command (default: `bun install --frozen-lockfile`)
//   6. Save node_modules cache (if first build of this lockfile)
//   7. Run build command (default: `bun install && bun run build`)
//   8. Verify outputDir exists
//   9. Create gzipped tarball + sha256 + size
//  10. Emit BuildArtefact + cleanup() callback
//
// Cleanup contract:
//   - On FAILURE the runner cleans the workspace itself (no leaks).
//   - On SUCCESS the runner returns a `cleanup()` callback. The caller
//     (deploy-orchestrator) MUST invoke it after it has persisted the
//     tarball into durable storage (R2). This avoids a copy and lets the
//     orchestrator stream the tarball straight from disk.
//
// The runner accepts injected dependencies (Spawner, GitClient, Tarball,
// CacheStore, WorkspaceFactory, LogSink) so tests can drive it
// hermetically without touching the network or the real filesystem.

import * as path from "node:path";
import { mkdir, stat } from "node:fs/promises";

import {
  buildRequestSchema,
  type BuildArtefact,
  type BuildFailure,
  type BuildRequest,
  type BuildResult,
} from "./schemas";
import { detectFramework, type FilesystemProbe } from "./framework";
import type { Spawner } from "./spawner";
import type { LogSink } from "./log-sink";
import type { GitClient } from "./git";
import type { Tarball } from "./tarball";
import type { CacheStore } from "./cache";
import { computeCacheKey } from "./cache";
import type { Workspace, WorkspaceFactory } from "./workspace";
import { fileSha256, fileSize } from "./tarball";

export interface BuildRunnerDeps {
  readonly spawner: Spawner;
  readonly git: GitClient;
  readonly tar: Tarball;
  readonly cache: CacheStore | null; // null disables caching
  readonly workspaceFactory: WorkspaceFactory;
  readonly logSink: LogSink;
  readonly fsProbe?: FilesystemProbe;
  /** Override for tests — defaults to `() => new Date().toISOString()` */
  readonly now?: () => string;
  /** Override for tests — confirms a directory exists. */
  readonly dirExists?: (dir: string) => Promise<boolean>;
}

function emitSystem(sink: LogSink, buildId: string, line: string): void {
  sink.emit({ buildId, stream: "system", line, ts: Date.now() });
}

function splitShell(cmd: string): ReadonlyArray<string> {
  // Customer build commands often look like `bun install && bun run build`.
  // We delegate the shelling to `sh -c` so users keep familiar syntax.
  return ["sh", "-c", cmd];
}

async function defaultDirExists(dir: string): Promise<boolean> {
  try {
    const s = await stat(dir);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function cleanupWorkspace(workspace: Workspace, sink: LogSink): Promise<void> {
  try {
    await workspace.cleanup();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitSystem(sink, workspace.buildId, `workspace cleanup failed (non-fatal): ${msg}`);
  }
}

export class BuildRunner {
  constructor(private readonly deps: BuildRunnerDeps) {}

  async run(input: BuildRequest): Promise<BuildResult> {
    const start = Date.now();
    const parsed = buildRequestSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        failure: {
          code: "VALIDATION_FAILED",
          message: parsed.error.message,
          exitCode: -1,
          durationMs: Date.now() - start,
        },
      };
    }
    const req = parsed.data;
    const sink = this.deps.logSink;
    const dirExists = this.deps.dirExists ?? defaultDirExists;
    const now = this.deps.now ?? (() => new Date().toISOString());

    const workspace = await this.deps.workspaceFactory.create(req.buildId);
    const fail = async (failure: BuildFailure): Promise<BuildResult> => {
      await cleanupWorkspace(workspace, sink);
      return { ok: false, failure };
    };

    // ── 1. clone ───────────────────────────────────────────────────
    emitSystem(sink, req.buildId, `cloning ${req.repo}@${req.sha}`);
    await mkdir(workspace.checkoutDir, { recursive: true });
    const cloneRes = await this.deps.git.clone(
      {
        buildId: req.buildId,
        repo: req.repo,
        sha: req.sha,
        ref: req.ref,
        targetDir: workspace.checkoutDir,
        gitToken: req.gitToken,
        timeoutMs: req.timeoutMs,
      },
      sink,
    );
    if (cloneRes.exitCode !== 0) {
      return fail({
        code: "CLONE_FAILED",
        message: `git clone exited ${cloneRes.exitCode}`,
        exitCode: cloneRes.exitCode,
        durationMs: Date.now() - start,
      });
    }

    // ── 2. detect framework ───────────────────────────────────────
    const framework = await detectFramework(workspace.checkoutDir, this.deps.fsProbe);
    emitSystem(sink, req.buildId, `framework=${framework}`);

    // ── 3. cache restore ──────────────────────────────────────────
    let cacheHit = false;
    const cacheKey = await computeCacheKey(workspace.checkoutDir);
    if (cacheKey && this.deps.cache) {
      const restored = await this.deps.cache.restore(cacheKey, workspace.checkoutDir);
      if (restored) {
        cacheHit = true;
        emitSystem(sink, req.buildId, `cache HIT (key=${cacheKey.slice(0, 12)})`);
      } else {
        emitSystem(sink, req.buildId, `cache MISS (key=${cacheKey.slice(0, 12)})`);
      }
    }

    const remainingMs = (): number => Math.max(1, req.timeoutMs - (Date.now() - start));

    // ── 4. install (skip if cache hit) ─────────────────────────────
    if (!cacheHit) {
      const installRes = await this.deps.spawner.run(
        {
          buildId: req.buildId,
          cmd: splitShell(req.installCommand),
          cwd: workspace.checkoutDir,
          env: req.env,
          timeoutMs: remainingMs(),
        },
        sink,
      );
      if (installRes.timedOut) {
        return fail({
          code: "TIMEOUT",
          message: "install timed out",
          exitCode: -1,
          durationMs: Date.now() - start,
        });
      }
      if (installRes.exitCode !== 0) {
        return fail({
          code: "INSTALL_FAILED",
          message: `install exited ${installRes.exitCode}`,
          exitCode: installRes.exitCode,
          durationMs: Date.now() - start,
        });
      }
      // ── 5. cache save ──────────────────────────────────────────
      if (cacheKey && this.deps.cache) {
        const nodeModules = path.join(workspace.checkoutDir, "node_modules");
        if (await dirExists(nodeModules)) {
          try {
            await this.deps.cache.save(cacheKey, nodeModules);
            emitSystem(sink, req.buildId, `cache SAVED (key=${cacheKey.slice(0, 12)})`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            emitSystem(sink, req.buildId, `cache save failed (non-fatal): ${msg}`);
          }
        }
      }
    }

    // ── 6. build ───────────────────────────────────────────────────
    const buildRes = await this.deps.spawner.run(
      {
        buildId: req.buildId,
        cmd: splitShell(req.buildCommand),
        cwd: workspace.checkoutDir,
        env: req.env,
        timeoutMs: remainingMs(),
      },
      sink,
    );
    if (buildRes.timedOut) {
      return fail({
        code: "TIMEOUT",
        message: "build timed out",
        exitCode: -1,
        durationMs: Date.now() - start,
      });
    }
    if (buildRes.exitCode !== 0) {
      return fail({
        code: "BUILD_FAILED",
        message: `build exited ${buildRes.exitCode}`,
        exitCode: buildRes.exitCode,
        durationMs: Date.now() - start,
      });
    }

    // ── 7. verify output dir ──────────────────────────────────────
    const outputAbs = path.isAbsolute(req.outputDir)
      ? req.outputDir
      : path.join(workspace.checkoutDir, req.outputDir);
    if (!(await dirExists(outputAbs))) {
      return fail({
        code: "OUTPUT_DIR_MISSING",
        message: `output directory not found: ${req.outputDir}`,
        exitCode: -1,
        durationMs: Date.now() - start,
      });
    }

    // ── 8. tarball ────────────────────────────────────────────────
    const tarballPath = path.join(workspace.artefactsDir, `${req.buildId}.tar.gz`);
    try {
      await this.deps.tar.create(outputAbs, tarballPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail({
        code: "TARBALL_FAILED",
        message: msg,
        exitCode: -1,
        durationMs: Date.now() - start,
      });
    }

    // ── 9. content addressing ────────────────────────────────────
    const [sha256, sizeBytes] = await Promise.all([
      fileSha256(tarballPath),
      fileSize(tarballPath),
    ]);

    const artefact: BuildArtefact = {
      buildId: req.buildId,
      tenantId: req.tenantId,
      sha: req.sha,
      framework,
      tarballPath,
      sizeBytes,
      sha256,
      durationMs: Date.now() - start,
      exitCode: 0,
      cacheHit,
      outputDir: req.outputDir,
      detectedAt: now(),
    };
    return {
      ok: true,
      artefact,
      cleanup: () => cleanupWorkspace(workspace, sink),
    };
  }
}
