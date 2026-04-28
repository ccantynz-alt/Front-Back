/**
 * HTTP client wrapper for the deploy-orchestrator service.
 *
 * The deploy-orchestrator takes a build artefact and registers it under a
 * hostname on the edge tunnel. For previews, we always pass `target: "preview"`
 * so the orchestrator routes through the preview tunnel and never collides
 * with production hostnames.
 */

import type { DeployResult } from "../types";

export interface DeployRequest {
  readonly artefactUrl: string;
  readonly hostname: string;
  readonly target: "preview";
  /** Tag identifying which PR this deploy belongs to (for teardown). */
  readonly deployKey: string;
}

export interface TeardownRequest {
  readonly deploymentId: string;
  readonly hostname: string;
}

export interface DeployOrchestratorClient {
  deploy(request: DeployRequest): Promise<DeployResult>;
  teardown(request: TeardownRequest): Promise<void>;
}

export class HttpDeployOrchestratorClient implements DeployOrchestratorClient {
  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async deploy(request: DeployRequest): Promise<DeployResult> {
    const res = await this.fetchImpl(`${this.endpoint}/deployments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      throw new Error(
        `deploy-orchestrator returned ${res.status}: ${await res.text()}`,
      );
    }
    const json = (await res.json()) as DeployResult;
    if (
      typeof json.deploymentId !== "string" ||
      typeof json.liveUrl !== "string"
    ) {
      throw new Error("deploy-orchestrator returned malformed response");
    }
    return json;
  }

  async teardown(request: TeardownRequest): Promise<void> {
    const res = await this.fetchImpl(
      `${this.endpoint}/deployments/${encodeURIComponent(request.deploymentId)}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: request.hostname }),
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(
        `deploy-orchestrator teardown returned ${res.status}: ${await res.text()}`,
      );
    }
  }
}
