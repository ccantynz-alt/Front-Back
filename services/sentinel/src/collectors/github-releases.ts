import { z } from "zod";
import {
  type Collector,
  type CollectorResult,
  type IntelligenceItem,
  TRACKED_REPOS,
  type TrackedRepo,
} from "./types";
import { fetchWithRetry } from "../utils/fetch";

const GitHubReleaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable(),
  html_url: z.string(),
  published_at: z.string().nullable(),
  prerelease: z.boolean(),
  body: z.string().nullable(),
});

const lastSeenTags = new Map<string, string>();

function repoKey(repo: TrackedRepo): string {
  return `${repo.owner}/${repo.repo}`;
}

function classifyRelease(tag: string, prerelease: boolean): IntelligenceItem["severity"] {
  if (prerelease) return "low";
  if (/^v?\d+\.0\.0/.test(tag)) return "critical";
  if (/^v?\d+\.\d+\.0/.test(tag)) return "high";
  return "medium";
}

async function fetchRepoReleases(repo: TrackedRepo): Promise<IntelligenceItem[]> {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=5`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "MarcoReid-Sentinel/1.0",
  };
  const githubToken = process.env["GITHUB_TOKEN"];
  if (githubToken) headers["Authorization"] = `Bearer ${githubToken}`;

  const response = await fetchWithRetry(url, { headers });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) return [];
    throw new Error(`GitHub API returned ${response.status} for ${repoKey(repo)}`);
  }

  const data: unknown = await response.json();
  const releases = z.array(GitHubReleaseSchema).parse(data);
  const key = repoKey(repo);
  const lastTag = lastSeenTags.get(key);
  const items: IntelligenceItem[] = [];

  for (const release of releases) {
    if (lastTag && release.tag_name === lastTag) break;
    items.push({
      id: `github-${repo.owner}-${repo.repo}-${release.tag_name}`,
      source: "github-releases",
      title: `${repo.displayName} ${release.tag_name} released`,
      description: release.body?.slice(0, 500) ?? `New release: ${release.name ?? release.tag_name}`,
      url: release.html_url,
      severity: classifyRelease(release.tag_name, release.prerelease),
      tags: [repo.displayName.toLowerCase(), "release", "github"],
      metadata: { owner: repo.owner, repo: repo.repo, tag: release.tag_name, prerelease: release.prerelease },
      collectedAt: new Date().toISOString(),
    });
  }

  if (releases[0]) lastSeenTags.set(key, releases[0].tag_name);
  return items;
}

export const githubReleasesCollector: Collector = {
  name: "github-releases",
  cronExpression: "*/15 * * * *",
  intervalMs: 15 * 60 * 1000,

  async collect(): Promise<CollectorResult> {
    const start = performance.now();
    const allItems: IntelligenceItem[] = [];
    const errors: string[] = [];

    for (const repo of TRACKED_REPOS) {
      try {
        allItems.push(...await fetchRepoReleases(repo));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Error for ${repoKey(repo)}`);
      }
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
