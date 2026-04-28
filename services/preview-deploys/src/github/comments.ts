/**
 * GitHub Comments client.
 *
 * Posts and updates a single PR comment per preview deploy — idempotent. The
 * comment is identified by a hidden HTML marker (`<!-- crontech-preview ... -->`)
 * so we can find an existing comment on subsequent sync events and update it
 * in place rather than spamming the PR.
 *
 * This is wrapped by an interface so tests can mock the HTTP layer.
 */

export interface PostCommentRequest {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly body: string;
}

export interface UpdateCommentRequest {
  readonly owner: string;
  readonly repo: string;
  readonly commentId: number;
  readonly body: string;
}

export interface DeleteCommentRequest {
  readonly owner: string;
  readonly repo: string;
  readonly commentId: number;
}

export interface GitHubCommentsClient {
  postComment(request: PostCommentRequest): Promise<{ id: number }>;
  updateComment(request: UpdateCommentRequest): Promise<void>;
  deleteComment(request: DeleteCommentRequest): Promise<void>;
}

const GITHUB_API = "https://api.github.com";

/** Hidden marker used to identify our comments on a PR. */
export const COMMENT_MARKER = "<!-- crontech-preview-deploys -->";

export class HttpGitHubCommentsClient implements GitHubCommentsClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly apiBase: string = GITHUB_API,
  ) {
    if (token.length === 0) {
      throw new Error("GitHub token is required");
    }
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "crontech-preview-deploys/0.0.1",
    };
  }

  async postComment(request: PostCommentRequest): Promise<{ id: number }> {
    const url = `${this.apiBase}/repos/${request.owner}/${request.repo}/issues/${request.number}/comments`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ body: request.body }),
    });
    if (!res.ok) {
      throw new Error(`GitHub postComment ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { id: number };
    if (typeof json.id !== "number") {
      throw new Error("GitHub postComment returned malformed response");
    }
    return { id: json.id };
  }

  async updateComment(request: UpdateCommentRequest): Promise<void> {
    const url = `${this.apiBase}/repos/${request.owner}/${request.repo}/issues/comments/${request.commentId}`;
    const res = await this.fetchImpl(url, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ body: request.body }),
    });
    if (!res.ok) {
      throw new Error(`GitHub updateComment ${res.status}: ${await res.text()}`);
    }
  }

  async deleteComment(request: DeleteCommentRequest): Promise<void> {
    const url = `${this.apiBase}/repos/${request.owner}/${request.repo}/issues/comments/${request.commentId}`;
    const res = await this.fetchImpl(url, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`GitHub deleteComment ${res.status}: ${await res.text()}`);
    }
  }
}
