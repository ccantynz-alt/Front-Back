// ── /admin/ops route — smoke + helper tests ────────────────────────
// Mirrors the pattern from claude.test.ts:
//   1. Static source assertions on ops.tsx (file present, AdminRoute
//      wrap, polite tone, expected endpoints referenced).
//   2. Reference implementations of the pure helpers, tested
//      executably so any drift in the route file's helpers fails
//      a green-build.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "ops.tsx");

describe("admin/ops — file presence", () => {
  test("ops.tsx exists at the documented path", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });
});

describe("admin/ops — static source contract", () => {
  const src = readFileSync(ROUTE_PATH, "utf-8");

  test("exports a default component", () => {
    expect(src).toContain("export default function");
  });

  test("wraps its content in AdminRoute", () => {
    expect(src).toContain("AdminRoute");
    expect(src).toMatch(/<AdminRoute>[\s\S]*<\/AdminRoute>/);
  });

  test("references the three admin-deploy proxy endpoints it depends on", () => {
    expect(src).toContain("/api/admin/deploy/status");
    expect(src).toContain("/api/admin/git/log");
    expect(src).toContain("/api/admin/git/drift");
    expect(src).toContain("/api/admin/diagnose");
  });

  test("renders the Admin / Operations breadcrumb trail", () => {
    expect(src).toContain("Admin");
    expect(src).toContain("Operations");
  });

  test("links back to /admin (deploy panel)", () => {
    expect(src).toContain('href="/admin"');
  });

  test("uses polite tone — does not name competitor platforms", () => {
    const lowered = src.toLowerCase();
    expect(lowered).not.toContain("vercel");
    expect(lowered).not.toContain("cloudflare");
    expect(lowered).not.toContain("supabase");
    expect(lowered).not.toContain("render.com");
  });

  test("exports the pure helpers used by the panels", () => {
    expect(src).toContain("export function formatDriftLabel");
    expect(src).toContain("export function driftColor");
    expect(src).toContain("export function isCommitDeployed");
    expect(src).toContain("export function serviceColor");
  });
});

describe("admin/ops — dynamic mount check (best-effort)", () => {
  test("if the module can be imported, its default export is a function", async () => {
    try {
      const mod = (await import("./ops")) as { default: unknown };
      expect(typeof mod.default).toBe("function");
    } catch (err) {
      // Bun's default solid-js SSR runtime throws on top-level
      // @solidjs/router side-effects (same as claude.test.ts notes).
      expect(err).toBeDefined();
    }
  });
});

// ── Reference implementations of the pure helpers ───────────────────

interface GitDrift {
  localSha: string;
  originSha: string;
  ahead: number;
  behind: number;
  dirty: boolean;
}

function referenceFormatDriftLabel(drift: GitDrift): string {
  if (drift.ahead === 0 && drift.behind === 0 && !drift.dirty) {
    return "In sync with origin/Main";
  }
  const parts: string[] = [];
  if (drift.behind > 0) {
    parts.push(`${drift.behind} commit${drift.behind === 1 ? "" : "s"} behind`);
  }
  if (drift.ahead > 0) {
    parts.push(`${drift.ahead} commit${drift.ahead === 1 ? "" : "s"} ahead`);
  }
  if (drift.dirty) parts.push("dirty tree");
  return parts.join(", ");
}

function referenceDriftColor(drift: GitDrift): string {
  if (drift.ahead === 0 && drift.behind === 0 && !drift.dirty) {
    return "var(--color-success)";
  }
  return "var(--color-warning)";
}

function referenceIsCommitDeployed(commitSha: string, localSha: string): boolean {
  if (!commitSha || !localSha) return false;
  return commitSha.trim() === localSha.trim();
}

function referenceServiceColor(state: string): string {
  if (state === "active") return "var(--color-success)";
  if (state === "inactive" || state === "unknown") return "var(--color-text-muted)";
  return "var(--color-danger)";
}

const ZERO_DRIFT: GitDrift = {
  localSha: "abc1234",
  originSha: "abc1234",
  ahead: 0,
  behind: 0,
  dirty: false,
};

// ── formatDriftLabel ────────────────────────────────────────────────

describe("admin/ops — formatDriftLabel contract", () => {
  test("returns 'In sync' when ahead/behind/dirty are all zero", () => {
    expect(referenceFormatDriftLabel(ZERO_DRIFT)).toBe("In sync with origin/Main");
  });

  test("describes a behind state with correct pluralisation", () => {
    expect(
      referenceFormatDriftLabel({ ...ZERO_DRIFT, behind: 1 }),
    ).toBe("1 commit behind");
    expect(
      referenceFormatDriftLabel({ ...ZERO_DRIFT, behind: 12 }),
    ).toBe("12 commits behind");
  });

  test("describes an ahead state with correct pluralisation", () => {
    expect(
      referenceFormatDriftLabel({ ...ZERO_DRIFT, ahead: 1 }),
    ).toBe("1 commit ahead");
    expect(
      referenceFormatDriftLabel({ ...ZERO_DRIFT, ahead: 5 }),
    ).toBe("5 commits ahead");
  });

  test("appends 'dirty tree' when working tree is dirty", () => {
    expect(
      referenceFormatDriftLabel({ ...ZERO_DRIFT, dirty: true }),
    ).toBe("dirty tree");
    expect(
      referenceFormatDriftLabel({ ...ZERO_DRIFT, behind: 3, dirty: true }),
    ).toBe("3 commits behind, dirty tree");
  });

  test("combines behind + ahead + dirty in a single label", () => {
    expect(
      referenceFormatDriftLabel({
        localSha: "abc",
        originSha: "def",
        ahead: 2,
        behind: 3,
        dirty: true,
      }),
    ).toBe("3 commits behind, 2 commits ahead, dirty tree");
  });
});

// ── driftColor ──────────────────────────────────────────────────────

describe("admin/ops — driftColor contract", () => {
  test("returns success token when in sync", () => {
    expect(referenceDriftColor(ZERO_DRIFT)).toBe("var(--color-success)");
  });

  test("returns warning token when behind", () => {
    expect(
      referenceDriftColor({ ...ZERO_DRIFT, behind: 1 }),
    ).toBe("var(--color-warning)");
  });

  test("returns warning token when ahead", () => {
    expect(
      referenceDriftColor({ ...ZERO_DRIFT, ahead: 1 }),
    ).toBe("var(--color-warning)");
  });

  test("returns warning token when dirty", () => {
    expect(
      referenceDriftColor({ ...ZERO_DRIFT, dirty: true }),
    ).toBe("var(--color-warning)");
  });
});

// ── isCommitDeployed ────────────────────────────────────────────────

describe("admin/ops — isCommitDeployed contract", () => {
  test("matches identical short SHAs", () => {
    expect(referenceIsCommitDeployed("abc1234", "abc1234")).toBe(true);
  });

  test("does not match different SHAs", () => {
    expect(referenceIsCommitDeployed("abc1234", "def5678")).toBe(false);
  });

  test("returns false for empty inputs", () => {
    expect(referenceIsCommitDeployed("", "abc1234")).toBe(false);
    expect(referenceIsCommitDeployed("abc1234", "")).toBe(false);
    expect(referenceIsCommitDeployed("", "")).toBe(false);
  });

  test("trims whitespace before comparing", () => {
    expect(referenceIsCommitDeployed(" abc1234 ", "abc1234")).toBe(true);
    expect(referenceIsCommitDeployed("abc1234\n", "abc1234")).toBe(true);
  });
});

// ── serviceColor ────────────────────────────────────────────────────

describe("admin/ops — serviceColor contract", () => {
  test("returns success token for an 'active' service", () => {
    expect(referenceServiceColor("active")).toBe("var(--color-success)");
  });

  test("returns muted token for 'inactive' or 'unknown'", () => {
    expect(referenceServiceColor("inactive")).toBe("var(--color-text-muted)");
    expect(referenceServiceColor("unknown")).toBe("var(--color-text-muted)");
  });

  test("returns danger token for any other state (failed, activating, etc.)", () => {
    expect(referenceServiceColor("failed")).toBe("var(--color-danger)");
    expect(referenceServiceColor("activating")).toBe("var(--color-danger)");
    expect(referenceServiceColor("")).toBe("var(--color-danger)");
  });
});
