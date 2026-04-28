import { describe, expect, test } from "bun:test";
import { runDeployPipeline } from "../src/pipeline";
import type { BuildArtefact } from "../src/schemas";
import {
  createMockBundleReader,
  createMockEdgeRuntime,
  createMockEmitter,
  createMockHealth,
  createMockObjectStorage,
  createMockSecrets,
  createMockTunnel,
  fixedClock,
} from "./mocks";

const baseArtefact = (overrides: Partial<BuildArtefact> = {}): BuildArtefact => ({
  buildId: "build_001",
  tenantId: "tenant_a",
  projectId: "proj_alpha",
  sha: "abc1234567def890",
  framework: "solidstart",
  tarballPath: "/tmp/build_001.tar",
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  hostname: "alpha.crontech.dev",
  limits: { cpuMs: 50, memoryMb: 128 },
  ...overrides,
});

let counter = 0;
const newId = (): string => `dep_${++counter}`;

describe("runDeployPipeline — happy path", () => {
  test("uploads → registers → swaps → health-checks → goes live", async () => {
    const objectStorage = createMockObjectStorage();
    const edgeRuntime = createMockEdgeRuntime();
    const tunnel = createMockTunnel();
    const secrets = createMockSecrets();
    const bundleReader = createMockBundleReader();
    const emitter = createMockEmitter();

    const result = await runDeployPipeline(baseArtefact(), {
      objectStorage,
      edgeRuntime,
      tunnel,
      secrets,
      bundleReader,
      health: createMockHealth({ ok: true }),
      emitter,
      clock: fixedClock(),
      newDeploymentId: newId,
      bundlesBucket: "bundles",
    });

    expect(result.ok).toBe(true);
    expect(result.record.status).toBe("live");
    expect(result.record.liveUrl).toBe("https://alpha.crontech.dev/");

    expect(objectStorage.store.size).toBe(1);
    expect(edgeRuntime.bundles.size).toBe(1);
    expect(tunnel.routes.get("alpha.crontech.dev")).toMatch(/^bdl_build_001_/);

    const statuses = emitter.records.map((r) => r.status);
    expect(statuses).toContain("uploading");
    expect(statuses).toContain("registering");
    expect(statuses).toContain("routing");
    expect(statuses).toContain("health-checking");
    expect(statuses).toContain("swapping");
    expect(statuses[statuses.length - 1]).toBe("live");
  });

  test("framework-aware entrypoint extraction", async () => {
    const cases: Array<{ framework: BuildArtefact["framework"]; expect: string }> =
      [
        { framework: "solidstart", expect: "dist/server/index.mjs" },
        { framework: "nextjs", expect: ".next/standalone/server.js" },
        { framework: "remix", expect: "build/server/index.js" },
        { framework: "astro", expect: "dist/server/entry.mjs" },
        { framework: "sveltekit", expect: "build/index.js" },
        { framework: "hono", expect: "dist/index.js" },
        { framework: "node", expect: "dist/index.js" },
        { framework: "static", expect: "dist/index.html" },
      ];

    for (const c of cases) {
      const reader = createMockBundleReader();
      const result = await runDeployPipeline(
        baseArtefact({ framework: c.framework }),
        {
          objectStorage: createMockObjectStorage(),
          edgeRuntime: createMockEdgeRuntime(),
          tunnel: createMockTunnel(),
          secrets: createMockSecrets(),
          bundleReader: reader,
          health: createMockHealth({ ok: true }),
          emitter: createMockEmitter(),
          clock: fixedClock(),
          newDeploymentId: newId,
          bundlesBucket: "bundles",
        },
      );
      expect(result.ok).toBe(true);
      expect(reader.reads[0]).toBe(`/tmp/build_001.tar::${c.expect}`);
    }
  });

  test("entrypoint override is honoured", async () => {
    const reader = createMockBundleReader();
    const result = await runDeployPipeline(
      baseArtefact({ entrypointOverride: "custom/server.mjs" }),
      {
        objectStorage: createMockObjectStorage(),
        edgeRuntime: createMockEdgeRuntime(),
        tunnel: createMockTunnel(),
        secrets: createMockSecrets(),
        bundleReader: reader,
        health: createMockHealth({ ok: true }),
        emitter: createMockEmitter(),
        clock: fixedClock(),
        newDeploymentId: newId,
        bundlesBucket: "bundles",
      },
    );
    expect(result.ok).toBe(true);
    expect(reader.reads[0]).toBe("/tmp/build_001.tar::custom/server.mjs");
  });

  test("rejects entrypoint override with path traversal", async () => {
    const result = await runDeployPipeline(
      baseArtefact({ entrypointOverride: "../etc/passwd" }),
      {
        objectStorage: createMockObjectStorage(),
        edgeRuntime: createMockEdgeRuntime(),
        tunnel: createMockTunnel(),
        secrets: createMockSecrets(),
        bundleReader: createMockBundleReader(),
        health: createMockHealth({ ok: true }),
        emitter: createMockEmitter(),
        clock: fixedClock(),
        newDeploymentId: newId,
        bundlesBucket: "bundles",
      },
    );
    expect(result.ok).toBe(false);
    expect(result.record.status).toBe("failed");
    expect(result.record.error).toContain("path traversal");
  });
});

describe("runDeployPipeline — rollback", () => {
  test("rolls back object-storage write when edge-runtime fails", async () => {
    const objectStorage = createMockObjectStorage();
    const edgeRuntime = createMockEdgeRuntime({ failOnRegister: true });
    const tunnel = createMockTunnel();
    const emitter = createMockEmitter();

    const result = await runDeployPipeline(baseArtefact(), {
      objectStorage,
      edgeRuntime,
      tunnel,
      secrets: createMockSecrets(),
      bundleReader: createMockBundleReader(),
      health: createMockHealth({ ok: true }),
      emitter,
      clock: fixedClock(),
      newDeploymentId: newId,
      bundlesBucket: "bundles",
    });

    expect(result.ok).toBe(false);
    expect(result.record.status).toBe("failed");
    expect(objectStorage.deletes.length).toBe(1);
    expect(objectStorage.store.size).toBe(0);
    expect(emitter.records.some((r) => r.status === "rolling-back")).toBe(true);
  });

  test("rolls back bundle + storage when tunnel swap fails", async () => {
    const objectStorage = createMockObjectStorage();
    const edgeRuntime = createMockEdgeRuntime();
    const tunnel = createMockTunnel({ failOnSwap: true });

    const result = await runDeployPipeline(baseArtefact(), {
      objectStorage,
      edgeRuntime,
      tunnel,
      secrets: createMockSecrets(),
      bundleReader: createMockBundleReader(),
      health: createMockHealth({ ok: true }),
      emitter: createMockEmitter(),
      clock: fixedClock(),
      newDeploymentId: newId,
      bundlesBucket: "bundles",
    });

    expect(result.ok).toBe(false);
    expect(edgeRuntime.deleted.length).toBe(1);
    expect(objectStorage.deletes.length).toBe(1);
  });

  test("rolls back tunnel + bundle + storage when health-check fails (restores previous route)", async () => {
    const objectStorage = createMockObjectStorage();
    const edgeRuntime = createMockEdgeRuntime();
    const tunnel = createMockTunnel({
      initialRoutes: { "alpha.crontech.dev": "bdl_old" },
    });

    const result = await runDeployPipeline(baseArtefact(), {
      objectStorage,
      edgeRuntime,
      tunnel,
      secrets: createMockSecrets(),
      bundleReader: createMockBundleReader(),
      health: createMockHealth({ ok: false }),
      emitter: createMockEmitter(),
      clock: fixedClock(),
      newDeploymentId: newId,
      bundlesBucket: "bundles",
    });

    expect(result.ok).toBe(false);
    expect(result.record.error).toContain("health check failed");
    // Two swaps: forward + restore.
    expect(tunnel.swapHistory.length).toBe(2);
    expect(tunnel.routes.get("alpha.crontech.dev")).toBe("bdl_old");
    expect(edgeRuntime.deleted.length).toBe(1);
    expect(objectStorage.deletes.length).toBe(1);
  });

  test("rolls back via tunnel deleteRoute when no previous bundle existed", async () => {
    const objectStorage = createMockObjectStorage();
    const edgeRuntime = createMockEdgeRuntime();
    const tunnel = createMockTunnel(); // no initial routes

    const result = await runDeployPipeline(baseArtefact(), {
      objectStorage,
      edgeRuntime,
      tunnel,
      secrets: createMockSecrets(),
      bundleReader: createMockBundleReader(),
      health: createMockHealth({ ok: false }),
      emitter: createMockEmitter(),
      clock: fixedClock(),
      newDeploymentId: newId,
      bundlesBucket: "bundles",
    });

    expect(result.ok).toBe(false);
    expect(tunnel.deletes).toContain("alpha.crontech.dev");
  });
});

describe("runDeployPipeline — blue-green swap", () => {
  test("warms previous bundle for configured TTL", async () => {
    const edgeRuntime = createMockEdgeRuntime();
    const tunnel = createMockTunnel({
      initialRoutes: { "alpha.crontech.dev": "bdl_old" },
    });

    const result = await runDeployPipeline(baseArtefact(), {
      objectStorage: createMockObjectStorage(),
      edgeRuntime,
      tunnel,
      secrets: createMockSecrets(),
      bundleReader: createMockBundleReader(),
      health: createMockHealth({ ok: true }),
      emitter: createMockEmitter(),
      clock: fixedClock(),
      newDeploymentId: newId,
      bundlesBucket: "bundles",
      blueGreenWarmMs: 60_000,
    });

    expect(result.ok).toBe(true);
    expect(result.record.previousBundleId).toBe("bdl_old");
    expect(edgeRuntime.warmed).toEqual([
      { bundleId: "bdl_old", ttlSeconds: 60 },
    ]);
  });

  test("does not warm anything on first deploy", async () => {
    const edgeRuntime = createMockEdgeRuntime();
    const tunnel = createMockTunnel();

    const result = await runDeployPipeline(baseArtefact(), {
      objectStorage: createMockObjectStorage(),
      edgeRuntime,
      tunnel,
      secrets: createMockSecrets(),
      bundleReader: createMockBundleReader(),
      health: createMockHealth({ ok: true }),
      emitter: createMockEmitter(),
      clock: fixedClock(),
      newDeploymentId: newId,
      bundlesBucket: "bundles",
    });

    expect(result.ok).toBe(true);
    expect(result.record.previousBundleId).toBeUndefined();
    expect(edgeRuntime.warmed).toEqual([]);
  });
});
