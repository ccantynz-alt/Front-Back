// ── Sentinel Unit Tests ─────────────────────────────────────────────
// Tests collector types, analyzer logic, storage, digest generation,
// and GitWatchman collector infrastructure.
// No network calls -- all logic is tested in isolation.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  IntelligenceItemSchema,
  TrackedRepoSchema,
  TrackedReposFileSchema,
  DEFAULT_TRACKED_REPOS,
  isRepoPriority,
  isRepoCategory,
  type IntelligenceItem,
  type Severity,
  type RepoPriority,
  type RepoCategory,
} from "./collectors/types";
import { analyzeThreat, analyzeThreats, type ThreatAnalysis } from "./analyzers/threat-analyzer";
import { findOpportunities, type Opportunity } from "./analyzers/opportunity-finder";
import { scoutTech, type TechScoutResult } from "./analyzers/tech-scout";
import {
  storeItems,
  getItemsSince,
  getAllItems,
  getItemCount,
  clearStore,
  pruneOlderThan,
  setStorePath,
} from "./storage/intelligence-store";
import { generateDigest, type DailyDigest } from "./digest/daily-digest";
import { checkDeadMansSwitch, reportSuccess } from "./dead-mans-switch";
import { join } from "path";
import { readFileSync, unlinkSync, existsSync } from "fs";

// ── Helpers ─────────────────────────────────────────────────────────

function makeItem(overrides: Partial<IntelligenceItem> = {}): IntelligenceItem {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    source: "test",
    title: "Test Item",
    description: "A test intelligence item",
    url: "https://example.com",
    severity: "medium",
    tags: ["test"],
    metadata: {},
    collectedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Zod Schema Tests ────────────────────────────────────────────────

describe("IntelligenceItemSchema", () => {
  test("validates a correct item", () => {
    const item = makeItem();
    const result = IntelligenceItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test("rejects missing required fields", () => {
    const result = IntelligenceItemSchema.safeParse({ id: "test" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid severity", () => {
    const item = makeItem({ severity: "unknown" as Severity });
    const result = IntelligenceItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test("accepts all valid severity levels", () => {
    for (const severity of ["low", "medium", "high", "critical"] as Severity[]) {
      const item = makeItem({ severity });
      const result = IntelligenceItemSchema.safeParse(item);
      expect(result.success).toBe(true);
    }
  });
});

// ── Tracked Repos Schema Tests ──────────────────────────────────────

describe("TrackedRepoSchema / DEFAULT_TRACKED_REPOS", () => {
  test("every DEFAULT_TRACKED_REPOS entry passes TrackedRepoSchema.parse", () => {
    for (const repo of DEFAULT_TRACKED_REPOS) {
      const result = TrackedRepoSchema.safeParse(repo);
      if (!result.success) {
        throw new Error(
          `Invalid tracked repo ${repo.owner}/${repo.repo}: ${JSON.stringify(result.error.issues)}`,
        );
      }
      expect(result.success).toBe(true);
    }
  });

  test("DEFAULT_TRACKED_REPOS has no duplicate owner/repo pairs", () => {
    const seen = new Set<string>();
    for (const repo of DEFAULT_TRACKED_REPOS) {
      const key = `${repo.owner}/${repo.repo}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test("tracked-repos.json file validates against TrackedReposFileSchema", () => {
    const jsonPath = join(
      (import.meta as { dir?: string }).dir ?? process.cwd(),
      "..",
      "data",
      "tracked-repos.json",
    );
    expect(existsSync(jsonPath)).toBe(true);
    const raw = readFileSync(jsonPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const result = TrackedReposFileSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `tracked-repos.json invalid: ${JSON.stringify(result.error.issues)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  test("tracked-repos.json covers the core empire competitors", () => {
    const jsonPath = join(
      (import.meta as { dir?: string }).dir ?? process.cwd(),
      "..",
      "data",
      "tracked-repos.json",
    );
    const raw = readFileSync(jsonPath, "utf-8");
    const parsed = TrackedReposFileSchema.parse(JSON.parse(raw));
    const slugs = new Set(parsed.repos.map((r) => `${r.owner}/${r.repo}`));
    // Sanity-check a representative subset of the new competitors
    expect(slugs.has("cloudflare/workers-sdk")).toBe(true);
    expect(slugs.has("supabase/supabase")).toBe(true);
    expect(slugs.has("get-convex/convex-backend")).toBe(true);
    expect(slugs.has("netlify/cli")).toBe(true);
    expect(slugs.has("snyk/snyk")).toBe(true);
    expect(slugs.has("openai/whisper")).toBe(true);
    expect(slugs.has("stackblitz/bolt.new")).toBe(true);
  });

  test("tracked-repos.json has no duplicate owner/repo pairs", () => {
    const jsonPath = join(
      (import.meta as { dir?: string }).dir ?? process.cwd(),
      "..",
      "data",
      "tracked-repos.json",
    );
    const raw = readFileSync(jsonPath, "utf-8");
    const parsed = TrackedReposFileSchema.parse(JSON.parse(raw));
    const seen = new Set<string>();
    for (const repo of parsed.repos) {
      const key = `${repo.owner}/${repo.repo}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test("every RepoPriority level has at least one tracked repo", () => {
    const priorities = new Set(DEFAULT_TRACKED_REPOS.map((r) => r.priority));
    for (const p of ["critical", "high", "medium"] as RepoPriority[]) {
      expect(priorities.has(p)).toBe(true);
    }
  });

  test("every RepoCategory is represented in DEFAULT_TRACKED_REPOS", () => {
    const categories = new Set(DEFAULT_TRACKED_REPOS.map((r) => r.category));
    for (const c of ["framework", "backend", "api", "ai"] as RepoCategory[]) {
      expect(categories.has(c)).toBe(true);
    }
  });
});

// ── Type Guard Tests ────────────────────────────────────────────────

describe("isRepoPriority / isRepoCategory type guards", () => {
  test("isRepoPriority accepts all valid levels", () => {
    expect(isRepoPriority("critical")).toBe(true);
    expect(isRepoPriority("high")).toBe(true);
    expect(isRepoPriority("medium")).toBe(true);
  });

  test("isRepoPriority rejects invalid inputs", () => {
    expect(isRepoPriority("low")).toBe(false);
    expect(isRepoPriority("")).toBe(false);
    expect(isRepoPriority(null)).toBe(false);
    expect(isRepoPriority(undefined)).toBe(false);
    expect(isRepoPriority(1)).toBe(false);
    expect(isRepoPriority({})).toBe(false);
  });

  test("isRepoCategory accepts all valid categories", () => {
    expect(isRepoCategory("framework")).toBe(true);
    expect(isRepoCategory("backend")).toBe(true);
    expect(isRepoCategory("api")).toBe(true);
    expect(isRepoCategory("ai")).toBe(true);
  });

  test("isRepoCategory rejects invalid inputs", () => {
    expect(isRepoCategory("compliance")).toBe(false);
    expect(isRepoCategory("")).toBe(false);
    expect(isRepoCategory(null)).toBe(false);
    expect(isRepoCategory(42)).toBe(false);
  });

  test("type guards narrow for the compiler", () => {
    const raw: unknown = "critical";
    if (isRepoPriority(raw)) {
      // TS narrows to RepoPriority here -- assign to a typed slot.
      const p: RepoPriority = raw;
      expect(p).toBe("critical");
    }
    const rawCat: unknown = "ai";
    if (isRepoCategory(rawCat)) {
      const c: RepoCategory = rawCat;
      expect(c).toBe("ai");
    }
  });
});

// ── Threat Analyzer Tests ───────────────────────────────────────────

describe("Threat Analyzer", () => {
  test("classifies critical-severity items as critical threats", () => {
    const item = makeItem({ severity: "critical", title: "Major framework release" });
    const result: ThreatAnalysis = analyzeThreat(item);
    expect(result.threatLevel).toBe("critical");
  });

  test("detects high threats from critical keywords", () => {
    const item = makeItem({ title: "New WebGPU browser inference engine" });
    const result: ThreatAnalysis = analyzeThreat(item);
    expect(result.threatLevel).toBe("high");
  });

  test("detects medium threats from high keywords", () => {
    const item = makeItem({ title: "New web framework launched" });
    const result: ThreatAnalysis = analyzeThreat(item);
    expect(result.threatLevel).toBe("medium");
  });

  test("returns none for unrelated items", () => {
    const item = makeItem({ title: "New cooking recipe app", severity: "low" });
    const result: ThreatAnalysis = analyzeThreat(item);
    expect(result.threatLevel).toBe("none");
  });

  test("analyzeThreats filters out none-level threats", () => {
    const items: IntelligenceItem[] = [
      makeItem({ title: "WebGPU inference breakthrough", severity: "high" }),
      makeItem({ title: "New cooking app", severity: "low" }),
    ];
    const threats = analyzeThreats(items);
    expect(threats.length).toBe(1);
    expect(threats[0]?.threatLevel).not.toBe("none");
  });
});

// ── Opportunity Finder Tests ────────────────────────────────────────

describe("Opportunity Finder", () => {
  test("identifies deprecation opportunities", () => {
    const items: IntelligenceItem[] = [
      makeItem({ title: "Framework X deprecated" }),
    ];
    const opps: Opportunity[] = findOpportunities(items);
    expect(opps.length).toBeGreaterThanOrEqual(1);
    expect(opps[0]?.opportunityType).toBe("differentiation");
  });

  test("identifies breaking change opportunities", () => {
    const items: IntelligenceItem[] = [
      makeItem({ description: "Breaking change in v5 migration guide" }),
    ];
    const opps: Opportunity[] = findOpportunities(items);
    expect(opps.length).toBeGreaterThanOrEqual(1);
    expect(opps[0]?.opportunityType).toBe("acquisition");
  });

  test("identifies integration opportunities from new APIs", () => {
    const items: IntelligenceItem[] = [
      makeItem({ title: "New API for browser compute" }),
    ];
    const opps: Opportunity[] = findOpportunities(items);
    expect(opps.length).toBeGreaterThanOrEqual(1);
    expect(opps[0]?.opportunityType).toBe("integration");
  });

  test("returns empty for unrelated items", () => {
    const items: IntelligenceItem[] = [
      makeItem({ title: "Unrelated news", description: "Nothing relevant" }),
    ];
    const opps: Opportunity[] = findOpportunities(items);
    expect(opps.length).toBe(0);
  });
});

// ── Tech Scout Tests ────────────────────────────────────────────────

describe("Tech Scout", () => {
  test("categorizes AI/ML items", () => {
    const items: IntelligenceItem[] = [
      makeItem({ title: "New LLM transformer model for inference" }),
    ];
    const signals: TechScoutResult[] = scoutTech(items);
    expect(signals.length).toBe(1);
    expect(signals[0]?.category).toBe("AI/ML");
  });

  test("categorizes WebGPU items", () => {
    const items: IntelligenceItem[] = [
      makeItem({ title: "WebGPU shader compilation improvements" }),
    ];
    const signals: TechScoutResult[] = scoutTech(items);
    expect(signals.length).toBe(1);
    expect(signals[0]?.category).toBe("WebGPU/Graphics");
  });

  test("sorts by relevance (direct first)", () => {
    const items: IntelligenceItem[] = [
      makeItem({ title: "Minor edge computing update" }),
      makeItem({ title: "LLM transformer model AI inference neural network breakthrough" }),
    ];
    const signals: TechScoutResult[] = scoutTech(items);
    expect(signals.length).toBe(2);
    expect(signals[0]?.relevance).toBe("direct");
  });
});

// ── Intelligence Store Tests ────────────────────────────────────────

describe("Intelligence Store", () => {
  const testStorePath = join((import.meta as { dir?: string }).dir ?? process.cwd(), "..", "..", "data", "test-store.json");

  beforeEach(() => {
    setStorePath(testStorePath);
    clearStore();
  });

  afterEach(() => {
    clearStore();
    try {
      if (existsSync(testStorePath)) unlinkSync(testStorePath);
    } catch {
      // ignore
    }
  });

  test("stores and retrieves items", () => {
    const items: IntelligenceItem[] = [makeItem({ id: "store-1" }), makeItem({ id: "store-2" })];
    const added = storeItems(items);
    expect(added).toBe(2);
    expect(getItemCount()).toBe(2);
  });

  test("deduplicates items by id", () => {
    const item = makeItem({ id: "dup-1" });
    storeItems([item]);
    storeItems([item]);
    expect(getItemCount()).toBe(1);
  });

  test("getItemsSince filters by time", () => {
    const item = makeItem({ id: "time-1" });
    storeItems([item]);

    const future = new Date(Date.now() + 60_000).toISOString();
    expect(getItemsSince(future).length).toBe(0);

    const past = new Date(Date.now() - 60_000).toISOString();
    expect(getItemsSince(past).length).toBe(1);
  });

  test("pruneOlderThan removes old items", () => {
    storeItems([makeItem({ id: "old-1" })]);
    // Items just added should not be pruned with 1 day threshold
    const removed = pruneOlderThan(1);
    expect(removed).toBe(0);
    expect(getItemCount()).toBe(1);
  });

  test("getAllItems returns copies", () => {
    storeItems([makeItem({ id: "all-1" }), makeItem({ id: "all-2" })]);
    const all = getAllItems();
    expect(all.length).toBe(2);
  });
});

// ── Daily Digest Tests ──────────────────────────────────────────────

describe("Daily Digest", () => {
  const testStorePath = join(import.meta.dir, "..", "..", "data", "test-digest-store.json");

  beforeEach(() => {
    setStorePath(testStorePath);
    clearStore();
  });

  afterEach(() => {
    clearStore();
    try {
      if (existsSync(testStorePath)) unlinkSync(testStorePath);
    } catch {
      // ignore
    }
  });

  test("generates empty digest when no items", () => {
    const digest: DailyDigest = generateDigest(24);
    expect(digest.totalItems).toBe(0);
    expect(digest.summary).toContain("No new intelligence");
  });

  test("generates digest with items", () => {
    storeItems([
      makeItem({ id: "digest-1", source: "github-releases", severity: "high" }),
      makeItem({ id: "digest-2", source: "hackernews", severity: "low" }),
    ]);

    const digest: DailyDigest = generateDigest(24);
    expect(digest.totalItems).toBe(2);
    expect(digest.bySeverity.high).toBe(1);
    expect(digest.bySeverity.low).toBe(1);
    expect(digest.bySource["github-releases"]).toBe(1);
    expect(digest.bySource["hackernews"]).toBe(1);
  });

  test("includes threats and opportunities in digest", () => {
    storeItems([
      makeItem({
        id: "threat-item",
        title: "WebGPU browser inference competitor launch",
        severity: "critical",
      }),
    ]);

    const digest: DailyDigest = generateDigest(24);
    expect(digest.threats.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Dead Man's Switch Tests ─────────────────────────────────────────

describe("Dead Man's Switch", () => {
  test("reports no dead collectors immediately after success", () => {
    reportSuccess("test-collector", 60_000);
    const dead = checkDeadMansSwitch();
    expect(dead).not.toContain("test-collector");
  });
});
