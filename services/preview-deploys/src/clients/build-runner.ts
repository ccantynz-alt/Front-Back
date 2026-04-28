/**
 * HTTP client wrapper for the build-runner service.
 *
 * The build-runner clones the repo at a given SHA and produces a deployable
 * artefact. We pass `cancelPrevious: true` so concurrent builds for the same
 * PR get cancelled — only the latest sync wins, no wasted compute.
 *
 * In tests, replace this with a stub via the `BuildRunnerClient` interface.
 */

import type { BuildResult } from "../types";

export interface BuildRequest {
  readonly owner: string;
  readonly repo: string;
  readonly sha: string;
  readonly ref: string;
  /** Tag identifying which PR this build belongs to (for cancel-previous). */
  readonly buildKey: string;
  readonly cancelPrevious: boolean;
}

export interface BuildRunnerClient {
  triggerBuild(request: BuildRequest): Promise<BuildResult>;
  cancelBuild(buildId: string): Promise<void>;
}

export class HttpBuildRunnerClient implements BuildRunnerClient {
  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async triggerBuild(request: BuildRequest): Promise<BuildResult> {
    const res = await this.fetchImpl(`${this.endpoint}/builds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      throw new Error(
        `build-runner returned ${res.status}: ${await res.text()}`,
      );
    }
    const json = (await res.json()) as BuildResult;
    if (typeof json.buildId !== "string" || typeof json.artefactUrl !== "string") {
      throw new Error("build-runner returned malformed response");
    }
    return json;
  }

  async cancelBuild(buildId: string): Promise<void> {
    const res = await this.fetchImpl(
      `${this.endpoint}/builds/${encodeURIComponent(buildId)}`,
      { method: "DELETE" },
    );
    // 404 is fine — already gone.
    if (!res.ok && res.status !== 404) {
      throw new Error(
        `build-runner cancel returned ${res.status}: ${await res.text()}`,
      );
    }
  }
}
