/**
 * Core types for the preview-deploys service.
 *
 * State machine:
 *   pending -> building -> deploying -> live
 *                    \-> failed
 *   live -> torn-down (on PR close)
 */

export type PreviewStatus =
  | "pending"
  | "building"
  | "deploying"
  | "live"
  | "failed"
  | "torn-down";

export interface PreviewState {
  /** Stable identifier for the PR — `${owner}/${repo}#${number}`. */
  readonly prId: string;
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  /** Public preview hostname — `<owner>-<repo>-pr<n>-<sha7>.preview.crontech.dev`. */
  hostname: string;
  status: PreviewStatus;
  /** Last commit SHA we attempted to build. */
  lastSha: string;
  /** Build runner job ID (if a build has been triggered). */
  lastBuildId?: string;
  /** Deploy orchestrator deployment ID (if a deploy has been triggered). */
  lastDeploymentId?: string;
  /** GitHub PR comment ID — used for idempotent updates. */
  commentId?: number;
  /** Error message if status === "failed". */
  errorMessage?: string;
  /** Timestamps for state transitions. */
  createdAt: number;
  updatedAt: number;
}

export interface PullRequestEvent {
  /** GitHub PR webhook action — we care about open / sync / reopen / close. */
  readonly action: "opened" | "synchronize" | "reopened" | "closed";
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly headSha: string;
  readonly headRef: string;
  readonly baseRef: string;
  readonly merged?: boolean;
}

export interface BuildResult {
  readonly buildId: string;
  readonly artefactUrl: string;
}

export interface DeployResult {
  readonly deploymentId: string;
  readonly liveUrl: string;
}
