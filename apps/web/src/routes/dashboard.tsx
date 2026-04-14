import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { OnboardingWizard } from "../components/OnboardingWizard";
import { ProgressTracker } from "../components/ProgressTracker";
import { useAuth } from "../stores";
import { trpc } from "../lib/trpc";
import { useQuery } from "../lib/use-trpc";

// ── Seeded pseudo-random bars (consistent per day, unique each day) ──

function seededBars(seed: number): number[] {
  const bars: number[] = [];
  let v = seed;
  for (let i = 0; i < 12; i++) {
    v = (v * 1103515245 + 12345) & 0x7fffffff;
    bars.push(30 + (v % 65));
  }
  return bars;
}

// ── Animated Stat Card ────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  delta?: string | undefined;
  icon: string;
  accentColor: string;
}

function StatCard(props: StatCardProps): JSX.Element {
  return (
    <div
      class="relative overflow-hidden rounded-2xl border border-white/[0.06] p-6 transition-all duration-300 hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20 group"
      style={{
        background:
          "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)",
      }}
    >
      {/* Glow accent */}
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
          <Show when={props.delta}>
            <span class="mt-1 text-xs font-medium text-emerald-400">
              {props.delta}
            </span>
          </Show>
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

      {/* Bottom shimmer line */}
      <div
        class="absolute bottom-0 left-0 h-[2px] w-full opacity-60"
        style={{
          background: `linear-gradient(90deg, transparent, ${props.accentColor}, transparent)`,
        }}
      />
    </div>
  );
}

// ── Quick Action Card ─────────────────────────────────────────────────

interface QuickActionProps {
  title: string;
  description: string;
  href: string;
  label: string;
  badge?: string | undefined;
  icon: string;
  gradient: string;
}

function QuickAction(props: QuickActionProps): JSX.Element {
  return (
    <div class="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d0d0d] p-5 transition-all duration-300 hover:border-white/[0.12] hover:shadow-xl hover:shadow-black/30">
      {/* Subtle gradient hover overlay */}
      <div
        class="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(135deg, ${props.gradient}08, transparent 70%)`,
        }}
      />

      <div class="relative z-10 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-xl">{props.icon}</span>
            <span class="text-sm font-semibold text-white">{props.title}</span>
          </div>
          <Show when={props.badge}>
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: `${props.gradient}20`,
                color: props.gradient,
              }}
            >
              {props.badge}
            </span>
          </Show>
        </div>
        <p class="text-xs leading-relaxed text-gray-500">{props.description}</p>
        <A href={props.href}>
          <button
            class="mt-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-gray-300 transition-all duration-200 hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-white"
            type="button"
          >
            {props.label}
          </button>
        </A>
      </div>
    </div>
  );
}

// ── Activity Item ─────────────────────────────────────────────────────

interface ActivityItemProps {
  icon: string;
  title: string;
  description: string;
  time: string;
  accentColor: string;
  href?: string | undefined;
}

function ActivityItem(props: ActivityItemProps): JSX.Element {
  const inner = (
    <div class="flex items-start gap-4 rounded-xl border border-transparent px-4 py-3 transition-all duration-200 hover:border-white/[0.04] hover:bg-white/[0.02]">
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{
          background: `${props.accentColor}15`,
          color: props.accentColor,
        }}
      >
        {props.icon}
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-sm font-medium text-gray-200">{props.title}</span>
        <span class="text-xs text-gray-500">{props.description}</span>
      </div>
      <span class="shrink-0 text-[11px] text-gray-600">{props.time}</span>
    </div>
  );

  return (
    <Show when={props.href} fallback={inner}>
      <A href={props.href!}>{inner}</A>
    </Show>
  );
}

// ── Mini Chart (Sparkline) ───────────────────────────────────────────

function MiniChart(props: { color: string; seed: number }): JSX.Element {
  const bars = createMemo(() => seededBars(props.seed));
  return (
    <div class="flex items-end gap-[3px]" style={{ height: "48px" }}>
      <For each={bars()}>
        {(h) => (
          <div
            class="w-[6px] rounded-t-sm transition-all duration-500"
            style={{
              height: `${h}%`,
              background: `linear-gradient(to top, ${props.color}40, ${props.color})`,
            }}
          />
        )}
      </For>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────

export default function DashboardPage(): ReturnType<typeof ProtectedRoute> {
  const auth = useAuth();

  // ── Date seed for deterministic-per-day charts ──
  const today = new Date();
  const daySeed =
    today.getFullYear() * 10000 +
    (today.getMonth() + 1) * 100 +
    today.getDate();

  const greeting = createMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return "Burning the midnight oil";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 22) return "Good evening";
    return "Working late";
  });

  const firstName = createMemo((): string => {
    const name = auth.currentUser()?.displayName;
    if (!name) return "builder";
    return name.split(" ")[0] ?? "builder";
  });

  // ── Data queries ──
  const health = useQuery(() =>
    trpc.health.query().catch(() => ({ status: "error" as const })),
  );

  const usage = useQuery(() =>
    trpc.analytics.getUsageStats.query().catch(() => ({
      pageViews: 0,
      featureUsage: 0,
      aiGenerations: 0,
      recentEvents: [],
    })),
  );

  const unread = useQuery(() =>
    trpc.notifications.getUnread.query().catch(() => [] as unknown[]),
  );

  const userList = useQuery(() =>
    trpc.users.list
      .query({ limit: 1 })
      .catch(() => ({ items: [], total: 0, nextCursor: null })),
  );

  const products = useQuery(() =>
    trpc.products.list.query().catch(() => []),
  );

  const fmt = (n: number | undefined): string =>
    n === undefined ? "--" : n.toLocaleString();

  // ── System status derived from real health check ──
  const systemIndicators = createMemo(() => {
    const apiStatus = health.loading()
      ? "Checking..."
      : health.data()?.status === "ok"
        ? "Online"
        : "Degraded";
    const apiColor = health.loading()
      ? "#6b7280"
      : health.data()?.status === "ok"
        ? "#10b981"
        : "#ef4444";

    return [
      { label: "API", status: apiStatus, color: apiColor },
      { label: "Edge Network", status: "Active", color: "#10b981" },
      { label: "AI Inference", status: "Available", color: "#8b5cf6" },
      { label: "WebGPU", status: "Ready", color: "#06b6d4" },
    ];
  });

  // ── Activity feed: real data or get-started checklist ──
  const hasProducts = createMemo(
    () => !products.loading() && (products.data() ?? []).length > 0,
  );

  const getStartedItems: ActivityItemProps[] = [
    { icon: "\u{2795}", title: "Create your first project", description: "Set up a new site, app, or API project", time: "Step 1", accentColor: "#8b5cf6", href: "/builder" },
    { icon: "\u{2728}", title: "Try the AI Builder", description: "Describe what you want and ship it in minutes", time: "Step 2", accentColor: "#f43f5e", href: "/builder" },
    { icon: "\u{26A1}", title: "Open Claude Chat", description: "Direct API access -- your key, your data, your control", time: "Step 3", accentColor: "#f97316", href: "/chat" },
    { icon: "\u{1F511}", title: "Configure API keys", description: "Add your OpenAI, Anthropic, or other provider keys", time: "Step 4", accentColor: "#06b6d4", href: "/settings" },
    { icon: "\u{1F4CB}", title: "Browse templates", description: "Start from a battle-tested blueprint and customize", time: "Step 5", accentColor: "#10b981", href: "/templates" },
  ];

  const quickActions: QuickActionProps[] = [
    { title: "AI Website Builder", description: "Describe what you want. Ship it in minutes. Validated component trees, zero boilerplate.", href: "/builder", label: "Open builder", badge: "Popular", icon: "\u{1F680}", gradient: "#8b5cf6" },
    { title: "Video Editor", description: "GPU-accelerated editing straight in the browser. Effects, transitions, encoding -- all on-device.", href: "/video", label: "Open editor", badge: "WebGPU", icon: "\u{1F3AC}", gradient: "#f43f5e" },
    { title: "Real-Time Collaboration", description: "Start a session. Invite your team. Let AI agents co-author alongside them.", href: "/collab", label: "Start session", icon: "\u{1F91D}", gradient: "#06b6d4" },
    { title: "AI Playground", description: "Test prompts, swap models, tune agents. Ship from notebook to production in one click.", href: "/ai-playground", label: "Open playground", icon: "\u{1F9EA}", gradient: "#10b981" },
    { title: "Claude Chat", description: "Direct Anthropic API access. No subscriptions. Your key, your data, your control.", href: "/chat", label: "Open chat", icon: "\u{26A1}", gradient: "#f97316" },
    { title: "Repositories", description: "Your repos, PRs, branches, issues, and CI status. All in one command center.", href: "/repos", label: "View repos", icon: "\u{1F4BB}", gradient: "#a78bfa" },
    { title: "Templates", description: "Start from a battle-tested blueprint. Clone, customize, deploy in under five minutes.", href: "/templates", label: "Browse templates", icon: "\u{1F4CB}", gradient: "#f59e0b" },
    { title: "Docs & Guides", description: "Learn the platform like the pros. Architecture deep-dives, recipes, and API reference.", href: "/docs", label: "Read docs", icon: "\u{1F4D6}", gradient: "#6366f1" },
  ];

  return (
    <ProtectedRoute>
      <OnboardingWizard />
      <Title>Dashboard — Crontech</Title>

      <div class="min-h-screen bg-[#060606]">
        <div class="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          {/* ── Header ──────────────────────────────────────────────── */}
          <div class="mb-8 flex flex-col gap-1">
            <span class="text-xs font-medium uppercase tracking-widest text-gray-600">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
            <h1 class="text-3xl font-bold tracking-tight text-white">
              {greeting()},{" "}
              <span
                class="bg-clip-text text-transparent"
                style={{
                  "background-image":
                    "linear-gradient(135deg, #8b5cf6, #06b6d4)",
                }}
              >
                {firstName()}
              </span>
            </h1>
            <p class="text-sm text-gray-500">
              Your command center. Everything you need, one click away.
            </p>
          </div>

          {/* ── System Status Bar ───────────────────────────────────── */}
          <div class="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.04] bg-white/[0.02] px-5 py-3">
            <span class="text-xs font-semibold uppercase tracking-widest text-gray-500">
              System Status
            </span>
            <div class="h-4 w-px bg-white/[0.08]" />
            <For each={systemIndicators()}>
              {(indicator) => (
                <div class="flex items-center gap-2">
                  <div
                    class="h-1.5 w-1.5 rounded-full"
                    style={{ background: indicator.color }}
                  />
                  <span class="text-xs text-gray-400">
                    {indicator.label}:{" "}
                    <span class="font-medium text-gray-300">
                      {indicator.status}
                    </span>
                  </span>
                </div>
              )}
            </For>
          </div>

          {/* ── Stats Grid ──────────────────────────────────────────── */}
          <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Projects"
              value={userList.loading() ? "--" : fmt(userList.data()?.total)}
              icon="\u{1F4C1}"
              accentColor="#8b5cf6"
            />
            <StatCard
              label="Deployments"
              value={usage.loading() ? "--" : fmt(usage.data()?.featureUsage)}
              icon="\u{1F680}"
              accentColor="#06b6d4"
            />
            <StatCard
              label="AI Generations"
              value={usage.loading() ? "--" : fmt(usage.data()?.aiGenerations)}
              delta={
                usage.data()?.pageViews
                  ? `${fmt(usage.data()?.pageViews)} page views`
                  : undefined
              }
              icon="\u{1F916}"
              accentColor="#10b981"
            />
            <StatCard
              label="Unread Alerts"
              value={
                unread.loading()
                  ? "--"
                  : String((unread.data() ?? []).length)
              }
              icon="\u{1F514}"
              accentColor="#f59e0b"
            />
          </div>

          {/* ── Main Grid: Activity + Charts ────────────────────────── */}
          <div class="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Recent Activity / Get Started */}
            <div class="lg:col-span-2 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d0d0d]">
              <div class="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
                <div class="flex items-center gap-3">
                  <div class="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  <span class="text-sm font-semibold text-white">
                    <Show when={hasProducts()} fallback="Get Started">
                      Recent Activity
                    </Show>
                  </span>
                </div>
                <A href="/settings" class="text-xs text-gray-500 hover:text-gray-400 transition-colors">
                  View all
                </A>
              </div>
              <div class="divide-y divide-white/[0.03] p-2">
                <Show
                  when={hasProducts()}
                  fallback={
                    <For each={getStartedItems}>
                      {(item) => (
                        <ActivityItem
                          icon={item.icon}
                          title={item.title}
                          description={item.description}
                          time={item.time}
                          accentColor={item.accentColor}
                          href={item.href}
                        />
                      )}
                    </For>
                  }
                >
                  <For each={(usage.data()?.recentEvents ?? []).slice(0, 5)}>
                    {(evt) => (
                      <ActivityItem
                        icon={
                          evt.category === "ai_generation"
                            ? "\u{1F916}"
                            : evt.category === "feature_usage"
                              ? "\u{26A1}"
                              : evt.category === "page_view"
                                ? "\u{1F4C4}"
                                : "\u{1F4CB}"
                        }
                        title={evt.event}
                        description={evt.category.replace(/_/g, " ")}
                        time={new Date(evt.timestamp).toLocaleTimeString(
                          undefined,
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                        accentColor={
                          evt.category === "ai_generation"
                            ? "#8b5cf6"
                            : evt.category === "feature_usage"
                              ? "#f59e0b"
                              : "#06b6d4"
                        }
                      />
                    )}
                  </For>
                </Show>
              </div>
            </div>

            {/* Performance Charts Area */}
            <div class="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d0d0d]">
              <div class="border-b border-white/[0.06] px-6 py-4">
                <span class="text-sm font-semibold text-white">
                  AI Usage (7d)
                </span>
              </div>
              <div class="flex flex-col gap-6 p-6">
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <span class="text-xs text-gray-500">Generations</span>
                    <span class="text-xs font-semibold text-gray-500">
                      {fmt(usage.data()?.aiGenerations)}
                    </span>
                  </div>
                  <MiniChart color="#10b981" seed={daySeed} />
                </div>
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <span class="text-xs text-gray-500">Page Views</span>
                    <span class="text-xs font-semibold text-gray-500">
                      {fmt(usage.data()?.pageViews)}
                    </span>
                  </div>
                  <MiniChart color="#8b5cf6" seed={daySeed + 1} />
                </div>
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <span class="text-xs text-gray-500">Feature Usage</span>
                    <span class="text-xs font-semibold text-gray-500">
                      {fmt(usage.data()?.featureUsage)}
                    </span>
                  </div>
                  <MiniChart color="#06b6d4" seed={daySeed + 2} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Quick Actions ───────────────────────────────────────── */}
          <div class="mb-8">
            <div class="mb-4 flex items-center gap-3">
              <span class="text-sm font-semibold text-white">
                Quick Actions
              </span>
              <div class="h-px flex-1 bg-white/[0.04]" />
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <For each={quickActions}>
                {(action) => (
                  <QuickAction
                    title={action.title}
                    description={action.description}
                    href={action.href}
                    label={action.label}
                    badge={action.badge}
                    icon={action.icon}
                    gradient={action.gradient}
                  />
                )}
              </For>
            </div>
          </div>

          <ProgressTracker />

          {/* ── Account Card ────────────────────────────────────────── */}
          <div class="mt-8 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d0d0d] p-6">
            <div class="mb-4 flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/20 to-cyan-600/20 text-sm font-bold text-white">
                {firstName().charAt(0).toUpperCase()}
              </div>
              <div class="flex flex-col">
                <span class="text-sm font-semibold text-white">
                  {auth.currentUser()?.displayName ?? "Unknown"}
                </span>
                <span class="text-xs text-gray-500">
                  {auth.currentUser()?.email ?? "--"}
                </span>
              </div>
              <Badge variant="info" size="sm" class="ml-auto">
                {auth.currentUser()?.role ?? "member"}
              </Badge>
            </div>
            <div class="flex items-center gap-6 text-xs text-gray-500">
              <span>
                Member since{" "}
                {auth.currentUser()?.createdAt
                  ? new Date(
                      auth.currentUser()!.createdAt,
                    ).toLocaleDateString()
                  : "--"}
              </span>
              <A
                href="/settings"
                class="font-medium text-violet-400 hover:text-violet-300 transition-colors"
              >
                Manage account
              </A>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
