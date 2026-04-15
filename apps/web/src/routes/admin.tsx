import { Title } from "@solidjs/meta";
import { createSignal, createResource, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { AdminRoute } from "../components/AdminRoute";
import { trpc } from "../lib/trpc";
import { showToast } from "../components/Toast";

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
      class="relative overflow-hidden rounded-2xl border border-white/[0.06] p-6 transition-all duration-300 hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20 group"
      style={{
        background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)",
      }}
    >
      <div
        class="absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-20 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
        style={{ background: props.accentColor }}
      />
      <div class="relative z-10 flex items-start justify-between">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-widest text-gray-500">
            {props.label}
          </span>
          <span class="text-3xl font-bold tracking-tight text-white">
            {props.value}
          </span>
          <span class="mt-1 text-xs font-medium text-gray-400">{props.sublabel}</span>
        </div>
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
          style={{
            background: `linear-gradient(135deg, ${props.accentColor}22, ${props.accentColor}44)`,
            color: props.accentColor,
          }}
        >
          {props.icon}
        </div>
      </div>
      <div
        class="absolute bottom-0 left-0 h-[2px] w-full opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${props.accentColor}, transparent)` }}
      />
    </div>
  );
}

// ── Health Row ────────────────────────────────────────────────────────

type HealthStatus = "ok" | "error" | "active" | "inactive";

function HealthRow(props: { label: string; status: HealthStatus; detail?: string }): JSX.Element {
  const statusColor = (): string => {
    if (props.status === "ok" || props.status === "active") return "#10b981";
    if (props.status === "inactive") return "#6b7280";
    return "#ef4444";
  };

  return (
    <div class="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.03]">
      <div class="flex items-center gap-3">
        <div
          class="h-2.5 w-2.5 rounded-full"
          style={{ background: statusColor(), "box-shadow": `0 0 8px ${statusColor()}80` }}
        />
        <span class="text-sm font-medium text-gray-200">{props.label}</span>
      </div>
      <div class="flex items-center gap-3">
        <Show when={props.detail}>
          <span class="text-xs text-gray-500">{props.detail}</span>
        </Show>
        <span
          class="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: `${statusColor()}18`, color: statusColor() }}
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
    if (props.user.role === "admin") return "#a78bfa";
    if (props.user.role === "editor") return "#3b82f6";
    return "#6b7280";
  };

  return (
    <div class="flex items-center gap-4 rounded-xl border border-white/[0.04] bg-white/[0.015] px-4 py-3.5 transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.03]">
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${roleColor()}60, ${roleColor()})` }}
      >
        {initialsFor(props.user)}
      </div>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm font-medium text-gray-100">
          {props.user.displayName ?? props.user.email}
        </span>
        <span class="text-xs text-gray-500">{props.user.email}</span>
      </div>
      <select
        value={props.user.role}
        disabled={props.pending}
        onChange={(e) => props.onChangeRole(e.currentTarget.value as UserRole)}
        class="w-24 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-gray-200 outline-none transition-colors duration-200 focus:border-blue-500/50 disabled:opacity-50"
      >
        <option value="admin">admin</option>
        <option value="editor">editor</option>
        <option value="viewer">viewer</option>
      </select>
      <span class="w-32 text-right text-xs text-gray-500">
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

  const [stats, { refetch: refetchStats }] = createResource(async () =>
    trpc.admin.getStats.query(),
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

  const fmtCurrency = (cents: number): string => {
    return `$${(cents / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div class="min-h-screen bg-[#060606]">
      <Title>Admin Panel - Crontech</Title>

      <div class="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div class="mb-8 flex items-end justify-between">
          <div>
            <h1 class="text-3xl font-bold tracking-tight text-white">Admin Panel</h1>
            <p class="mt-1 text-sm text-gray-500">
              Live platform data. All numbers below come from the database — nothing is mocked.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={refreshAll}
              class="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-gray-300 transition-all duration-200 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-white"
            >
              <span class="text-base">&#8635;</span>
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExportUsers}
              class="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-gray-300 transition-all duration-200 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-white"
            >
              <span class="text-base">&#128229;</span>
              Export Users
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/support")}
              class="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:shadow-blue-500/40 hover:brightness-110"
            >
              <span class="text-base">&#128231;</span>
              Support Queue
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Show
            when={stats()}
            fallback={<StatSkeleton count={4} />}
          >
            {(s) => (
              <>
                <StatCard
                  label="Total Users"
                  value={s().totalUsers.toLocaleString()}
                  sublabel="Registered accounts"
                  icon="&#128101;"
                  accentColor="#3b82f6"
                />
                <StatCard
                  label="Active Subscriptions"
                  value={s().activeSubscriptions.toLocaleString()}
                  sublabel="Currently paying"
                  icon="&#128179;"
                  accentColor="#8b5cf6"
                />
                <StatCard
                  label="Revenue (lifetime)"
                  value={fmtCurrency(s().totalRevenue)}
                  sublabel="Succeeded payments"
                  icon="&#128176;"
                  accentColor="#10b981"
                />
                <StatCard
                  label="AI Generations"
                  value={s().aiGenerations.toLocaleString()}
                  sublabel="Total events logged"
                  icon="&#9889;"
                  accentColor="#f59e0b"
                />
              </>
            )}
          </Show>
        </div>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent Users - takes 2 cols */}
          <div class="lg:col-span-2">
            <div
              class="rounded-2xl border border-white/[0.06] p-6"
              style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)" }}
            >
              <div class="mb-5 flex items-center justify-between">
                <div>
                  <h2 class="text-lg font-semibold text-white">Recent Users</h2>
                  <p class="text-xs text-gray-500">
                    <Show when={users()} fallback={<span>Loading…</span>}>
                      {(list) => <span>{list().length} shown (latest 20)</span>}
                    </Show>
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  <select
                    value={filterRole()}
                    onChange={(e) => setFilterRole(e.currentTarget.value)}
                    class="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-gray-300 outline-none transition-colors duration-200 focus:border-blue-500/50"
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
                      value={searchQuery()}
                      onInput={(e) => setSearchQuery(e.currentTarget.value)}
                      class="w-56 rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 pl-8 pr-3 text-xs text-gray-200 placeholder-gray-600 outline-none transition-colors duration-200 focus:border-blue-500/50"
                    />
                    <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-xs">&#128270;</span>
                  </div>
                </div>
              </div>

              <div class="mb-2 flex items-center gap-4 px-4 py-2">
                <div class="w-9 shrink-0" />
                <span class="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">User</span>
                <span class="w-24 text-[10px] font-semibold uppercase tracking-widest text-gray-600">Role</span>
                <span class="w-32 text-right text-[10px] font-semibold uppercase tracking-widest text-gray-600">Joined</span>
              </div>

              <Show
                when={users()}
                fallback={
                  <div class="flex flex-col items-center gap-2 py-12">
                    <div class="loading-spinner" />
                    <span class="text-sm text-gray-500">Loading users…</span>
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
                    <span class="text-2xl text-gray-600">&#128269;</span>
                    <span class="text-sm text-gray-500">
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
              class="rounded-2xl border border-white/[0.06] p-6"
              style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)" }}
            >
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold text-white">System Health</h2>
                <Show when={health()}>
                  {(h) => (
                    <Show when={h().database === "ok" && h().api === "ok"}>
                      <div class="flex items-center gap-2">
                        <div
                          class="h-2 w-2 rounded-full bg-emerald-400"
                          style={{ "box-shadow": "0 0 8px #10b98180" }}
                        />
                        <span class="text-xs font-medium text-emerald-400">Operational</span>
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
                    <span class="text-xs text-gray-500">Checking services…</span>
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
                    <div class="mt-2 text-[10px] text-gray-600">
                      Last checked {new Date(h().timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </Show>
            </div>

            {/* Quick Actions */}
            <div
              class="rounded-2xl border border-white/[0.06] p-6"
              style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)" }}
            >
              <h2 class="mb-4 text-lg font-semibold text-white">Quick Actions</h2>
              <div class="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/admin/support")}
                  class="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-left transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.04]"
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "#3b82f618", color: "#3b82f6" }}>&#128231;</span>
                  <div>
                    <span class="text-sm font-medium text-gray-200">Support Queue</span>
                    <p class="text-[11px] text-gray-500">Review AI draft replies before they go out</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/progress")}
                  class="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-left transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.04]"
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "#10b98118", color: "#10b981" }}>&#128203;</span>
                  <div>
                    <span class="text-sm font-medium text-gray-200">Progress Board</span>
                    <p class="text-[11px] text-gray-500">Track block status across the platform</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleExportUsers}
                  class="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-left transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.04]"
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "#f59e0b18", color: "#f59e0b" }}>&#128229;</span>
                  <div>
                    <span class="text-sm font-medium text-gray-200">Export Users</span>
                    <p class="text-[11px] text-gray-500">Download CSV of real users from the DB</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/status")}
                  class="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-left transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.04]"
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "#a78bfa18", color: "#a78bfa" }}>&#128200;</span>
                  <div>
                    <span class="text-sm font-medium text-gray-200">Status Page</span>
                    <p class="text-[11px] text-gray-500">Public uptime and incidents</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat Skeleton ─────────────────────────────────────────────────────

function StatSkeleton(props: { count: number }): JSX.Element {
  return (
    <For each={Array.from({ length: props.count })}>
      {() => (
        <div
          class="relative overflow-hidden rounded-2xl border border-white/[0.06] p-6"
          style={{
            background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)",
          }}
        >
          <div class="flex flex-col gap-2">
            <div class="h-3 w-24 animate-pulse rounded bg-white/[0.05]" />
            <div class="h-8 w-32 animate-pulse rounded bg-white/[0.08]" />
            <div class="h-3 w-20 animate-pulse rounded bg-white/[0.04]" />
          </div>
        </div>
      )}
    </For>
  );
}
