// ── GitHub Commit Velocity Tracker ──────────────────────────────────
// Monitors commit frequency on main branches of tracked repos.
// Detects unusual spikes in activity that may indicate an upcoming
// release. Lightweight: fetches commit counts, not full diffs.

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

// ── Zod Schema for GitHub Commits API ───────────────────────────────

const GitHubCommitSchema = z.object({
  sha: z.string(),
  commit: z.object({
    message: z.string(),
    author: z
      .object({
        date: z.string().nullable(),
      })
      .nullable(),
    committer: z
      .object({
        date: z.string().nullable(),
      })
      .nullable(),
  }),
});

// ── Configuration ───────────────────────────────────────────────────

/** Number of days to look back when counting recent commits. */
const LOOKBACK_DAYS = 7;

/**
 * Multiplier over the baseline that triggers a spike alert.
 * 2.0 = activity is 2x the historical average.
 */
const SPIKE_THRESHOLD = 2.0;

/**
 * Minimum commit count to even consider as a spike.
 * Prevents false positives on low-activity repos.
 */
const MIN_SPIKE_COMMITS = 15;

/**
 * Number of weeks to use when computing a rolling baseline.
 * We average the current count with any stored baseline.
 */
const BASELINE_SMOOTHING_WEEKS = 4;

// ── Helpers ─────────────────────────────────────────────────────────

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

function classifySpikeSeverity(
  ratio: number,
  repo: TrackedRepo,
): Severity {
  if (repo.priority === "critical" && ratio >= 3.0) return "critical";
  if (ratio >= 4.0) return "critical";
  if (ratio >= 3.0) return "high";
  if (ratio >= 2.0) return "medium";
  return "low";
}

// ── Per-Repo Commit Velocity Check ──────────────────────────────────

interface CommitVelocityResult {
  item: IntelligenceItem | null;
  recentCount: number;
  baseline: number | null;
  isSpike: boolean;
}

async function checkCommitVelocity(
  repo: TrackedRepo,
): Promise<CommitVelocityResult> {
  const repoKey = `${repo.owner}/${repo.repo}`;
  const since = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const sinceISO = since.toISOString();

  // Use the commits search endpoint with per_page=1 to get count from headers
  // Then fetch the actual recent commits for context
  const url = `https://api.github.com/repos/${repoKey}/commits?sha=${repo.defaultBranch}&since=${sinceISO}&per_page=100`;
  const headers = buildHeaders();

  const response = await fetchWithRetry(url, { headers });

  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      console.warn(
        `[sentinel:github-commits] Rate limited for ${repoKey}. Skipping.`,
      );
      return { item: null, recentCount: 0, baseline: null, isSpike: false };
    }
    if (response.status === 404 || response.status === 409) {
      // 409 = empty repo or branch not found
      console.warn(
        `[sentinel:github-commits] Repo ${repoKey} returned ${response.status}. Skipping.`,
      );
      return { item: null, recentCount: 0, baseline: null, isSpike: false };
    }
    throw new Error(
      `GitHub API returned ${response.status} for ${repoKey} commits`,
    );
  }

  const data: unknown = await response.json();
  const commits = z.array(GitHubCommitSchema).parse(data);
  const recentCount = commits.length;

  // Update last check timestamp
  updateTrackedRepo(repo.owner, repo.repo, {
    lastCommitCheckAt: new Date().toISOString(),
  });

  // Calculate baseline: smooth stored baseline with current observation
  const storedBaseline = repo.baselineCommitsPerWeek;
  let baseline: number;

  if (storedBaseline === null || storedBaseline === 0) {
    // No baseline yet -- store current count as baseline, no spike detection
    updateTrackedRepo(repo.owner, repo.repo, {
      baselineCommitsPerWeek: recentCount,
    });
    return {
      item: null,
      recentCount,
      baseline: null,
      isSpike: false,
    };
  }

  // Exponential moving average: weight new data 1/BASELINE_SMOOTHING_WEEKS
  const alpha = 1 / BASELINE_SMOOTHING_WEEKS;
  baseline = storedBaseline * (1 - alpha) + recentCount * alpha;

  // Persist updated baseline
  updateTrackedRepo(repo.owner, repo.repo, {
    baselineCommitsPerWeek: Math.round(baseline),
  });

  // Detect spike
  const ratio = storedBaseline > 0 ? recentCount / storedBaseline : 0;
  const isSpike =
    ratio >= SPIKE_THRESHOLD && recentCount >= MIN_SPIKE_COMMITS;

  if (!isSpike) {
    return { item: null, recentCount, baseline: storedBaseline, isSpike: false };
  }

  // Extract notable commit messages for context
  const notableMessages = commits
    .slice(0, 5)
    .map((c) => c.commit.message.split("\n")[0]?.slice(0, 80) ?? "")
    .filter(Boolean);

  const severity = classifySpikeSeverity(ratio, repo);

  const item: IntelligenceItem = {
    id: `github-commits-spike-${repo.owner}-${repo.repo}-${Date.now()}`,
    source: "github-commits",
    title: `Activity spike in ${repo.displayName}: ${recentCount} commits in ${LOOKBACK_DAYS}d (${ratio.toFixed(1)}x baseline)`,
    description: [
      `${repo.displayName} (${repoKey}) has ${recentCount} commits in the last ${LOOKBACK_DAYS} days,`,
      `which is ${ratio.toFixed(1)}x the baseline of ${storedBaseline} commits/week.`,
      `This may indicate an upcoming release or major development push.`,
      `\nRecent commits:\n${notableMessages.map((m) => `- ${m}`).join("\n")}`,
    ].join(" "),
    url: `https://github.com/${repoKey}/commits/${repo.defaultBranch}`,
    severity,
    tags: [
      repo.displayName.toLowerCase(),
      repo.category,
      "commit-velocity",
      "spike",
      "github",
    ],
    metadata: {
      owner: repo.owner,
      repo: repo.repo,
      defaultBranch: repo.defaultBranch,
      recentCommits: recentCount,
      baselineCommitsPerWeek: storedBaseline,
      spikeRatio: Math.round(ratio * 100) / 100,
      lookbackDays: LOOKBACK_DAYS,
      priority: repo.priority,
      notableMessages,
    },
    collectedAt: new Date().toISOString(),
  };

  return { item, recentCount, baseline: storedBaseline, isSpike: true };
}

// ── GitHub Commit Velocity Collector ────────────────────────────────

export const githubCommitsCollector: Collector = {
  name: "github-commits",
  cronExpression: "0 */6 * * *",
  intervalMs: 6 * 60 * 60 * 1000,

  async collect(): Promise<CollectorResult> {
    const start = performance.now();
    const allItems: IntelligenceItem[] = [];
    const errors: string[] = [];

    const repos = loadTrackedRepos();

    // Process repos in priority order. Record<RepoPriority, ...> forces the
    // compiler to flag this map if a new priority level is added without
    // updating the ordering here.
    const priorityOrder: Record<RepoPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
    };
    const sortedRepos = [...repos].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
    );

    for (const repo of sortedRepos) {
      try {
        const result = await checkCommitVelocity(repo);
        if (result.item) {
          allItems.push(result.item);
        }
        console.info(
          `[sentinel:github-commits] ${repo.owner}/${repo.repo}: ${result.recentCount} commits in ${LOOKBACK_DAYS}d${result.isSpike ? " [SPIKE]" : ""}${result.baseline !== null ? ` (baseline: ${result.baseline})` : " (first check)"}`,
        );
      } catch (err) {
        const repoKey = `${repo.owner}/${repo.repo}`;
        errors.push(
          err instanceof Error
            ? err.message
            : `Error checking commit velocity for ${repoKey}`,
        );
      }
    }

    return {
      source: "github-commits",
      items: allItems,
      collectedAt: new Date().toISOString(),
      success: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
      durationMs: Math.round(performance.now() - start),
    };
  },
};
