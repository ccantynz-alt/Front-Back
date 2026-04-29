import { Title } from "@solidjs/meta";
import { createSignal, createResource, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Box, Container, Stack, Text } from "@back-to-the-future/ui";
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
    <Box class="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Admin Panel - Crontech</Title>

      <Container size="full" padding="md" class="max-w-7xl py-8">
        {/* Header */}
        <Stack direction="horizontal" justify="between" align="end" class="mb-8">
          <Box>
            <Text variant="h1" class="text-3xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>Admin Panel</Text>
            <Text variant="body" class="mt-1 text-sm" style={{ color: "var(--color-text-faint)" }}>
              Live platform data. All numbers below come from the database — nothing is mocked.
            </Text>
          </Box>
          <Stack direction="horizontal" gap="sm" align="center">
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
          </Stack>
        </Stack>

        {/* Stats Row — BLK-013 real tRPC data via trpc.admin.stats */}
        <Box class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        </Box>

        {/* Platform Family - cross-product health across Crontech, Gluecron, GateTest */}
        <Box class="mb-6">
          <PlatformSiblingsWidget />
        </Box>

        <Box class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent Users - takes 2 cols */}
          <Box class="lg:col-span-2">
            <Box
              class="rounded-2xl p-6"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
            >
              <Stack direction="horizontal" justify="between" align="center" class="mb-5">
                <Box>
                  <Text variant="h2" class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Recent Users</Text>
                  <Text variant="body" class="text-xs" style={{ color: "var(--color-text-faint)" }}>
                    <Show when={users()} fallback={<Text as="span" variant="caption">Loading…</Text>}>
                      {(list) => <Text as="span" variant="caption">{list().length} shown (latest 20)</Text>}
                    </Show>
                  </Text>
                </Box>
                <Stack direction="horizontal" gap="sm" align="center">
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
                  <Box class="relative">
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={searchQuery()}
                      onInput={(e) => setSearchQuery(e.currentTarget.value)}
                      class="w-56 rounded-lg py-2 pl-8 pr-3 text-xs outline-none transition-colors duration-200"
                      style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}
                    />
                    <Text as="span" variant="caption" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--color-text-faint)" }}>&#128270;</Text>
                  </Box>
                </Stack>
              </Stack>

              <Stack direction="horizontal" gap="md" align="center" class="mb-2 px-4 py-2">
                <Box class="w-9 shrink-0" />
                <Text as="span" variant="caption" class="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-faint)" }}>User</Text>
                <Text as="span" variant="caption" class="w-24 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-faint)" }}>Role</Text>
                <Text as="span" variant="caption" class="w-32 text-right text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-faint)" }}>Joined</Text>
              </Stack>

              <Show
                when={users()}
                fallback={
                  <Stack direction="vertical" gap="sm" align="center" class="py-12">
                    <Box class="loading-spinner" />
                    <Text as="span" variant="caption" class="text-sm" style={{ color: "var(--color-text-faint)" }}>Loading users…</Text>
                  </Stack>
                }
              >
                <Stack direction="vertical" gap="sm">
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
                </Stack>
                <Show when={filteredUsers().length === 0}>
                  <Stack direction="vertical" gap="sm" align="center" class="py-12">
                    <Text as="span" variant="caption" class="text-2xl" style={{ color: "var(--color-text-faint)" }}>&#128269;</Text>
                    <Text as="span" variant="caption" class="text-sm" style={{ color: "var(--color-text-faint)" }}>
                      <Show
                        when={(users() ?? []).length > 0}
                        fallback={<>No users in the database yet</>}
                      >
                        No users match your filters
                      </Show>
                    </Text>
                  </Stack>
                </Show>
              </Show>
            </Box>
          </Box>

          {/* System Health - right col */}
          <Stack direction="vertical" gap="lg">
            <Box
              class="rounded-2xl p-6"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
            >
              <Stack direction="horizontal" justify="between" align="center" class="mb-4">
                <Text variant="h2" class="text-lg font-semibold" style={{ color: "var(--color-text)" }}>System Health</Text>
                <Show when={health()}>
                  {(h) => (
                    <Show when={h().database === "ok" && h().api === "ok"}>
                      <Stack direction="horizontal" gap="sm" align="center">
                        <Box
                          class="h-2 w-2 rounded-full"
                          style={{ background: "var(--color-success)" }}
                        />
                        <Text as="span" variant="caption" class="text-xs font-medium" style={{ color: "var(--color-success)" }}>Operational</Text>
                      </Stack>
                    </Show>
                  )}
                </Show>
              </Stack>
              <Show
                when={health()}
                fallback={
                  <Stack direction="vertical" gap="sm" align="center" class="py-6">
                    <Box class="loading-spinner" />
                    <Text as="span" variant="caption" class="text-xs" style={{ color: "var(--color-text-faint)" }}>Checking services…</Text>
                  </Stack>
                }
              >
                {(h) => (
                  <Stack direction="vertical" gap="sm">
                    <HealthRow label="API Gateway" status={h().api} />
                    <HealthRow label="Database" status={h().database} />
                    <HealthRow
                      label="Sentinel Monitor"
                      status={h().sentinel}
                      detail={`${h().flagsLoaded} flags`}
                    />
                    <HealthRow label="WebSocket" status={h().websocket} />
                    <Box class="mt-2 text-[10px]" style={{ color: "var(--color-text-faint)" }}>
                      Last checked {new Date(h().timestamp).toLocaleTimeString()}
                    </Box>
                  </Stack>
                )}
              </Show>
            </Box>

            {/* Quick Actions */}
            <Box
              class="rounded-2xl p-6"
              style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
            >
              <Text variant="h2" class="mb-4 text-lg font-semibold" style={{ color: "var(--color-text)" }}>Quick Actions</Text>
              <Stack direction="vertical" gap="sm">
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
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Container>
    </Box>
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
