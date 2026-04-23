// ── Per-Project Metrics Procedures ──────────────────────────────────
//
// Extends BLK-014 Observability with per-project drill-downs. Reads
// time-series straight from the Grafana Mimir HTTP API (Prometheus
// query_range shape). The collector → Mimir pipeline is already live
// (platform-wide Crontech Overview dashboard ships against it); this
// procedure lets `/projects/[id]/metrics` pull a project-scoped slice.
//
// HONEST FALLBACK CONTRACT — critical:
//   • If `MIMIR_URL` is not set                → returns `null`
//   • If Mimir responds non-2xx or the call throws → returns `null`
//   • If Mimir responds 2xx but has no samples  → returns `{ points: [], ... }`
//
// The UI treats both `null` and `points.length === 0` as "No metrics
// yet" and shows an honest empty state. The previous implementation of
// `/projects/[id]/metrics` synthesised CPU/memory/bandwidth graphs with
// `Math.random()`. We do not go back there. If the data isn't in Mimir,
// we say so.
//
// Project-scoped queries filter on a `project_id` label that the
// request/build hot-path will attach to its OTel metric emissions. Until
// that wiring is extended to every code path, many projects will return
// `points: []` — that's the correct honest behaviour.

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { projects } from "@back-to-the-future/db";
import { router, protectedProcedure } from "../init";

// ── Input Schemas ────────────────────────────────────────────────────

const metricEnum = z.enum([
  "cpu",
  "memory",
  "bandwidth",
  "requests",
  "inflight",
]);
const rangeEnum = z.enum(["1h", "6h", "24h", "7d", "30d"]);

export type ProjectMetricName = z.infer<typeof metricEnum>;
export type ProjectMetricRange = z.infer<typeof rangeEnum>;

// ── Range → query-window math ────────────────────────────────────────

interface RangeSpec {
  /** Seconds of history to request from Mimir. */
  durationSeconds: number;
  /** Resolution (step) in seconds between samples in the returned frame. */
  stepSeconds: number;
  /** Prometheus-style range window used inside the rate()/avg_over_time call. */
  window: string;
}

const RANGE_SPECS: Record<ProjectMetricRange, RangeSpec> = {
  "1h": { durationSeconds: 60 * 60, stepSeconds: 60, window: "1m" },
  "6h": { durationSeconds: 6 * 60 * 60, stepSeconds: 60 * 5, window: "5m" },
  "24h": { durationSeconds: 24 * 60 * 60, stepSeconds: 60 * 15, window: "5m" },
  "7d": { durationSeconds: 7 * 24 * 60 * 60, stepSeconds: 60 * 60, window: "30m" },
  "30d": { durationSeconds: 30 * 24 * 60 * 60, stepSeconds: 60 * 60 * 6, window: "1h" },
};

// ── Metric → PromQL mapping ──────────────────────────────────────────
//
// Each metric selects a PromQL expression tailored to the data the OTel
// pipeline exports (see `apps/api/src/telemetry.ts` + the Crontech
// Overview dashboard). The `{project_id="..."}` label is injected by
// `buildQuery`. Metric names here are the OTLP → Prometheus remote-write
// transforms of the dotted names declared in `telemetry.ts`:
//   http.request.count    → http_request_count_total
//   http.request.duration → http_request_duration_milliseconds_*
//
// CPU and memory come from the standard OTel `process.*` instrument
// family (process_cpu_utilization, process_memory_usage). If a given
// process isn't instrumenting them, or the series has no `project_id`
// label yet, the query simply returns no points and the UI honours
// the empty state.

interface MetricSpec {
  label: string;
  unit: string;
  /** Build the PromQL query. `projectId` is already escape-safe (uuid). */
  buildExpr: (projectId: string, window: string) => string;
}

const METRIC_SPECS: Record<ProjectMetricName, MetricSpec> = {
  cpu: {
    label: "CPU utilisation",
    unit: "%",
    buildExpr: (projectId, window) =>
      `avg(avg_over_time(process_cpu_utilization{project_id="${projectId}"}[${window}])) * 100`,
  },
  memory: {
    label: "Memory utilisation",
    unit: "%",
    buildExpr: (projectId, window) =>
      // process_memory_usage is bytes; divide by process_memory_limit for a %.
      // If either series is missing for a project, the vector division yields
      // no samples and the UI shows its empty state.
      `avg(avg_over_time(process_memory_usage{project_id="${projectId}"}[${window}])` +
      ` / on(project_id) group_left avg_over_time(process_memory_limit{project_id="${projectId}"}[${window}])) * 100`,
  },
  bandwidth: {
    label: "Egress bandwidth",
    unit: "MB/s",
    buildExpr: (projectId, window) =>
      `sum(rate(http_server_bytes_sent_total{project_id="${projectId}"}[${window}])) / 1048576`,
  },
  requests: {
    label: "Requests / min",
    unit: "req/min",
    buildExpr: (projectId, window) =>
      `sum(rate(http_request_count_total{project_id="${projectId}"}[${window}])) * 60`,
  },
  // `project_requests_inflight` is an OTel ObservableGauge emitted by
  // `apps/api/src/telemetry.ts`. Every scrape, it publishes one sample
  // per active project containing the current in-flight request count.
  // `max_over_time(...[window])` gives us the peak concurrency seen in
  // the bucket — a better "is this project busy?" signal than the raw
  // instantaneous sample, which is noisy at low traffic.
  inflight: {
    label: "Requests in flight",
    unit: "req",
    buildExpr: (projectId, window) =>
      `max_over_time(project_requests_inflight{project_id="${projectId}"}[${window}])`,
  },
};

// ── Mimir response shapes (subset we read) ───────────────────────────

interface PromRangeResponse {
  status: "success" | "error";
  data?: {
    resultType?: string;
    result?: Array<{
      metric?: Record<string, string>;
      values?: Array<[number, string]>;
    }>;
  };
}

export interface ProjectTimeseriesPoint {
  /** Unix epoch milliseconds. */
  t: number;
  /** Numeric value, NaN/Inf filtered out upstream. */
  v: number;
}

export interface ProjectTimeseriesResponse {
  metric: ProjectMetricName;
  label: string;
  unit: string;
  range: ProjectMetricRange;
  points: ProjectTimeseriesPoint[];
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Mimir exposes the Prometheus query API at `/prometheus/api/v1/*` by
 * default. When MIMIR_URL is pointed at a real deployment (e.g. a
 * Caddy-fronted endpoint or the local LGTM compose stack on :9009),
 * this resolves to the correct query path.
 */
function mimirQueryRangeUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/prometheus/api/v1/query_range`;
}

async function fetchMimirRange(
  baseUrl: string,
  expr: string,
  startSeconds: number,
  endSeconds: number,
  stepSeconds: number,
): Promise<PromRangeResponse | null> {
  const url = new URL(mimirQueryRangeUrl(baseUrl));
  url.searchParams.set("query", expr);
  url.searchParams.set("start", startSeconds.toString());
  url.searchParams.set("end", endSeconds.toString());
  url.searchParams.set("step", stepSeconds.toString());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const headers: Record<string, string> = { accept: "application/json" };
    const tenant = process.env["MIMIR_TENANT_ID"];
    if (tenant) headers["X-Scope-OrgID"] = tenant;

    const res = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as PromRangeResponse;
    if (body.status !== "success") return null;
    return body;
  } catch (_err) {
    // Network unreachable, DNS failure, abort/timeout, JSON parse error.
    // All three flatten to the honest fallback: "no data yet".
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function flattenPoints(resp: PromRangeResponse): ProjectTimeseriesPoint[] {
  const series = resp.data?.result ?? [];
  if (series.length === 0) return [];

  // Prometheus range_query returns one or more series. Because our
  // PromQL already aggregates with sum()/avg(), we expect a single
  // series — but defensive code merges values by timestamp if multiple
  // slip through (e.g. labels that didn't get aggregated away).
  const merged = new Map<number, number>();
  for (const s of series) {
    for (const [ts, raw] of s.values ?? []) {
      const parsed = Number.parseFloat(raw);
      if (!Number.isFinite(parsed)) continue;
      const tsMs = Math.round(ts * 1_000);
      const existing = merged.get(tsMs);
      merged.set(tsMs, existing === undefined ? parsed : existing + parsed);
    }
  }

  const out: ProjectTimeseriesPoint[] = [];
  for (const [t, v] of merged) out.push({ t, v });
  out.sort((a, b) => a.t - b.t);
  return out;
}

async function requireOwnedProjectId(
  db: import("../context").TRPCContext["db"],
  projectId: string,
  userId: string,
): Promise<string> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found or you do not have access.",
    });
  }
  return row.id;
}

// ── Router ───────────────────────────────────────────────────────────

export const metricsRouter = router({
  /**
   * Per-project time-series pulled from Mimir. Returns `null` when the
   * metrics pipeline is unreachable / unconfigured — the UI shows an
   * honest "No metrics yet" in that case. Returns an empty `points`
   * array when Mimir is reachable but has no samples labelled for this
   * project (also honest, also rendered as the empty state).
   */
  projectTimeseries: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        metric: metricEnum,
        range: rangeEnum,
      }),
    )
    .query(async ({ ctx, input }): Promise<ProjectTimeseriesResponse | null> => {
      // Authorise first — we never want to leak "this project exists"
      // via timing or response shape to an unauthorised caller.
      await requireOwnedProjectId(ctx.db, input.projectId, ctx.userId);

      const mimirUrl = process.env["MIMIR_URL"];
      if (!mimirUrl) return null;

      const spec = METRIC_SPECS[input.metric];
      const rangeSpec = RANGE_SPECS[input.range];

      const now = Math.floor(Date.now() / 1_000);
      const start = now - rangeSpec.durationSeconds;
      const expr = spec.buildExpr(input.projectId, rangeSpec.window);

      const resp = await fetchMimirRange(
        mimirUrl,
        expr,
        start,
        now,
        rangeSpec.stepSeconds,
      );
      if (!resp) return null;

      const points = flattenPoints(resp);
      return {
        metric: input.metric,
        label: spec.label,
        unit: spec.unit,
        range: input.range,
        points,
      };
    }),
});
