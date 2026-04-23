// ── Project Metrics — Real OTel → Mimir drill-down ────────────────────
//
// Replaces the honest-preview placeholder that was standing in after we
// ripped out the 468-line `Math.random()` theatre. This page now queries
// the `trpc.metrics.projectTimeseries` procedure, which in turn hits the
// Mimir HTTP API (live from BLK-014).
//
// Honest contract:
//   • `trpc.metrics.projectTimeseries` returns `null` when MIMIR_URL is
//     unset or Mimir is unreachable. We render "No metrics yet" per chart.
//   • It returns `{ points: [] }` when Mimir is reachable but has no
//     samples tagged with this project_id. Also "No metrics yet".
//   • Only when `points.length > 0` do we render a chart.
//
// Under NO circumstances does this page synthesise values. If we don't
// have real data, we say so. That's the whole point.
//
// URL state:
//   • `/projects/[id]/metrics?range=24h` — range is persisted in the
//     query string so refresh preserves the selected window.

import { createResource, createMemo, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { useParams, useSearchParams, A } from "@solidjs/router";
import { ProtectedRoute } from "../../../components/ProtectedRoute";
import { SEOHead } from "../../../components/SEOHead";
import { MetricsChart } from "../../../components/MetricsChart";
import { MetricCard } from "../../../components/MetricCard";
import { trpc } from "../../../lib/trpc";

// ── Types ────────────────────────────────────────────────────────────

type MetricName = "cpu" | "memory" | "bandwidth" | "requests" | "inflight";
type RangeKey = "1h" | "6h" | "24h" | "7d" | "30d";

interface TimeseriesPoint {
  t: number;
  v: number;
}

interface TimeseriesPayload {
  metric: MetricName;
  label: string;
  unit: string;
  range: RangeKey;
  points: TimeseriesPoint[];
}

interface MetricDescriptor {
  key: MetricName;
  label: string;
  unit: string;
  color: string;
  icon: string;
  /** Formatter for the numeric value shown on the MetricCard. */
  formatValue: (v: number) => string;
}

const METRICS: MetricDescriptor[] = [
  {
    key: "cpu",
    label: "CPU",
    unit: "%",
    color: "#60a5fa",
    icon: "\u{1F4BB}",
    formatValue: (v) => v.toFixed(1),
  },
  {
    key: "memory",
    label: "Memory",
    unit: "%",
    color: "#a78bfa",
    icon: "\u{1F9E0}",
    formatValue: (v) => v.toFixed(1),
  },
  {
    key: "bandwidth",
    label: "Bandwidth",
    unit: "MB/s",
    color: "#34d399",
    icon: "\u{1F4E1}",
    formatValue: (v) => v.toFixed(2),
  },
  {
    key: "requests",
    label: "Requests / min",
    unit: "req/min",
    color: "#fbbf24",
    icon: "\u{1F4CA}",
    formatValue: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)),
  },
  {
    key: "inflight",
    label: "Requests in flight",
    unit: "req",
    color: "#f472b6",
    icon: "\u{1F500}",
    formatValue: (v) => v.toFixed(0),
  },
];

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "1h", label: "1h" },
  { key: "6h", label: "6h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

const DEFAULT_RANGE: RangeKey = "24h";

function isRangeKey(v: unknown): v is RangeKey {
  return (
    v === "1h" || v === "6h" || v === "24h" || v === "7d" || v === "30d"
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function ProjectMetricsPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const [search, setSearch] = useSearchParams();

  const range = (): RangeKey => {
    const raw = search.range;
    return isRangeKey(raw) ? raw : DEFAULT_RANGE;
  };

  const setRange = (next: RangeKey): void => {
    setSearch({ range: next }, { replace: true });
  };

  // Project metadata (name for the breadcrumb + H1).
  const [project] = createResource(
    () => params.id,
    async (id): Promise<{ id: string; name: string } | null> => {
      try {
        const row = (await trpc.projects.getById.query({ projectId: id })) as
          | { id: string; name: string }
          | null;
        return row ? { id: row.id, name: row.name } : null;
      } catch {
        return null;
      }
    },
  );

  const displayName = (): string =>
    project()?.name ?? (params.id ? `project ${params.id}` : "this project");

  return (
    <ProtectedRoute>
      <SEOHead
        title="Metrics"
        description="Per-project metrics on Crontech — CPU, memory, bandwidth, and request graphs backed by the Crontech OpenTelemetry → Mimir observability pipeline."
        path={`/projects/${params.id}/metrics`}
      />

      <div
        class="min-h-screen"
        style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <div class="mx-auto max-w-7xl px-6 py-12">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            class="mb-6 flex items-center gap-2 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            <A
              href="/projects"
              class="hover:underline"
              style={{ color: "var(--color-text-muted)" }}
            >
              Projects
            </A>
            <span aria-hidden="true">/</span>
            <A
              href={`/projects/${params.id}`}
              class="hover:underline"
              style={{ color: "var(--color-text-muted)" }}
            >
              {displayName()}
            </A>
            <span aria-hidden="true">/</span>
            <span style={{ color: "var(--color-text)" }}>Metrics</span>
          </nav>

          {/* Header */}
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div class="flex flex-col gap-2">
              <h1 class="text-4xl font-bold tracking-tight">
                Metrics for {displayName()}
              </h1>
              <p
                class="max-w-2xl text-sm leading-relaxed"
                style={{ color: "var(--color-text-muted)" }}
              >
                Real-time telemetry from the Crontech observability
                pipeline (OpenTelemetry &rarr; Mimir). Charts below pull
                directly from Mimir &mdash; when a series is missing or
                the pipeline is unreachable we say so rather than invent
                numbers.
              </p>
            </div>

            {/* Range selector */}
            <div
              role="radiogroup"
              aria-label="Time range"
              class="inline-flex items-center gap-1 rounded-xl p-1"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              <For each={RANGES}>
                {(r) => {
                  const active = (): boolean => range() === r.key;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active()}
                      onClick={() => setRange(r.key)}
                      class="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                      style={{
                        background: active()
                          ? "var(--color-primary)"
                          : "transparent",
                        color: active()
                          ? "#ffffff"
                          : "var(--color-text-muted)",
                      }}
                    >
                      {r.label}
                    </button>
                  );
                }}
              </For>
            </div>
          </div>

          {/* Chart grid */}
          <div class="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <For each={METRICS}>
              {(desc) => (
                <MetricPanel
                  projectId={params.id}
                  descriptor={desc}
                  range={range()}
                />
              )}
            </For>
          </div>

          {/* Pipeline footer */}
          <p
            class="mt-10 text-xs"
            style={{ color: "var(--color-text-faint)" }}
          >
            Source: OpenTelemetry collector &rarr; Mimir (BLK-014). When
            per-project labels are not present on a series, the chart
            shows its empty state &mdash; not synthesised data.
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
}

// ── Per-chart panel ──────────────────────────────────────────────────

interface MetricPanelProps {
  projectId: string;
  descriptor: MetricDescriptor;
  range: RangeKey;
}

function MetricPanel(props: MetricPanelProps): JSX.Element {
  const [series] = createResource(
    () => ({ projectId: props.projectId, metric: props.descriptor.key, range: props.range }),
    async ({ projectId, metric, range }): Promise<TimeseriesPayload | null> => {
      try {
        const res = (await trpc.metrics.projectTimeseries.query({
          projectId,
          metric,
          range,
        })) as TimeseriesPayload | null;
        return res;
      } catch {
        // Network / tRPC failure — surface as error state.
        throw new Error("fetch-failed");
      }
    },
  );

  const hasPoints = createMemo((): boolean => {
    const data = series();
    return data !== null && data !== undefined && data.points.length > 0;
  });

  const latestValue = createMemo((): number | null => {
    const data = series();
    if (!data || data.points.length === 0) return null;
    const last = data.points[data.points.length - 1];
    return last ? last.v : null;
  });

  const cardValue = createMemo((): string => {
    const v = latestValue();
    return v === null ? "—" : props.descriptor.formatValue(v);
  });

  const sparkline = createMemo((): number[] => {
    const data = series();
    if (!data) return [];
    return data.points.map((p) => p.v);
  });

  const trendChange = createMemo((): number => {
    const data = series();
    if (!data || data.points.length < 2) return 0;
    const first = data.points[0]?.v ?? 0;
    const last = data.points[data.points.length - 1]?.v ?? 0;
    if (first === 0) return 0;
    return ((last - first) / first) * 100;
  });

  const chartPoints = createMemo((): Array<{ timestamp: number; value: number }> => {
    const data = series();
    if (!data) return [];
    return data.points.map((p) => ({ timestamp: p.t, value: p.v }));
  });

  return (
    <section
      class="flex flex-col gap-4 rounded-2xl p-5"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
      aria-label={`${props.descriptor.label} metrics`}
    >
      {/* Summary card */}
      <MetricCard
        name={props.descriptor.label}
        value={cardValue()}
        unit={props.descriptor.unit}
        change={trendChange()}
        status="healthy"
        color={props.descriptor.color}
        icon={props.descriptor.icon}
        sparkline={sparkline()}
      />

      {/* Chart body — 4 states: loading / error / empty / data */}
      <div class="min-h-[240px]">
        <Show
          when={!series.loading}
          fallback={<ChartSkeleton color={props.descriptor.color} />}
        >
          <Show
            when={series.error === undefined}
            fallback={<ChartError />}
          >
            <Show
              when={hasPoints()}
              fallback={<ChartEmpty metric={props.descriptor.label} />}
            >
              <MetricsChart
                data={chartPoints()}
                color={props.descriptor.color}
                label={props.descriptor.label}
                unit={props.descriptor.unit}
                height={240}
                animate={false}
              />
            </Show>
          </Show>
        </Show>
      </div>
    </section>
  );
}

// ── Non-data states ──────────────────────────────────────────────────

function ChartSkeleton(props: { color: string }): JSX.Element {
  return (
    <div
      class="flex h-[240px] w-full animate-pulse items-center justify-center rounded-xl"
      style={{
        background: `color-mix(in oklab, ${props.color} 6%, transparent)`,
        border: `1px dashed color-mix(in oklab, ${props.color} 20%, transparent)`,
      }}
      aria-busy="true"
      aria-label="Loading metrics"
    >
      <span
        class="text-xs"
        style={{ color: "var(--color-text-faint)" }}
      >
        Loading…
      </span>
    </div>
  );
}

function ChartError(): JSX.Element {
  return (
    <div
      class="flex h-[240px] w-full items-center justify-center rounded-xl p-6 text-center"
      style={{
        background: "color-mix(in oklab, var(--color-danger) 8%, transparent)",
        border: "1px solid color-mix(in oklab, var(--color-danger) 30%, transparent)",
      }}
      role="alert"
    >
      <div class="flex flex-col items-center gap-1">
        <span
          class="text-sm font-semibold"
          style={{ color: "var(--color-danger)" }}
        >
          Couldn&apos;t reach the metrics pipeline
        </span>
        <span
          class="text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          The metrics API returned an error. No data shown rather than fake data.
        </span>
      </div>
    </div>
  );
}

function ChartEmpty(props: { metric: string }): JSX.Element {
  return (
    <div
      class="flex h-[240px] w-full items-center justify-center rounded-xl p-6 text-center"
      style={{
        background: "color-mix(in oklab, var(--color-border) 30%, transparent)",
        border: "1px dashed var(--color-border)",
      }}
    >
      <div class="flex flex-col items-center gap-1">
        <span
          class="text-sm font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          No {props.metric.toLowerCase()} metrics yet
        </span>
        <span
          class="max-w-xs text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          Mimir is reachable but has no samples for this project in the
          selected range. Deploy or generate traffic and the chart will
          fill in — we do not synthesise data.
        </span>
      </div>
    </div>
  );
}
