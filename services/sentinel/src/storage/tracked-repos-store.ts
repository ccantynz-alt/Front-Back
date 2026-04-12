// ── Tracked Repos Store ──────────────────────────────────────────────
// Reads and writes the tracked-repos.json configuration file.
// Persists last-known release versions and commit baselines so the
// GitWatchman collector can detect new releases across restarts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  DEFAULT_TRACKED_REPOS,
  type TrackedRepo,
  type TrackedReposFile,
  TrackedReposFileSchema,
} from "../collectors/types";

/**
 * Schema version for the tracked-repos.json on-disk format. Bump when the
 * file layout changes in a way that requires a migration. A single source
 * of truth prevents load/save drift.
 */
export const TRACKED_REPOS_SCHEMA_VERSION = 1;

function getDefaultPath(): string {
  const baseDir = (import.meta as { dir?: string }).dir ?? process.cwd();
  return join(baseDir, "..", "..", "data", "tracked-repos.json");
}

let filePath = getDefaultPath();
let cached: TrackedReposFile | null = null;

/** Override the file path (call before any other operation). */
export function setTrackedReposPath(path: string): void {
  filePath = path;
  cached = null;
}

/** Get the current file path. */
export function getTrackedReposPath(): string {
  return filePath;
}

function ensureDir(): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Load tracked repos from disk. Falls back to defaults on failure. */
export function loadTrackedRepos(): TrackedRepo[] {
  if (cached) return cached.repos;

  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      const validated = TrackedReposFileSchema.parse(parsed);
      cached = validated;
      return validated.repos;
    }
  } catch (err) {
    console.error(`[sentinel:tracked-repos] Failed to load ${filePath}:`, err);
  }

  // Fall back to defaults and persist them
  cached = {
    repos: DEFAULT_TRACKED_REPOS,
    lastUpdated: null,
    schemaVersion: TRACKED_REPOS_SCHEMA_VERSION,
  };
  saveTrackedRepos(cached.repos);
  return cached.repos;
}

/** Persist updated repos to disk. */
export function saveTrackedRepos(repos: TrackedRepo[]): void {
  const data: TrackedReposFile = {
    repos,
    lastUpdated: new Date().toISOString(),
    schemaVersion: TRACKED_REPOS_SCHEMA_VERSION,
  };

  try {
    ensureDir();
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    cached = data;
  } catch (err) {
    console.error(`[sentinel:tracked-repos] Failed to save ${filePath}:`, err);
  }
}

/** Update a single repo entry (matched by owner/repo). */
export function updateTrackedRepo(
  owner: string,
  repo: string,
  updates: Partial<Pick<TrackedRepo, "lastKnownRelease" | "lastKnownReleaseAt" | "lastCommitCheckAt" | "baselineCommitsPerWeek">>,
): void {
  const repos = loadTrackedRepos();
  const target = repos.find((r) => r.owner === owner && r.repo === repo);
  if (!target) return;

  if (updates.lastKnownRelease !== undefined) target.lastKnownRelease = updates.lastKnownRelease;
  if (updates.lastKnownReleaseAt !== undefined) target.lastKnownReleaseAt = updates.lastKnownReleaseAt;
  if (updates.lastCommitCheckAt !== undefined) target.lastCommitCheckAt = updates.lastCommitCheckAt;
  if (updates.baselineCommitsPerWeek !== undefined) {
    target.baselineCommitsPerWeek = updates.baselineCommitsPerWeek;
  }

  saveTrackedRepos(repos);
}

/** Clear the cache (for testing). */
export function clearTrackedReposCache(): void {
  cached = null;
}
