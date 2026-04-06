import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { OnboardingWizard } from "../components/OnboardingWizard";
import { ProgressTracker } from "../components/ProgressTracker";
import { EmptyState } from "../components/ErrorState";
import { useAuth } from "../stores";
import { trpc } from "../lib/trpc";
import { useQuery } from "../lib/use-trpc";

// ── Quick Action Card ─────────────────────────────────────────────────

interface QuickActionProps {
  title: string;
  description: string;
  href: string;
  label: string;
  badge?: string;
}

function QuickAction(props: QuickActionProps): ReturnType<typeof Card> {
  return (
    <Card class="quick-action-card" padding="md">
      <Stack direction="vertical" gap="sm">
        <Stack direction="horizontal" justify="between" align="center">
          <Text variant="h4" weight="semibold">{props.title}</Text>
          <Show when={props.badge}>
            <Badge variant="info" size="sm">{props.badge}</Badge>
          </Show>
        </Stack>
        <Text variant="body" class="text-muted">{props.description}</Text>
        <A href={props.href}>
          <Button variant="outline" size="sm">{props.label}</Button>
        </A>
      </Stack>
    </Card>
  );
}

interface StatProps {
  label: string;
  value: string;
  delta?: string;
}
function Stat(props: StatProps): ReturnType<typeof Card> {
  return (
    <div class="dashboard-stat">
      <div class="dashboard-stat-label">{props.label}</div>
      <div class="dashboard-stat-value">{props.value}</div>
      <Show when={props.delta}>
        <div class="dashboard-stat-delta">{props.delta}</div>
      </Show>
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

  const firstName = createMemo(() => {
    const name = auth.currentUser()?.displayName;
    if (!name) return "builder";
    return name.split(" ")[0];
  });

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

  const fmt = (n: number | undefined): string =>
    n === undefined ? "--" : String(n);

  const stats = (): StatProps[] => [
    {
      label: "Total users",
      value: userList.loading() ? "--" : fmt(userList.data()?.total),
    },
    {
      label: "AI generations",
      value: usage.loading() ? "--" : fmt(usage.data()?.aiGenerations),
      delta: `${fmt(usage.data()?.pageViews)} page views`,
    },
    {
      label: "Feature uses",
      value: usage.loading() ? "--" : fmt(usage.data()?.featureUsage),
    },
    {
      label: "Unread alerts",
      value: unread.loading() ? "--" : String((unread.data() ?? []).length),
    },
  ];

  const quickActions: QuickActionProps[] = [
    {
      title: "AI Website Builder",
      description: "Describe what you want. Ship it in minutes. Validated component trees, zero boilerplate.",
      href: "/builder",
      label: "Open builder",
      badge: "Popular",
    },
    {
      title: "Video Editor",
      description: "GPU-accelerated editing straight in the browser. Effects, transitions, encoding — all on-device.",
      href: "/video",
      label: "Open editor",
      badge: "WebGPU",
    },
    {
      title: "Real-Time Collaboration",
      description: "Start a session. Invite your team. Let AI agents co-author alongside them.",
      href: "/collab",
      label: "Start session",
    },
    {
      title: "AI Playground",
      description: "Test prompts, swap models, tune agents. Ship from notebook to production in one click.",
      href: "/ai-playground",
      label: "Open playground",
    },
    {
      title: "Templates",
      description: "Start from a battle-tested blueprint. Clone, customize, deploy in under five minutes.",
      href: "/templates",
      label: "Browse templates",
    },
    {
      title: "Docs & guides",
      description: "Learn the platform like the pros. Architecture deep-dives, recipes, and API reference.",
      href: "/docs",
      label: "Read docs",
    },
  ];

  // Empty by default; replace with real activity stream when available.
  const recentActivity: { id: string; actor: string; action: string; at: string }[] = [];

  return (
    <ProtectedRoute>
      <OnboardingWizard />
      <Title>Dashboard — Marco Reid</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        {/* Header */}
        <Stack direction="vertical" gap="xs">
          <Text variant="caption" class="text-muted">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          <Text variant="h1" weight="bold">
            {greeting()}, {firstName()}.
          </Text>
          <Text variant="body" class="text-muted">
            Here's your command center. Everything you need, one click away.
          </Text>
        </Stack>

        {/* Stats */}
        <div class="stats-grid">
          <For each={stats()}>{(s) => <Stat label={s.label} value={s.value} delta={s.delta} />}</For>
        </div>

        {/* Quick actions */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Quick actions</Text>
          <div class="grid-3">
            <For each={quickActions}>
              {(action) => (
                <QuickAction
                  title={action.title}
                  description={action.description}
                  href={action.href}
                  label={action.label}
                  badge={action.badge}
                />
              )}
            </For>
          </div>
        </Stack>

        <ProgressTracker />

        {/* Recent activity */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Recent activity</Text>
          <Show
            when={recentActivity.length > 0}
            fallback={
              <EmptyState
                title="No activity yet"
                message="Spin up your first project and watch the feed come alive. Every build, every deploy, every agent run shows up here."
                actionLabel="Create a project"
                actionHref="/builder"
              />
            }
          >
            <Card padding="md">
              <Stack direction="vertical" gap="xs">
                <For each={recentActivity}>
                  {(item) => (
                    <Text variant="body">
                      <strong>{item.actor}</strong> {item.action} · <span class="text-muted">{item.at}</span>
                    </Text>
                  )}
                </For>
              </Stack>
            </Card>
          </Show>
        </Stack>

        {/* Account */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Account</Text>
          <Card padding="md">
            <Stack direction="vertical" gap="xs">
              <Text variant="body">
                <strong>Email:</strong> {auth.currentUser()?.email ?? "—"}
              </Text>
              <Text variant="body">
                <strong>Role:</strong> {auth.currentUser()?.role ?? "—"}
              </Text>
              <Text variant="caption" class="text-muted">
                Member since{" "}
                {auth.currentUser()?.createdAt
                  ? new Date(auth.currentUser()!.createdAt).toLocaleDateString()
                  : "—"}
              </Text>
            </Stack>
          </Card>
        </Stack>
      </Stack>
    </ProtectedRoute>
  );
}
