// ── GitWatchman: GitHub Release Monitor ─────────────────────────────
// Monitors competitor GitHub releases with full threat assessment.
// Persists last-known releases via tracked-repos store so detection
// survives restarts. Handles rate limiting, pre-releases, and semver
// classification for intelligent severity assignment.

import { z } from "zod";
import {
  type Collector,
  type CollectorResult,
  type IntelligenceItem,
  type RepoPriority,
  type Severity,
  type TrackedRepo,
} from "./types";
import { fetchWithRetry } from "../utils/fetch";
import {
  loadTrackedRepos,
  updateTrackedRepo,
} from "../storage/tracked-repos-store";

// ── Zod Schemas for GitHub API Responses ────────────────────────────

const GitHubReleaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable(),
  html_url: z.string(),
  published_at: z.string().nullable(),
  created_at: z.string(),
  prerelease: z.boolean(),
  draft: z.boolean(),
  body: z.string().nullable(),
  author: z
    .object({
      login: z.string(),
    })
    .nullable(),
  assets: z.array(
    z.object({
      name: z.string(),
      download_count: z.number(),
    }),
  ),
});

type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;

const GitHubRateLimitSchema = z.object({
  resources: z.object({
    core: z.object({
      remaining: z.number(),
      reset: z.number(),
    }),
  }),
});

// ── Semver Parsing ──────────────────────────────────────────────────

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
  preRelease: string | null;
  raw: string;
}

function parseSemver(tag: string): SemverParts | null {
  const cleaned = tag.replace(/^v/, "");
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(cleaned);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    preRelease: match[4] ?? null,
    raw: tag,
  };
}

function classifyVersionBump(
  oldTag: string | null,
  newTag: string,
  isPrerelease: boolean,
): { severity: Severity; bumpType: string } {
  if (isPrerelease) {
    return { severity: "low", bumpType: "pre-release" };
  }

  if (!oldTag) {
    // First known release -- classify by tag pattern
    const parsed = parseSemver(newTag);
    if (parsed && parsed.major >= 1) {
      return { severity: "high", bumpType: "initial-detection" };
    }
    return { severity: "medium", bumpType: "initial-detection" };
  }

  const oldVer = parseSemver(oldTag);
  const newVer = parseSemver(newTag);

  if (!oldVer || !newVer) {
    // Cannot parse semver, fall back to string comparison
    return { severity: "medium", bumpType: "unknown" };
  }

  if (newVer.major > oldVer.major) {
    return { severity: "critical", bumpType: "major" };
  }
  if (newVer.minor > oldVer.minor) {
    return { severity: "high", bumpType: "minor" };
  }
  if (newVer.patch > oldVer.patch) {
    return { severity: "medium", bumpType: "patch" };
  }

  return { severity: "low", bumpType: "other" };
}

// ── Threat Assessment ───────────────────────────────────────────────

function assessThreat(
  repo: TrackedRepo,
  release: GitHubRelease,
  bumpType: string,
): { impact: string; recommendation: string } {
  const repoKey = `${repo.owner}/${repo.repo}`;

  if (repo.priority === "critical") {
    if (bumpType === "major") {
      return {
        impact: `MAJOR version bump in critical dependency ${repo.displayName}. This likely contains breaking changes that directly affect our stack.`,
        recommendation: `Immediate review required. Check migration guide at ${release.html_url}. Assess impact on our ${repo.category} layer and plan upgrade path.`,
      };
    }
    if (bumpType === "minor") {
      return {
        impact: `New features in critical dependency ${repo.displayName}. May include capabilities we should adopt or competitive features we need to match.`,
        recommendation: `Review changelog within 24 hours. Identify new features relevant to our platform and schedule integration.`,
      };
    }
    return {
      impact: `Patch release for critical dependency ${repo.displayName}. Likely bug fixes and security patches.`,
      recommendation: `Queue for Renovate auto-merge. Verify no breaking changes in the patch.`,
    };
  }

  if (repo.priority === "high") {
    if (bumpType === "major") {
      return {
        impact: `Major release from competitor ${repo.displayName} (${repoKey}). May shift competitive landscape.`,
        recommendation: `Review within 48 hours. Assess competitive implications and identify any features we should match or surpass.`,
      };
    }
    return {
      impact: `New release from tracked project ${repo.displayName}.`,
      recommendation: `Include in weekly intelligence review. Check for relevant features or patterns.`,
    };
  }

  return {
    impact: `Release from monitored project ${repo.displayName}.`,
    recommendation: `Monitor. Include in weekly digest.`,
  };
}

// ── GitHub API Helpers ──────────────────────────────────────────────

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Crontech-Sentinel/1.0",
  };
  const githubToken = process.env["GITHUB_TOKEN"];
  if (githubToken) {
    headers["Authorization"] = `Bearer ${githubToken}`;
  }
  return headers;
}

async function checkRateLimit(): Promise<{
  remaining: number;
  resetAt: Date;
}> {
  const headers = buildHeaders();
  try {
    const response = await fetchWithRetry(
      "https://api.github.com/rate_limit",
      { headers },
    );
    if (!response.ok) {
      return { remaining: 0, resetAt: new Date(Date.now() + 60_000) };
    }
    const data: unknown = await response.json();
    const parsed = GitHubRateLimitSchema.parse(data);
    return {
      remaining: parsed.resources.core.remaining,
      resetAt: new Date(parsed.resources.core.reset * 1000),
    };
  } catch {
    return { remaining: 0, resetAt: new Date(Date.now() + 60_000) };
  }
}

// ── Per-Repo Release Fetcher ────────────────────────────────────────

async function fetchRepoReleases(
  repo: TrackedRepo,
): Promise<IntelligenceItem[]> {
  const repoKey = `${repo.owner}/${repo.repo}`;
  const url = `https://api.github.com/repos/${repoKey}/releases?per_page=10`;
  const headers = buildHeaders();

  const response = await fetchWithRetry(url, { headers });

  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const resetHeader = response.headers.get("x-ratelimit-reset");
      const waitInfo = retryAfter
        ? `retry-after: ${retryAfter}s`
        : resetHeader
          ? `rate limit resets at ${new Date(Number(resetHeader) * 1000).toISOString()}`
          : "unknown reset time";
      console.warn(
        `[sentinel:github-releases] Rate limited for ${repoKey} (${waitInfo}). Skipping.`,
      );
      return [];
    }
    if (response.status === 404) {
      console.warn(
        `[sentinel:github-releases] Repo ${repoKey} not found (404). Skipping.`,
      );
      return [];
    }
    throw new Error(
      `GitHub API returned ${response.status} for ${repoKey}`,
    );
  }

  const data: unknown = await response.json();
  const releases = z.array(GitHubReleaseSchema).parse(data);

  // Filter out drafts
  const published = releases.filter((r) => !r.draft);
  if (published.length === 0) return [];

  const lastKnown = repo.lastKnownRelease;
  const items: IntelligenceItem[] = [];

  for (const release of published) {
    // Stop when we hit the last known release
    if (lastKnown && release.tag_name === lastKnown) break;

    const { severity, bumpType } = classifyVersionBump(
      lastKnown,
      release.tag_name,
      release.prerelease,
    );
    const { impact, recommendation } = assessThreat(repo, release, bumpType);

    const totalDownloads = release.assets.reduce(
      (sum, a) => sum + a.download_count,
      0,
    );

    const description = [
      release.prerelease ? "[PRE-RELEASE] " : "",
      release.body?.slice(0, 500) ??
        `New release: ${release.name ?? release.tag_name}`,
    ].join("");

    items.push({
      id: `github-release-${repo.owner}-${repo.repo}-${release.tag_name}`,
      source: "github-releases",
      title: `${repo.displayName} ${release.tag_name} released${release.prerelease ? " (pre-release)" : ""}`,
      description,
      url: release.html_url,
      severity,
      tags: [
        repo.displayName.toLowerCase(),
        repo.category,
        "release",
        "github",
        bumpType,
        ...(release.prerelease ? ["pre-release"] : []),
      ],
      metadata: {
        owner: repo.owner,
        repo: repo.repo,
        tag: release.tag_name,
        prerelease: release.prerelease,
        bumpType,
        priority: repo.priority,
        impact,
        recommendation,
        publishedAt: release.published_at ?? release.created_at,
        author: release.author?.login ?? "unknown",
        totalAssetDownloads: totalDownloads,
        previousRelease: lastKnown,
      },
      collectedAt: new Date().toISOString(),
    });
  }

  // Persist the latest release tag if we found new releases
  if (published[0] && published[0].tag_name !== lastKnown) {
    updateTrackedRepo(repo.owner, repo.repo, {
      lastKnownRelease: published[0].tag_name,
      lastKnownReleaseAt:
        published[0].published_at ?? published[0].created_at,
    });
  }

  return items;
}

// ── GitWatchman Collector ───────────────────────────────────────────

export const githubReleasesCollector: Collector = {
  name: "github-releases",
  cronExpression: "*/15 * * * *",
  intervalMs: 15 * 60 * 1000,

  async collect(): Promise<CollectorResult> {
    const start = performance.now();
    const allItems: IntelligenceItem[] = [];
    const errors: string[] = [];

    // Load repos from persistent store (survives restarts)
    const repos = loadTrackedRepos();

    // Check rate limit before starting
    const rateLimit = await checkRateLimit();
    if (rateLimit.remaining < repos.length + 1) {
      const resetIn = Math.max(
        0,
        Math.round((rateLimit.resetAt.getTime() - Date.now()) / 1000),
      );
      console.warn(
        `[sentinel:github-releases] Rate limit low (${rateLimit.remaining} remaining). Resets in ${resetIn}s. Limiting to ${Math.max(1, rateLimit.remaining - 1)} repos.`,
      );
    }

    // Process repos in order of priority: critical first, then high, then medium.
    // Record<RepoPriority, ...> forces the compiler to flag this if a new
    // priority level is added to RepoPrioritySchema without updating the order.
    const priorityOrder: Record<RepoPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
    };
    const sortedRepos = [...repos].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
    );

    // Respect rate limit: only process as many repos as we have budget for
    const maxRepos =
      rateLimit.remaining > 0
        ? Math.min(sortedRepos.length, rateLimit.remaining - 1)
        : sortedRepos.length;
    const reposToProcess = sortedRepos.slice(0, maxRepos);

    for (const repo of reposToProcess) {
      try {
        const items = await fetchRepoReleases(repo);
        allItems.push(...items);
      } catch (err) {
        const repoKey = `${repo.owner}/${repo.repo}`;
        errors.push(
          err instanceof Error
            ? err.message
            : `Error fetching releases for ${repoKey}`,
        );
      }
    }

    const skippedCount = sortedRepos.length - reposToProcess.length;
    if (skippedCount > 0) {
      console.warn(
        `[sentinel:github-releases] Skipped ${skippedCount} repos due to rate limiting.`,
      );
    }

    return {
      source: "github-releases",
      items: allItems,
      collectedAt: new Date().toISOString(),
      success: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      durationMs: Math.round(performance.now() - start),
    };
  },
};
