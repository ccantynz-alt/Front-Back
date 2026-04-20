/**
 * BLK-014 — Observability dashboard drift guard.
 *
 * Parses the pre-provisioned `Crontech Overview` Grafana dashboard JSON
 * (infra/lgtm/dashboards/crontech-overview.json) and asserts every panel
 * target references a metric name — or a Loki log label — that the
 * codebase actually emits. A dashboard pointing at a hallucinated metric
 * is a fake-fix pattern; this test makes that class of drift impossible
 * to merge.
 *
 * The allowed metric stems are derived from `apps/api/src/telemetry.ts`.
 * If you add a new OTel metric there, add its dotted name to the
 * ALLOWED_METRIC_STEMS list below and you can reference it in a panel.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

// ── Inventory ────────────────────────────────────────────────────────
// These are the OTel metric names emitted by apps/api/src/telemetry.ts.
// When exported via OTLP → Prometheus remote-write, dots become
// underscores and histogram/counter suffixes are appended
// (`_bucket`, `_sum`, `_count`, `_total`, plus a `_milliseconds` unit
// suffix for histograms declared with unit "ms"). We match on the stem
// with underscores so the test is robust across exporter versions.
const ALLOWED_METRIC_STEMS = [
  "http_request_duration",
  "http_request_count",
  "ai_inference_latency",
  "ai_tokens_used",
  "ws_connections_active",
] as const;

// Loki data-source UID the dashboard wires to. Log panels use LogQL
// selectors, not metric names, so we verify datasource UID instead of
// the metric list.
const LOKI_DATASOURCE_UID = "loki";
const MIMIR_DATASOURCE_UID = "mimir";

// ── Types ────────────────────────────────────────────────────────────
interface DashboardTarget {
  refId?: string;
  datasource?: { type?: string; uid?: string };
  expr?: string;
  legendFormat?: string;
  hide?: boolean;
  queryType?: string;
}

interface DashboardPanel {
  id: number;
  title: string;
  type: string;
  datasource?: { type?: string; uid?: string };
  targets?: DashboardTarget[];
}

interface Dashboard {
  title: string;
  uid: string;
  panels: DashboardPanel[];
}

// ── Helpers ──────────────────────────────────────────────────────────
function isKnownMetricExpr(expr: string): boolean {
  return ALLOWED_METRIC_STEMS.some((stem) => expr.includes(stem));
}

function isLokiLabelExpr(expr: string): boolean {
  // LogQL stream selectors always start with `{` and reference labels
  // like service_name that come from OTel resource attributes.
  return /\{\s*[a-z_]+\s*=/.test(expr);
}

// ── The test ─────────────────────────────────────────────────────────
describe("BLK-014 dashboard drift guard", () => {
  const dashboardPath = resolve(
    import.meta.dir,
    "..",
    "..",
    "..",
    "infra",
    "lgtm",
    "dashboards",
    "crontech-overview.json",
  );

  const raw = readFileSync(dashboardPath, "utf-8");

  test("crontech-overview.json is valid JSON", () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  const dashboard = JSON.parse(raw) as Dashboard;

  test("dashboard has the expected UID and title", () => {
    expect(dashboard.uid).toBe("crontech-overview");
    expect(dashboard.title).toBe("Crontech Overview");
  });

  test("dashboard has at least 6 panels (one per required surface)", () => {
    expect(Array.isArray(dashboard.panels)).toBe(true);
    expect(dashboard.panels.length).toBeGreaterThanOrEqual(6);
  });

  test("every metric panel target references a real emitted metric", () => {
    const metricPanels = dashboard.panels.filter(
      (p) => p.datasource?.uid === MIMIR_DATASOURCE_UID,
    );
    expect(metricPanels.length).toBeGreaterThan(0);

    for (const panel of metricPanels) {
      const targets = panel.targets ?? [];
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const expr = target.expr;
        expect(typeof expr).toBe("string");
        if (typeof expr !== "string") continue;
        const ok = isKnownMetricExpr(expr);
        if (!ok) {
          throw new Error(
            `Panel "${panel.title}" target ${target.refId ?? "?"} references ` +
              `unknown metric: ${expr}\nAllowed stems: ${ALLOWED_METRIC_STEMS.join(", ")}`,
          );
        }
      }
    }
  });

  test("Loki log panels use LogQL label selectors, not PromQL", () => {
    const logPanels = dashboard.panels.filter(
      (p) => p.datasource?.uid === LOKI_DATASOURCE_UID,
    );
    expect(logPanels.length).toBeGreaterThan(0);

    for (const panel of logPanels) {
      const targets = panel.targets ?? [];
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const expr = target.expr;
        expect(typeof expr).toBe("string");
        if (typeof expr !== "string") continue;
        expect(isLokiLabelExpr(expr)).toBe(true);
      }
    }
  });

  test("dashboard JSON has no leftover TODO placeholders", () => {
    expect(raw).not.toMatch(/TODO/);
    expect(raw).not.toMatch(/FIXME/);
  });
});
