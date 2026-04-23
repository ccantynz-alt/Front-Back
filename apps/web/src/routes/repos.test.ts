// ── /repos — Repository List Regression Guard ──────────────────────
//
// The repos page lists every connected GitHub repository and surfaces
// PRs / branches / issues / CI status. It must wire to real tRPC and
// never ship hardcoded sample repos.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "repos.tsx");

describe("repos route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("fetches real repos via trpc (no fabricated rows)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("trpc.");
  });

  test("no hardcoded sample repositories", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/const\s+SAMPLE_REPOS/);
    expect(code).not.toMatch(/const\s+MOCK_REPOS/);
    expect(code).not.toMatch(/const\s+FAKE_REPOS/);
    // No invented GitHub repo fixtures.
    expect(code).not.toContain('"crontech-web"');
    expect(code).not.toContain('"crontech-api"');
  });
});
