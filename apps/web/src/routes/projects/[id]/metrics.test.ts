// ── /projects/[id]/metrics — Real Metrics Regression Test ─────────
//
// This route used to be 468 lines of `Math.random()` theatre — gaussian
// spikes, simulated GC drops, a hardcoded Record<string, string> that
// mapped "proj-1" → "crontech-web". Every number was invented in the
// browser.
//
// After the honest-preview interlude it now renders REAL per-project
// time-series by calling `trpc.metrics.projectTimeseries` (which hits
// Mimir via the API). This guard pins the real-metrics shape so a
// future session can't silently regress back to synthesised numbers.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "metrics.tsx");

describe("projects/[id]/metrics route — real metrics regression", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("carries no Math.random fake-metric generators", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Strip single-line comments (the file-header disclaimer describes
    // the regression we just fixed, so a plain toContain would always
    // match the word "Math.random" inside that explanation).
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("Math.random");
    // None of the specific generator names from the old implementation
    // should ever return.
    expect(code).not.toContain("generateCpuData");
    expect(code).not.toContain("generateMemoryData");
    expect(code).not.toContain("generateBandwidthData");
    expect(code).not.toContain("generateRequestsData");
  });

  test("reads project name from real tRPC (not a hardcoded map)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("trpc.projects.getById");
    // The old implementation mapped "proj-1" → "crontech-web" etc.
    expect(src).not.toContain('"proj-1"');
    expect(src).not.toContain('"proj-2"');
    expect(src).not.toContain('"proj-3"');
  });

  test("pulls real metrics from tRPC → Mimir via projectTimeseries", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The new implementation must route through the real procedure.
    expect(src).toContain("trpc.metrics.projectTimeseries");
  });

  test("renders all five required metric panels", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The METRICS constant drives a <For> over these five descriptors.
    expect(src).toMatch(/key:\s*"cpu"/);
    expect(src).toMatch(/key:\s*"memory"/);
    expect(src).toMatch(/key:\s*"bandwidth"/);
    expect(src).toMatch(/key:\s*"requests"/);
    // `inflight` is the project_requests_inflight ObservableGauge we
    // emit from apps/api/src/telemetry.ts — the first process-scoped
    // metric that carries the `project_id` label honestly.
    expect(src).toMatch(/key:\s*"inflight"/);
  });

  test("exposes the five required time ranges", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toMatch(/key:\s*"1h"/);
    expect(src).toMatch(/key:\s*"6h"/);
    expect(src).toMatch(/key:\s*"24h"/);
    expect(src).toMatch(/key:\s*"7d"/);
    expect(src).toMatch(/key:\s*"30d"/);
  });

  test("persists range in the URL query param", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("useSearchParams");
    expect(src).toContain("setSearch");
  });

  test("handles the empty / error / loading states honestly", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Empty state — "No … metrics yet" — uses the honest language the
    // backend contract guarantees (null or points: []).
    expect(src).toMatch(/No .+ metrics yet/);
    // Explicit skeleton + error components, no optimistic fabrications.
    expect(src).toContain("ChartSkeleton");
    expect(src).toContain("ChartError");
    expect(src).toContain("ChartEmpty");
  });

  test("reuses the shared MetricsChart + MetricCard components", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain('from "../../../components/MetricsChart"');
    expect(src).toContain('from "../../../components/MetricCard"');
  });

  test("states the metrics pipeline honestly (OTel → Mimir)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("OpenTelemetry");
    expect(src).toContain("Mimir");
  });

  test("is admin-gated through ProtectedRoute", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("ProtectedRoute");
  });
});
