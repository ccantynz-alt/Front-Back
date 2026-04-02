import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createResource, For, Show, Suspense } from "solid-js";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useAuth } from "../stores";
import { trpc } from "../lib/trpc";

// ── Quick Action Card ─────────────────────────────────────────────────

interface QuickActionProps {
  title: string;
  description: string;
  href: string;
  label: string;
}

function QuickAction(props: QuickActionProps): ReturnType<typeof Card> {
  return (
    <Card class="quick-action-card" padding="md">
      <Stack direction="vertical" gap="sm">
        <Text variant="h4" weight="semibold">{props.title}</Text>
        <Text variant="body" class="text-muted">{props.description}</Text>
        <A href={props.href}>
          <Button variant="outline" size="sm">{props.label}</Button>
        </A>
      </Stack>
    </Card>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────

export default function DashboardPage(): ReturnType<typeof ProtectedRoute> {
  const auth = useAuth();

  // Fetch current user profile from API for fresh data
  const [profile] = createResource(
    () => auth.isAuthenticated(),
    async (isAuthed) => {
      if (!isAuthed) return null;
      try {
        return await trpc.auth.me.query();
      } catch {
        return null;
      }
    },
  );

  // Fetch recent users list (for admin dashboard or team view)
  const [recentUsers] = createResource(
    () => auth.isAuthenticated(),
    async (isAuthed) => {
      if (!isAuthed) return null;
      try {
        return await trpc.users.list.query({ limit: 5 });
      } catch {
        return null;
      }
    },
  );

  // Use profile from API if available, fall back to cached auth state
  const displayName = (): string =>
    profile()?.displayName ?? auth.currentUser()?.displayName ?? "User";
  const displayEmail = (): string | undefined =>
    profile()?.email ?? auth.currentUser()?.email;
  const displayRole = (): string | undefined =>
    profile()?.role ?? auth.currentUser()?.role;
  const displayCreatedAt = (): string | undefined => {
    const raw = profile()?.createdAt ?? auth.currentUser()?.createdAt;
    if (!raw) return undefined;
    return new Date(raw).toLocaleDateString();
  };

  const quickActions: QuickActionProps[] = [
    {
      title: "AI Website Builder",
      description: "Create a new website with AI assistance. Describe what you want and watch it build.",
      href: "/builder",
      label: "Open Builder",
    },
    {
      title: "Projects",
      description: "View and manage your existing projects, deployments, and assets.",
      href: "/dashboard",
      label: "Browse Projects",
    },
    {
      title: "Collaboration",
      description: "Join a real-time editing session or invite team members to collaborate.",
      href: "/dashboard",
      label: "Start Session",
    },
  ];

  return (
    <ProtectedRoute>
      <Title>Dashboard - Back to the Future</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">
            Welcome back, {displayName()}
          </Text>
          <Text variant="body" class="text-muted">
            Here is your workspace overview.
          </Text>
        </Stack>

        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Quick Actions</Text>
          <div class="grid-3">
            <For each={quickActions}>
              {(action) => (
                <QuickAction
                  title={action.title}
                  description={action.description}
                  href={action.href}
                  label={action.label}
                />
              )}
            </For>
          </div>
        </Stack>

        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Account</Text>
          <Card padding="md">
            <Stack direction="vertical" gap="xs">
              <Text variant="body">
                <strong>Email:</strong> {displayEmail()}
              </Text>
              <Text variant="body">
                <strong>Role:</strong> {displayRole()}
              </Text>
              <Text variant="caption" class="text-muted">
                Member since {displayCreatedAt() ?? "N/A"}
              </Text>
            </Stack>
          </Card>
        </Stack>

        <Show when={recentUsers()}>
          {(data) => (
            <Stack direction="vertical" gap="sm">
              <Text variant="h3" weight="semibold">
                Team Members ({data().total})
              </Text>
              <Suspense fallback={<Text variant="body">Loading team...</Text>}>
                <For each={data().items}>
                  {(user) => (
                    <Card padding="sm">
                      <Stack direction="horizontal" gap="md">
                        <Text variant="body" weight="semibold">
                          {user.displayName}
                        </Text>
                        <Text variant="caption" class="text-muted">
                          {user.email}
                        </Text>
                        <Text variant="caption" class="text-muted">
                          {user.role}
                        </Text>
                      </Stack>
                    </Card>
                  )}
                </For>
              </Suspense>
            </Stack>
          )}
        </Show>
      </Stack>
    </ProtectedRoute>
  );
}
