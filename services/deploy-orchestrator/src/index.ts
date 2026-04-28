import { type DeployDeps, type DeployResult, runDeployPipeline } from "./pipeline";
import { TenantQueue } from "./queue";
import type { BuildArtefact, DeploymentRecord } from "./schemas";

export * from "./schemas";
export * from "./framework";
export * from "./pipeline";
export * from "./queue";
export type { ObjectStorageClient } from "./clients/object-storage";
export { createObjectStorageHttpClient } from "./clients/object-storage";
export type { EdgeRuntimeClient } from "./clients/edge-runtime";
export { createEdgeRuntimeHttpClient } from "./clients/edge-runtime";
export type { TunnelClient } from "./clients/tunnel";
export { createTunnelHttpClient } from "./clients/tunnel";
export type { SecretsVaultClient } from "./clients/secrets-vault";
export { createSecretsVaultHttpClient } from "./clients/secrets-vault";

/**
 * High-level deploy entrypoint: enforces per-tenant FIFO ordering on
 * top of the pure pipeline. Concurrent deploys for the same tenant
 * queue; deploys for different tenants run in parallel.
 */
export class DeployOrchestrator {
  private readonly queue = new TenantQueue<DeployResult>();

  constructor(private readonly deps: DeployDeps) {}

  deploy(artefact: BuildArtefact): Promise<DeployResult> {
    return this.queue.enqueue(artefact.tenantId, () =>
      runDeployPipeline(artefact, this.deps),
    );
  }

  /** Tenant IDs with at least one in-flight or queued deploy. */
  activeTenants(): string[] {
    return this.queue.activeKeys();
  }
}

/** Convenience type re-export for downstream consumers. */
export type { DeploymentRecord };
