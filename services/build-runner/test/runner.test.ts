// ── BuildRunner integration tests ─────────────────────────────────────
// Hermetic — no real git, no real subprocesses, no real filesystem
// (the workspace factory is mocked, but tarball mock writes a tiny real
// file to a tmp path so fileSha256 / fileSize work end-to-end).

import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { BuildRunner } from "../src/runner";
import { buildArtefactSchema, type BuildRequest } from "../src/schemas";
import { MemoryLogSink } from "../src/log-sink";
import { MockSpawner } from "./util/mock-spawner";
import {
  MockCacheStore,
  MockFilesystemProbe,
  MockGitClient,
  MockTarball,
  MockWorkspaceFactory,
} from "./util/mock-deps";

function baseRequest(overrides: Partial<BuildRequest> = {}): BuildRequest {
  return {
    buildId: "build_test_1",
    tenantId: "tenant_a",
    repo: "https://github.com/example/site.git",
    ref: "main",
    sha: "deadbeef",
    buildCommand: "bun install && bun run build",
    installCommand: "bun install --frozen-lockfile",
    outputDir: "dist",
    timeoutMs: 60_000,
    memoryLimitBytes: 4 * 1024 * 1024 * 1024,
    env: {},
    ...overrides,
  };
}

async function workspaceWithRealTmp(): Promise<MockWorkspaceFactory> {
  // For tests that exercise tarball + sha256, the artefacts dir needs to
  // exist on the real filesystem. We create one in os.tmpdir().
  const root = join(tmpdir(), `crontech-br-test-${crypto.randomUUID()}`);
  const checkoutDir = join(root, "checkout");
  const artefactsDir = join(root, "artefacts");
  await mkdir(checkoutDir, { recursive: true });
  await mkdir(artefactsDir, { recursive: true });
  return new MockWorkspaceFactory({ checkoutDir, artefactsDir });
}

describe("BuildRunner — happy path", () => {
  test("clones, installs, builds, tarballs, returns valid artefact", async () => {
    const factory = await workspaceWithRealTmp();
    const probe = new MockFilesystemProbe().setPackageJson(
      // The probe uses checkoutDir from the mock factory
      "/tmp/mock/build_test_1/checkout", // unused — we'll override with framework probe below
      { dependencies: { next: "^14.0.0" } },
    );
    // Better: configure the probe with the *actual* checkoutDir the
    // factory will return. The mock factory returns a fresh path each
    // create — so we re-derive it.
    const ws = await factory.create("build_test_1");
    const probe2 = new MockFilesystemProbe().setPackageJson(ws.checkoutDir, {
      dependencies: { next: "^14.0.0" },
    });
    // recreate factory that returns this same workspace
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ws,
    };

    const sink = new MemoryLogSink();
    const spawner = new MockSpawner().setFallback({ exitCode: 0 });
    const runner = new BuildRunner({
      spawner,
      git: new MockGitClient(),
      tar: new MockTarball(),
      cache: null,
      workspaceFactory: stableFactory,
      logSink: sink,
      fsProbe: probe2,
      // Force outputDir presence so the runner's dirExists check passes
      dirExists: async () => true,
      now: () => "2026-04-28T00:00:00.000Z",
    });
    void probe;

    const res = await runner.run(baseRequest());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.artefact.framework).toBe("nextjs");
    expect(res.artefact.exitCode).toBe(0);
    expect(res.artefact.cacheHit).toBe(false);
    expect(res.artefact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(res.artefact.sizeBytes).toBeGreaterThan(0);
    // Schema-validate the artefact
    const validated = buildArtefactSchema.safeParse(res.artefact);
    expect(validated.success).toBe(true);
    await res.cleanup();
  });
});

describe("BuildRunner — failure modes", () => {
  test("VALIDATION_FAILED when input is malformed", async () => {
    const sink = new MemoryLogSink();
    const factory = await workspaceWithRealTmp();
    const runner = new BuildRunner({
      spawner: new MockSpawner(),
      git: new MockGitClient(),
      tar: new MockTarball(),
      cache: null,
      workspaceFactory: factory,
      logSink: sink,
    });
    // Empty buildId fails the schema
    const res = await runner.run({
      ...baseRequest(),
      buildId: "",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("VALIDATION_FAILED");
  });

  test("CLONE_FAILED when git client returns non-zero", async () => {
    const factory = await workspaceWithRealTmp();
    const ws = await factory.create("build_clone_fail");
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ws,
    };
    const git = new MockGitClient();
    git.exitCode = 128;
    const runner = new BuildRunner({
      spawner: new MockSpawner(),
      git,
      tar: new MockTarball(),
      cache: null,
      workspaceFactory: stableFactory,
      logSink: new MemoryLogSink(),
    });
    const res = await runner.run(baseRequest({ buildId: "build_clone_fail" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("CLONE_FAILED");
    expect(res.failure.exitCode).toBe(128);
  });

  test("INSTALL_FAILED when install exits non-zero", async () => {
    const factory = await workspaceWithRealTmp();
    const ws = await factory.create("build_install_fail");
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ws,
    };
    const probe = new MockFilesystemProbe().setPackageJson(ws.checkoutDir, {
      dependencies: { astro: "^4.0.0" },
    });
    const spawner = new MockSpawner();
    // First spawn (install) fails
    spawner.setFallback({ exitCode: 1, stderr: ["install error"] });
    const runner = new BuildRunner({
      spawner,
      git: new MockGitClient(),
      tar: new MockTarball(),
      cache: null,
      workspaceFactory: stableFactory,
      logSink: new MemoryLogSink(),
      fsProbe: probe,
    });
    const res = await runner.run(baseRequest({ buildId: "build_install_fail" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("INSTALL_FAILED");
  });

  test("BUILD_FAILED when build exits non-zero (install passes)", async () => {
    const factory = await workspaceWithRealTmp();
    const ws = await factory.create("build_build_fail");
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ws,
    };
    const probe = new MockFilesystemProbe().setPackageJson(ws.checkoutDir, {
      dependencies: { vite: "^5.0.0" },
    });
    const spawner = new MockSpawner();
    spawner.expectIncludes("install --frozen-lockfile", { exitCode: 0 });
    spawner.expectIncludes("bun run build", { exitCode: 2, stderr: ["compile error"] });
    spawner.setFallback({ exitCode: 0 });
    const runner = new BuildRunner({
      spawner,
      git: new MockGitClient(),
      tar: new MockTarball(),
      cache: null,
      workspaceFactory: stableFactory,
      logSink: new MemoryLogSink(),
      fsProbe: probe,
    });
    const res = await runner.run(baseRequest({ buildId: "build_build_fail" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("BUILD_FAILED");
    expect(res.failure.exitCode).toBe(2);
  });

  test("TIMEOUT when build phase reports timedOut", async () => {
    const factory = await workspaceWithRealTmp();
    const ws = await factory.create("build_timeout");
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ws,
    };
    const probe = new MockFilesystemProbe().setPackageJson(ws.checkoutDir, {
      dependencies: { astro: "^4.0.0" },
    });
    const spawner = new MockSpawner();
    spawner.expectIncludes("install --frozen-lockfile", { exitCode: 0 });
    spawner.expectIncludes("bun run build", { exitCode: -1, timedOut: true });
    spawner.setFallback({ exitCode: 0 });
    const runner = new BuildRunner({
      spawner,
      git: new MockGitClient(),
      tar: new MockTarball(),
      cache: null,
      workspaceFactory: stableFactory,
      logSink: new MemoryLogSink(),
      fsProbe: probe,
    });
    const res = await runner.run(baseRequest({ buildId: "build_timeout" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("TIMEOUT");
  });

  test("OUTPUT_DIR_MISSING when build succeeds but output dir absent", async () => {
    const factory = await workspaceWithRealTmp();
    const ws = await factory.create("build_no_output");
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ws,
    };
    const probe = new MockFilesystemProbe().setPackageJson(ws.checkoutDir, {
      dependencies: { vite: "^5.0.0" },
    });
    const runner = new BuildRunner({
      spawner: new MockSpawner().setFallback({ exitCode: 0 }),
      git: new MockGitClient(),
      tar: new MockTarball(),
      cache: null,
      workspaceFactory: stableFactory,
      logSink: new MemoryLogSink(),
      fsProbe: probe,
      dirExists: async (dir) => !dir.includes("dist"), // pretend dist is missing
    });
    const res = await runner.run(baseRequest({ buildId: "build_no_output" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("OUTPUT_DIR_MISSING");
  });

  test("TARBALL_FAILED when tarball creation throws", async () => {
    const factory = await workspaceWithRealTmp();
    const ws = await factory.create("build_tar_fail");
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ws,
    };
    const probe = new MockFilesystemProbe().setPackageJson(ws.checkoutDir, {
      dependencies: { vite: "^5.0.0" },
    });
    const tar = new MockTarball();
    tar.shouldFail = true;
    const runner = new BuildRunner({
      spawner: new MockSpawner().setFallback({ exitCode: 0 }),
      git: new MockGitClient(),
      tar,
      cache: null,
      workspaceFactory: stableFactory,
      logSink: new MemoryLogSink(),
      fsProbe: probe,
      dirExists: async () => true,
    });
    const res = await runner.run(baseRequest({ buildId: "build_tar_fail" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("TARBALL_FAILED");
  });
});

describe("BuildRunner — log streaming", () => {
  test("emits per-line events to the log sink across phases", async () => {
    const factory = await workspaceWithRealTmp();
    const ws = await factory.create("build_logs");
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ws,
    };
    const probe = new MockFilesystemProbe().setPackageJson(ws.checkoutDir, {
      dependencies: { astro: "^4.0.0" },
    });
    const spawner = new MockSpawner();
    spawner.expectIncludes("install --frozen-lockfile", {
      exitCode: 0,
      stdout: ["installing deps", "added 200 packages"],
    });
    spawner.expectIncludes("bun run build", {
      exitCode: 0,
      stdout: ["building...", "build complete"],
    });
    spawner.setFallback({ exitCode: 0 });
    const sink = new MemoryLogSink();
    const runner = new BuildRunner({
      spawner,
      git: new MockGitClient(),
      tar: new MockTarball(),
      cache: null,
      workspaceFactory: stableFactory,
      logSink: sink,
      fsProbe: probe,
      dirExists: async () => true,
    });
    const res = await runner.run(baseRequest({ buildId: "build_logs" }));
    expect(res.ok).toBe(true);
    expect(sink.lines.length).toBeGreaterThan(0);
    // Each canned stdout line must appear once
    const stdoutText = sink.textFor("stdout");
    expect(stdoutText).toContain("installing deps");
    expect(stdoutText).toContain("added 200 packages");
    expect(stdoutText).toContain("building...");
    expect(stdoutText).toContain("build complete");
    // System events also fired (clone, framework, cache miss/hit)
    const systemText = sink.textFor("system");
    expect(systemText).toContain("framework=astro");
    if (res.ok) await res.cleanup();
  });
});

describe("BuildRunner — lockfile cache", () => {
  test("first build is a cache MISS and saves under the lockfile key", async () => {
    const factory = await workspaceWithRealTmp();
    const ws = await factory.create("build_cache_miss");
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ws,
    };
    // Plant a real lockfile so computeCacheKey hits it
    await Bun.write(`${ws.checkoutDir}/bun.lock`, "lockfile-bytes-v1");
    const probe = new MockFilesystemProbe().setPackageJson(ws.checkoutDir, {
      dependencies: { vite: "^5.0.0" },
    });
    const cache = new MockCacheStore();
    const runner = new BuildRunner({
      spawner: new MockSpawner().setFallback({ exitCode: 0 }),
      git: new MockGitClient(),
      tar: new MockTarball(),
      cache,
      workspaceFactory: stableFactory,
      logSink: new MemoryLogSink(),
      fsProbe: probe,
      dirExists: async () => true,
    });
    const res = await runner.run(baseRequest({ buildId: "build_cache_miss" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.artefact.cacheHit).toBe(false);
    expect(cache.saveCalls.length).toBe(1);
    expect(cache.restoreCalls.length).toBe(1);
  });

  test("second build with same lockfile is a cache HIT and skips install", async () => {
    const factory = await workspaceWithRealTmp();
    const ws = await factory.create("build_cache_hit");
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ws,
    };
    await Bun.write(`${ws.checkoutDir}/bun.lock`, "lockfile-bytes-v1-stable");
    const probe = new MockFilesystemProbe().setPackageJson(ws.checkoutDir, {
      dependencies: { vite: "^5.0.0" },
    });
    const cache = new MockCacheStore();
    // First, prime the cache with the same key the runner will compute
    const { computeCacheKey } = await import("../src/cache");
    const key = await computeCacheKey(ws.checkoutDir);
    expect(key).not.toBeNull();
    if (!key) return;
    cache.prime(key);
    const spawner = new MockSpawner();
    spawner.setFallback({ exitCode: 0 });
    const runner = new BuildRunner({
      spawner,
      git: new MockGitClient(),
      tar: new MockTarball(),
      cache,
      workspaceFactory: stableFactory,
      logSink: new MemoryLogSink(),
      fsProbe: probe,
      dirExists: async () => true,
    });
    const res = await runner.run(baseRequest({ buildId: "build_cache_hit" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.artefact.cacheHit).toBe(true);
    // Install should NOT have been spawned — only build. (1 spawn = build)
    const installLikeCalls = spawner.calls.filter((c) =>
      (c.cmd.join(" ") ?? "").includes("install --frozen-lockfile"),
    );
    expect(installLikeCalls.length).toBe(0);
  });
});

describe("BuildRunner — workspace cleanup", () => {
  test("cleans workspace on failure", async () => {
    const factory = new MockWorkspaceFactory();
    const git = new MockGitClient();
    git.exitCode = 1;
    const runner = new BuildRunner({
      spawner: new MockSpawner(),
      git,
      tar: new MockTarball(),
      cache: null,
      workspaceFactory: factory,
      logSink: new MemoryLogSink(),
    });
    const res = await runner.run(baseRequest({ buildId: "build_cleanup_fail" }));
    expect(res.ok).toBe(false);
    expect(factory.cleanups).toBe(1);
  });

  test("returns cleanup callback on success (does not auto-clean)", async () => {
    const realFactory = await workspaceWithRealTmp();
    const ws = await realFactory.create("build_cleanup_ok");
    let cleanups = 0;
    const stableFactory: import("../src/workspace").WorkspaceFactory = {
      create: async () => ({
        ...ws,
        cleanup: async () => {
          cleanups += 1;
        },
      }),
    };
    const probe = new MockFilesystemProbe().setPackageJson(ws.checkoutDir, {
      dependencies: { astro: "^4.0.0" },
    });
    const runner = new BuildRunner({
      spawner: new MockSpawner().setFallback({ exitCode: 0 }),
      git: new MockGitClient(),
      tar: new MockTarball(),
      cache: null,
      workspaceFactory: stableFactory,
      logSink: new MemoryLogSink(),
      fsProbe: probe,
      dirExists: async () => true,
    });
    const res = await runner.run(baseRequest({ buildId: "build_cleanup_ok" }));
    expect(res.ok).toBe(true);
    expect(cleanups).toBe(0); // not auto-cleaned
    if (!res.ok) return;
    await res.cleanup();
    expect(cleanups).toBe(1); // explicit cleanup ran
  });
});
