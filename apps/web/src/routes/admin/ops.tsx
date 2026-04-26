// ── /admin/ops ───────────────────────────────────────────────────────
// Admin-only Operations console. Surfaces the data the deploy-agent
// already exposes (deploy state, services, recent commits, deploy
// drift, diagnose battery) in a single read-friendly dashboard so an
// admin can see "is the box healthy?" without an SSH session.
//
// Authorized as a free-action under CLAUDE.md §0.7 (admin-only sub-route
// under /admin/*). Renders behind AdminRoute the same way every other
// /admin/* page does.
//
// All data comes from the deploy-agent on 127.0.0.1:9091 via the API
// admin-deploy proxies:
//   GET /api/admin/deploy/status  — services + current SHA + deploying flag
//   GET /api/admin/git/log        — recent commits
//   GET /api/admin/git/drift      — local vs origin/Main
//   GET /api/admin/diagnose       — fast read-only health battery

import { Title } from "@solidjs/meta";
import { createSignal, createResource, For, Show, type JSX } from "solid-js";
import { A } from "@solidjs/router";
import { AdminRoute } from "../../components/AdminRoute";

// ── Types ───────────────────────────────────────────────────────────

interface DeployStatus {
  services: Record<string, string>;
  sha: string;
  deploying: boolean;
  uptime: string;
}

interface GitCommit {
  sha: string;
  subject: string;
  date: string;
}

interface GitDrift {
  localSha: string;
  originSha: string;
  ahead: number;
  behind: number;
  dirty: boolean;
}

interface DiagnoseCheck {
  name: string;
  ok: boolean;
  detail: string;
}

interface DiagnoseResult {
  services: Record<string, string>;
  checks: DiagnoseCheck[];
}

// ── Pure helpers (exported for tests) ───────────────────────────────

/**
 * Build a human-readable label for the deploy drift state. Used in
 * the drift card header so an admin can see "in sync" vs "12 commits
 * behind, dirty tree" at a glance.
 */
export function formatDriftLabel(drift: GitDrift): string {
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

/**
 * Decide the colour token for the drift state. Green when in sync,
 * warning when behind/ahead or dirty.
 */
export function driftColor(drift: GitDrift): string {
  if (drift.ahead === 0 && drift.behind === 0 && !drift.dirty) {
    return "var(--color-success)";
  }
  return "var(--color-warning)";
}

/**
 * A commit is "deployed" if its short SHA matches the SHA currently
 * checked out on the box. The deploy-agent returns short SHAs from
 * `git log -n` and `git rev-parse --short HEAD` so a string compare
 * is sufficient.
 */
export function isCommitDeployed(commitSha: string, localSha: string): boolean {
  if (!commitSha || !localSha) return false;
  return commitSha.trim() === localSha.trim();
}

/**
 * Categorise a service's `systemctl is-active` state into a colour
 * bucket. Matches the existing palette used on the /admin index.
 */
export function serviceColor(state: string): string {
  if (state === "active") return "var(--color-success)";
  if (state === "inactive" || state === "unknown") return "var(--color-text-muted)";
  return "var(--color-danger)";
}

// ── Auth header helper ──────────────────────────────────────────────

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("ct_token") ?? "";
  return { Authorization: `Bearer ${token}` };
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Page shell ──────────────────────────────────────────────────────

export default function AdminOpsPage(): JSX.Element {
  return (
    <AdminRoute>
      <AdminOpsContent />
    </AdminRoute>
  );
}

// ── Content ─────────────────────────────────────────────────────────

function AdminOpsContent(): JSX.Element {
  const [status, { refetch: refetchStatus }] = createResource<DeployStatus | null>(
    () => fetchJson<DeployStatus>("/api/admin/deploy/status"),
  );
  const [commits, { refetch: refetchCommits }] = createResource<GitCommit[]>(
    async () => {
      const body = await fetchJson<{ ok: boolean; commits?: GitCommit[] }>(
        "/api/admin/git/log?limit=20",
      );
      return body?.commits ?? [];
    },
  );
  const [drift, { refetch: refetchDrift }] = createResource<GitDrift | null>(
    () => fetchJson<GitDrift>("/api/admin/git/drift"),
  );

  const [diagnose, setDiagnose] = createSignal<DiagnoseResult | null>(null);
  const [diagnoseRunning, setDiagnoseRunning] = createSignal(false);
  const [diagnoseError, setDiagnoseError] = createSignal<string | null>(null);

  const refreshAll = (): void => {
    refetchStatus();
    refetchCommits();
    refetchDrift();
  };

  const runDiagnose = async (): Promise<void> => {
    setDiagnoseRunning(true);
    setDiagnoseError(null);
    try {
      const body = await fetchJson<{ ok: boolean; services: Record<string, string>; checks: DiagnoseCheck[]; error?: string }>(
        "/api/admin/diagnose",
      );
      if (!body || !body.ok) {
        setDiagnoseError(body?.error ?? "Diagnose request failed");
        setDiagnose(null);
      } else {
        setDiagnose({ services: body.services, checks: body.checks });
      }
    } finally {
      setDiagnoseRunning(false);
    }
  };

  return (
    <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Operations - Crontech Admin</Title>

      <div class="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div class="mb-8 flex items-end justify-between">
          <div>
            <nav
              aria-label="Breadcrumb"
              class="mb-2 flex items-center gap-2 text-xs"
              style={{ color: "var(--color-text-faint)" }}
            >
              <A
                href="/admin"
                class="font-medium transition-colors"
                style={{ color: "var(--color-text-muted)" }}
              >
                Admin
              </A>
              <span aria-hidden="true">›</span>
              <span class="font-semibold" style={{ color: "var(--color-text)" }}>
                Operations
              </span>
            </nav>
            <h1
              class="text-3xl font-bold tracking-tight"
              style={{ color: "var(--color-text)" }}
            >
              Operations Console
            </h1>
            <p class="mt-1 text-sm" style={{ color: "var(--color-text-faint)" }}>
              Live state of the production box — deploy drift, recent commits, service
              health, and a one-click diagnose battery. All data fetched from the deploy
              agent over localhost.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={refreshAll}
              class="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200"
              style={{
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-subtle)",
                color: "var(--color-text-secondary)",
              }}
            >
              <span class="text-base">&#8635;</span>
              Refresh all
            </button>
            <A
              href="/admin"
              class="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200"
              style={{
                background: "var(--color-primary)",
                color: "var(--color-primary-text)",
              }}
            >
              <span class="text-base">&#128640;</span>
              Deploy panel
            </A>
          </div>
        </div>

        {/* Drift card */}
        <DriftCard drift={drift()} loading={drift.loading} />

        {/* Two-column body: services + recent commits */}
        <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div class="lg:col-span-2">
            <CommitList
              commits={commits() ?? []}
              loading={commits.loading}
              localSha={status()?.sha ?? ""}
            />
          </div>
          <div class="flex flex-col gap-6">
            <ServicesCard status={status()} loading={status.loading} />
            <DiagnoseCard
              result={diagnose()}
              running={diagnoseRunning()}
              error={diagnoseError()}
              onRun={() => void runDiagnose()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Drift card ──────────────────────────────────────────────────────

function DriftCard(props: {
  drift: GitDrift | null | undefined;
  loading: boolean;
}): JSX.Element {
  return (
    <div
      class="rounded-2xl p-6"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <Show
        when={!props.loading}
        fallback={
          <div class="flex items-center gap-2 py-2">
            <div class="loading-spinner" />
            <span class="text-sm" style={{ color: "var(--color-text-faint)" }}>
              Checking deploy drift…
            </span>
          </div>
        }
      >
        <Show
          when={props.drift}
          fallback={
            <p class="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Deploy agent unreachable. Drift state unknown.
            </p>
          }
        >
          {(d) => (
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div class="flex flex-col gap-1">
                <span
                  class="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Deploy drift
                </span>
                <span
                  class="text-xl font-bold tracking-tight"
                  style={{ color: driftColor(d()) }}
                >
                  {formatDriftLabel(d())}
                </span>
              </div>
              <div class="flex flex-col gap-1 text-right">
                <span
                  class="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Box · origin/Main
                </span>
                <span
                  class="font-mono text-sm"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {d().localSha} &middot; {d().originSha}
                </span>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}

// ── Recent commits ──────────────────────────────────────────────────

function CommitList(props: {
  commits: GitCommit[];
  loading: boolean;
  localSha: string;
}): JSX.Element {
  return (
    <div
      class="rounded-2xl p-6"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Recent commits
          </h2>
          <p class="text-xs" style={{ color: "var(--color-text-faint)" }}>
            Last 20 commits on the deployed branch. The deployed SHA is highlighted.
          </p>
        </div>
      </div>
      <Show
        when={!props.loading}
        fallback={
          <div class="flex items-center gap-2 py-6">
            <div class="loading-spinner" />
            <span class="text-sm" style={{ color: "var(--color-text-faint)" }}>
              Loading commit history…
            </span>
          </div>
        }
      >
        <Show
          when={props.commits.length > 0}
          fallback={
            <p class="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No commit history available — deploy agent unreachable.
            </p>
          }
        >
          <ul class="flex flex-col gap-2">
            <For each={props.commits}>
              {(commit) => (
                <CommitRow commit={commit} deployed={isCommitDeployed(commit.sha, props.localSha)} />
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}

function CommitRow(props: { commit: GitCommit; deployed: boolean }): JSX.Element {
  return (
    <li
      class="flex items-center gap-4 rounded-xl px-4 py-3 transition-all"
      style={{
        background: props.deployed
          ? "color-mix(in oklab, var(--color-success) 6%, transparent)"
          : "var(--color-bg-subtle)",
        border: props.deployed
          ? "1px solid color-mix(in oklab, var(--color-success) 30%, transparent)"
          : "1px solid var(--color-border)",
      }}
    >
      <span
        class="font-mono text-xs font-semibold"
        style={{ color: props.deployed ? "var(--color-success)" : "var(--color-text-muted)" }}
      >
        {props.commit.sha}
      </span>
      <span
        class="min-w-0 flex-1 truncate text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {props.commit.subject}
      </span>
      <span class="text-[11px]" style={{ color: "var(--color-text-faint)" }}>
        {props.commit.date}
      </span>
      <Show when={props.deployed}>
        <span
          class="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: "color-mix(in oklab, var(--color-success) 15%, transparent)",
            color: "var(--color-success)",
          }}
        >
          deployed
        </span>
      </Show>
    </li>
  );
}

// ── Services card ───────────────────────────────────────────────────

function ServicesCard(props: {
  status: DeployStatus | null | undefined;
  loading: boolean;
}): JSX.Element {
  return (
    <div
      class="rounded-2xl p-6"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <h2
        class="mb-4 text-lg font-semibold"
        style={{ color: "var(--color-text)" }}
      >
        Services
      </h2>
      <Show
        when={!props.loading}
        fallback={
          <div class="flex items-center gap-2 py-2">
            <div class="loading-spinner" />
            <span class="text-sm" style={{ color: "var(--color-text-faint)" }}>
              Querying systemd…
            </span>
          </div>
        }
      >
        <Show
          when={props.status}
          fallback={
            <p class="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Deploy agent unreachable.
            </p>
          }
        >
          {(s) => (
            <div class="flex flex-col gap-2">
              <For each={Object.entries(s().services)}>
                {([svc, state]) => (
                  <div
                    class="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{
                      background: "var(--color-bg-subtle)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="h-2.5 w-2.5 rounded-full"
                        style={{ background: serviceColor(state) }}
                      />
                      <span
                        class="text-sm font-medium"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {svc}
                      </span>
                    </div>
                    <span
                      class="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        background: `color-mix(in oklab, ${serviceColor(state)} 10%, transparent)`,
                        color: serviceColor(state),
                      }}
                    >
                      {state}
                    </span>
                  </div>
                )}
              </For>
              <div
                class="mt-1 text-[10px]"
                style={{ color: "var(--color-text-faint)" }}
              >
                Box uptime: {s().uptime || "unknown"}
              </div>
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}

// ── Diagnose card ───────────────────────────────────────────────────

function DiagnoseCard(props: {
  result: DiagnoseResult | null;
  running: boolean;
  error: string | null;
  onRun: () => void;
}): JSX.Element {
  return (
    <div
      class="rounded-2xl p-6"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Diagnose
        </h2>
        <button
          type="button"
          onClick={props.onRun}
          disabled={props.running}
          class="rounded-xl px-4 py-2 text-xs font-semibold transition-all disabled:opacity-50"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-primary-text)",
          }}
        >
          {props.running ? "Running…" : "Run diagnose"}
        </button>
      </div>
      <p class="mb-3 text-xs" style={{ color: "var(--color-text-faint)" }}>
        Hits the API health route, the web origin, and confirms every systemd unit
        is active. Read-only — safe to run anytime.
      </p>
      <Show when={props.error}>
        <p
          class="mb-3 text-xs"
          style={{ color: "var(--color-danger)" }}
        >
          {props.error}
        </p>
      </Show>
      <Show when={props.result}>
        {(r) => (
          <ul class="flex flex-col gap-1.5">
            <For each={r().checks}>
              {(check) => (
                <li
                  class="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{
                    background: "var(--color-bg-subtle)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div class="flex items-center gap-2">
                    <span
                      style={{
                        color: check.ok ? "var(--color-success)" : "var(--color-danger)",
                        "font-weight": 700,
                      }}
                    >
                      {check.ok ? "✓" : "✗"}
                    </span>
                    <span
                      class="font-mono text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {check.name}
                    </span>
                  </div>
                  <span
                    class="text-[11px]"
                    style={{ color: "var(--color-text-faint)" }}
                  >
                    {check.detail}
                  </span>
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
    </div>
  );
}
