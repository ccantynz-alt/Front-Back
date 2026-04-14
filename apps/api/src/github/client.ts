// ── GitHub API Client ──────────────────────────────────────────────
// Typed GitHub REST API client for the Crontech repos panel.
// Uses the user's stored GitHub PAT (from userProviderKeys).
// Wraps fetch — no external SDK dependency needed.

import { z } from "zod";

const GITHUB_API = "https://api.github.com";

// ── Response Schemas ─────────────────────────────────────────────

export const GHRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
  language: z.string().nullable(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  default_branch: z.string(),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean(),
  updated_at: z.string(),
  pushed_at: z.string().nullable(),
  owner: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
});
export type GHRepo = z.infer<typeof GHRepoSchema>;

export const GHBranchSchema = z.object({
  name: z.string(),
  commit: z.object({
    sha: z.string(),
  }),
  protected: z.boolean(),
});
export type GHBranch = z.infer<typeof GHBranchSchema>;

export const GHCommitSchema = z.object({
  sha: z.string(),
  commit: z.object({
    message: z.string(),
    author: z.object({
      name: z.string(),
      date: z.string(),
    }).nullable(),
  }),
  html_url: z.string(),
  author: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }).nullable(),
});
export type GHCommit = z.infer<typeof GHCommitSchema>;

export const GHPullRequestSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  merged_at: z.string().nullable(),
  draft: z.boolean(),
  user: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
  head: z.object({
    ref: z.string(),
  }),
  base: z.object({
    ref: z.string(),
  }),
});
export type GHPullRequest = z.infer<typeof GHPullRequestSchema>;

export const GHIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  labels: z.array(z.object({
    name: z.string(),
    color: z.string(),
  })),
  user: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
  pull_request: z.object({ url: z.string() }).optional(),
});
export type GHIssue = z.infer<typeof GHIssueSchema>;

export const GHWorkflowRunSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  html_url: z.string(),
  created_at: z.string(),
  head_branch: z.string(),
  head_sha: z.string(),
});
export type GHWorkflowRun = z.infer<typeof GHWorkflowRunSchema>;

export const GHUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string(),
  html_url: z.string(),
  public_repos: z.number(),
  followers: z.number(),
});
export type GHUser = z.infer<typeof GHUserSchema>;

// ── Client ───────────────────────────────────────────────────────

export class GitHubClient {
  constructor(private token: string) {}

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const url = new URL(`${GITHUB_API}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    return schema.parse(json);
  }

  /** Get the authenticated user's profile. */
  async getUser(): Promise<GHUser> {
    return this.request("/user", GHUserSchema);
  }

  /** List repositories for the authenticated user. */
  async listRepos(opts?: {
    sort?: "updated" | "pushed" | "full_name";
    per_page?: number;
    page?: number;
  }): Promise<GHRepo[]> {
    return this.request(
      "/user/repos",
      z.array(GHRepoSchema),
      {
        sort: opts?.sort ?? "pushed",
        per_page: opts?.per_page ?? 30,
        page: opts?.page ?? 1,
        type: "all",
      },
    );
  }

  /** Get a single repository. */
  async getRepo(owner: string, repo: string): Promise<GHRepo> {
    return this.request(`/repos/${owner}/${repo}`, GHRepoSchema);
  }

  /** List branches for a repository. */
  async listBranches(
    owner: string,
    repo: string,
    opts?: { per_page?: number },
  ): Promise<GHBranch[]> {
    return this.request(
      `/repos/${owner}/${repo}/branches`,
      z.array(GHBranchSchema),
      { per_page: opts?.per_page ?? 30 },
    );
  }

  /** List recent commits for a repository. */
  async listCommits(
    owner: string,
    repo: string,
    opts?: { per_page?: number; sha?: string },
  ): Promise<GHCommit[]> {
    const params: Record<string, string | number> = {
      per_page: opts?.per_page ?? 20,
    };
    if (opts?.sha) params["sha"] = opts.sha;
    return this.request(
      `/repos/${owner}/${repo}/commits`,
      z.array(GHCommitSchema),
      params,
    );
  }

  /** List pull requests for a repository. */
  async listPullRequests(
    owner: string,
    repo: string,
    opts?: { state?: "open" | "closed" | "all"; per_page?: number },
  ): Promise<GHPullRequest[]> {
    return this.request(
      `/repos/${owner}/${repo}/pulls`,
      z.array(GHPullRequestSchema),
      {
        state: opts?.state ?? "open",
        per_page: opts?.per_page ?? 20,
        sort: "updated",
        direction: "desc",
      },
    );
  }

  /** List issues (excluding PRs) for a repository. */
  async listIssues(
    owner: string,
    repo: string,
    opts?: { state?: "open" | "closed" | "all"; per_page?: number },
  ): Promise<GHIssue[]> {
    const all = await this.request(
      `/repos/${owner}/${repo}/issues`,
      z.array(GHIssueSchema),
      {
        state: opts?.state ?? "open",
        per_page: opts?.per_page ?? 20,
        sort: "updated",
        direction: "desc",
      },
    );
    // GitHub's issues endpoint includes PRs — filter them out
    return all.filter((i) => !i.pull_request);
  }

  /** List recent CI/CD workflow runs for a repository. */
  async listWorkflowRuns(
    owner: string,
    repo: string,
    opts?: { per_page?: number },
  ): Promise<GHWorkflowRun[]> {
    const res = await this.request(
      `/repos/${owner}/${repo}/actions/runs`,
      z.object({ workflow_runs: z.array(GHWorkflowRunSchema) }),
      { per_page: opts?.per_page ?? 10 },
    );
    return res.workflow_runs;
  }

  /** Validate that the token works by fetching the user. */
  async validateToken(): Promise<{ valid: boolean; login?: string }> {
    try {
      const user = await this.getUser();
      return { valid: true, login: user.login };
    } catch {
      return { valid: false };
    }
  }
}
