// ── BLK-009 build-runner tests ───────────────────────────────────────
// Exercise the real runBuild() with dependency-injected spawn/deploy/fs so
// no test hits git, the orchestrator HTTP, or the real `/tmp`. These tests
// are the contract for the build runner — if they go red, the deploy
// pipeline is broken.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  db,
  deploymentLogs,
  deployments,
  projects,
  users,
} from "@back-to-the-future/db";
import type { SandboxResult, SandboxSpec } from "@back-to-the-future/orchestrator/sandbox";
import {
  type BuildFs,
  type DeployFn,
  type RunBuildOptions,
  type SandboxRunFn,
  type SpawnedProcess,
  type SpawnFn,
  _getInFlightForTests,
  _resetQueueForTests,
  runBuild,
} from "./build-runner";

// ── Test fixtures ────────────────────────────────────────────────────

interface SpawnCall {
  cmd: string[];
  cwd?: string;
}

interface FakeProcessOptions {
  exitCode?: number;
  stdoutLines?: string[];
  stderrLines?: string[];
  /** Hang until kill is called (for timeout tests). */
  hang?: boolean;
}

function stream(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });
}

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

function makeFakeProcess(opts: FakeProcessOptions = {}): SpawnedProcess {
  let killed = false;
  let killedWith: string | number | undefined;
  const exited = new Promise<number>((resolve) => {
    if (opts.hang) {
      const checkKill = (): void => {
        if (killed) resolve(137);
        else setTimeout(checkKill, 10);
      };
      checkKill();
    } else {
      queueMicrotask(() => resolve(opts.exitCode ?? 0));
    }
  });
  return {
    stdout: opts.stdoutLines ? stream(opts.stdoutLines) : emptyStream(),
    stderr: opts.stderrLines ? stream(opts.stderrLines) : emptyStream(),
    exited,
    kill(signal) {
      killed = true;
      killedWith = signal;
      void killedWith; // exercised only via exited resolution
    },
  };
}

function recordingSpawn(
  scripts: FakeProcessOptions[],
  calls: SpawnCall[],
): SpawnFn {
  let i = 0;
  return (cmd, options) => {
    const entry: SpawnCall = { cmd };
    if (options?.cwd !== undefined) entry.cwd = options.cwd;
    calls.push(entry);
    const opts = scripts[i] ?? {};
    i += 1;
    return makeFakeProcess(opts);
  };
}

// ── Sandbox test doubles ─────────────────────────────────────────────

interface SandboxCall {
  cmd: string[];
  workspaceDir: string;
  env?: Record<string, string> | undefined;
}

interface FakeSandboxRun {
  exitCode?: number;
  stdoutLines?: string[];
  stderrLines?: string[];
  timedOut?: boolean;
}

function recordingSandbox(
  scripts: FakeSandboxRun[],
  calls: SandboxCall[],
): SandboxRunFn {
  let i = 0;
  return async (spec: SandboxSpec, onLogLine): Promise<SandboxResult> => {
    const entry: SandboxCall = {
      cmd: spec.command,
      workspaceDir: spec.workspaceDir,
      env: spec.env,
    };
    calls.push(entry);
    const opts = scripts[i] ?? {};
    i += 1;
    for (const line of opts.stdoutLines ?? []) {
      onLogLine?.("stdout", line);
    }
    for (const line of opts.stderrLines ?? []) {
      onLogLine?.("stderr", line);
    }
    return {
      exitCode: opts.exitCode ?? 0,
      stdout: (opts.stdoutLines ?? []).join("\n"),
      stderr: (opts.stderrLines ?? []).join("\n"),
      timedOut: opts.timedOut ?? false,
      wallClockMs: 1,
    };
  };
}

function fakeFs(): BuildFs & { ops: Array<{ op: string; path: string }> } {
  const ops: Array<{ op: string; path: string }> = [];
  return {
    ops,
    async mkdir(path) {
      ops.push({ op: "mkdir", path });
    },
    async rm(path) {
      ops.push({ op: "rm", path });
    },
  };
}

// ── DB seed helpers ──────────────────────────────────────────────────

async function seedProjectAndDeployment(overrides: {
  deploymentId: string;
  projectId?: string;
  userId?: string;
  slug?: string;
  repoUrl?: string | null;
  buildCommand?: string | null;
  repoBranch?: string;
}): Promise<{ deploymentId: string; projectId: string; userId: string; slug: string }> {
  const userId = overrides.userId ?? `u-${crypto.randomUUID()}`;
  const projectId = overrides.projectId ?? `p-${crypto.randomUUID()}`;
  const slug = overrides.slug ?? `slug-${crypto.randomUUID().slice(0, 8)}`;

  await db.insert(users).values({
    id: userId,
    email: `${userId}@example.com`,
    displayName: `Test ${userId}`,
  });

  await db.insert(projects).values({
    id: projectId,
    userId,
    name: `Project ${projectId}`,
    slug,
    repoUrl: overrides.repoUrl === undefined ? "https://github.com/acme/demo.git" : overrides.repoUrl,
    repoBranch: overrides.repoBranch ?? "main",
    buildCommand: overrides.buildCommand === undefined ? "bun run build" : overrides.buildCommand,
    status: "active",
    port: 3000,
    runtime: "bun",
  });

  await db.insert(deployments).values({
    id: overrides.deploymentId,
    projectId,
    userId,
    branch: overrides.repoBranch ?? "main",
    status: "queued",
  });

  return { deploymentId: overrides.deploymentId, projectId, userId, slug };
}

async function cleanup(deploymentId: string, projectId: string, userId: string): Promise<void> {
  await db.delete(deploymentLogs).where(eq(deploymentLogs.deploymentId, deploymentId));
  await db.delete(deployments).where(eq(deployments.id, deploymentId));
  await db.delete(projects).where(eq(projects.id, projectId));
  await db.delete(users).where(eq(users.id, userId));
}

function okDeploy(): DeployFn {
  return async () => ({
    containerId: "ctr-abc123",
    appName: "test",
    domain: "test.crontech.ai",
    url: "https://test.crontech.ai",
    status: "running",
    healthCheck: "pass",
  });
}

function baseOptions(overrides: Partial<RunBuildOptions> = {}): RunBuildOptions {
  return {
    workspaceRoot: "/tmp/crontech-build-test",
    totalTimeoutMs: 5_000,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("runBuild", () => {
  beforeEach(() => {
    _resetQueueForTests();
  });

  afterEach(() => {
    _resetQueueForTests();
  });

  test("happy path: queued → building → deploying → live", async () => {
    const deploymentId = `d-${crypto.randomUUID()}`;
    const seeded = await seedProjectAndDeployment({ deploymentId });

    const spawnCalls: SpawnCall[] = [];
    // Only clone is spawned on host — install + build run in the sandbox.
    const spawn = recordingSpawn(
      [{ stdoutLines: ["Cloning into 'demo'..."] }],
      spawnCalls,
    );
    const sandboxCalls: SandboxCall[] = [];
    const sandboxRun = recordingSandbox(
      [
        { stdoutLines: ["bun install ok", "3 packages installed"] },
        { stdoutLines: ["building…", "done"] },
      ],
      sandboxCalls,
    );
    const fs = fakeFs();
    const deploy = okDeploy();

    const result = await runBuild(
      deploymentId,
      baseOptions({ spawn, sandboxRun, deploy, fs }),
    );

    expect(result.status).toBe("live");
    expect(result.deployUrl).toBe(`https://${seeded.slug}.crontech.ai`);
    expect(result.errorMessage).toBeNull();
    expect(result.buildDurationMs).toBeGreaterThanOrEqual(0);

    // Host-side spawn: only the clone runs on the host.
    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0]?.cmd[0]).toBe("git");
    expect(spawnCalls[0]?.cmd).toContain("--depth");
    expect(spawnCalls[0]?.cmd).toContain("--branch");
    expect(spawnCalls[0]?.cmd[spawnCalls[0]!.cmd.length - 1]).toMatch(
      /\/tmp\/crontech-build-test\//,
    );

    // Sandboxed steps: install + build, both bound to the same workspace.
    expect(sandboxCalls.length).toBe(2);
    expect(sandboxCalls[0]?.cmd).toEqual(["bun", "install", "--frozen-lockfile"]);
    expect(sandboxCalls[0]?.workspaceDir).toMatch(/\/tmp\/crontech-build-test\//);
    expect(sandboxCalls[1]?.cmd).toEqual(["bun", "run", "build"]);
    expect(sandboxCalls[1]?.env).toEqual({ NODE_ENV: "production" });

    // DB row was flipped to live and got the deploy URL.
    const [row] = await db.select().from(deployments).where(eq(deployments.id, deploymentId)).limit(1);
    expect(row?.status).toBe("live");
    expect(row?.deployUrl).toBe(`https://${seeded.slug}.crontech.ai`);
    expect(row?.isCurrent).toBe(true);
    expect(row?.buildDuration).toBeGreaterThanOrEqual(0);

    // Logs captured stdout lines.
    const logs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, deploymentId));
    const stdoutLines = logs.filter((l) => l.stream === "stdout").map((l) => l.line);
    expect(stdoutLines).toContain("Cloning into 'demo'...");
    expect(stdoutLines).toContain("bun install ok");
    expect(stdoutLines).toContain("building…");
    const eventLines = logs.filter((l) => l.stream === "event").map((l) => l.line);
    expect(eventLines.some((l) => l.includes("starting build"))).toBe(true);
    expect(eventLines.some((l) => l.includes("deployment live"))).toBe(true);

    // Workspace was created and cleaned up.
    const rmOps = fs.ops.filter((o) => o.op === "rm");
    expect(rmOps.length).toBeGreaterThanOrEqual(2);
    expect(rmOps[rmOps.length - 1]?.path).toMatch(new RegExp(`${deploymentId}$`));

    await cleanup(deploymentId, seeded.projectId, seeded.userId);
  });

  test("clone failure marks the deployment failed and cleans up", async () => {
    const deploymentId = `d-${crypto.randomUUID()}`;
    const seeded = await seedProjectAndDeployment({ deploymentId });

    const calls: SpawnCall[] = [];
    const spawn = recordingSpawn(
      [{ exitCode: 128, stderrLines: ["fatal: could not reach repo"] }],
      calls,
    );
    const sandboxCalls: SandboxCall[] = [];
    const sandboxRun = recordingSandbox([], sandboxCalls);
    const fs = fakeFs();

    const result = await runBuild(
      deploymentId,
      baseOptions({ spawn, sandboxRun, fs, deploy: okDeploy() }),
    );

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/clone failed/);
    expect(calls.length).toBe(1); // stopped at clone
    expect(sandboxCalls.length).toBe(0); // never entered sandbox

    const [row] = await db.select().from(deployments).where(eq(deployments.id, deploymentId)).limit(1);
    expect(row?.status).toBe("failed");
    expect(row?.errorMessage).toMatch(/clone failed/);

    const logs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, deploymentId));
    const stderrLines = logs.filter((l) => l.stream === "stderr").map((l) => l.line);
    expect(stderrLines).toContain("fatal: could not reach repo");
    const eventLines = logs.filter((l) => l.stream === "event").map((l) => l.line);
    expect(eventLines.some((l) => l.includes("FAILED"))).toBe(true);

    // Cleanup still ran even though we failed.
    const rmOps = fs.ops.filter((o) => o.op === "rm");
    expect(rmOps.some((o) => o.path.endsWith(deploymentId))).toBe(true);

    await cleanup(deploymentId, seeded.projectId, seeded.userId);
  });

  test("install failure short-circuits the build and never calls deploy", async () => {
    const deploymentId = `d-${crypto.randomUUID()}`;
    const seeded = await seedProjectAndDeployment({ deploymentId });

    const spawnCalls: SpawnCall[] = [];
    const spawn = recordingSpawn([{ stdoutLines: ["cloned"] }], spawnCalls);
    const sandboxCalls: SandboxCall[] = [];
    const sandboxRun = recordingSandbox(
      [{ exitCode: 1, stderrLines: ["lockfile drift"] }],
      sandboxCalls,
    );

    let deployCalled = false;
    const deploy: DeployFn = async () => {
      deployCalled = true;
      return {
        containerId: "nope",
        appName: "nope",
        domain: "nope",
        url: "nope",
        status: "running",
        healthCheck: "pass",
      };
    };

    const result = await runBuild(
      deploymentId,
      baseOptions({ spawn, sandboxRun, deploy, fs: fakeFs() }),
    );

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/install failed/);
    expect(deployCalled).toBe(false);
    expect(spawnCalls.length).toBe(1); // clone only
    expect(sandboxCalls.length).toBe(1); // stopped at install

    // Sandbox stderr was captured into deployment_logs.
    const logs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, deploymentId));
    const stderrLines = logs.filter((l) => l.stream === "stderr").map((l) => l.line);
    expect(stderrLines).toContain("lockfile drift");

    await cleanup(deploymentId, seeded.projectId, seeded.userId);
  });

  test("deployer failure marks the deployment failed", async () => {
    const deploymentId = `d-${crypto.randomUUID()}`;
    const seeded = await seedProjectAndDeployment({ deploymentId });

    const spawn = recordingSpawn([{ exitCode: 0 }], []);
    const sandboxRun = recordingSandbox(
      [{ exitCode: 0 }, { exitCode: 0 }],
      [],
    );
    const deploy: DeployFn = async () => {
      throw new Error("orchestrator 500: caddy dead");
    };

    const result = await runBuild(
      deploymentId,
      baseOptions({ spawn, sandboxRun, deploy, fs: fakeFs() }),
    );

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/orchestrator 500/);

    const [row] = await db.select().from(deployments).where(eq(deployments.id, deploymentId)).limit(1);
    expect(row?.status).toBe("failed");

    await cleanup(deploymentId, seeded.projectId, seeded.userId);
  });

  test("concurrency guard: a second runBuild for the same id while the first is in-flight fails fast", async () => {
    const deploymentId = `d-${crypto.randomUUID()}`;
    const seeded = await seedProjectAndDeployment({ deploymentId });

    // Block the first build on clone so we can race it.
    let releaseFirst: () => void = () => {};
    const firstDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const spawn: SpawnFn = () => {
      return {
        stdout: emptyStream(),
        stderr: emptyStream(),
        exited: firstDone.then(() => 0),
        kill() {
          /* noop */
        },
      };
    };

    const first = runBuild(deploymentId, baseOptions({ spawn, deploy: okDeploy(), fs: fakeFs() }));

    // Give the first call a chance to enter the critical section.
    await new Promise((r) => setTimeout(r, 10));
    expect(_getInFlightForTests().has(deploymentId)).toBe(true);

    const second = await runBuild(
      deploymentId,
      baseOptions({ spawn, deploy: okDeploy(), fs: fakeFs() }),
    );
    expect(second.status).toBe("failed");
    expect(second.errorMessage).toMatch(/already in progress/);

    releaseFirst();
    await first;

    expect(_getInFlightForTests().has(deploymentId)).toBe(false);

    await cleanup(deploymentId, seeded.projectId, seeded.userId);
  });

  test("timeout: a hanging clone is killed and the deployment marked failed", async () => {
    const deploymentId = `d-${crypto.randomUUID()}`;
    const seeded = await seedProjectAndDeployment({ deploymentId });

    const spawn: SpawnFn = () => makeFakeProcess({ hang: true });

    const result = await runBuild(
      deploymentId,
      baseOptions({ spawn, deploy: okDeploy(), fs: fakeFs(), totalTimeoutMs: 100 }),
    );

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/timeout|137|exit code/i);

    await cleanup(deploymentId, seeded.projectId, seeded.userId);
  });

  test("missing deployment row returns failed without throwing", async () => {
    const result = await runBuild(
      `nonexistent-${crypto.randomUUID()}`,
      baseOptions({
        spawn: () => makeFakeProcess(),
        deploy: okDeploy(),
        fs: fakeFs(),
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("deployment not found");
  });

  test("missing project.repoUrl fails fast with a clean error log", async () => {
    const deploymentId = `d-${crypto.randomUUID()}`;
    const seeded = await seedProjectAndDeployment({
      deploymentId,
      repoUrl: null,
    });

    const result = await runBuild(
      deploymentId,
      baseOptions({
        spawn: () => makeFakeProcess(),
        deploy: okDeploy(),
        fs: fakeFs(),
      }),
    );
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/repoUrl/);

    await cleanup(deploymentId, seeded.projectId, seeded.userId);
  });

  test("custom build command is split on whitespace and invoked verbatim", async () => {
    const deploymentId = `d-${crypto.randomUUID()}`;
    const seeded = await seedProjectAndDeployment({
      deploymentId,
      buildCommand: "pnpm run compile",
    });

    const spawnCalls: SpawnCall[] = [];
    const spawn = recordingSpawn([{ exitCode: 0 }], spawnCalls);
    const sandboxCalls: SandboxCall[] = [];
    const sandboxRun = recordingSandbox(
      [{ exitCode: 0 }, { exitCode: 0 }],
      sandboxCalls,
    );

    const result = await runBuild(
      deploymentId,
      baseOptions({ spawn, sandboxRun, deploy: okDeploy(), fs: fakeFs() }),
    );
    expect(result.status).toBe("live");
    expect(sandboxCalls[1]?.cmd).toEqual(["pnpm", "run", "compile"]);

    await cleanup(deploymentId, seeded.projectId, seeded.userId);
  });

  test("install+build run inside the sandbox, not on the host", async () => {
    const deploymentId = `d-${crypto.randomUUID()}`;
    const seeded = await seedProjectAndDeployment({ deploymentId });

    const spawnCalls: SpawnCall[] = [];
    const spawn = recordingSpawn([{ exitCode: 0 }], spawnCalls);
    const sandboxCalls: SandboxCall[] = [];
    const sandboxRun = recordingSandbox(
      [{ exitCode: 0 }, { exitCode: 0 }],
      sandboxCalls,
    );

    const result = await runBuild(
      deploymentId,
      baseOptions({ spawn, sandboxRun, deploy: okDeploy(), fs: fakeFs() }),
    );

    expect(result.status).toBe("live");
    // SECURITY INVARIANT: customer code must never execute on the host.
    // Only git clone runs via host spawn. `bun install` and `bun run build`
    // MUST be routed through the sandbox runner.
    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0]?.cmd[0]).toBe("git");
    expect(sandboxCalls.length).toBe(2);
    expect(sandboxCalls[0]?.cmd[0]).toBe("bun");
    expect(sandboxCalls[0]?.cmd).toContain("install");
    expect(sandboxCalls[1]?.cmd).toContain("build");
    // Workspace is shared across both sandboxed steps so install artifacts
    // (node_modules) are visible to the build step.
    expect(sandboxCalls[0]?.workspaceDir).toBe(sandboxCalls[1]?.workspaceDir);

    await cleanup(deploymentId, seeded.projectId, seeded.userId);
  });

  test("sandbox timeout on install surfaces as a failed deployment", async () => {
    const deploymentId = `d-${crypto.randomUUID()}`;
    const seeded = await seedProjectAndDeployment({ deploymentId });

    const spawn = recordingSpawn([{ exitCode: 0 }], []);
    const sandboxRun = recordingSandbox(
      [{ exitCode: 137, timedOut: true }],
      [],
    );

    const result = await runBuild(
      deploymentId,
      baseOptions({ spawn, sandboxRun, deploy: okDeploy(), fs: fakeFs() }),
    );

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toMatch(/exceeded sandbox timeout/);

    await cleanup(deploymentId, seeded.projectId, seeded.userId);
  });
});
