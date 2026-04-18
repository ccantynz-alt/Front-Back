import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";

// ── Status page (honest edition) ────────────────────────────────────────
//
// This page reflects the live output of the API's /health/monitor endpoint.
// No hardcoded uptime numbers. No Math.random() uptime bars. No claimed
// response times. If the monitor hasn't published a snapshot yet, we say so.
// If the API is unreachable, we say so. Uptime percentages and latency
// averages are computed from the retained health history window.

type RawStatus = "ok" | "degraded" | "down" | "unknown";

interface ServiceCheck {
  readonly name: string;
  readonly status: RawStatus;
  readonly latencyMs: number;
  readonly detail?: string;
}

interface HealthSnapshot {
  readonly timestamp: string;
  readonly overall: RawStatus;
  readonly services: ReadonlyArray<ServiceCheck>;
  readonly memoryMb: number;
  readonly uptimeSec: number;
}

interface HealthMonitorResponse {
  readonly current: HealthSnapshot | null;
  readonly history: ReadonlyArray<HealthSnapshot>;
}

const SERVICE_META: Record<string, { label: string; description: string; icon: string }> = {
  database: {
    label: "Database (Turso)",
    description: "Edge SQLite with embedded replicas",
    icon: "\uD83D\uDDC4\uFE0F",
  },
  qdrant: {
    label: "Vector DB (Qdrant)",
    description: "Embeddings and semantic search",
    icon: "\uD83E\uDDE0",
  },
  stripe: {
    label: "Billing (Stripe)",
    description: "Payment processing and subscriptions",
    icon: "\uD83D\uDCB3",
  },
  email: {
    label: "Email",
    description: "Transactional delivery (Resend / AlecRae)",
    icon: "\u2709\uFE0F",
  },
  sentinel: {
    label: "Sentinel",
    description: "24/7 competitive intelligence collectors",
    icon: "\uD83D\uDEF0\uFE0F",
  },
};

// ── API URL resolution (mirrors lib/trpc.ts) ────────────────────────────

function getApiUrl(): string {
  const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
  const envUrl = meta.env?.VITE_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (hostname === "crontech.ai" || hostname === "www.crontech.ai") {
      return "https://api.crontech.ai";
    }
    if (hostname.endsWith(".pages.dev")) {
      return `${protocol}//${hostname}`;
    }
  }
  return "http://localhost:3001";
}

async function fetchHealth(): Promise<HealthMonitorResponse> {
  const res = await fetch(`${getApiUrl()}/health/monitor`, { cache: "no-store" });
  if (!res.ok) throw new Error(`health endpoint returned ${res.status}`);
  return (await res.json()) as HealthMonitorResponse;
}

// ── Status styling helpers ──────────────────────────────────────────────

interface StatusStyle {
  readonly label: string;
  readonly color: string;
  readonly bgColor: string;
  readonly dotColor: string;
}

function statusConfig(status: RawStatus | "unreachable"): StatusStyle {
  switch (status) {
    case "ok":
      return {
        label: "Operational",
        color: "var(--color-success-text)",
        bgColor: "var(--color-success-bg)",
        dotColor: "var(--color-success)",
      };
    case "degraded":
      return {
        label: "Degraded",
        color: "var(--color-warning)",
        bgColor: "var(--color-warning-bg)",
        dotColor: "var(--color-warning)",
      };
    case "down":
      return {
        label: "Outage",
        color: "var(--color-danger-text)",
        bgColor: "var(--color-danger-bg)",
        dotColor: "var(--color-danger)",
      };
    case "unreachable":
      return {
        label: "Monitor unreachable",
        color: "var(--color-danger-text)",
        bgColor: "var(--color-danger-bg)",
        dotColor: "var(--color-danger)",
      };
    default:
      return {
        label: "Unknown",
        color: "var(--color-text-muted)",
        bgColor: "var(--color-bg-muted)",
        dotColor: "var(--color-text-faint)",
      };
  }
}

function serviceMeta(name: string): { label: string; description: string; icon: string } {
  return SERVICE_META[name] ?? { label: name, description: "Platform service", icon: "\u2699\uFE0F" };
}

// ── History math (no lies) ──────────────────────────────────────────────

function uptimePercent(history: ReadonlyArray<HealthSnapshot>): number | null {
  if (history.length === 0) return null;
  const ok = history.filter((s) => s.overall === "ok").length;
  return (ok / history.length) * 100;
}

function avgLatency(current: HealthSnapshot | null): number | null {
  if (!current || current.services.length === 0) return null;
  // Skip services with zero-latency synthetic checks (e.g. email config probe).
  const measured = current.services.filter((s) => s.latencyMs > 0);
  if (measured.length === 0) return null;
  const sum = measured.reduce((a, s) => a + s.latencyMs, 0);
  return Math.round(sum / measured.length);
}

function p99Latency(history: ReadonlyArray<HealthSnapshot>): number | null {
  const all: number[] = [];
  for (const snap of history) {
    for (const svc of snap.services) {
      if (svc.latencyMs > 0) all.push(svc.latencyMs);
    }
  }
  if (all.length === 0) return null;
  all.sort((a, b) => a - b);
  const idx = Math.min(all.length - 1, Math.floor(all.length * 0.99));
  return all[idx] ?? null;
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3_600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86_400) {
    const h = Math.floor(sec / 3_600);
    const m = Math.floor((sec % 3_600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3_600);
  return `${d}d ${h}h`;
}

function formatWindow(history: ReadonlyArray<HealthSnapshot>): string {
  if (history.length < 2) return "insufficient history";
  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last) return "insufficient history";
  const spanMs = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();
  const spanSec = Math.max(1, Math.floor(spanMs / 1000));
  return formatUptime(spanSec);
}

// ── Recent history bar (real data, not Math.random) ─────────────────────

function HistoryBar(props: { history: ReadonlyArray<HealthSnapshot> }): JSX.Element {
  return (
    <Show
      when={props.history.length > 0}
      fallback={
        <div
          class="flex h-8 items-center justify-center rounded-md text-xs"
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-subtle)",
            color: "var(--color-text-faint)",
          }}
        >
          No health snapshots retained yet.
        </div>
      }
    >
      <div class="flex h-8 items-end gap-[2px]">
        <For each={[...props.history]}>
          {(snap) => {
            const cfg = statusConfig(snap.overall);
            const whenLabel = new Date(snap.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div
                class="h-full min-w-[2px] flex-1 rounded-sm transition-opacity duration-200 hover:opacity-80"
                style={{ background: cfg.dotColor, opacity: "0.7" }}
                title={`${whenLabel} — ${cfg.label}`}
              />
            );
          }}
        </For>
      </div>
    </Show>
  );
}

// ── Incident derivation (from real history) ─────────────────────────────

interface IncidentSummary {
  readonly start: string;
  readonly end: string;
  readonly worst: RawStatus;
  readonly affected: ReadonlyArray<string>;
}

function deriveIncidents(history: ReadonlyArray<HealthSnapshot>): ReadonlyArray<IncidentSummary> {
  const incidents: IncidentSummary[] = [];
  let open: { start: string; end: string; worst: RawStatus; affected: Set<string> } | null = null;

  for (const snap of history) {
    const isIncident = snap.overall === "degraded" || snap.overall === "down";
    if (isIncident) {
      const affected = snap.services
        .filter((s) => s.status === "degraded" || s.status === "down")
        .map((s) => s.name);
      if (!open) {
        open = {
          start: snap.timestamp,
          end: snap.timestamp,
          worst: snap.overall,
          affected: new Set(affected),
        };
      } else {
        open.end = snap.timestamp;
        if (snap.overall === "down") open.worst = "down";
        for (const a of affected) open.affected.add(a);
      }
    } else if (open) {
      incidents.push({
        start: open.start,
        end: open.end,
        worst: open.worst,
        affected: [...open.affected],
      });
      open = null;
    }
  }
  if (open) {
    incidents.push({
      start: open.start,
      end: open.end,
      worst: open.worst,
      affected: [...open.affected],
    });
  }
  return incidents.reverse(); // Newest first
}

// ── Main page ───────────────────────────────────────────────────────────

export default function StatusPage(): JSX.Element {
  const [data, { refetch }] = createResource(fetchHealth);
  const [now, setNow] = createSignal(new Date());

  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    pollTimer = setInterval(() => {
      void refetch();
    }, 30_000);
    clockTimer = setInterval(() => setNow(new Date()), 1_000);
  });
  onCleanup(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (clockTimer) clearInterval(clockTimer);
  });

  const current = (): HealthSnapshot | null => data()?.current ?? null;
  const history = (): ReadonlyArray<HealthSnapshot> => data()?.history ?? [];

  const overall = (): StatusStyle => {
    if (data.error) return statusConfig("unreachable");
    const c = current();
    if (!c) return statusConfig("unknown");
    return statusConfig(c.overall);
  };

  const overallHeadline = (): string => {
    if (data.error) return "Status monitor unreachable";
    const c = current();
    if (!c) return "Waiting for first health snapshot";
    if (c.overall === "ok") return "All systems operational";
    if (c.overall === "degraded") return "Degraded performance";
    if (c.overall === "down") return "Major outage";
    return "Status unknown";
  };

  const lastUpdatedLabel = (): string => {
    const c = current();
    if (!c) return now().toLocaleString();
    return new Date(c.timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    });
  };

  return (
    <>
      <SEOHead
        title="System Status"
        description="Live operational status for Crontech. Numbers are computed from real health snapshots, not marketing claims."
        path="/status"
      />

      <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
        {/* Hero */}
        <div class="relative overflow-hidden">
          <div class="relative mx-auto max-w-4xl px-6 pt-20 pb-12">
            <div class="flex flex-col items-center text-center">
              <h1
                class="text-4xl font-bold tracking-tight sm:text-5xl"
                style={{
                  color: "var(--color-text)",
                  "line-height": "1.1",
                }}
              >
                System Status
              </h1>
              <p class="mt-3 text-sm" style={{ color: "var(--color-text-faint)" }}>
                Last snapshot: {lastUpdatedLabel()}
              </p>

              <div
                class="mt-8 w-full max-w-lg rounded-2xl p-6"
                style={{
                  background: overall().bgColor,
                  border: "1px solid var(--color-border)",
                }}
              >
                <div class="flex items-center justify-center gap-3">
                  <div class="relative">
                    <div
                      class="h-3 w-3 rounded-full"
                      style={{ background: overall().dotColor }}
                    />
                    <div
                      class="absolute inset-0 h-3 w-3 animate-ping rounded-full opacity-50"
                      style={{ background: overall().dotColor }}
                    />
                  </div>
                  <span class="text-xl font-semibold" style={{ color: overall().color }}>
                    {overallHeadline()}
                  </span>
                </div>
                <Show when={data.error}>
                  <p class="mt-2 text-xs" style={{ color: "var(--color-text-faint)" }}>
                    Could not reach the monitor endpoint. The API may be restarting or
                    the browser may be offline. Retrying every 30s.
                  </p>
                </Show>
              </div>
            </div>
          </div>
        </div>

        {/* Services */}
        <div class="mx-auto max-w-4xl px-6 pb-8">
          <div class="mb-6 flex items-center justify-between">
            <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Service Status</h2>
            <span class="font-mono text-xs" style={{ color: "var(--color-text-faint)" }}>
              {current()?.services.length ?? 0} services monitored
            </span>
          </div>

          <Show
            when={current()}
            fallback={
              <div
                class="rounded-2xl p-10 text-center"
                style={{
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-subtle)",
                }}
              >
                <Show when={data.loading}>
                  <p class="text-sm" style={{ color: "var(--color-text-faint)" }}>Loading health data…</p>
                </Show>
                <Show when={data.error}>
                  <p class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    Monitor endpoint unreachable. No live service data to display.
                  </p>
                </Show>
                <Show when={!data.loading && !data.error && !current()}>
                  <p class="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    Monitor is running but has not published a snapshot yet. Check back in a minute.
                  </p>
                </Show>
              </div>
            }
          >
            {(snap) => (
              <div
                class="overflow-hidden rounded-2xl"
                style={{
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-elevated)",
                }}
              >
                <For each={snap().services}>
                  {(service, index) => {
                    const cfg = statusConfig(service.status);
                    const meta = serviceMeta(service.name);
                    return (
                      <div
                        class="flex items-center gap-4 px-6 py-4 transition-colors duration-200"
                        style={{
                          "border-bottom":
                            index() < snap().services.length - 1
                              ? "1px solid var(--color-border)"
                              : "none",
                        }}
                      >
                        <span class="w-8 shrink-0 text-center text-lg">{meta.icon}</span>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2">
                            <span class="text-sm font-medium" style={{ color: "var(--color-text)" }}>{meta.label}</span>
                          </div>
                          <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>
                            {service.detail ?? meta.description}
                          </span>
                        </div>

                        <div class="hidden shrink-0 items-center gap-6 sm:flex">
                          <div class="text-right">
                            <span class="block text-xs" style={{ color: "var(--color-text-faint)" }}>Latency</span>
                            <span class="font-mono text-sm" style={{ color: "var(--color-text-secondary)" }}>
                              {service.latencyMs > 0 ? `${service.latencyMs}ms` : "—"}
                            </span>
                          </div>
                        </div>

                        <div
                          class="flex shrink-0 items-center gap-2 rounded-full px-3 py-1"
                          style={{ background: cfg.bgColor }}
                        >
                          <div
                            class="h-2 w-2 rounded-full"
                            style={{ background: cfg.dotColor }}
                          />
                          <span class="text-xs font-medium" style={{ color: cfg.color }}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            )}
          </Show>
        </div>

        {/* Recent history bar */}
        <div class="mx-auto max-w-4xl px-6 pb-8">
          <div
            class="rounded-2xl p-6"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-elevated)",
            }}
          >
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                Recent Uptime
                <span class="ml-2 font-normal" style={{ color: "var(--color-text-faint)" }}>
                  (window: {formatWindow(history())}, {history().length} snapshots)
                </span>
              </h3>
              <div class="flex items-center gap-4 text-xs" style={{ color: "var(--color-text-faint)" }}>
                <span class="flex items-center gap-1.5">
                  <span
                    class="inline-block h-2 w-2 rounded-sm"
                    style={{ background: "var(--color-success)", opacity: "0.7" }}
                  />
                  Operational
                </span>
                <span class="flex items-center gap-1.5">
                  <span
                    class="inline-block h-2 w-2 rounded-sm"
                    style={{ background: "var(--color-warning)", opacity: "0.7" }}
                  />
                  Degraded
                </span>
                <span class="flex items-center gap-1.5">
                  <span
                    class="inline-block h-2 w-2 rounded-sm"
                    style={{ background: "var(--color-danger)", opacity: "0.7" }}
                  />
                  Outage
                </span>
              </div>
            </div>
            <HistoryBar history={history()} />
            <p class="mt-3 text-xs" style={{ color: "var(--color-text-faint)" }}>
              The API retains the last 1,000 health checks (one per minute). Longer
              history requires a dedicated time-series store — tracked under BLK-011.
            </p>
          </div>
        </div>

        {/* Real metrics grid */}
        <div class="mx-auto max-w-4xl px-6 pb-8">
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(() => {
              const c = current();
              const h = history();
              const pct = uptimePercent(h);
              const avg = avgLatency(c);
              const p99 = p99Latency(h);
              const stats: ReadonlyArray<{ label: string; value: string; sub: string }> = [
                {
                  label: "Avg latency",
                  value: avg !== null ? `${avg}ms` : "—",
                  sub: "current snapshot",
                },
                {
                  label: "Uptime (window)",
                  value: pct !== null ? `${pct.toFixed(2)}%` : "—",
                  sub: `across ${h.length} snapshots`,
                },
                {
                  label: "P99 latency",
                  value: p99 !== null ? `${p99}ms` : "—",
                  sub: "retained window",
                },
                {
                  label: "API uptime",
                  value: c ? formatUptime(c.uptimeSec) : "—",
                  sub: c ? `heap: ${c.memoryMb} MB` : "awaiting snapshot",
                },
              ];
              return (
                <For each={stats}>
                  {(stat) => (
                    <div
                      class="rounded-xl p-4 text-center"
                      style={{
                        border: "1px solid var(--color-border)",
                        background: "var(--color-bg-elevated)",
                      }}
                    >
                      <div class="text-xl font-bold" style={{ color: "var(--color-text)" }}>{stat.value}</div>
                      <div class="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{stat.label}</div>
                      <div class="mt-0.5 text-xs" style={{ color: "var(--color-text-faint)" }}>{stat.sub}</div>
                    </div>
                  )}
                </For>
              );
            })()}
          </div>
        </div>

        {/* Incident history — derived from real snapshots */}
        <div class="mx-auto max-w-4xl px-6 pb-20">
          <h2 class="mb-6 text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Incidents in retained window
          </h2>
          {(() => {
            const incidents = deriveIncidents(history());
            if (incidents.length === 0) {
              return (
                <div
                  class="rounded-2xl p-8 text-center"
                  style={{
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg-elevated)",
                  }}
                >
                  <div class="mb-3 text-3xl opacity-30">{"\u2705"}</div>
                  <p class="font-medium" style={{ color: "var(--color-text-muted)" }}>
                    No incidents in the retained history window
                  </p>
                  <p class="mt-1 text-sm" style={{ color: "var(--color-text-faint)" }}>
                    {history().length === 0
                      ? "(no snapshots yet)"
                      : `All ${history().length} snapshots reported healthy.`}
                  </p>
                </div>
              );
            }
            return (
              <div class="space-y-3">
                <For each={incidents}>
                  {(incident) => {
                    const cfg = statusConfig(incident.worst);
                    const start = new Date(incident.start);
                    const end = new Date(incident.end);
                    const durationMs = end.getTime() - start.getTime();
                    const durationSec = Math.max(60, Math.floor(durationMs / 1000));
                    return (
                      <div
                        class="rounded-2xl p-5"
                        style={{
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg-elevated)",
                        }}
                      >
                        <div class="flex items-start justify-between gap-4">
                          <div>
                            <div class="flex items-center gap-2">
                              <span
                                class="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                                style={{ background: cfg.bgColor, color: cfg.color }}
                              >
                                {cfg.label}
                              </span>
                              <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                                {start.toLocaleString()} — {end.toLocaleString()}
                              </span>
                            </div>
                            <p class="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                              Duration: {formatUptime(durationSec)} · Affected:{" "}
                              {incident.affected.length > 0
                                ? incident.affected.join(", ")
                                : "overall platform"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );
}
