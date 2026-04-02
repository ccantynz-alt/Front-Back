import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For } from "solid-js";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useAuth } from "../stores";

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
            Welcome back, {auth.currentUser()?.displayName ?? "User"}
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
                <strong>Email:</strong> {auth.currentUser()?.email}
              </Text>
              <Text variant="body">
                <strong>Role:</strong> {auth.currentUser()?.role}
              </Text>
              <Text variant="caption" class="text-muted">
                Member since {auth.currentUser()?.createdAt ? new Date(auth.currentUser()!.createdAt).toLocaleDateString() : "N/A"}
              </Text>
            </Stack>
          </Card>
        </Stack>
      </Stack>
    </ProtectedRoute>
  );
}
