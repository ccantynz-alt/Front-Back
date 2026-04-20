import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For, Show, Suspense, createMemo, lazy } from "solid-js";
import type { JSX } from "solid-js";
import { Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { PlatformCrossSellCard } from "../components/PlatformCrossSellCard";
import { ProgressTracker } from "../components/ProgressTracker";
import { useAuth } from "../stores";
import { trpc } from "../lib/trpc";
import { useQuery } from "../lib/use-trpc";

// OnboardingWizard is a first-time-user overlay that renders nothing
// once `btf_onboarding_complete` is set in localStorage — so for every
// returning user it is dead weight in the dashboard chunk. Defer it.
const OnboardingWizard = lazy(() =>
  import("../components/OnboardingWizard").then((m) => ({
    default: m.OnboardingWizard,
  })),
);

// ── Types ────────────────────────────────────────────────────────────

type ProjectStatus =
  | "creating"
  | "active"
  | "building"
  | "deploying"
  | "stopped"
  | "error"
  | null;

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  framework: string | null;
  runtime: string | null;
  status: ProjectStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ── Skeleton ─────────────────────────────────────────────────────────

function Skeleton(props: { class?: string; height?: string }): JSX.Element {
  return (
    <div
      class={`animate-pulse rounded-md ${props.class ?? ""}`}
      style={{
        background: "var(--color-bg-subtle)",
        height: props.height ?? "1rem",
      }}
    />
  );
}

// ── Status helpers ───────────────────────────────────────────────────

function statusMeta(status: ProjectStatus): {
  label: string;
  color: string;
  dotPulse: boolean;
} {
  switch (status) {
    case "active":
      return { label: "Live", color: "var(--color-success)", dotPulse: true };
    case "building":
    case "deploying":
    case "creating":
      return { label: status === "creating" ? "Creating" : status === "deploying" ? "Deploying" : "Building", color: "var(--color-warning)", dotPulse: true };
    case "error":
      return { label: "Error", color: "var(--color-danger)", dotPulse: false };
    case "stopped":
      return { label: "Stopped", color: "var(--color-text-faint)", dotPulse: false };
    default:
      return { label: "Idle", color: "var(--color-text-faint)", dotPulse: false };
  }
}

function formatRelative(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "--";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatCostCents(cents: number): string {
  if (!cents || cents <= 0) return "$0.00";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Project Card ─────────────────────────────────────────────────────

interface ProjectCardProps {
  project: ProjectRow;
}

function ProjectCard(props: ProjectCardProps): JSX.Element {
  const meta = createMemo(() => statusMeta(props.project.status));
  return (
    <div
      class="group relative flex flex-col gap-4 overflow-hidden rounded-xl p-5 transition-all duration-200"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border-strong)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border)";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-1">
          <span
            class="truncate text-base font-semibold tracking-tight"
            style={{ color: "var(--color-text)" }}
          >
            {props.project.name}
          </span>
          <span
            class="truncate font-mono text-[11px]"
            style={{ color: "var(--color-text-faint)" }}
          >
            {props.project.slug}
          </span>
        </div>
        <div
          class="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1"
          style={{
            background: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span
            class={`h-2 w-2 rounded-full ${meta().dotPulse ? "animate-pulse" : ""}`}
            style={{ background: meta().color }}
          />
          <span
            class="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {meta().label}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Show when={props.project.framework}>
          <span
            class="rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{
              background: "var(--color-primary-light)",
              color: "var(--color-primary-text)",
            }}
          >
            {props.project.framework}
          </span>
        </Show>
        <Show when={props.project.runtime}>
          <span
            class="rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{
              background: "var(--color-bg-subtle)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
            }}
          >
            {props.project.runtime}
          </span>
        </Show>
      </div>

      <div
        class="flex items-center justify-between pt-3"
        style={{ "border-top": "1px solid var(--color-border)" }}
      >
        <span
          class="text-[11px]"
          style={{ color: "var(--color-text-faint)" }}
        >
          Updated {formatRelative(props.project.updatedAt)}
        </span>
        <A href={`/projects/${props.project.id}`}>
          <button
            class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text)",
              border: "1px solid var(--color-primary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-primary-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--color-primary)";
            }}
            type="button"
            aria-label={`Open project ${props.project.name}`}
          >
            Open →
          </button>
        </A>
      </div>
    </div>
  );
}

// ── Project Card Skeleton ────────────────────────────────────────────

function ProjectCardSkeleton(): JSX.Element {
  return (
    <div
      class="flex flex-col gap-4 rounded-xl p-5"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton class="w-2/3" height="1.1rem" />
          <Skeleton class="w-1/3" height="0.75rem" />
        </div>
        <Skeleton class="w-16" height="1.25rem" />
      </div>
      <div class="flex gap-2">
        <Skeleton class="w-16" height="0.9rem" />
        <Skeleton class="w-12" height="0.9rem" />
      </div>
      <div
        class="flex items-center justify-between pt-3"
        style={{ "border-top": "1px solid var(--color-border)" }}
      >
        <Skeleton class="w-24" height="0.75rem" />
        <Skeleton class="w-16" height="1.75rem" />
      </div>
    </div>
  );
}

// ── Empty Projects CTA ───────────────────────────────────────────────

function EmptyProjectsCTA(): JSX.Element {
  return (
    <div
      class="relative overflow-hidden rounded-xl p-8 text-center"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px dashed var(--color-border-strong)",
      }}
    >
      <div
        class="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, var(--color-primary-light), transparent 60%)",
        }}
      />
      <div class="relative flex flex-col items-center gap-4">
        <div
          class="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          style={{
            background: "var(--color-primary-light)",
            color: "var(--color-primary-text)",
            border: "1px solid var(--color-border)",
          }}
        >
          {"\u{1F680}"}
        </div>
        <div class="flex flex-col gap-1">
          <h3
            class="text-lg font-bold tracking-tight"
            style={{ color: "var(--color-text)" }}
          >
            Create your first project
          </h3>
          <p
            class="max-w-md text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            Spin up a SolidStart, Next.js, Remix, Astro, or Hono project and
            deploy to 330+ edge cities in seconds.
          </p>
        </div>
        <A href="/projects/new">
          <button
            class="rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors duration-150"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text)",
              border: "1px solid var(--color-primary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-primary-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--color-primary)";
            }}
            type="button"
          >
            Create Project →
          </button>
        </A>
      </div>
    </div>
  );
}

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
      totalProjects: 0,
      activeDeployments: 0,
      avgBuildTime: 0,
      monthlyAiCost: 0,
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

  const fmt = (n: number | undefined): string =>
    n === undefined ? "--" : n.toLocaleString();

  const apiIndicator = createMemo(() => {
    if (health.loading()) return { status: "Checking\u2026", color: "var(--color-text-muted)" };
    if (health.data()?.status === "ok") return { status: "Online", color: "var(--color-success)" };
    return { status: "Degraded", color: "var(--color-danger)" };
  });

  const projects = createMemo<ProjectRow[]>(
    () => (projectList.data() ?? []) as ProjectRow[],
  );

  const hasProjects = createMemo(
    () => !projectList.loading() && projects().length > 0,
  );

  const getStartedItems: ActivityItemProps[] = [
    { icon: "\u{1F4C1}", title: "Create your first project", description: "Set up a project with a name, framework, and deploy target.", time: "Step 1", href: "/projects/new" },
    { icon: "\u{1F5C4}", title: "Configure your database", description: "Connect Turso or Neon. Your data layer is ready in seconds.", time: "Step 2", href: "/database" },
    { icon: "\u{1F511}", title: "Set up authentication", description: "Passkeys, OAuth, or email+password. Auth is built in.", time: "Step 3", href: "/docs" },
    { icon: "\u{1F680}", title: "Deploy to the edge", description: "Push to deploy. Sub-5ms cold starts across 330+ cities.", time: "Step 4", href: "/deployments" },
    { icon: "\u{1F4CA}", title: "Monitor your app", description: "Real-time health, usage analytics, and AI inference metrics.", time: "Step 5", href: "/status" },
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
      <Suspense>
        <OnboardingWizard />
      </Suspense>
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
              value={usage.loading() ? "--" : fmt(usage.data()?.totalProjects)}
              icon="\u{1F4C1}"
            />
            <StatCard
              label="Active Deployments"
              value={
                usage.loading() ? "--" : fmt(usage.data()?.activeDeployments)
              }
              icon="\u{1F680}"
            />
            <StatCard
              label="Avg Build Time"
              value={
                usage.loading()
                  ? "--"
                  : formatDuration(usage.data()?.avgBuildTime ?? 0)
              }
              icon="\u{23F1}"
            />
            <StatCard
              label="AI Spend (30d)"
              value={
                usage.loading()
                  ? "--"
                  : formatCostCents(usage.data()?.monthlyAiCost ?? 0)
              }
              delta={
                usage.data()?.aiGenerations
                  ? `${fmt(usage.data()?.aiGenerations)} generations`
                  : undefined
              }
              icon="\u{1F916}"
            />
          </div>

          {/* ── Your Projects ───────────────────────────────────────── */}
          <div class="mb-8">
            <div class="mb-4 flex items-center gap-3">
              <span
                class="text-sm font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                Your Projects
              </span>
              <Show when={hasProjects()}>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    background: "var(--color-bg-subtle)",
                    color: "var(--color-text-muted)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {projects().length}
                </span>
              </Show>
              <div
                class="h-px flex-1"
                style={{ background: "var(--color-border)" }}
              />
              <Show when={hasProjects()}>
                <A
                  href="/projects"
                  class="text-xs transition-colors"
                  style={{ color: "var(--color-primary-text)" }}
                >
                  View all →
                </A>
              </Show>
            </div>
            <Show
              when={!projectList.loading()}
              fallback={
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <ProjectCardSkeleton />
                  <ProjectCardSkeleton />
                  <ProjectCardSkeleton />
                </div>
              }
            >
              <Show
                when={hasProjects()}
                fallback={
                  <div class="flex flex-col gap-4">
                    <EmptyProjectsCTA />
                    <PlatformCrossSellCard />
                  </div>
                }
              >
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={projects().slice(0, 6)}>
                    {(project) => <ProjectCard project={project} />}
                  </For>
                </div>
              </Show>
            </Show>
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
                    <Show when={hasProjects()} fallback="Get Started">
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
                  when={hasProjects()}
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
