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

// ── Stat Card ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  delta?: string | undefined;
  icon: string;
}

function StatCard(props: StatCardProps): JSX.Element {
  return (
    <div
      class="rounded-xl p-5 transition-all duration-200"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border-strong)";
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div class="flex items-start justify-between">
        <div class="flex flex-col gap-1">
          <span
            class="text-xs font-medium uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            {props.label}
          </span>
          <span
            class="text-2xl font-bold tracking-tight"
            style={{ color: "var(--color-text)" }}
          >
            {props.value}
          </span>
          <Show when={props.delta}>
            <span
              class="mt-0.5 text-xs font-medium"
              style={{ color: "var(--color-success)" }}
            >
              {props.delta}
            </span>
          </Show>
        </div>
        <div
          class="flex h-9 w-9 items-center justify-center rounded-lg text-base"
          style={{
            background: "var(--color-primary-light)",
            color: "var(--color-primary-text)",
          }}
        >
          {props.icon}
        </div>
      </div>
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
}

function QuickAction(props: QuickActionProps): JSX.Element {
  return (
    <div
      class="rounded-xl p-5 transition-all duration-200"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border-strong)";
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-lg">{props.icon}</span>
            <span
              class="text-sm font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              {props.title}
            </span>
          </div>
          <Show when={props.badge}>
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: "var(--color-primary-light)",
                color: "var(--color-primary-text)",
              }}
            >
              {props.badge}
            </span>
          </Show>
        </div>
        <p
          class="text-xs leading-relaxed"
          style={{ color: "var(--color-text-muted)" }}
        >
          {props.description}
        </p>
        <A href={props.href}>
          <button
            class="mt-1 rounded-lg px-4 py-2 text-xs font-medium transition-colors duration-150"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-subtle)",
              color: "var(--color-text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-strong)";
              e.currentTarget.style.color = "var(--color-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.color = "var(--color-text-secondary)";
            }}
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
  href?: string | undefined;
}

function ActivityItem(props: ActivityItemProps): JSX.Element {
  const inner = (
    <div
      class="flex items-start gap-4 rounded-lg px-4 py-3 transition-colors duration-150"
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-bg-subtle)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{
          background: "var(--color-primary-light)",
          color: "var(--color-primary-text)",
        }}
      >
        {props.icon}
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          class="text-sm font-medium"
          style={{ color: "var(--color-text)" }}
        >
          {props.title}
        </span>
        <span
          class="text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          {props.description}
        </span>
      </div>
      <span
        class="shrink-0 text-[11px]"
        style={{ color: "var(--color-text-faint)" }}
      >
        {props.time}
      </span>
    </div>
  );

  return (
    <Show when={props.href} fallback={inner}>
      <A href={props.href!}>{inner}</A>
    </Show>
  );
}

// ── Usage Metric Row ──────────────────────────────────────────────────

function UsageMetric(props: { label: string; value: string }): JSX.Element {
  return (
    <div
      class="flex items-center justify-between rounded-lg px-4 py-3"
      style={{
        background: "var(--color-bg-subtle)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div class="flex items-center gap-3">
        <span
          class="h-2 w-2 rounded-full"
          style={{ background: "var(--color-primary)" }}
        />
        <span
          class="text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          {props.label}
        </span>
      </div>
      <span
        class="font-mono text-sm font-semibold"
        style={{ color: "var(--color-text)" }}
      >
        {props.value}
      </span>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────

export default function DashboardPage(): ReturnType<typeof ProtectedRoute> {
  const auth = useAuth();

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

  const projectList = useQuery(() =>
    trpc.projects.list
      .query()
      .catch(() => []),
  );

  const products = useQuery(() =>
    trpc.products.list.query().catch(() => []),
  );

  const fmt = (n: number | undefined): string =>
    n === undefined ? "--" : n.toLocaleString();

  const apiIndicator = createMemo(() => {
    if (health.loading()) return { status: "Checking\u2026", color: "var(--color-text-muted)" };
    if (health.data()?.status === "ok") return { status: "Online", color: "var(--color-success)" };
    return { status: "Degraded", color: "var(--color-danger)" };
  });

  const hasProducts = createMemo(
    () => !products.loading() && (products.data() ?? []).length > 0,
  );

  const getStartedItems: ActivityItemProps[] = [
    { icon: "\u{2795}", title: "Create your first project", description: "Set up a new site, app, or API project", time: "Step 1", href: "/builder" },
    { icon: "\u{2728}", title: "Try the Composer", description: "Generate a component tree from a prompt", time: "Step 2", href: "/builder" },
    { icon: "\u{26A1}", title: "Open Claude Chat", description: "Direct API access \u2014 your key, your data, your control", time: "Step 3", href: "/chat" },
    { icon: "\u{1F511}", title: "Configure API keys", description: "Add your OpenAI, Anthropic, or other provider keys", time: "Step 4", href: "/settings" },
    { icon: "\u{1F4CB}", title: "Browse templates", description: "Start from a battle-tested blueprint and customize", time: "Step 5", href: "/templates" },
  ];

  const quickActions: QuickActionProps[] = [
    { title: "Component Composer", description: "Generate validated SolidJS component trees from a prompt. Three-tier routing, zero boilerplate.", href: "/builder", label: "Open Composer", badge: "Popular", icon: "\u{1F680}" },
    { title: "Claude Chat", description: "Direct Anthropic API access. No subscriptions. Your key, your data, your control.", href: "/chat", label: "Open chat", icon: "\u{26A1}" },
    { title: "Repositories", description: "Your repos, PRs, branches, issues, and CI status. All in one command center.", href: "/repos", label: "View repos", icon: "\u{1F4BB}" },
    { title: "Templates", description: "Start from a battle-tested blueprint. Clone, customize, deploy in under five minutes.", href: "/templates", label: "Browse templates", icon: "\u{1F4CB}" },
    { title: "Ops Theatre", description: "Live build runs, CI status, and deployment logs. Full observability.", href: "/ops", label: "Open ops", icon: "\u{25B6}" },
  ];

  return (
    <ProtectedRoute>
      <OnboardingWizard />
      <Title>Dashboard — Crontech</Title>

      <div style={{ background: "var(--color-bg)" }}>
        <div class="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          {/* ── Header ──────────────────────────────────────────────── */}
          <div class="mb-8 flex flex-col gap-1">
            <span
              class="text-xs font-medium uppercase tracking-widest"
              style={{ color: "var(--color-text-faint)" }}
            >
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
            <h1
              class="text-3xl font-bold tracking-tight"
              style={{ color: "var(--color-text)" }}
            >
              {greeting()},{" "}
              <span style={{ color: "var(--color-primary)" }}>
                {firstName()}
              </span>
            </h1>
            <p
              class="text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Your command center. Everything you need, one click away.
            </p>
          </div>

          {/* ── System Status Bar ───────────────────────────────────── */}
          <div
            class="mb-8 flex flex-wrap items-center gap-4 rounded-lg px-5 py-3"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-elevated)",
            }}
          >
            <span
              class="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-muted)" }}
            >
              System Status
            </span>
            <div
              class="h-4 w-px"
              style={{ background: "var(--color-border)" }}
            />
            <div class="flex items-center gap-2">
              <div
                class="h-1.5 w-1.5 rounded-full"
                style={{ background: apiIndicator().color }}
              />
              <span
                class="text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                API:{" "}
                <span class="font-medium" style={{ color: "var(--color-text)" }}>
                  {apiIndicator().status}
                </span>
              </span>
            </div>
            <A
              href="/status"
              class="ml-auto text-xs transition-colors"
              style={{ color: "var(--color-primary-text)" }}
            >
              Full service status →
            </A>
          </div>

          {/* ── Stats Grid ──────────────────────────────────────────── */}
          <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Projects"
              value={projectList.loading() ? "--" : fmt(projectList.data()?.length)}
              icon="\u{1F4C1}"
            />
            <StatCard
              label="Deployments"
              value={usage.loading() ? "--" : fmt(usage.data()?.featureUsage)}
              icon="\u{1F680}"
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
            />
            <StatCard
              label="Unread Alerts"
              value={
                unread.loading()
                  ? "--"
                  : String((unread.data() ?? []).length)
              }
              icon="\u{1F514}"
            />
          </div>

          {/* ── Main Grid: Activity + Usage ─────────────────────────── */}
          <div class="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div
              class="lg:col-span-2 overflow-hidden rounded-xl"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                class="flex items-center justify-between px-6 py-4"
                style={{ "border-bottom": "1px solid var(--color-border)" }}
              >
                <div class="flex items-center gap-3">
                  <div
                    class="h-2 w-2 animate-pulse rounded-full"
                    style={{ background: "var(--color-success)" }}
                  />
                  <span
                    class="text-sm font-semibold"
                    style={{ color: "var(--color-text)" }}
                  >
                    <Show when={hasProducts()} fallback="Get Started">
                      Recent Activity
                    </Show>
                  </span>
                </div>
                <A
                  href="/settings"
                  class="text-xs transition-colors"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  View all
                </A>
              </div>
              <div class="p-2">
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
                      />
                    )}
                  </For>
                </Show>
              </div>
            </div>

            <div
              class="overflow-hidden rounded-xl"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                class="flex items-center justify-between px-6 py-4"
                style={{ "border-bottom": "1px solid var(--color-border)" }}
              >
                <span
                  class="text-sm font-semibold"
                  style={{ color: "var(--color-text)" }}
                >
                  Usage summary
                </span>
                <span
                  class="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  all-time
                </span>
              </div>
              <div class="flex flex-col gap-3 p-6">
                <UsageMetric
                  label="AI generations"
                  value={usage.loading() ? "\u2026" : fmt(usage.data()?.aiGenerations)}
                />
                <UsageMetric
                  label="Page views"
                  value={usage.loading() ? "\u2026" : fmt(usage.data()?.pageViews)}
                />
                <UsageMetric
                  label="Feature events"
                  value={usage.loading() ? "\u2026" : fmt(usage.data()?.featureUsage)}
                />
                <p
                  class="mt-2 text-[11px] leading-relaxed"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Time-series charts arrive with the analytics rollup service.
                  These are aggregate counts from your analytics events.
                </p>
              </div>
            </div>
          </div>

          {/* ── Quick Actions ───────────────────────────────────────── */}
          <div class="mb-8">
            <div class="mb-4 flex items-center gap-3">
              <span
                class="text-sm font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                Quick Actions
              </span>
              <div
                class="h-px flex-1"
                style={{ background: "var(--color-border)" }}
              />
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
                  />
                )}
              </For>
            </div>
          </div>

          <ProgressTracker />

          {/* ── Account Card ────────────────────────────────────────── */}
          <div
            class="mt-8 rounded-xl p-6"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div class="mb-4 flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold"
                style={{ background: "var(--color-primary)", color: "var(--color-text)" }}
              >
                {firstName().charAt(0).toUpperCase()}
              </div>
              <div class="flex flex-col">
                <span
                  class="text-sm font-semibold"
                  style={{ color: "var(--color-text)" }}
                >
                  {auth.currentUser()?.displayName ?? "Unknown"}
                </span>
                <span
                  class="text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {auth.currentUser()?.email ?? "--"}
                </span>
              </div>
              <Badge variant="info" size="sm" class="ml-auto">
                {auth.currentUser()?.role ?? "member"}
              </Badge>
            </div>
            <div
              class="flex items-center gap-6 text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
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
                class="font-medium transition-colors"
                style={{ color: "var(--color-primary-text)" }}
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
