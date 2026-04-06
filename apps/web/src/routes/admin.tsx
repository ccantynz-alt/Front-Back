import { Title } from "@solidjs/meta";
import { createSignal, createResource, Show, For } from "solid-js";
import type { JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Card, Stack, Text, Badge, Spinner } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useAuth } from "../stores";
import { trpc } from "../lib/trpc";

// ── Admin Guard ──────────────────────────────────────────────────────

function AdminGuard(props: { children: JSX.Element }): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();

  const isAdmin = (): boolean => auth.currentUser()?.role === "admin";

  return (
    <ProtectedRoute>
      <Show
        when={isAdmin()}
        fallback={
          <Stack direction="vertical" gap="md" class="page-padded">
            <Text variant="h2" weight="bold">Access Denied</Text>
            <Text variant="body" class="text-muted">
              You do not have permission to view this page. Admin role required.
            </Text>
            <Button variant="primary" size="sm" onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </Button>
          </Stack>
        }
      >
        {props.children}
      </Show>
    </ProtectedRoute>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
}

function StatCard(props: StatCardProps): JSX.Element {
  return (
    <Card padding="md">
      <Stack direction="vertical" gap="xs">
        <Text variant="caption" class="text-muted">{props.label}</Text>
        <Text variant="h2" weight="bold">{String(props.value)}</Text>
        <Show when={props.subtext}>
          <Text variant="caption" class="text-muted">{props.subtext}</Text>
        </Show>
      </Stack>
    </Card>
  );
}

// ── Health Indicator ─────────────────────────────────────────────────

function HealthIndicator(props: { label: string; status: string }): JSX.Element {
  const variant = (): "success" | "warning" | "error" => {
    if (props.status === "ok" || props.status === "active") return "success";
    if (props.status === "inactive") return "warning";
    return "error";
  };

  return (
    <Stack direction="horizontal" gap="sm" align="center">
      <Badge variant={variant()} size="sm">{props.status}</Badge>
      <Text variant="body">{props.label}</Text>
    </Stack>
  );
}

// ── Admin Dashboard Page ─────────────────────────────────────────────

export default function AdminPage(): JSX.Element {
  const [statsData] = createResource(() => trpc.admin.getStats.query());
  const [recentUsers] = createResource(() => trpc.admin.getRecentUsers.query());
  const [recentPayments] = createResource(() => trpc.admin.getRecentPayments.query());
  const [systemHealth] = createResource(() => trpc.admin.getSystemHealth.query());
  const [flags] = createResource(() => trpc.featureFlags.getAll.query());
  const [collabRooms] = createResource(() => trpc.collab.getRooms.query());
  const [supportStats] = createResource(() => trpc.support.getStats.query());
  const navigateToSupport = (): void => { window.location.href = "/admin/support"; };

  const [togglingFlag, setTogglingFlag] = createSignal<string | null>(null);

  const handleToggleFlag = async (key: string, currentEnabled: boolean): Promise<void> => {
    setTogglingFlag(key);
    try {
      await trpc.admin.toggleFeatureFlag.mutate({
        key,
        enabled: !currentEnabled,
      });
      // Refetch flags -- createResource refetch not available directly,
      // so we just reload the page section. In production, use a store.
      window.location.reload();
    } catch (err) {
      console.error("Failed to toggle flag:", err);
    } finally {
      setTogglingFlag(null);
    }
  };

  const formatCurrency = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (date: Date | string | null): string => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <AdminGuard>
      <Title>Admin Dashboard - Marco Reid</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">Admin Dashboard</Text>
          <Text variant="body" class="text-muted">
            Platform overview and management controls.
          </Text>
        </Stack>

        {/* Platform Stats */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Platform Stats</Text>
          <Show when={!statsData.loading} fallback={<Spinner />}>
            <div class="grid-4">
              <StatCard
                label="Total Users"
                value={statsData()?.totalUsers ?? 0}
              />
              <StatCard
                label="Active Subscriptions"
                value={statsData()?.activeSubscriptions ?? 0}
              />
              <StatCard
                label="Total Revenue"
                value={formatCurrency(statsData()?.totalRevenue ?? 0)}
              />
              <StatCard
                label="AI Generations"
                value={statsData()?.aiGenerations ?? 0}
              />
            </div>
          </Show>
        </Stack>

        {/* Support Metrics */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">AI Support Inbox</Text>
          <Show when={!supportStats.loading} fallback={<Spinner />}>
            <Card padding="md">
              <Stack direction="vertical" gap="sm">
                <div class="grid-4">
                  <Stack direction="vertical" gap="xs">
                    <Text variant="caption" class="text-muted">Total tickets</Text>
                    <Text variant="h2" weight="bold">{supportStats()?.totalTickets ?? 0}</Text>
                  </Stack>
                  <Stack direction="vertical" gap="xs">
                    <Text variant="caption" class="text-muted">Auto-resolved</Text>
                    <Text variant="h2" weight="bold">
                      <Badge variant="success" size="sm">{supportStats()?.autoResolved ?? 0}</Badge>
                    </Text>
                  </Stack>
                  <Stack direction="vertical" gap="xs">
                    <Text variant="caption" class="text-muted">Awaiting review</Text>
                    <Text variant="h2" weight="bold">
                      <Badge variant="warning" size="sm">{supportStats()?.awaitingReview ?? 0}</Badge>
                    </Text>
                  </Stack>
                  <Stack direction="vertical" gap="xs">
                    <Text variant="caption" class="text-muted">Escalated</Text>
                    <Text variant="h2" weight="bold">
                      <Badge variant="error" size="sm">{supportStats()?.escalated ?? 0}</Badge>
                    </Text>
                  </Stack>
                </div>
                <Button variant="primary" size="sm" onClick={navigateToSupport}>
                  Open support inbox
                </Button>
              </Stack>
            </Card>
          </Show>
        </Stack>

        {/* System Health */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">System Health</Text>
          <Show when={!systemHealth.loading} fallback={<Spinner />}>
            <Card padding="md">
              <Stack direction="vertical" gap="sm">
                <HealthIndicator label="API Server" status={systemHealth()?.api ?? "unknown"} />
                <HealthIndicator label="Database" status={systemHealth()?.database ?? "unknown"} />
                <HealthIndicator label="Sentinel Intelligence" status={systemHealth()?.sentinel ?? "unknown"} />
                <HealthIndicator label="WebSocket" status={systemHealth()?.websocket ?? "unknown"} />
                <Text variant="caption" class="text-muted">
                  Feature flags loaded: {systemHealth()?.flagsLoaded ?? 0} | Last check: {formatDate(systemHealth()?.timestamp ?? null)}
                </Text>
              </Stack>
            </Card>
          </Show>
        </Stack>

        {/* Recent Signups */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Recent Signups</Text>
          <Show when={!recentUsers.loading} fallback={<Spinner />}>
            <Card padding="md">
              <Show
                when={(recentUsers() ?? []).length > 0}
                fallback={<Text variant="body" class="text-muted">No users yet.</Text>}
              >
                <div class="admin-table">
                  <div class="admin-table-header">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Role</span>
                    <span>Joined</span>
                  </div>
                  <For each={recentUsers()}>
                    {(user) => (
                      <div class="admin-table-row">
                        <span>{user.displayName}</span>
                        <span>{user.email}</span>
                        <Badge variant={user.role === "admin" ? "warning" : "default"} size="sm">
                          {user.role}
                        </Badge>
                        <span class="text-muted">{formatDate(user.createdAt)}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Card>
          </Show>
        </Stack>

        {/* Recent Payments */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Recent Payments</Text>
          <Show when={!recentPayments.loading} fallback={<Spinner />}>
            <Card padding="md">
              <Show
                when={(recentPayments() ?? []).length > 0}
                fallback={<Text variant="body" class="text-muted">No payments yet.</Text>}
              >
                <div class="admin-table">
                  <div class="admin-table-header">
                    <span>Amount</span>
                    <span>Status</span>
                    <span>User ID</span>
                    <span>Date</span>
                  </div>
                  <For each={recentPayments()}>
                    {(payment) => (
                      <div class="admin-table-row">
                        <span>{formatCurrency(payment.amount)} {payment.currency.toUpperCase()}</span>
                        <Badge
                          variant={payment.status === "succeeded" ? "success" : "warning"}
                          size="sm"
                        >
                          {payment.status}
                        </Badge>
                        <span class="text-muted">{payment.userId.slice(0, 8)}...</span>
                        <span class="text-muted">{formatDate(payment.createdAt)}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Card>
          </Show>
        </Stack>

        {/* Active Collaboration Rooms */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Active Collaboration Rooms</Text>
          <Show when={!collabRooms.loading} fallback={<Spinner />}>
            <Card padding="md">
              <Show
                when={(collabRooms() ?? []).length > 0}
                fallback={<Text variant="body" class="text-muted">No active rooms.</Text>}
              >
                <For each={collabRooms()}>
                  {(room) => (
                    <Stack direction="horizontal" gap="sm" align="center" class="admin-room-row">
                      <Badge variant="success" size="sm">Live</Badge>
                      <Text variant="body" weight="semibold">{room.name}</Text>
                      <Text variant="caption" class="text-muted">
                        {room.users.length} participant{room.users.length !== 1 ? "s" : ""}
                      </Text>
                      <Text variant="caption" class="text-muted">
                        Created {formatDate(room.createdAt)}
                      </Text>
                    </Stack>
                  )}
                </For>
              </Show>
            </Card>
          </Show>
        </Stack>

        {/* Sentinel Intelligence Summary */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Sentinel Intelligence</Text>
          <Card padding="md">
            <Stack direction="vertical" gap="sm">
              <Text variant="body" class="text-muted">
                Competitive intelligence monitoring status.
              </Text>
              <Show
                when={systemHealth()?.sentinel === "active"}
                fallback={
                  <Badge variant="warning" size="sm">Sentinel is inactive. Enable the sentinel.monitoring flag to activate.</Badge>
                }
              >
                <Badge variant="success" size="sm">Sentinel is active and monitoring.</Badge>
              </Show>
            </Stack>
          </Card>
        </Stack>

        {/* Feature Flag Toggle Panel */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Feature Flags</Text>
          <Show when={!flags.loading} fallback={<Spinner />}>
            <Card padding="md">
              <Stack direction="vertical" gap="sm">
                <For each={flags()}>
                  {(flag) => (
                    <Stack direction="horizontal" gap="sm" align="center" class="admin-flag-row">
                      <Button
                        variant={flag.evaluatedEnabled ? "primary" : "outline"}
                        size="sm"
                        onClick={() => handleToggleFlag(flag.key, flag.enabled)}
                        disabled={togglingFlag() === flag.key}
                      >
                        {flag.enabled ? "ON" : "OFF"}
                      </Button>
                      <Stack direction="vertical" gap="xs">
                        <Text variant="body" weight="semibold">{flag.key}</Text>
                        <Show when={flag.description}>
                          <Text variant="caption" class="text-muted">{flag.description}</Text>
                        </Show>
                      </Stack>
                      <Badge variant="default" size="sm">
                        {flag.rolloutPercentage}% rollout
                      </Badge>
                    </Stack>
                  )}
                </For>
              </Stack>
            </Card>
          </Show>
        </Stack>
      </Stack>
    </AdminGuard>
  );
}
