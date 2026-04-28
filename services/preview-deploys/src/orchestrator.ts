/**
 * PreviewOrchestrator — the heart of the service.
 *
 * Responsibilities:
 *   - Receive PR events (opened / synchronize / reopened / closed).
 *   - Generate a deterministic preview hostname per build.
 *   - Trigger build-runner -> deploy-orchestrator chain.
 *   - Post / update / delete the GitHub PR comment idempotently.
 *   - Enforce single-active-build per PR. New sync events cancel in-flight
 *     builds before kicking off a fresh one — newest commit always wins.
 *   - Tear down the deployment on PR close.
 *
 * Design: every transition mutates `PreviewState` in the store. Concurrent
 * sync events for the same PR are serialised through a per-PR mutex so we
 * never race the cancel-then-start sequence.
 */

import type { BuildRunnerClient } from "./clients/build-runner";
import type { DeployOrchestratorClient } from "./clients/deploy-orchestrator";
import type { GitHubCommentsClient } from "./github/comments";
import { renderCommentBody } from "./github/render";
import { generateHostname, prId as makePrId } from "./hostname";
import type { StateStore } from "./state/store";
import type {
  PreviewState,
  PreviewStatus,
  PullRequestEvent,
} from "./types";

export interface OrchestratorConfig {
  readonly previewDomain: string;
  readonly now?: () => number;
}

interface Deps {
  readonly buildRunner: BuildRunnerClient;
  readonly deployer: DeployOrchestratorClient;
  readonly comments: GitHubCommentsClient;
  readonly store: StateStore;
  readonly config: OrchestratorConfig;
}

export class PreviewOrchestrator {
  private readonly buildRunner: BuildRunnerClient;
  private readonly deployer: DeployOrchestratorClient;
  private readonly comments: GitHubCommentsClient;
  private readonly store: StateStore;
  private readonly previewDomain: string;
  private readonly now: () => number;
  /** Per-PR mutex chain — every operation queues onto the previous promise. */
  private readonly locks = new Map<string, Promise<void>>();

  constructor(deps: Deps) {
    this.buildRunner = deps.buildRunner;
    this.deployer = deps.deployer;
    this.comments = deps.comments;
    this.store = deps.store;
    this.previewDomain = deps.config.previewDomain;
    this.now = deps.config.now ?? Date.now;
  }

  /**
   * Public entry point. Routes a PR event to the right handler and returns
   * once the resulting state transition is committed.
   */
  async handlePrEvent(event: PullRequestEvent): Promise<PreviewState> {
    const id = makePrId(event.owner, event.repo, event.number);
    return this.withLock(id, async () => {
      switch (event.action) {
        case "opened":
        case "reopened":
        case "synchronize":
          return this.handleOpenOrSync(event);
        case "closed":
          return this.handleClose(event);
      }
    });
  }

  /** Manual teardown — for `/pr/:prId/teardown` admin endpoint. */
  async manualTeardown(prId: string): Promise<PreviewState | undefined> {
    return this.withLock(prId, async () => {
      const state = this.store.get(prId);
      if (!state) return undefined;
      await this.tearDownInternal(state);
      return this.store.get(prId);
    });
  }

  getState(prId: string): PreviewState | undefined {
    return this.store.get(prId);
  }

  // --------------------------------------------------------------------- //
  // Internal handlers
  // --------------------------------------------------------------------- //

  private async handleOpenOrSync(
    event: PullRequestEvent,
  ): Promise<PreviewState> {
    const id = makePrId(event.owner, event.repo, event.number);
    const existing = this.store.get(id);

    // Cancel any in-flight build for this PR — newest commit wins.
    if (existing?.lastBuildId && this.isInFlight(existing.status)) {
      try {
        await this.buildRunner.cancelBuild(existing.lastBuildId);
      } catch (err) {
        // Cancellation failure shouldn't block the new build.
        console.warn(`[preview-deploys] cancel failed for ${id}:`, err);
      }
    }

    const hostname = generateHostname({
      owner: event.owner,
      repo: event.repo,
      number: event.number,
      sha: event.headSha,
      previewDomain: this.previewDomain,
    });

    const state: PreviewState = existing
      ? {
          ...existing,
          hostname,
          lastSha: event.headSha,
          status: "pending",
          updatedAt: this.now(),
          ...(existing.errorMessage !== undefined
            ? { errorMessage: existing.errorMessage }
            : {}),
        }
      : {
          prId: id,
          owner: event.owner,
          repo: event.repo,
          number: event.number,
          hostname,
          lastSha: event.headSha,
          status: "pending",
          createdAt: this.now(),
          updatedAt: this.now(),
        };
    // Reset transient error/build/deploy IDs for the new attempt.
    delete state.errorMessage;
    delete state.lastBuildId;
    delete state.lastDeploymentId;
    this.store.set(state);
    await this.upsertComment(state);

    try {
      await this.transition(state, "building");
      const buildKey = id;
      const build = await this.buildRunner.triggerBuild({
        owner: event.owner,
        repo: event.repo,
        sha: event.headSha,
        ref: event.headRef,
        buildKey,
        cancelPrevious: true,
      });
      state.lastBuildId = build.buildId;
      this.store.set(state);

      await this.transition(state, "deploying");
      const deploy = await this.deployer.deploy({
        artefactUrl: build.artefactUrl,
        hostname,
        target: "preview",
        deployKey: buildKey,
      });
      state.lastDeploymentId = deploy.deploymentId;
      this.store.set(state);

      await this.transition(state, "live");
      return state;
    } catch (err) {
      state.status = "failed";
      state.errorMessage = err instanceof Error ? err.message : String(err);
      state.updatedAt = this.now();
      this.store.set(state);
      await this.upsertComment(state);
      throw err;
    }
  }

  private async handleClose(event: PullRequestEvent): Promise<PreviewState> {
    const id = makePrId(event.owner, event.repo, event.number);
    const existing = this.store.get(id);
    if (!existing) {
      // Nothing to tear down — synthesize a torn-down record so callers can
      // observe the state idempotently.
      const state: PreviewState = {
        prId: id,
        owner: event.owner,
        repo: event.repo,
        number: event.number,
        hostname: "",
        lastSha: event.headSha,
        status: "torn-down",
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      this.store.set(state);
      return state;
    }
    await this.tearDownInternal(existing);
    const after = this.store.get(id);
    if (!after) throw new Error("state vanished after teardown");
    return after;
  }

  private async tearDownInternal(state: PreviewState): Promise<void> {
    if (state.lastBuildId && this.isInFlight(state.status)) {
      try {
        await this.buildRunner.cancelBuild(state.lastBuildId);
      } catch (err) {
        console.warn(`[preview-deploys] cancel during teardown failed:`, err);
      }
    }
    if (state.lastDeploymentId) {
      try {
        await this.deployer.teardown({
          deploymentId: state.lastDeploymentId,
          hostname: state.hostname,
        });
      } catch (err) {
        console.warn(`[preview-deploys] teardown deploy failed:`, err);
      }
    }
    state.status = "torn-down";
    state.updatedAt = this.now();
    delete state.errorMessage;
    this.store.set(state);
    await this.upsertComment(state);
  }

  private async transition(
    state: PreviewState,
    next: PreviewStatus,
  ): Promise<void> {
    state.status = next;
    state.updatedAt = this.now();
    this.store.set(state);
    await this.upsertComment(state);
  }

  private async upsertComment(state: PreviewState): Promise<void> {
    const body = renderCommentBody(state);
    if (state.commentId !== undefined) {
      await this.comments.updateComment({
        owner: state.owner,
        repo: state.repo,
        commentId: state.commentId,
        body,
      });
      return;
    }
    const created = await this.comments.postComment({
      owner: state.owner,
      repo: state.repo,
      number: state.number,
      body,
    });
    state.commentId = created.id;
    this.store.set(state);
  }

  private isInFlight(status: PreviewStatus): boolean {
    return (
      status === "pending" || status === "building" || status === "deploying"
    );
  }

  /** Serialise operations per-PR — no two run for the same PR concurrently. */
  private async withLock<T>(
    id: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(id, previous.then(() => next));
    try {
      await previous;
      return await fn();
    } finally {
      release();
      // Best-effort cleanup so the map doesn't grow unbounded.
      if (this.locks.get(id) === previous.then(() => next)) {
        this.locks.delete(id);
      }
    }
  }
}
