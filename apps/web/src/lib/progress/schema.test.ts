// ── Progress Tracker schema + JSON validation ──────────────────────
// Double duty: validates the parseProgressTracker validator itself,
// AND locks the real apps/web/public/progress.json file so a typo in
// a status/priority/tag is caught in CI instead of silently breaking
// /admin/progress at runtime.

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseProgressTracker,
  countByStatus,
  totalEntries,
  filterTracker,
  commitUrl,
  type ProgressFilters,
  type ProgressPriority,
  type ProgressStatus,
  type ProgressTracker,
  type ProgressEntry,
} from "./schema";

const WEB_ROOT = resolve(import.meta.dir, "../../..");
const PROGRESS_JSON_PATH = resolve(WEB_ROOT, "public", "progress.json");

function loadTracker(): ProgressTracker {
  const raw = JSON.parse(readFileSync(PROGRESS_JSON_PATH, "utf-8"));
  return parseProgressTracker(raw);
}

// ── parseProgressTracker: happy path ─────────────────────────────────

describe("parseProgressTracker", () => {
  test("parses a minimal valid tracker", () => {
    const minimal = {
      version: 1,
      lastUpdated: "2026-04-10T00:00:00Z",
      session: "test",
      doctrine: "test",
      categories: [],
    };
    const parsed = parseProgressTracker(minimal);
    expect(parsed.version).toBe(1);
    expect(parsed.categories).toHaveLength(0);
  });

  test("parses a tracker with one entry", () => {
    const raw = {
      version: 1,
      lastUpdated: "2026-04-10T00:00:00Z",
      session: "test",
      doctrine: "test",
      categories: [
        {
          id: "cat",
          title: "Cat",
          subtitle: "sub",
          icon: "star",
          entries: [
            {
              id: "e1",
              title: "Entry one",
              description: "desc",
              status: "completed",
              priority: "p0",
              commit: "abc1234",
              branch: "main",
              docLink: null,
              blockedReason: null,
              tags: ["tag"],
            },
          ],
        },
      ],
    };
    const parsed = parseProgressTracker(raw);
    expect(parsed.categories).toHaveLength(1);
    const entries = parsed.categories[0]?.entries;
    expect(entries).toBeDefined();
    expect(entries).toHaveLength(1);
    const first = entries?.[0];
    expect(first?.status).toBe("completed");
    expect(first?.priority).toBe("p0");
  });
});

// ── parseProgressTracker: rejection cases ───────────────────────────

describe("parseProgressTracker rejections", () => {
  test("rejects non-object root", () => {
    expect(() => parseProgressTracker(null)).toThrow();
    expect(() => parseProgressTracker(42)).toThrow();
    expect(() => parseProgressTracker("string")).toThrow();
  });

  test("rejects missing version", () => {
    expect(() =>
      parseProgressTracker({
        lastUpdated: "x",
        session: "x",
        doctrine: "x",
        categories: [],
      }),
    ).toThrow();
  });

  test("rejects invalid status on entry", () => {
    expect(() =>
      parseProgressTracker({
        version: 1,
        lastUpdated: "x",
        session: "x",
        doctrine: "x",
        categories: [
          {
            id: "c",
            title: "c",
            subtitle: "s",
            icon: "i",
            entries: [
              {
                id: "e",
                title: "t",
                description: "d",
                status: "somewhere_between", // invalid
                priority: "p0",
                commit: null,
                branch: null,
                docLink: null,
                blockedReason: null,
                tags: [],
              },
            ],
          },
        ],
      }),
    ).toThrow(/status/);
  });

  test("rejects invalid priority on entry", () => {
    expect(() =>
      parseProgressTracker({
        version: 1,
        lastUpdated: "x",
        session: "x",
        doctrine: "x",
        categories: [
          {
            id: "c",
            title: "c",
            subtitle: "s",
            icon: "i",
            entries: [
              {
                id: "e",
                title: "t",
                description: "d",
                status: "completed",
                priority: "p9", // invalid
                commit: null,
                branch: null,
                docLink: null,
                blockedReason: null,
                tags: [],
              },
            ],
          },
        ],
      }),
    ).toThrow(/priority/);
  });

  test("rejects non-array tags", () => {
    expect(() =>
      parseProgressTracker({
        version: 1,
        lastUpdated: "x",
        session: "x",
        doctrine: "x",
        categories: [
          {
            id: "c",
            title: "c",
            subtitle: "s",
            icon: "i",
            entries: [
              {
                id: "e",
                title: "t",
                description: "d",
                status: "completed",
                priority: "p0",
                commit: null,
                branch: null,
                docLink: null,
                blockedReason: null,
                tags: "not-an-array",
              },
            ],
          },
        ],
      }),
    ).toThrow(/tags/);
  });
});

// ── countByStatus / totalEntries ────────────────────────────────────

describe("countByStatus + totalEntries", () => {
  const tracker: ProgressTracker = {
    version: 1,
    lastUpdated: "x",
    session: "x",
    doctrine: "x",
    repoUrl: null,
    categories: [
      {
        id: "c1",
        title: "c1",
        subtitle: "s",
        icon: "i",
        entries: [
          mk("a", "completed"),
          mk("b", "completed"),
          mk("c", "pending"),
        ],
      },
      {
        id: "c2",
        title: "c2",
        subtitle: "s",
        icon: "i",
        entries: [mk("d", "blocked"), mk("e", "in_progress")],
      },
    ],
  };

  test("counts every status bucket", () => {
    const counts = countByStatus(tracker);
    expect(counts.completed).toBe(2);
    expect(counts.pending).toBe(1);
    expect(counts.blocked).toBe(1);
    expect(counts.in_progress).toBe(1);
  });

  test("totalEntries sums across categories", () => {
    expect(totalEntries(tracker)).toBe(5);
  });

  test("counts sum equals totalEntries", () => {
    const counts = countByStatus(tracker);
    const sum = counts.completed + counts.in_progress + counts.pending + counts.blocked;
    expect(sum).toBe(totalEntries(tracker));
  });
});

// ── Real progress.json lock ─────────────────────────────────────────
// These tests run against the actual file served to /admin/progress.
// If the JSON drifts — bad status, missing field, broken structure —
// CI will fail here before the admin page breaks in production.

describe("apps/web/public/progress.json", () => {
  test("loads and parses successfully", () => {
    const tracker = loadTracker();
    expect(tracker.version).toBeGreaterThanOrEqual(1);
    expect(typeof tracker.lastUpdated).toBe("string");
    expect(tracker.categories.length).toBeGreaterThan(0);
  });

  test("has at least one entry per category", () => {
    const tracker = loadTracker();
    for (const category of tracker.categories) {
      expect(category.entries.length).toBeGreaterThan(0);
    }
  });

  test("entry ids are unique across the whole tracker", () => {
    const tracker = loadTracker();
    const seen = new Set<string>();
    for (const category of tracker.categories) {
      for (const entry of category.entries) {
        expect(seen.has(entry.id)).toBe(false);
        seen.add(entry.id);
      }
    }
  });

  test("category ids are unique", () => {
    const tracker = loadTracker();
    const seen = new Set<string>();
    for (const category of tracker.categories) {
      expect(seen.has(category.id)).toBe(false);
      seen.add(category.id);
    }
  });

  test("completed entries include at least one commit-linked entry", () => {
    const tracker = loadTracker();
    const completed: ProgressEntry[] = [];
    for (const category of tracker.categories) {
      for (const entry of category.entries) {
        if (entry.status === "completed") completed.push(entry);
      }
    }
    expect(completed.length).toBeGreaterThan(0);
    // At least some completed work must cite a commit SHA
    const withCommit = completed.filter((e) => e.commit && /^[a-f0-9]{7,40}$/.test(e.commit));
    expect(withCommit.length).toBeGreaterThan(0);
  });

  test("blocked entries all have a blockedReason", () => {
    const tracker = loadTracker();
    for (const category of tracker.categories) {
      for (const entry of category.entries) {
        if (entry.status === "blocked") {
          expect(entry.blockedReason).not.toBeNull();
          expect(entry.blockedReason?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });

  test("every entry has at least one tag", () => {
    const tracker = loadTracker();
    for (const category of tracker.categories) {
      for (const entry of category.entries) {
        expect(entry.tags.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────────────

function mk(
  id: string,
  status: ProgressEntry["status"],
  overrides: Partial<ProgressEntry> = {},
): ProgressEntry {
  return {
    id,
    title: id,
    description: "d",
    status,
    priority: "p1",
    commit: null,
    branch: null,
    docLink: null,
    blockedReason: status === "blocked" ? "reason" : null,
    tags: ["tag"],
    updatedAt: null,
    ...overrides,
  };
}

// ── filterTracker + commitUrl ────────────────────────────────────────

describe("filterTracker", () => {
  const now = new Date("2026-04-10T12:00:00Z");
  const recent = new Date("2026-04-10T10:00:00Z").toISOString();
  const stale = new Date("2026-04-08T00:00:00Z").toISOString();

  const base: ProgressTracker = {
    version: 1,
    lastUpdated: "x",
    session: "x",
    doctrine: "x",
    repoUrl: "https://github.com/org/repo",
    categories: [
      {
        id: "c1",
        title: "C1",
        subtitle: "s",
        icon: "i",
        entries: [
          mk("alpha", "completed", {
            priority: "p0",
            tags: ["audit", "core"],
            updatedAt: recent,
          }),
          mk("beta", "in_progress", { priority: "p1", updatedAt: stale }),
        ],
      },
      {
        id: "c2",
        title: "C2",
        subtitle: "s",
        icon: "i",
        entries: [
          mk("gamma", "pending", { priority: "p2" }),
          mk("delta", "blocked", { priority: "p3", updatedAt: recent }),
        ],
      },
    ],
  };

  function filters(overrides: Partial<ProgressFilters> = {}): ProgressFilters {
    return {
      statuses: new Set<ProgressStatus>(),
      priorities: new Set<ProgressPriority>(),
      search: "",
      within24h: false,
      now,
      ...overrides,
    };
  }

  test("empty filter returns everything", () => {
    const out = filterTracker(base, filters());
    expect(totalEntries(out)).toBe(4);
    expect(out.categories).toHaveLength(2);
  });

  test("status filter prunes non-matching entries", () => {
    const out = filterTracker(
      base,
      filters({ statuses: new Set<ProgressStatus>(["completed", "blocked"]) }),
    );
    expect(totalEntries(out)).toBe(2);
  });

  test("priority filter prunes non-matching entries", () => {
    const out = filterTracker(
      base,
      filters({ priorities: new Set<ProgressPriority>(["p0"]) }),
    );
    expect(totalEntries(out)).toBe(1);
    expect(out.categories[0]?.entries[0]?.id).toBe("alpha");
  });

  test("search matches title/description/tags/id (case-insensitive)", () => {
    const out = filterTracker(base, filters({ search: "AUDIT" }));
    expect(totalEntries(out)).toBe(1);
    expect(out.categories[0]?.entries[0]?.id).toBe("alpha");
  });

  test("within24h drops entries with null or stale updatedAt", () => {
    const out = filterTracker(base, filters({ within24h: true }));
    const ids = out.categories.flatMap((c) => c.entries.map((e) => e.id));
    expect(ids).toEqual(["alpha", "delta"]);
  });

  test("empty category is omitted from the result", () => {
    const out = filterTracker(
      base,
      filters({ statuses: new Set<ProgressStatus>(["completed"]) }),
    );
    expect(out.categories).toHaveLength(1);
    expect(out.categories[0]?.id).toBe("c1");
  });

  test("combined filters compose as AND", () => {
    const out = filterTracker(
      base,
      filters({
        statuses: new Set<ProgressStatus>(["completed", "blocked"]),
        within24h: true,
      }),
    );
    const ids = out.categories.flatMap((c) => c.entries.map((e) => e.id));
    expect(ids).toEqual(["alpha", "delta"]);
  });
});

describe("commitUrl", () => {
  test("returns null when repo or commit missing", () => {
    expect(commitUrl(null, "abc")).toBeNull();
    expect(commitUrl("https://github.com/org/repo", null)).toBeNull();
    expect(commitUrl("https://github.com/org/repo", "")).toBeNull();
  });

  test("joins repo and commit", () => {
    expect(commitUrl("https://github.com/org/repo", "abc1234")).toBe(
      "https://github.com/org/repo/commit/abc1234",
    );
  });

  test("trims trailing slash on repo url", () => {
    expect(commitUrl("https://github.com/org/repo/", "abc1234")).toBe(
      "https://github.com/org/repo/commit/abc1234",
    );
  });
});
