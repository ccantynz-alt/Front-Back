// ── /deployments — Deploy List Regression Guard ────────────────────
//
// The deployments page is a core customer surface — it shows every
// deploy a user has triggered, live-streams build logs, and is the
// jumping-off point for rollback. It MUST wire to real tRPC and
// never synthesise rows.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "deployments.tsx");

describe("deployments route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("fetches real deployments via trpc (no fabricated rows)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Must wire to real data source — the old placeholder data
    // surface lived here before BLK-009 landed.
    expect(src).toContain("trpc.");
  });

  test("streams logs over real SSE via useDeploymentLogStream", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Live logs surface must use the real SSE hook wired in BLK-009.
    expect(src).toContain("useDeploymentLogStream");
  });

  test("no hardcoded deployment sample rows", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    // Guard against common patterns used pre-BLK-009.
    expect(code).not.toMatch(/const\s+SAMPLE_DEPLOYMENTS/);
    expect(code).not.toMatch(/const\s+MOCK_DEPLOYMENTS/);
    expect(code).not.toMatch(/const\s+PLACEHOLDER_DEPLOYMENTS/);
  });
});
