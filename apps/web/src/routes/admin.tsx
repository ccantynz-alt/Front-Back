import { Title } from "@solidjs/meta";
import { createSignal, For, Show, Switch, Match } from "solid-js";
import type { JSX } from "solid-js";

// ── Mock Data ────────────────────────────────────────────────────────

const MOCK_STATS = {
  totalUsers: 12_847,
  activeProjects: 3_291,
  apiCallsToday: 1_482_003,
  revenue: 284_750,
};

const MOCK_USERS = [
  { id: "1", name: "Elena Vasquez", email: "elena@acme.dev", plan: "Enterprise", status: "active" as const, avatar: "EV" },
  { id: "2", name: "Marcus Chen", email: "marcus@streamline.io", plan: "Pro", status: "active" as const, avatar: "MC" },
  { id: "3", name: "Sarah Kim", email: "sarah.kim@buildfast.co", plan: "Pro", status: "active" as const, avatar: "SK" },
  { id: "4", name: "Raj Patel", email: "raj@devstack.com", plan: "Free", status: "inactive" as const, avatar: "RP" },
  { id: "5", name: "Anya Novak", email: "anya.novak@cloudship.dev", plan: "Enterprise", status: "active" as const, avatar: "AN" },
  { id: "6", name: "James Wright", email: "james@pixelcraft.io", plan: "Pro", status: "suspended" as const, avatar: "JW" },
  { id: "7", name: "Li Wei", email: "liwei@tensorlab.ai", plan: "Enterprise", status: "active" as const, avatar: "LW" },
];

const SYSTEM_HEALTH = [
  { label: "API Gateway", status: "operational" as const, latency: "12ms", uptime: "99.99%" },
  { label: "Edge Network", status: "operational" as const, latency: "4ms", uptime: "99.98%" },
  { label: "Database Cluster", status: "operational" as const, latency: "8ms", uptime: "100%" },
  { label: "AI Inference", status: "degraded" as const, latency: "142ms", uptime: "99.91%" },
  { label: "WebSocket Layer", status: "operational" as const, latency: "3ms", uptime: "99.97%" },
  { label: "Sentinel Monitor", status: "operational" as const, latency: "28ms", uptime: "99.95%" },
];

// ── Stat Card ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  delta: string;
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
          <span class="mt-1 text-xs font-medium text-emerald-400">{props.delta}</span>
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

function HealthRow(props: { label: string; status: "operational" | "degraded" | "down"; latency: string; uptime: string }): JSX.Element {
  const statusColor = (): string => {
    if (props.status === "operational") return "#10b981";
    if (props.status === "degraded") return "#f59e0b";
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
      <div class="flex items-center gap-6">
        <span class="text-xs text-gray-500">{props.latency}</span>
        <span class="text-xs font-medium text-gray-400">{props.uptime}</span>
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

function UserRow(props: {
  name: string;
  email: string;
  plan: string;
  status: "active" | "inactive" | "suspended";
  avatar: string;
  onEdit: () => void;
  onSuspend: () => void;
}): JSX.Element {
  const statusColor = (): string => {
    if (props.status === "active") return "#10b981";
    if (props.status === "inactive") return "#6b7280";
    return "#ef4444";
  };

  const planColor = (): string => {
    if (props.plan === "Enterprise") return "#a78bfa";
    if (props.plan === "Pro") return "#3b82f6";
    return "#6b7280";
  };

  return (
    <div class="flex items-center gap-4 rounded-xl border border-white/[0.04] bg-white/[0.015] px-4 py-3.5 transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.03]">
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${planColor()}60, ${planColor()})` }}
      >
        {props.avatar}
      </div>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm font-medium text-gray-100">{props.name}</span>
        <span class="text-xs text-gray-500">{props.email}</span>
      </div>
      <span
        class="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ background: `${planColor()}18`, color: planColor() }}
      >
        {props.plan}
      </span>
      <div class="flex items-center gap-2">
        <div
          class="h-2 w-2 rounded-full"
          style={{ background: statusColor(), "box-shadow": `0 0 6px ${statusColor()}60` }}
        />
        <span class="text-xs capitalize text-gray-400">{props.status}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onClick={props.onEdit}
          class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-gray-400 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={props.onSuspend}
          class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-gray-400 transition-all duration-200 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
        >
          Suspend
        </button>
      </div>
    </div>
  );
}

// ── Admin Dashboard Page ─────────────────────────────────────────────

export default function AdminPage(): JSX.Element {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [filterPlan, setFilterPlan] = createSignal<string>("all");
  const [showInviteModal, setShowInviteModal] = createSignal(false);
  const [inviteEmail, setInviteEmail] = createSignal("");
  const [inviteSent, setInviteSent] = createSignal(false);
  const [editingUserId, setEditingUserId] = createSignal<string | null>(null);
  const [showSuspendConfirm, setShowSuspendConfirm] = createSignal<string | null>(null);
  const [users, setUsers] = createSignal(MOCK_USERS);

  const handleInviteUser = (): void => {
    setShowInviteModal(true);
    setInviteEmail("");
    setInviteSent(false);
  };

  const submitInvite = (): void => {
    if (inviteEmail().trim() !== "") {
      setInviteSent(true);
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteSent(false);
      }, 2000);
    }
  };

  const handleExportData = (): void => {
    const header = "ID,Name,Email,Plan,Status";
    const rows = users().map((u) => `${u.id},${u.name},${u.email},${u.plan},${u.status}`);
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "crontech-users-export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleViewLogs = (): void => {
    window.location.href = "/admin/logs";
  };

  const handleSystemConfig = (): void => {
    window.location.href = "/admin/config";
  };

  const handleEditUser = (userId: string): void => {
    setEditingUserId(editingUserId() === userId ? null : userId);
  };

  const handleSuspendUser = (userId: string): void => {
    if (showSuspendConfirm() === userId) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, status: (u.status === "suspended" ? "active" : "suspended") as "active" | "inactive" | "suspended" }
            : u
        )
      );
      setShowSuspendConfirm(null);
    } else {
      setShowSuspendConfirm(userId);
    }
  };

  const filteredUsers = (): typeof MOCK_USERS => {
    return users().filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery().toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery().toLowerCase());
      const matchesPlan = filterPlan() === "all" || u.plan === filterPlan();
      return matchesSearch && matchesPlan;
    });
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
              Platform administration and system oversight
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button
              type="button"
              onClick={handleViewLogs}
              class="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-gray-300 transition-all duration-200 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-white"
            >
              <span class="text-base">&#128203;</span>
              View Logs
            </button>
            <button
              type="button"
              onClick={handleExportData}
              class="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-gray-300 transition-all duration-200 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-white"
            >
              <span class="text-base">&#128229;</span>
              Export Data
            </button>
            <button
              type="button"
              onClick={handleInviteUser}
              class="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:shadow-blue-500/40 hover:brightness-110"
            >
              <span class="text-base">+</span>
              Invite User
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Users" value="12,847" delta="+342 this week" icon="&#128101;" accentColor="#3b82f6" />
          <StatCard label="Active Projects" value="3,291" delta="+89 this week" icon="&#128640;" accentColor="#8b5cf6" />
          <StatCard label="API Calls Today" value="1.48M" delta="+12.4% vs yesterday" icon="&#9889;" accentColor="#10b981" />
          <StatCard label="Revenue (MTD)" value="$284,750" delta="+18.2% vs last month" icon="&#128176;" accentColor="#f59e0b" />
        </div>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* User Management - takes 2 cols */}
          <div class="lg:col-span-2">
            <div
              class="rounded-2xl border border-white/[0.06] p-6"
              style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)" }}
            >
              <div class="mb-5 flex items-center justify-between">
                <div>
                  <h2 class="text-lg font-semibold text-white">User Management</h2>
                  <p class="text-xs text-gray-500">{users().length} total users</p>
                </div>
                <div class="flex items-center gap-3">
                  {/* Plan Filter */}
                  <select
                    value={filterPlan()}
                    onChange={(e) => setFilterPlan(e.currentTarget.value)}
                    class="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-gray-300 outline-none transition-colors duration-200 focus:border-blue-500/50"
                  >
                    <option value="all">All Plans</option>
                    <option value="Free">Free</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                  {/* Search */}
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

              {/* Table Header */}
              <div class="mb-2 flex items-center gap-4 px-4 py-2">
                <div class="w-9 shrink-0" />
                <span class="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">User</span>
                <span class="w-24 text-[10px] font-semibold uppercase tracking-widest text-gray-600">Plan</span>
                <span class="w-24 text-[10px] font-semibold uppercase tracking-widest text-gray-600">Status</span>
                <span class="w-36 text-[10px] font-semibold uppercase tracking-widest text-gray-600">Actions</span>
              </div>

              {/* User Rows */}
              <div class="flex flex-col gap-2">
                <For each={filteredUsers()}>
                  {(user) => (
                    <div>
                      <UserRow
                        name={user.name}
                        email={user.email}
                        plan={user.plan}
                        status={user.status}
                        avatar={user.avatar}
                        onEdit={() => handleEditUser(user.id)}
                        onSuspend={() => handleSuspendUser(user.id)}
                      />
                      <Show when={editingUserId() === user.id}>
                        <div class="mt-1 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                          <div class="flex items-center gap-3">
                            <span class="text-xs text-gray-400">Editing {user.name}</span>
                            <span class="text-xs text-gray-600">|</span>
                            <span class="text-xs text-gray-500">{user.email}</span>
                            <span class="text-xs text-gray-600">|</span>
                            <span class="text-xs text-gray-500">{user.plan}</span>
                            <div class="flex-1" />
                            <button
                              type="button"
                              onClick={() => setEditingUserId(null)}
                              class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-[10px] font-medium text-gray-400 transition-all hover:text-white"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </Show>
                      <Show when={showSuspendConfirm() === user.id}>
                        <div class="mt-1 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                          <div class="flex items-center gap-3">
                            <span class="text-xs text-red-400">
                              {user.status === "suspended" ? `Reactivate ${user.name}?` : `Suspend ${user.name}?`}
                            </span>
                            <div class="flex-1" />
                            <button
                              type="button"
                              onClick={() => setShowSuspendConfirm(null)}
                              class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-[10px] font-medium text-gray-400 transition-all hover:text-white"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSuspendUser(user.id)}
                              class="rounded-lg bg-red-600 px-3 py-1 text-[10px] font-semibold text-white transition-all hover:bg-red-500"
                            >
                              {user.status === "suspended" ? "Reactivate" : "Confirm Suspend"}
                            </button>
                          </div>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>

              <Show when={filteredUsers().length === 0}>
                <div class="flex flex-col items-center gap-2 py-12">
                  <span class="text-2xl text-gray-600">&#128269;</span>
                  <span class="text-sm text-gray-500">No users match your filters</span>
                </div>
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
                <div class="flex items-center gap-2">
                  <div class="h-2 w-2 rounded-full bg-emerald-400" style={{ "box-shadow": "0 0 8px #10b98180" }} />
                  <span class="text-xs font-medium text-emerald-400">All Systems Operational</span>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <For each={SYSTEM_HEALTH}>
                  {(item) => (
                    <HealthRow
                      label={item.label}
                      status={item.status}
                      latency={item.latency}
                      uptime={item.uptime}
                    />
                  )}
                </For>
              </div>
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
                  onClick={handleInviteUser}
                  class="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-left transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.04]"
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "#3b82f618", color: "#3b82f6" }}>&#128101;</span>
                  <div>
                    <span class="text-sm font-medium text-gray-200">Invite User</span>
                    <p class="text-[11px] text-gray-500">Send invitation to join the platform</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleExportData}
                  class="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-left transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.04]"
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "#10b98118", color: "#10b981" }}>&#128229;</span>
                  <div>
                    <span class="text-sm font-medium text-gray-200">Export Data</span>
                    <p class="text-[11px] text-gray-500">Download CSV of all user data</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleViewLogs}
                  class="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-left transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.04]"
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "#f59e0b18", color: "#f59e0b" }}>&#128203;</span>
                  <div>
                    <span class="text-sm font-medium text-gray-200">View Logs</span>
                    <p class="text-[11px] text-gray-500">Browse system and audit logs</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleSystemConfig}
                  class="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-left transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.04]"
                >
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm" style={{ background: "#a78bfa18", color: "#a78bfa" }}>&#9881;</span>
                  <div>
                    <span class="text-sm font-medium text-gray-200">System Config</span>
                    <p class="text-[11px] text-gray-500">Feature flags and environment settings</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invite User Modal */}
      <Show when={showInviteModal()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            class="mx-4 w-full max-w-md rounded-2xl border border-white/[0.08] p-6 shadow-2xl"
            style={{ background: "linear-gradient(135deg, rgba(20,20,20,0.98) 0%, rgba(12,12,12,0.99) 100%)" }}
          >
            <h3 class="mb-1 text-lg font-bold text-white">Invite User</h3>
            <p class="mb-5 text-xs text-gray-500">Send an invitation email to join the platform</p>
            <Show
              when={!inviteSent()}
              fallback={
                <div class="flex flex-col items-center gap-2 py-6">
                  <span class="text-3xl text-emerald-400">&#10003;</span>
                  <span class="text-sm font-medium text-emerald-400">Invitation sent to {inviteEmail()}</span>
                </div>
              }
            >
              <input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail()}
                onInput={(e) => setInviteEmail(e.currentTarget.value)}
                class="mb-4 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-blue-500/50"
              />
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  class="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] py-2.5 text-xs font-medium text-gray-400 transition-all hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitInvite}
                  class="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 py-2.5 text-xs font-semibold text-white transition-all hover:brightness-110"
                >
                  Send Invitation
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
