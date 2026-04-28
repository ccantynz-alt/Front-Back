/**
 * Test doubles for the orchestrator's collaborators.
 *
 * All mocks record their call history so tests can assert call ordering,
 * payloads, and idempotency. Behaviour can be overridden per-test (e.g. to
 * simulate a build-runner failure).
 */

import type {
  BuildRequest,
  BuildRunnerClient,
} from "../src/clients/build-runner";
import type {
  DeployOrchestratorClient,
  DeployRequest,
  TeardownRequest,
} from "../src/clients/deploy-orchestrator";
import type {
  DeleteCommentRequest,
  GitHubCommentsClient,
  PostCommentRequest,
  UpdateCommentRequest,
} from "../src/github/comments";
import type { BuildResult, DeployResult } from "../src/types";

export class MockBuildRunner implements BuildRunnerClient {
  triggers: BuildRequest[] = [];
  cancels: string[] = [];
  buildResult: BuildResult = {
    buildId: "build-1",
    artefactUrl: "https://artefacts/example.tar",
  };
  failOnce = false;
  /** Counter so each successive build returns a unique ID. */
  private counter = 0;

  async triggerBuild(request: BuildRequest): Promise<BuildResult> {
    this.triggers.push(request);
    if (this.failOnce) {
      this.failOnce = false;
      throw new Error("build-runner exploded");
    }
    this.counter += 1;
    return {
      buildId: `${this.buildResult.buildId}-${this.counter}`,
      artefactUrl: this.buildResult.artefactUrl,
    };
  }

  async cancelBuild(buildId: string): Promise<void> {
    this.cancels.push(buildId);
  }
}

export class MockDeployer implements DeployOrchestratorClient {
  deploys: DeployRequest[] = [];
  teardowns: TeardownRequest[] = [];
  deployResult: DeployResult = {
    deploymentId: "dep-1",
    liveUrl: "https://example.preview.crontech.dev",
  };
  failOnce = false;
  private counter = 0;

  async deploy(request: DeployRequest): Promise<DeployResult> {
    this.deploys.push(request);
    if (this.failOnce) {
      this.failOnce = false;
      throw new Error("deployer exploded");
    }
    this.counter += 1;
    return {
      deploymentId: `${this.deployResult.deploymentId}-${this.counter}`,
      liveUrl: this.deployResult.liveUrl,
    };
  }

  async teardown(request: TeardownRequest): Promise<void> {
    this.teardowns.push(request);
  }
}

export class MockComments implements GitHubCommentsClient {
  posts: PostCommentRequest[] = [];
  updates: UpdateCommentRequest[] = [];
  deletes: DeleteCommentRequest[] = [];
  private nextId = 100;

  async postComment(
    request: PostCommentRequest,
  ): Promise<{ id: number }> {
    this.posts.push(request);
    const id = this.nextId++;
    return { id };
  }

  async updateComment(request: UpdateCommentRequest): Promise<void> {
    this.updates.push(request);
  }

  async deleteComment(request: DeleteCommentRequest): Promise<void> {
    this.deletes.push(request);
  }
}
