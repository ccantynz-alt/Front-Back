import { describe, expect, test } from "bun:test";
import { DeployOrchestrator } from "../src/index";
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

const artefact = (overrides: Partial<BuildArtefact> = {}): BuildArtefact => ({
  buildId: "b1",
  tenantId: "t",
  projectId: "p",
  sha: "abcdef0",
  framework: "solidstart",
  tarballPath: "/tmp/b1.tar",
  sizeBytes: 256,
  sha256: "f".repeat(64),
  hostname: "x.crontech.dev",
  limits: { cpuMs: 50, memoryMb: 128 },
  ...overrides,
});

let n = 0;
const newId = (): string => `dep_${++n}`;

describe("DeployOrchestrator", () => {
  test("concurrent deploys for the same tenant are serialised", async () => {
    const tunnel = createMockTunnel();
    const orch = new DeployOrchestrator({
      objectStorage: createMockObjectStorage(),
      edgeRuntime: createMockEdgeRuntime(),
      tunnel,
      secrets: createMockSecrets(),
      bundleReader: createMockBundleReader(),
      health: createMockHealth({ ok: true }),
      emitter: createMockEmitter(),
      clock: fixedClock(),
      newDeploymentId: newId,
      bundlesBucket: "bundles",
    });

    const a = orch.deploy(artefact({ buildId: "b1", hostname: "h.test" }));
    const b = orch.deploy(artefact({ buildId: "b2", hostname: "h.test" }));

    const [r1, r2] = await Promise.all([a, b]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // Second deploy must see the first deploy's bundle as `previousBundleId`.
    expect(r2.record.previousBundleId).toBe(r1.record.bundleId);
    // Tunnel saw exactly two swaps in order.
    expect(tunnel.swapHistory.length).toBe(2);
  });

  test("deploys for different tenants are independent", async () => {
    const orch = new DeployOrchestrator({
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
    });
    const [a, b] = await Promise.all([
      orch.deploy(artefact({ tenantId: "t1", hostname: "a.test" })),
      orch.deploy(artefact({ tenantId: "t2", hostname: "b.test" })),
    ]);
    expect(a.ok && b.ok).toBe(true);
  });

  test("a failed deploy does not block the next one for the same tenant", async () => {
    let firstCall = true;
    const edge = createMockEdgeRuntime();
    const flakyEdge: typeof edge = {
      ...edge,
      registerBundle: async (input) => {
        if (firstCall) {
          firstCall = false;
          throw new Error("boom");
        }
        return edge.registerBundle(input);
      },
    };
    const orch = new DeployOrchestrator({
      objectStorage: createMockObjectStorage(),
      edgeRuntime: flakyEdge,
      tunnel: createMockTunnel(),
      secrets: createMockSecrets(),
      bundleReader: createMockBundleReader(),
      health: createMockHealth({ ok: true }),
      emitter: createMockEmitter(),
      clock: fixedClock(),
      newDeploymentId: newId,
      bundlesBucket: "bundles",
    });

    const r1 = await orch.deploy(artefact({ buildId: "b1" }));
    expect(r1.ok).toBe(false);
    const r2 = await orch.deploy(artefact({ buildId: "b2" }));
    expect(r2.ok).toBe(true);
  });
});
