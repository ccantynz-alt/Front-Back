import { Title } from "@solidjs/meta";
import { createSignal, createResource, For, Show, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { AdminRoute } from "../components/AdminRoute";
import { PlatformSiblingsWidget } from "../components/PlatformSiblingsWidget";
import { trpc } from "../lib/trpc";
import { showToast } from "../components/Toast";

// BLK-013: single-source-of-truth stats shape. Kept inline rather than
// imported from the API package so the web bundle stays lean.
interface AdminStats {
  totalUsers: number;
  activeSessions: number;
  totalDeployments: number;
  deploymentsThisMonth: number;
  claudeSpendMonthUsd: number;
}

// ── Stat Card ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sublabel: string;
  icon: string;
  accentColor: string;
}

function StatCard(props: StatCardProps): JSX.Element {
  return (
    <div
      class="relative overflow-hidden rounded-2xl p-6 transition-all duration-300 group"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div class="relative z-10 flex items-start justify-between">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--color-text-faint)" }}>
            {props.label}
          </span>
          <span class="text-3xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>
            {props.value}
          </span>
          <span class="mt-1 text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>{props.sublabel}</span>
        </div>
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
          style={{
            background: `color-mix(in oklab, ${props.accentColor} 13%, transparent)`,
            color: props.accentColor,
          }}
        >
          {props.icon}
        </div>
      </div>
      <div
        class="absolute bottom-0 left-0 h-[2px] w-full"
        style={{ background: props.accentColor, opacity: "0.4" }}
      />
    </div>
  );
}

// ── Health Row ────────────────────────────────────────────────────────

type HealthStatus = "ok" | "error" | "active" | "inactive";

function HealthRow(props: { label: string; status: HealthStatus; detail?: string }): JSX.Element {
  const statusColor = (): string => {
    if (props.status === "ok" || props.status === "active") return "var(--color-success)";
    if (props.status === "inactive") return "var(--color-text-muted)";
    return "var(--color-danger)";
  };

  return (
    <div class="flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-200" style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)" }}>
      <div class="flex items-center gap-3">
        <div
          class="h-2.5 w-2.5 rounded-full"
          style={{ background: statusColor() }}
        />
        <span class="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>{props.label}</span>
      </div>
      <div class="flex items-center gap-3">
        <Show when={props.detail}>
          <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>{props.detail}</span>
        </Show>
        <span
          class="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: `color-mix(in oklab, ${statusColor()} 10%, transparent)`, color: statusColor() }}
        >
          {props.status}
        </span>
      </div>
    </div>
  );
}

// ── User Row ─────────────────────────────────────────────────────────

type UserRole = "admin" | "editor" | "viewer";

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: Date | string;
}

function initialsFor(user: AdminUser): string {
  const source = user.displayName ?? user.email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

function UserRow(props: {
  user: AdminUser;
  onChangeRole: (role: UserRole) => void;
  pending: boolean;
}): JSX.Element {
  const roleColor = (): string => {
    if (props.user.role === "admin") return "var(--color-primary)";
    if (props.user.role === "editor") return "var(--color-primary)";
    return "var(--color-text-muted)";
  };

  return (
    <div class="flex items-center gap-4 rounded-xl px-4 py-3.5 transition-all duration-200" style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)" }}>
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: roleColor(), color: "var(--color-text)" }}
      >
        {initialsFor(props.user)}
      </div>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm font-medium" style={{ color: "var(--color-text)" }}>
          {props.user.displayName ?? props.user.email}
        </span>
        <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>{props.user.email}</span>
      </div>
      <select
        value={props.user.role}
        disabled={props.pending}
        onChange={(e) => props.onChangeRole(e.currentTarget.value as UserRole)}
        class="w-24 rounded-lg px-2 py-1.5 text-xs outline-none transition-colors duration-200 disabled:opacity-50"
        style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}
      >
        <option value="admin">admin</option>
        <option value="editor">editor</option>
        <option value="viewer">viewer</option>
      </select>
      <span class="w-32 text-right text-xs" style={{ color: "var(--color-text-faint)" }}>
        {new Date(props.user.createdAt).toLocaleDateString()}
      </span>
    </div>
  );
}

// ── Admin Dashboard Page ─────────────────────────────────────────────

export default function AdminPage(): JSX.Element {
  return (
    <AdminRoute>
      <AdminPageContent />
    </AdminRoute>
  );
}

function AdminPageContent(): JSX.Element {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = createSignal("");
  const [filterRole, setFilterRole] = createSignal<string>("all");
  const [pendingUserId, setPendingUserId] = createSignal<string | null>(null);

  // BLK-013: one tRPC query backs all five tiles. Returns AdminStats
  // or throws — the createResource error() channel surfaces a polite
  // fallback so a red Claude/DB blip never crashes the dashboard.
  const [stats, { refetch: refetchStats }] = createResource<AdminStats>(
    async () => trpc.admin.stats.query(),
  );
  const [users, { refetch: refetchUsers }] = createResource(async () =>
    (await trpc.admin.getRecentUsers.query()) as AdminUser[],
  );
  const [health, { refetch: refetchHealth }] = createResource(async () =>
    trpc.admin.getSystemHealth.query(),
  );

  const refreshAll = (): void => {
    refetchStats();
    refetchUsers();
    refetchHealth();
  };

  const handleChangeRole = async (userId: string, role: UserRole): Promise<void> => {
    setPendingUserId(userId);
    try {
      await trpc.admin.setUserRole.mutate({ userId, role });
      showToast(`Role updated to ${role}`, "success");
      await refetchUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update role";
      showToast(msg, "error");
    } finally {
      setPendingUserId(null);
    }
  };

  const handleExportUsers = (): void => {
    const list = users() ?? [];
    if (list.length === 0) {
      showToast("No users to export yet", "info");
      return;
    }
    const header = "ID,Email,Display Name,Role,Created At";
    const rows = list.map((u) => {
      const name = (u.displayName ?? "").replace(/"/g, '""');
      return `${u.id},"${u.email}","${name}",${u.role},${new Date(u.createdAt).toISOString()}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crontech-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${list.length} users`, "success");
  };

  const filteredUsers = (): AdminUser[] => {
    const list = users() ?? [];
    return list.filter((u) => {
      const q = searchQuery().toLowerCase();
      const name = (u.displayName ?? "").toLowerCase();
      const matchesSearch =
        q === "" || u.email.toLowerCase().includes(q) || name.includes(q);
      const matchesRole = filterRole() === "all" || u.role === filterRole();
      return matchesSearch && matchesRole;
    });
  };

  // BLK-013: format a USD amount already in dollars (not cents).
  // admin.stats.claudeSpendMonthUsd arrives pre-rounded to 2dp, but
  // we defensively clamp here for NaN / negative / undefined inputs.
  const fmtUsd = (dollars: number | null | undefined): string => {
    if (dollars === null || dollars === undefined) return "$0.00";
    if (!Number.isFinite(dollars) || dollars < 0) return "$0.00";
    return `$${dollars.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Admin Panel - Crontech</Title>

      <div class="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div class="mb-8 flex items-end justify-between">
          <div>
            <h1 class="text-3xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>Admin Panel</h1>
            <p class="mt-1 text-sm" style={{ color: "var(--color-text-faint)" }}>
              Live platform data. All numbers below come from the database — nothing is mocked.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={refreshAll}
              class="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200"
              style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text-secondary)" }}
            >
              <span class="text-base">&#8635;</span>
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExportUsers}
              class="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200"
              style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text-secondary)" }}
            >
              <span class="text-base">&#128229;</span>
              Export Users
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/support")}
              class="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200"
              style={{ background: "var(--color-primary)", color: "var(--color-text)" }}
            >
              <span class="text-base">&#128231;</span>
              Support Queue
            </button>
          </div>
        </div>

        {/* Stats Row — BLK-013 real tRPC data via trpc.admin.stats */}
        <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Show
            when={!stats.error}
            fallback={<StatErrorFallback count={5} />}
          >
            <Show
              when={stats()}
              fallback={<StatSkeleton count={5} />}
            >
              {(s) => (
                <>
                  <StatCard
                    label="Users"
                    value={s().totalUsers.toLocaleString()}
                    sublabel="Registered accounts"
                    icon="&#128101;"
                    accentColor="var(--color-primary)"
                  />
                  <StatCard
                    label="Active Sessions"
                    value={s().activeSessions.toLocaleString()}
                    sublabel="Signed in (last 24h)"
                    icon="&#128274;"
                    accentColor="var(--color-primary)"
                  />
                  <StatCard
                    label="Deployments (all-time)"
                    value={s().totalDeployments.toLocaleString()}
                    sublabel="Lifetime deploy runs"
                    icon="&#128640;"
                    accentColor="var(--color-success)"
                  />
                  <StatCard
                    label="Deployments (this month)"
                    value={s().deploymentsThisMonth.toLocaleString()}
                    sublabel="Created this calendar month"
                    icon="&#128197;"
                    accentColor="var(--color-warning)"
                  />
                  <StatCard
                    label="Claude Spend (this month)"
                    value={fmtUsd(s().claudeSpendMonthUsd)}
                    sublabel="Metered Anthropic API usage"
                    icon="&#129504;"
                    accentColor="var(--color-primary)"
                  />
                </>
              )}
            </Show>
          </Show>
        </div>

        {/* Platform Family - cross-product health across Crontech, Gluecron, GateTest */}
        <div class="mb-6">
          <PlatformSiblingsWidget />
        </div>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent Users - takes 2 cols */}
          <div class="lg:col-span-2">
            <div
              class="rounded-2xl p-6"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
            >
              <div class="mb-5 flex items-center justify-between">
                <div>
                  <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Recent Users</h2>
                  <p class="text-xs" style={{ color: "var(--color-text-faint)" }}>
                    <Show when={users()} fallback={<span>Loading…</span>}>
                      {(list) => <span>{list().length} shown (latest 20)</span>}
                    </Show>
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  <select
                    value={filterRole()}
                    onChange={(e) => setFilterRole(e.currentTarget.value)}
                    class="rounded-lg px-3 py-2 text-xs outline-none transition-colors duration-200"
                    style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}
                  >
                    <option value="all">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <div class="relative">
                    <input
                      type="text"
                      placeholder="Search users..."
                      aria-label="Search users"
                      value={searchQuery()}
                      onInput={(e) => setSearchQuery(e.currentTarget.value)}
                      class="w-56 rounded-lg py-2 pl-8 pr-3 text-xs outline-none transition-colors duration-200"
                      style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}
                    />
                    <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--color-text-faint)" }}>&#128270;</span>
                  </div>
                </div>
              </div>

              <div class="mb-2 flex items-center gap-4 px-4 py-2">
                <div class="w-9 shrink-0" />
                <span class="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-faint)" }}>User</span>
                <span class="w-24 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-faint)" }}>Role</span>
                <span class="w-32 text-right text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-faint)" }}>Joined</span>
              </div>

              <Show
                when={users()}
                fallback={
                  <div class="flex flex-col items-center gap-2 py-12">
                    <div class="loading-spinner" />
                    <span class="text-sm" style={{ color: "var(--color-text-faint)" }}>Loading users…</span>
                  </div>
                }
              >
                <div class="flex flex-col gap-2">
                  <For each={filteredUsers()}>
                    {(user) => (
                      <UserRow
                        user={user}
                        pending={pendingUserId() === user.id}
                        onChangeRole={(role) => {
                          void handleChangeRole(user.id, role);
                        }}
                      />
                    )}
                  </For>
                </div>
                <Show when={filteredUsers().length === 0}>
                  <div class="flex flex-col items-center gap-2 py-12">
                    <span class="text-2xl" style={{ color: "var(--color-text-faint)" }}>&#128269;</span>
                    <span class="text-sm" style={{ color: "var(--color-text-faint)" }}>
                      <Show
                        when={(users() ?? []).length > 0}
                        fallback={<>No users in the database yet</>}
                      >
                        No users match your filters
                      </Show>
                    </span>
                  </div>
                </Show>
              </Show>
            </div>
          </div>

          {/* System Health - right col */}
          <div class="flex flex-col gap-6">
            <div
              class="rounded-2xl p-6"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
            >
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>System Health</h2>
                <Show when={health()}>
                  {(h) => (
                    <Show when={h().database === "ok" && h().api === "ok"}>
                      <div class="flex items-center gap-2">
                        <div
                          class="h-2 w-2 rounded-full"
                          style={{ background: "var(--color-success)" }}
                        />
                        <span class="text-xs font-medium" style={{ color: "var(--color-success)" }}>Operational</span>
                      </div>
                    </Show>
                  )}
                </Show>
              </div>
              <Show
                when={health()}
                fallback={
                  <div class="flex flex-col items-center gap-2 py-6">
                    <div class="loading-spinner" />
                    <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>Checking services…</span>
                  </div>
                }
              >
                {(h) => (
                  <div class="flex flex-col gap-2">
                    <HealthRow label="API Gateway" status={h().api} />
                    <HealthRow label="Database" status={h().database} />
                    <HealthRow
                      label="Sentinel Monitor"
                      status={h().sentinel}
                      detail={`${h().flagsLoaded} flags`}
                    />
                    <HealthRow label="WebSocket" status={h().websocket} />
                    <div class="mt-2 text-[10px]" style={{ color: "var(--color-text-faint)" }}>
                      Last checked {new Date(h().timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </Show>
            </div>

            {/* Quick Actions */}
            <div
              class="rounded-2xl p-6"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
            >
              <h2 class="mb-4 text-lg font-semibold" style={{ color: "var(--color-text)" }}>Quick Actions</h2>
              <div class="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/admin/onboard")}
                  class="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)" }}
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "color-mix(in oklab, #6366f1 10%, transparent)", color: "#6366f1" }}>&#128640;</span>
                  <div>
                    <span class="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Platform Onboarding</span>
                    <p class="text-[11px]" style={{ color: "var(--color-text-faint)" }}>AI-assisted migration wizard — zero env vars left behind</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/claude")}
                  class="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)" }}
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "color-mix(in oklab, var(--color-primary) 10%, transparent)", color: "var(--color-primary)" }}>&#129504;</span>
                  <div>
                    <span class="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Claude Console</span>
                    <p class="text-[11px]" style={{ color: "var(--color-text-faint)" }}>Admin-only BYOK builder powered by Anthropic</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/support")}
                  class="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)" }}
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "color-mix(in oklab, var(--color-primary) 10%, transparent)", color: "var(--color-primary)" }}>&#128231;</span>
                  <div>
                    <span class="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Support Queue</span>
                    <p class="text-[11px]" style={{ color: "var(--color-text-faint)" }}>Review AI draft replies before they go out</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/progress")}
                  class="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)" }}
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "color-mix(in oklab, var(--color-success) 10%, transparent)", color: "var(--color-success)" }}>&#128203;</span>
                  <div>
                    <span class="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Progress Board</span>
                    <p class="text-[11px]" style={{ color: "var(--color-text-faint)" }}>Track block status across the platform</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleExportUsers}
                  class="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)" }}
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "color-mix(in oklab, var(--color-warning) 10%, transparent)", color: "var(--color-warning)" }}>&#128229;</span>
                  <div>
                    <span class="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Export Users</span>
                    <p class="text-[11px]" style={{ color: "var(--color-text-faint)" }}>Download CSV of real users from the DB</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/status")}
                  class="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)" }}
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "color-mix(in oklab, var(--color-primary) 10%, transparent)", color: "var(--color-primary)" }}>&#128200;</span>
                  <div>
                    <span class="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>Status Page</span>
                    <p class="text-[11px]" style={{ color: "var(--color-text-faint)" }}>Public uptime and incidents</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Deploy Control Panel */}
        <div class="mt-8">
          <DeployPanel />
        </div>

        {/* Server Env Vars */}
        <div class="mt-8">
          <ServerEnvPanel />
        </div>
      </div>
    </div>
  );
}

// ── Deploy Panel ──────────────────────────────────────────────────────
// Calls the Crontech API admin endpoints which proxy to the deploy-agent
// on localhost:9091. Full git pull → build → restart without GitHub Actions.

interface DeployStatus {
  services: Record<string, string>;
  sha: string;
  deploying: boolean;
  uptime: string;
}

interface DeployEvent {
  step?: string;
  status?: "running" | "ok" | "error";
  done?: boolean;
  ok?: boolean;
  failedStep?: string;
  detail?: string;
}

function DeployPanel(): JSX.Element {
  const [log, setLog] = createSignal<DeployEvent[]>([]);
  const [running, setRunning] = createSignal(false);
  const [status, { refetch: refetchStatus }] = createResource<DeployStatus | null>(
    async () => {
      const res = await fetch("/api/admin/deploy/status", {
        headers: { Authorization: `Bearer ${localStorage.getItem("ct_token") ?? ""}` },
      });
      if (!res.ok) return null;
      return res.json() as Promise<DeployStatus>;
    },
  );

  let abortController: AbortController | undefined;

  onCleanup(() => {
    abortController?.abort();
  });

  const startDeploy = async (endpoint: "deploy" | "restart"): Promise<void> => {
    if (running()) return;
    setRunning(true);
    setLog([]);
    abortController = new AbortController();

    try {
      const res = await fetch(`/api/admin/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("ct_token") ?? ""}` },
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        setLog([{ step: "error", status: "error", detail: `HTTP ${res.status}` }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, "").trim();
          if (!line) continue;
          try {
            const event = JSON.parse(line) as DeployEvent;
            setLog((prev) => [...prev, event]);
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setLog((prev) => [...prev, { step: "connection", status: "error", detail: err.message }]);
      }
    } finally {
      setRunning(false);
      refetchStatus();
    }
  };

  const stepColor = (e: DeployEvent): string => {
    if (e.status === "ok") return "var(--color-success)";
    if (e.status === "error") return "var(--color-danger)";
    if (e.status === "running") return "var(--color-warning)";
    return "var(--color-text-muted)";
  };

  const serviceColor = (s: string): string =>
    s === "active" ? "var(--color-success)" : "var(--color-danger)";

  return (
    <div
      class="rounded-2xl p-6"
      style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
    >
      <div class="mb-5 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
            Deploy Control
          </h2>
          <p class="mt-0.5 text-xs" style={{ color: "var(--color-text-faint)" }}>
            git pull → build → restart · no GitHub Actions needed
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetchStatus()}
          class="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
          style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text-secondary)" }}
        >
          &#8635; Refresh
        </button>
      </div>

      {/* Service status */}
      <Show when={status()}>
        {(s) => (
          <div class="mb-5 flex flex-wrap gap-2">
            <For each={Object.entries(s().services)}>
              {([svc, state]) => (
                <div
                  class="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold"
                  style={{
                    background: `color-mix(in oklab, ${serviceColor(state)} 10%, transparent)`,
                    color: serviceColor(state),
                    border: `1px solid color-mix(in oklab, ${serviceColor(state)} 25%, transparent)`,
                  }}
                >
                  <span class="h-1.5 w-1.5 rounded-full" style={{ background: serviceColor(state) }} />
                  {svc}
                  <span class="opacity-70">·</span>
                  {state}
                </div>
              )}
            </For>
            <div
              class="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
              style={{
                background: "var(--color-bg-subtle)",
                color: "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
              }}
            >
              SHA: {s().sha}
            </div>
          </div>
        )}
      </Show>

      {/* Action buttons */}
      <div class="mb-5 flex gap-3">
        <button
          type="button"
          disabled={running()}
          onClick={() => startDeploy("deploy")}
          class="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
          style={{
            background: "var(--color-primary)",
            color: "#ffffff",
            border: "none",
          }}
        >
          <span>{running() ? "⏳" : "🚀"}</span>
          {running() ? "Deploying…" : "Full Deploy"}
        </button>
        <button
          type="button"
          disabled={running()}
          onClick={() => startDeploy("restart")}
          class="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
          style={{
            background: "var(--color-bg-subtle)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span>🔄</span>
          Restart only
        </button>
      </div>

      {/* Live log */}
      <Show when={log().length > 0}>
        <div
          class="rounded-xl p-4 font-mono text-[12px] leading-relaxed"
          style={{ background: "var(--color-bg-inset)", border: "1px solid var(--color-border)" }}
        >
          <For each={log()}>
            {(e) => (
              <div class="flex items-start gap-2.5">
                <span style={{ color: stepColor(e), "min-width": "0.75rem" }}>
                  {e.status === "ok" ? "✓" : e.status === "error" ? "✗" : e.done ? (e.ok ? "✓" : "✗") : "·"}
                </span>
                <Show
                  when={e.done}
                  fallback={
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      {e.step}
                      <Show when={e.status === "running"}>
                        <span style={{ color: "var(--color-warning)" }}> running…</span>
                      </Show>
                      <Show when={e.status === "error" && e.detail}>
                        {" "}
                        <span style={{ color: "var(--color-danger)" }}>{e.detail}</span>
                      </Show>
                    </span>
                  }
                >
                  <span style={{ color: e.ok ? "var(--color-success)" : "var(--color-danger)", "font-weight": "600" }}>
                    {e.ok ? "Deploy complete" : `Failed at: ${e.failedStep ?? "unknown"}`}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// ── Server Env Vars Panel ─────────────────────────────────────────────
// Reads and writes the platform .env file via the deploy agent.
// Values are never returned — only a masked hint is shown.

interface EnvVarHint {
  key: string;
  hint: string;
  set: boolean;
}

function ServerEnvPanel(): JSX.Element {
  const token = (): string => localStorage.getItem("ct_token") ?? "";
  const authHeaders = (): HeadersInit => ({ Authorization: `Bearer ${token()}` });

  const [vars, setVars] = createSignal<EnvVarHint[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const [showAdd, setShowAdd] = createSignal(false);
  const [newKey, setNewKey] = createSignal("");
  const [newValue, setNewValue] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/env-vars", { headers: authHeaders() });
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      const body = await res.json() as { ok: boolean; vars?: EnvVarHint[] };
      setVars(body.vars ?? []);
    } catch {
      setError("Deploy agent unreachable");
    } finally {
      setLoading(false);
    }
  };

  void load();

  const save = async (): Promise<void> => {
    const k = newKey().trim().toUpperCase();
    const v = newValue();
    if (!k || !v) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/env-vars", {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, value: v }),
      });
      if (res.ok) {
        showToast(`Saved ${k}`, "success");
        setNewKey("");
        setNewValue("");
        setShowAdd(false);
        void load();
      } else {
        const body = await res.json() as { error?: string };
        showToast(body.error ?? "Save failed", "error");
      }
    } catch {
      showToast("Deploy agent unreachable", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (key: string): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/env-vars/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) {
        showToast(`Removed ${key}`, "success");
        void load();
      } else {
        showToast("Delete failed", "error");
      }
    } catch {
      showToast("Deploy agent unreachable", "error");
    }
  };

  const KEY_RE = /^[A-Z_][A-Z0-9_]*$/;

  return (
    <div
      class="rounded-2xl p-6"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div class="mb-5 flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold" style={{ color: "var(--color-text)" }}>
            Server Environment Variables
          </h3>
          <p class="mt-0.5 text-xs" style={{ color: "var(--color-text-faint)" }}>
            Manages <code class="font-mono">/opt/crontech/.env</code> on the Vultr box via the deploy agent. Values are write-only — hints shown only.
          </p>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            class="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              "border-color": "var(--color-border)",
              color: "var(--color-text-muted)",
              background: "var(--color-bg-subtle)",
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            class="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              "border-color": "var(--color-primary)",
              color: "var(--color-primary)",
              background: "color-mix(in srgb, var(--color-primary) 8%, transparent)",
            }}
          >
            + Add / Update
          </button>
        </div>
      </div>

      <Show when={showAdd()}>
        <div
          class="mb-5 rounded-xl border p-4"
          style={{
            "border-color": "var(--color-border)",
            background: "var(--color-bg-subtle)",
          }}
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div class="flex-1">
              <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                Key
              </label>
              <input
                type="text"
                value={newKey()}
                onInput={(e) => setNewKey(e.currentTarget.value.toUpperCase())}
                placeholder="DATABASE_URL"
                class="w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm focus:outline-none"
                style={{
                  "border-color": newKey().length > 0 && !KEY_RE.test(newKey())
                    ? "var(--color-danger)"
                    : "var(--color-border)",
                  color: "var(--color-text)",
                }}
              />
            </div>
            <div class="flex-1">
              <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                Value
              </label>
              <input
                type="password"
                value={newValue()}
                onInput={(e) => setNewValue(e.currentTarget.value)}
                placeholder="secret value…"
                class="w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm focus:outline-none"
                style={{
                  "border-color": "var(--color-border)",
                  color: "var(--color-text)",
                }}
              />
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setNewKey(""); setNewValue(""); }}
                class="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                style={{ "border-color": "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving() || !KEY_RE.test(newKey()) || !newValue()}
                onClick={() => void save()}
                class="rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
                style={{
                  background: "var(--color-primary)",
                  color: "#fff",
                }}
              >
                {saving() ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={loading()}>
        <div class="flex items-center gap-2 py-4 text-sm" style={{ color: "var(--color-text-faint)" }}>
          <div class="h-4 w-4 animate-spin rounded-full border-2" style={{ "border-color": "var(--color-border)", "border-top-color": "var(--color-primary)" }} />
          Loading env vars from server…
        </div>
      </Show>

      <Show when={!loading() && error()}>
        <p class="py-2 text-sm" style={{ color: "var(--color-danger)" }}>{error()}</p>
      </Show>

      <Show when={!loading() && !error()}>
        <Show
          when={vars().length > 0}
          fallback={
            <p class="py-2 text-sm" style={{ color: "var(--color-text-faint)" }}>
              No env vars found — deploy agent may be offline or .env is empty.
            </p>
          }
        >
          <div class="space-y-1">
            <For each={vars().slice().sort((a, b) => a.key.localeCompare(b.key))}>
              {(v) => (
                <div
                  class="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)" }}
                >
                  <span class="font-mono text-sm" style={{ color: "var(--color-text)" }}>{v.key}</span>
                  <div class="flex items-center gap-3">
                    <span class="font-mono text-xs" style={{ color: "var(--color-text-faint)" }}>{v.hint}</span>
                    <button
                      type="button"
                      onClick={() => void remove(v.key)}
                      aria-label={`Remove ${v.key}`}
                      class="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
                      style={{ color: "var(--color-danger)", background: "transparent" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}

// ── Stat Error Fallback ───────────────────────────────────────────────
// BLK-013: if admin.stats throws (DB blip, auth glitch, etc), we show
// an em-dash tile with a polite caption instead of crashing the whole
// dashboard. The Refresh button at the top is the remediation.

function StatErrorFallback(props: { count: number }): JSX.Element {
  return (
    <For each={Array.from({ length: props.count })}>
      {() => (
        <div
          class="relative overflow-hidden rounded-2xl p-6"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div class="flex flex-col gap-1">
            <span
              class="text-xs font-medium uppercase tracking-widest"
              style={{ color: "var(--color-text-faint)" }}
            >
              Stats unavailable
            </span>
            <span
              class="text-3xl font-bold tracking-tight"
              style={{ color: "var(--color-text-muted)" }}
            >
              &mdash;
            </span>
            <span
              class="mt-1 text-xs font-medium"
              style={{ color: "var(--color-text-muted)" }}
            >
              Couldn&apos;t reach the data layer. Try Refresh above.
            </span>
          </div>
        </div>
      )}
    </For>
  );
}

// ── Stat Skeleton ─────────────────────────────────────────────────────

function StatSkeleton(props: { count: number }): JSX.Element {
  return (
    <For each={Array.from({ length: props.count })}>
      {() => (
        <div
          class="relative overflow-hidden rounded-2xl p-6"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div class="flex flex-col gap-2">
            <div class="h-3 w-24 animate-pulse rounded" style={{ background: "var(--color-bg-muted)" }} />
            <div class="h-8 w-32 animate-pulse rounded" style={{ background: "var(--color-bg-inset)" }} />
            <div class="h-3 w-20 animate-pulse rounded" style={{ background: "var(--color-bg-muted)" }} />
          </div>
        </div>
      )}
    </For>
  );
}
