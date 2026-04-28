import type { EdgeRuntimeClient } from "./clients/edge-runtime";
import type { ObjectStorageClient } from "./clients/object-storage";
import type { SecretsVaultClient } from "./clients/secrets-vault";
import type { TunnelClient } from "./clients/tunnel";
import { resolveEntrypoint } from "./framework";
import {
  type BuildArtefact,
  BuildArtefactSchema,
  type DeploymentRecord,
  type DeploymentStatus,
} from "./schemas";

/**
 * Reads the entrypoint file out of an artefact tarball and returns it
 * as a UTF-8 string suitable for handing to the edge runtime.
 */
export interface BundleReader {
  readEntrypoint(args: {
    tarballPath: string;
    entrypoint: string;
  }): Promise<string>;
  readTarball(tarballPath: string): Promise<Uint8Array>;
}

/** Health-checks the live URL after the swap. */
export interface HealthChecker {
  probe(url: string, opts: { timeoutMs: number }): Promise<{ ok: boolean }>;
}

/** Collects status updates emitted by the pipeline. */
export interface StatusEmitter {
  emit(record: DeploymentRecord): void;
}

export interface DeployDeps {
  readonly objectStorage: ObjectStorageClient;
  readonly edgeRuntime: EdgeRuntimeClient;
  readonly tunnel: TunnelClient;
  readonly secrets: SecretsVaultClient;
  readonly bundleReader: BundleReader;
  readonly health: HealthChecker;
  readonly emitter: StatusEmitter;
  readonly clock: () => Date;
  readonly newDeploymentId: () => string;
  readonly bundlesBucket: string;
  /** ms to keep the previous bundle warm after the swap. Default 60s. */
  readonly blueGreenWarmMs?: number;
  /** ms to wait for /health 2xx after the swap. Default 10s. */
  readonly healthTimeoutMs?: number;
}

export interface DeployResult {
  record: DeploymentRecord;
  ok: boolean;
}

/**
 * Run the full deploy pipeline for a single `BuildArtefact`. Pure
 * functional core — every side-effect goes through an injected client
 * so tests can mock the surface and simulate failures at every step.
 *
 * Lifecycle:
 *   queued → uploading → registering → routing → health-checking →
 *   swapping → live   (blue-green: old bundle stays warm `blueGreenWarmMs`)
 *
 * If anything fails, the pipeline transitions to `rolling-back`,
 * undoes the side-effects in reverse order, and emits `failed`.
 */
export async function runDeployPipeline(
  rawArtefact: BuildArtefact,
  deps: DeployDeps,
): Promise<DeployResult> {
  const artefact = BuildArtefactSchema.parse(rawArtefact);
  const deploymentId = deps.newDeploymentId();
  const startedAt = deps.clock().toISOString();

  let record: DeploymentRecord = {
    deploymentId,
    buildId: artefact.buildId,
    tenantId: artefact.tenantId,
    hostname: artefact.hostname,
    status: "queued",
    startedAt,
  };
  const update = (patch: Partial<DeploymentRecord>): DeploymentRecord => {
    record = { ...record, ...patch };
    deps.emitter.emit(record);
    return record;
  };
  update({ status: "queued" });

  const bundleId = `bdl_${artefact.buildId}_${deploymentId}`;
  const objectKey = `bundles/${artefact.tenantId}/${artefact.buildId}.tar`;

  // Track which side-effects have happened so rollback can undo them.
  const undo: Array<{ name: string; run: () => Promise<void> }> = [];

  const fail = async (
    where: DeploymentStatus,
    err: unknown,
  ): Promise<DeployResult> => {
    update({ status: "rolling-back", error: messageOf(err) });
    for (const step of undo.reverse()) {
      try {
        await step.run();
      } catch {
        // Rollback is best-effort. We never throw out of rollback —
        // the worst-case is a stale resource the next deploy overwrites.
      }
    }
    const finishedAt = deps.clock().toISOString();
    return {
      ok: false,
      record: update({
        status: "failed",
        finishedAt,
        error: `${where}: ${messageOf(err)}`,
      }),
    };
  };

  try {
    /* 1. Upload tarball to object storage. */
    update({ status: "uploading" });
    const tarball = await deps.bundleReader.readTarball(artefact.tarballPath);
    await deps.objectStorage.put({
      bucket: deps.bundlesBucket,
      key: objectKey,
      body: tarball,
      contentType: "application/x-tar",
      sha256: artefact.sha256,
    });
    undo.push({
      name: "object-storage",
      run: () =>
        deps.objectStorage.delete({
          bucket: deps.bundlesBucket,
          key: objectKey,
        }),
    });

    /* 2. Read framework entrypoint and 3. fetch env+secrets. */
    const entrypoint = resolveEntrypoint(
      artefact.framework,
      artefact.entrypointOverride,
    );
    const [code, secretsBundle] = await Promise.all([
      deps.bundleReader.readEntrypoint({
        tarballPath: artefact.tarballPath,
        entrypoint,
      }),
      deps.secrets.fetchBundle({
        tenantId: artefact.tenantId,
        projectId: artefact.projectId,
        sha: artefact.sha,
      }),
    ]);

    /* 4. Register bundle on edge-runtime. */
    update({ status: "registering" });
    const registered = await deps.edgeRuntime.registerBundle({
      id: bundleId,
      hash: artefact.sha256,
      code,
      env: secretsBundle.env,
      secrets: secretsBundle.secrets,
      limits: artefact.limits,
    });
    undo.push({
      name: "edge-runtime",
      run: () => deps.edgeRuntime.deleteBundle(registered.bundleId),
    });

    /* 5. Atomically swap traffic via tunnel registry. */
    update({ status: "routing", bundleId: registered.bundleId });
    const swap = await deps.tunnel.swap({
      hostname: artefact.hostname,
      bundleId: registered.bundleId,
    });
    undo.push({
      name: "tunnel",
      run: async () => {
        if (swap.previousBundleId) {
          // Restore the previous mapping on rollback.
          await deps.tunnel.swap({
            hostname: artefact.hostname,
            bundleId: swap.previousBundleId,
          });
        } else {
          await deps.tunnel.deleteRoute(artefact.hostname);
        }
      },
    });

    /* 6. Health-check the live URL. */
    update({ status: "health-checking" });
    const liveUrl = `https://${artefact.hostname}/`;
    const probe = await deps.health.probe(liveUrl, {
      timeoutMs: deps.healthTimeoutMs ?? 10_000,
    });
    if (!probe.ok) {
      throw new Error("health check failed (expected 2xx within budget)");
    }

    /* 7. Blue-green: keep previous bundle warm for the configured window. */
    update({ status: "swapping" });
    if (swap.previousBundleId) {
      const warmMs = deps.blueGreenWarmMs ?? 60_000;
      // We don't await — warming is fire-and-forget. The runtime is
      // expected to honour the TTL itself.
      try {
        await deps.edgeRuntime.warmBundle(
          swap.previousBundleId,
          Math.ceil(warmMs / 1000),
        );
      } catch {
        // Failing to warm an old bundle is not fatal — the new one is live.
      }
    }

    const finishedAt = deps.clock().toISOString();
    const finalPatch: Partial<DeploymentRecord> = {
      status: "live",
      liveUrl,
      finishedAt,
    };
    if (swap.previousBundleId !== undefined) {
      finalPatch.previousBundleId = swap.previousBundleId;
    }
    return { ok: true, record: update(finalPatch) };
  } catch (err) {
    return fail(record.status, err);
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
