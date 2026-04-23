// ── BLK-030 — /admin/sms — cross-customer SMS usage console ───────────
// Admin-gated page that surfaces the full SMS log across every customer
// alongside total revenue and per-customer usage. Polite tone — no
// named competitors, no alarming copy. See apps/api/src/trpc/
// procedures/sms.ts `adminListAll` for the data contract.

import { Title } from "@solidjs/meta";
import { createResource, For, Show, type JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  Button,
  Card,
  Stack,
  Text,
  Badge,
  Spinner,
} from "@back-to-the-future/ui";
import { AdminRoute } from "../../components/AdminRoute";
import { useAuth } from "../../stores";
import { trpc } from "../../lib/trpc";

interface AdminSmsMessage {
  id: string;
  userId: string;
  direction: string;
  from: string;
  to: string;
  body: string;
  segments: number;
  status: string;
  providerMessageId: string | null;
  costMicrodollars: number;
  markupMicrodollars: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface AdminSmsUserTotals {
  userId: string;
  messageCount: number;
  segments: number;
  costMicrodollars: number;
  markupMicrodollars: number;
}

interface AdminSmsTotals {
  messageCount: number;
  costMicrodollars: number;
  markupMicrodollars: number;
}

/** Pure helper — format a microdollar integer as `$12.34`. Exported for tests. */
export function formatMicrodollars(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "$0.00";
  if (!Number.isFinite(amount) || amount < 0) return "$0.00";
  return `$${(amount / 1_000_000).toFixed(2)}`;
}

/** Pure helper — map an SMS status to the Badge variant. Exported for tests. */
export function smsStatusVariant(
  status: string,
): "success" | "warning" | "error" | "default" {
  if (status === "delivered" || status === "received") return "success";
  if (status === "sent" || status === "queued") return "warning";
  if (status === "failed") return "error";
  return "default";
}

function AdminGuard(props: { children: JSX.Element }): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const isAdmin = (): boolean => auth.currentUser()?.role === "admin";

  return (
    <AdminRoute>
      <Show
        when={isAdmin()}
        fallback={
          <Stack direction="vertical" gap="md" class="page-padded">
            <Text variant="h2" weight="bold">Access Denied</Text>
            <Text variant="body" class="text-muted">
              This page is reserved for administrators. If you believe this is
              a mistake, please let Craig know.
            </Text>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate("/dashboard")}
            >
              Back to Dashboard
            </Button>
          </Stack>
        }
      >
        {props.children}
      </Show>
    </AdminRoute>
  );
}

export default function AdminSmsPage(): JSX.Element {
  const [data, { refetch }] = createResource(() =>
    trpc.sms.adminListAll.query({ limit: 200 }),
  );

  const handleRefresh = async (): Promise<void> => {
    await refetch();
  };

  return (
    <AdminGuard>
      <Title>SMS Console — Crontech</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">SMS Console</Text>
          <Text variant="body" class="text-muted">
            A read-only view of every SMS we've sent or received on behalf of
            our customers, with totals and per-customer usage. Kind reminder:
            figures include the full markup column.
          </Text>
        </Stack>

        <Stack direction="horizontal" gap="sm">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Refresh
          </Button>
        </Stack>

        <Show when={!data.loading} fallback={<Spinner />}>
          <Show
            when={data()}
            fallback={
              <Text variant="body" class="text-muted">
                No SMS activity on record yet. Once customers start sending,
                their traffic will appear here.
              </Text>
            }
          >
            {(resolved) => {
              const totals = (): AdminSmsTotals => resolved().totals;
              const perUser = (): AdminSmsUserTotals[] => resolved().perUser;
              const messages = (): AdminSmsMessage[] => resolved().messages;

              return (
                <Stack direction="vertical" gap="lg">
                  <Stack direction="horizontal" gap="md">
                    <Card padding="md">
                      <Stack direction="vertical" gap="xs">
                        <Text variant="caption" class="text-muted">
                          Messages logged
                        </Text>
                        <Text variant="h2" weight="bold">
                          {totals().messageCount}
                        </Text>
                      </Stack>
                    </Card>
                    <Card padding="md">
                      <Stack direction="vertical" gap="xs">
                        <Text variant="caption" class="text-muted">
                          Total wholesale cost
                        </Text>
                        <Text variant="h2" weight="bold">
                          {formatMicrodollars(totals().costMicrodollars)}
                        </Text>
                      </Stack>
                    </Card>
                    <Card padding="md">
                      <Stack direction="vertical" gap="xs">
                        <Text variant="caption" class="text-muted">
                          Total revenue (markup)
                        </Text>
                        <Text variant="h2" weight="bold">
                          {formatMicrodollars(totals().markupMicrodollars)}
                        </Text>
                      </Stack>
                    </Card>
                  </Stack>

                  <Card padding="md">
                    <Stack direction="vertical" gap="sm">
                      <Text variant="h3" weight="semibold">
                        Per-customer usage
                      </Text>
                      <Show
                        when={perUser().length > 0}
                        fallback={
                          <Text variant="body" class="text-muted">
                            No per-customer usage yet. The table populates as
                            customers send their first SMS.
                          </Text>
                        }
                      >
                        <For each={perUser()}>
                          {(user) => (
                            <Stack
                              direction="horizontal"
                              gap="md"
                              align="center"
                            >
                              <Text variant="body" weight="semibold">
                                {user.userId}
                              </Text>
                              <Text variant="caption" class="text-muted">
                                {user.messageCount} messages · {user.segments}{" "}
                                segments
                              </Text>
                              <Text variant="caption" class="text-muted">
                                Cost:{" "}
                                {formatMicrodollars(user.costMicrodollars)}
                              </Text>
                              <Text variant="caption" class="text-muted">
                                Revenue:{" "}
                                {formatMicrodollars(user.markupMicrodollars)}
                              </Text>
                            </Stack>
                          )}
                        </For>
                      </Show>
                    </Stack>
                  </Card>

                  <Card padding="md">
                    <Stack direction="vertical" gap="sm">
                      <Text variant="h3" weight="semibold">
                        Recent messages
                      </Text>
                      <Show
                        when={messages().length > 0}
                        fallback={
                          <Text variant="body" class="text-muted">
                            No recent messages.
                          </Text>
                        }
                      >
                        <For each={messages()}>
                          {(msg) => (
                            <Stack
                              direction="vertical"
                              gap="xs"
                              class="admin-sms-row"
                            >
                              <Stack
                                direction="horizontal"
                                gap="sm"
                                align="center"
                              >
                                <Badge
                                  variant={smsStatusVariant(msg.status)}
                                  size="sm"
                                >
                                  {msg.status}
                                </Badge>
                                <Badge variant="default" size="sm">
                                  {msg.direction}
                                </Badge>
                                <Text variant="caption" class="text-muted">
                                  {msg.from} → {msg.to}
                                </Text>
                              </Stack>
                              <Text variant="body">{msg.body}</Text>
                              <Text variant="caption" class="text-muted">
                                {msg.segments} segment(s) ·{" "}
                                Cost {formatMicrodollars(msg.costMicrodollars)}{" "}
                                · Markup{" "}
                                {formatMicrodollars(msg.markupMicrodollars)}
                              </Text>
                            </Stack>
                          )}
                        </For>
                      </Show>
                    </Stack>
                  </Card>
                </Stack>
              );
            }}
          </Show>
        </Show>
      </Stack>
    </AdminGuard>
  );
}
