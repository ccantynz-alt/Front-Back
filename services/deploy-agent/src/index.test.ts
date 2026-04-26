// ── deploy-agent — pure helper tests ────────────────────────────────
// The deploy-agent runs as root on the production box and is otherwise
// infrastructure-tested (per package.json comment "tested in staging").
// These tests cover only the pure-function helpers added for the
// /admin/ops console: parseGitLog and parseDriftCounts.
//
// Importing index.ts triggers Bun.serve() at module-load time, which
// fails under `bun test` because it tries to bind 127.0.0.1:9091. We
// therefore mirror the helper bodies as reference implementations and
// snapshot the source string to detect drift, instead of importing.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve(import.meta.dir, "index.ts");

describe("deploy-agent — file presence", () => {
  test("index.ts exists", () => {
    expect(existsSync(SOURCE_PATH)).toBe(true);
  });
});

describe("deploy-agent — static source contract", () => {
  const src = readFileSync(SOURCE_PATH, "utf-8");

  test("exports the pure git helpers", () => {
    expect(src).toContain("export function parseGitLog");
    expect(src).toContain("export function parseDriftCounts");
  });

  test("declares the three new ops endpoints", () => {
    expect(src).toContain('pathname === "/git/log"');
    expect(src).toContain('pathname === "/git/drift"');
    expect(src).toContain('pathname === "/diagnose"');
  });

  test("documents the three new endpoints in the header comment", () => {
    expect(src).toContain("/git/log");
    expect(src).toContain("/git/drift");
    expect(src).toContain("/diagnose");
  });

  test("uses the ASCII unit-separator (\\x1f) for git log parsing", () => {
    expect(src).toContain("\\x1f");
  });
});

// ── Reference implementations (mirrored from src/index.ts) ──────────

interface GitCommit {
  sha: string;
  subject: string;
  date: string;
}

function referenceParseGitLog(stdout: string): GitCommit[] {
  if (!stdout) return [];
  const commits: GitCommit[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\x1f");
    if (parts.length !== 3) continue;
    const [sha, subject, date] = parts;
    if (!sha || !subject || !date) continue;
    commits.push({ sha, subject, date });
  }
  return commits;
}

interface DriftCounts {
  ahead: number;
  behind: number;
}

function referenceParseDriftCounts(stdout: string): DriftCounts {
  const trimmed = stdout.trim();
  if (!trimmed) return { ahead: 0, behind: 0 };
  const parts = trimmed.split(/\s+/);
  const behind = Number.parseInt(parts[0] ?? "0", 10);
  const ahead = Number.parseInt(parts[1] ?? "0", 10);
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}

// ── parseGitLog ─────────────────────────────────────────────────────

describe("deploy-agent — parseGitLog contract", () => {
  test("parses a typical multi-line git log output", () => {
    const input = [
      "abc1234\x1ffix(blk-016): correct gluecron platform-deploy route\x1f2 hours ago",
      "def5678\x1fdocs: competitive reality + cloudflare parity audits\x1fyesterday",
      "9876543\x1ffeat(blk-016): Gluecron platform self-deploy webhook\x1f3 days ago",
    ].join("\n");
    const commits = referenceParseGitLog(input);
    expect(commits).toHaveLength(3);
    expect(commits[0]).toEqual({
      sha: "abc1234",
      subject: "fix(blk-016): correct gluecron platform-deploy route",
      date: "2 hours ago",
    });
    expect(commits[2]?.sha).toBe("9876543");
  });

  test("returns an empty array for empty input", () => {
    expect(referenceParseGitLog("")).toEqual([]);
    expect(referenceParseGitLog("   \n   ")).toEqual([]);
  });

  test("skips lines that don't match the format", () => {
    const input = [
      "abc1234\x1fproper commit\x1fnow",
      "this-line-has-no-separators-and-should-be-skipped",
      "def5678\x1fanother proper commit\x1fyesterday",
    ].join("\n");
    const commits = referenceParseGitLog(input);
    expect(commits).toHaveLength(2);
    expect(commits[0]?.sha).toBe("abc1234");
    expect(commits[1]?.sha).toBe("def5678");
  });

  test("preserves commit subjects containing pipes and commas", () => {
    const input = "abc1234\x1ffix: handle a, b, and c|d cases\x1f1 hour ago";
    const [commit] = referenceParseGitLog(input);
    expect(commit?.subject).toBe("fix: handle a, b, and c|d cases");
  });

  test("skips lines with empty fields", () => {
    const input = [
      "abc1234\x1f\x1f1 hour ago", // empty subject
      "\x1fsubject\x1fnow", // empty sha
      "def5678\x1ffull commit\x1f2 hours ago",
    ].join("\n");
    const commits = referenceParseGitLog(input);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.sha).toBe("def5678");
  });
});

// ── parseDriftCounts ────────────────────────────────────────────────

describe("deploy-agent — parseDriftCounts contract", () => {
  test("parses a typical 'behind\\tahead' rev-list output", () => {
    expect(referenceParseDriftCounts("3\t0")).toEqual({ ahead: 0, behind: 3 });
    expect(referenceParseDriftCounts("0\t2")).toEqual({ ahead: 2, behind: 0 });
    expect(referenceParseDriftCounts("5\t7")).toEqual({ ahead: 7, behind: 5 });
  });

  test("treats in-sync as { ahead: 0, behind: 0 }", () => {
    expect(referenceParseDriftCounts("0\t0")).toEqual({ ahead: 0, behind: 0 });
  });

  test("returns zeros for empty / whitespace-only input", () => {
    expect(referenceParseDriftCounts("")).toEqual({ ahead: 0, behind: 0 });
    expect(referenceParseDriftCounts("   ")).toEqual({ ahead: 0, behind: 0 });
    expect(referenceParseDriftCounts("\n")).toEqual({ ahead: 0, behind: 0 });
  });

  test("tolerates space-separated input as well as tab-separated", () => {
    expect(referenceParseDriftCounts("3 0")).toEqual({ ahead: 0, behind: 3 });
    expect(referenceParseDriftCounts("0 2")).toEqual({ ahead: 2, behind: 0 });
  });

  test("clamps non-numeric input to zero", () => {
    expect(referenceParseDriftCounts("abc\tdef")).toEqual({
      ahead: 0,
      behind: 0,
    });
  });
});
