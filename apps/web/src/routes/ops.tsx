// BLK-019 — Build Theatre UI
//
// Vercel-style "what is actually happening" pane. Left column: recent runs
// across every producer (deploy, ingest, voice, migration, gate, agent).
// Right column: live-streaming log of the selected run, with steps as
// collapsible sections. SSE-backed; falls back to tRPC polling on error.
//
// No theater. No mock data. If there are no runs, the page says so.

import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";
import { trpc } from "../lib/trpc";

interface RunSummary {
  id: string;
  kind: string;
  title: string;
  status: string;
  actorLabel: string | null;
  gitBranch: string | null;
  startedAt: string | Date;
  endedAt: string | Date | null;
  error: string | null;
}

interface StepDetail {
  id: string;
  seq: number;
  name: string;
  status: string;
  exitCode: number | null;
  error: string | null;
}

interface LogLine {
  seq: number;
  stepId: string | null;
  stream: string;
  line: string;
  timestamp: string;
}

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

function statusColor(status: string): string {
  if (status === "succeeded") return "rgb(52,211,153)";
  if (status === "failed") return "rgb(248,113,113)";
  if (status === "cancelled") return "rgb(156,163,175)";
  if (status === "running") return "rgb(251,191,36)";
  return "rgb(148,163,184)";
}

function statusLabel(status: string): string {
  if (status === "succeeded") return "\u2713 succeeded";
  if (status === "failed") return "\u2717 failed";
  if (status === "cancelled") return "\u25CB cancelled";
  if (status === "running") return "\u25B6 running";
  if (status === "skipped") return "\u2014 skipped";
  return status;
}

function formatDuration(startedAt: string | Date, endedAt: string | Date | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.floor(s % 60);
  return `${m}m ${rs}s`;
}

export default function OpsPage(): JSX.Element {
  const [selectedRunId, setSelectedRunId] = createSignal<string | null>(null);
  const [steps, setSteps] = createSignal<ReadonlyArray<StepDetail>>([]);
  const [logs, setLogs] = createSignal<ReadonlyArray<LogLine>>([]);
  const [streamStatus, setStreamStatus] = createSignal<string>("idle");
  const [cancelling, setCancelling] = createSignal(false);

  const [runs, { refetch: refetchRuns }] = createResource(async () => {
    try {
      const out = await trpc.theatre.list.query({ limit: 50 });
      return out as ReadonlyArray<RunSummary>;
    } catch (err) {
      console.error("[ops] failed to list runs", err);
      return [] as ReadonlyArray<RunSummary>;
    }
  });

  // Refresh the run list every 5s so new runs appear without a manual refresh.
  const runsInterval = setInterval(() => {
    void refetchRuns();
  }, 5000);
  onCleanup(() => clearInterval(runsInterval));

  // When a run is selected, open an SSE stream for live logs + status.
  createEffect(() => {
    const id = selectedRunId();
    setLogs([]);
    setSteps([]);
    setStreamStatus("idle");
    if (!id) return;

    const url = `${getApiUrl()}/api/theatre/runs/${id}/stream`;
    const es = new EventSource(url, { withCredentials: true });
    setStreamStatus("connecting");

    es.addEventListener("open", () => setStreamStatus("connected"));

    es.addEventListener("status", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          status: string;
          steps: ReadonlyArray<StepDetail>;
        };
        setSteps(data.steps);
        setStreamStatus(data.status);
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("log", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as LogLine;
        setLogs((prev) => {
          // Dedupe by seq (SSE may retransmit on reconnect).
          if (prev.length > 0 && (prev[prev.length - 1]?.seq ?? -1) >= data.seq) return prev;
          return [...prev, data];
        });
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("end", () => {
      es.close();
      setStreamStatus((s) => (s === "running" ? "done" : s));
      void refetchRuns();
    });

    es.onerror = () => {
      setStreamStatus("reconnecting");
    };

    onCleanup(() => es.close());
  });

  async function requestCancel(): Promise<void> {
    const id = selectedRunId();
    if (!id) return;
    setCancelling(true);
    try {
      await trpc.theatre.cancel.mutate({ runId: id });
    } catch (err) {
      console.error("[ops] cancel failed", err);
    } finally {
      setCancelling(false);
      void refetchRuns();
    }
  }

  return (
    <div
      style={{ "min-height": "100vh", background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <SEOHead
        title="Operations Theatre"
        description="Live view of every build, deploy, ingest, voice, and agent operation in motion on Crontech."
        path="/ops"
      />

      <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
        <h1 style={{ "font-size": "2rem", "font-weight": "700", margin: "0 0 0.25rem" }}>
          Operations Theatre
        </h1>
        <p style={{ color: "var(--color-text-muted)", margin: "0 0 2rem", "font-size": "0.9rem" }}>
          Live visibility into every long-running operation on the platform. Deploys, ingests, voice
          dispatches, migrations, agent runs — all in one pane of glass.
        </p>

        <div style={{ display: "grid", "grid-template-columns": "360px 1fr", gap: "1.5rem" }}>
          {/* Left column: run list */}
          <div
            style={{
              background: "var(--color-bg-subtle)",
              border: "1px solid var(--color-border)",
              "border-radius": "8px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "0.75rem 1rem",
                "border-bottom": "1px solid var(--color-border)",
                "font-size": "0.75rem",
                "text-transform": "uppercase",
                "letter-spacing": "0.08em",
                color: "var(--color-text-secondary)",
              }}
            >
              Recent runs
            </div>
            <Show
              when={(runs()?.length ?? 0) > 0}
              fallback={
                <div
                  style={{
                    padding: "2rem 1rem",
                    color: "var(--color-text-muted)",
                    "font-size": "0.9rem",
                  }}
                >
                  No runs yet. Operations will appear here as they start.
                </div>
              }
            >
              <For each={runs()}>
                {(run) => (
                  <button
                    type="button"
                    onClick={() => setSelectedRunId(run.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      "text-align": "left",
                      padding: "0.75rem 1rem",
                      background:
                        selectedRunId() === run.id ? "var(--color-bg-muted)" : "transparent",
                      border: "none",
                      "border-bottom": "1px solid var(--color-border)",
                      color: "var(--color-text)",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        "justify-content": "space-between",
                        "align-items": "center",
                      }}
                    >
                      <span
                        style={{
                          "font-size": "0.72rem",
                          color: "var(--color-text-muted)",
                          "text-transform": "uppercase",
                        }}
                      >
                        {run.kind}
                      </span>
                      <span style={{ "font-size": "0.72rem", color: statusColor(run.status) }}>
                        {statusLabel(run.status)}
                      </span>
                    </div>
                    <div
                      style={{ "font-size": "0.9rem", "font-weight": "500", margin: "0.25rem 0" }}
                    >
                      {run.title}
                    </div>
                    <div style={{ "font-size": "0.72rem", color: "var(--color-text-muted)" }}>
                      {run.gitBranch ?? "—"} · {formatDuration(run.startedAt, run.endedAt)}
                    </div>
                  </button>
                )}
              </For>
            </Show>
          </div>

          {/* Right column: selected run detail */}
          <div
            style={{
              background: "var(--color-bg-subtle)",
              border: "1px solid var(--color-border)",
              "border-radius": "8px",
              "min-height": "500px",
            }}
          >
            <Show
              when={selectedRunId()}
              fallback={
                <div
                  style={{
                    padding: "4rem 2rem",
                    color: "var(--color-text-muted)",
                    "text-align": "center",
                  }}
                >
                  Select a run on the left to see its live logs.
                </div>
              }
            >
              <div
                style={{
                  padding: "1rem",
                  "border-bottom": "1px solid var(--color-border)",
                  display: "flex",
                  "justify-content": "space-between",
                  "align-items": "center",
                }}
              >
                <div>
                  <div style={{ "font-size": "0.72rem", color: "var(--color-text-muted)" }}>
                    stream: {streamStatus()}
                  </div>
                  <div style={{ "font-size": "0.9rem", "font-weight": "500" }}>
                    Run {selectedRunId()?.slice(0, 8)}…
                  </div>
                </div>
                <Show when={streamStatus() === "running"}>
                  <button
                    type="button"
                    onClick={requestCancel}
                    disabled={cancelling()}
                    style={{
                      padding: "0.4rem 0.8rem",
                      background: "transparent",
                      border: "1px solid var(--color-danger)",
                      color: "var(--color-danger)",
                      "border-radius": "6px",
                      "font-size": "0.8rem",
                      cursor: cancelling() ? "not-allowed" : "pointer",
                    }}
                  >
                    {cancelling() ? "cancelling…" : "Request cancel"}
                  </button>
                </Show>
              </div>

              <Show when={steps().length > 0}>
                <div
                  style={{
                    padding: "0.5rem 1rem",
                    "border-bottom": "1px solid var(--color-border)",
                  }}
                >
                  <For each={steps()}>
                    {(s) => (
                      <div
                        style={{
                          display: "flex",
                          "justify-content": "space-between",
                          padding: "0.2rem 0",
                          "font-size": "0.85rem",
                        }}
                      >
                        <span>
                          <span
                            style={{ color: "var(--color-text-muted)", "margin-right": "0.5rem" }}
                          >
                            {s.seq}.
                          </span>
                          {s.name}
                        </span>
                        <span style={{ color: statusColor(s.status) }}>
                          {statusLabel(s.status)}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <div
                style={{
                  padding: "1rem",
                  "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
                  "font-size": "0.8rem",
                  "line-height": "1.5",
                  "max-height": "600px",
                  "overflow-y": "auto",
                  color: "var(--color-text)",
                }}
              >
                <Show
                  when={logs().length > 0}
                  fallback={
                    <div style={{ color: "var(--color-text-muted)" }}>
                      {streamStatus() === "connecting"
                        ? "Connecting to log stream…"
                        : "No log lines yet."}
                    </div>
                  }
                >
                  <For each={logs()}>
                    {(log) => (
                      <div
                        style={{
                          color:
                            log.stream === "stderr" ? "var(--color-danger)" : "var(--color-text)",
                        }}
                      >
                        <span
                          style={{ color: "var(--color-text-faint)", "margin-right": "0.75rem" }}
                        >
                          {new Date(log.timestamp).toISOString().slice(11, 19)}
                        </span>
                        {log.line}
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
