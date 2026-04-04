import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, createResource, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import {
  Button,
  Card,
  Stack,
  Text,
  Badge,
  Alert,
  Separator,
  Spinner,
} from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useAuth } from "../stores";
import { trpc } from "../lib/trpc";

// ── Types ────────────────────────────────────────────────────────────

interface PlanInfo {
  id: string;
  name: string;
  slug: string;
  price: number;
  interval: string;
  sitesLimit: number;
  deploymentsPerMonth: number;
  aiRequestsPerMonth: number;
  customDomains: boolean;
  features: string | null;
}

interface SubscriptionInfo {
  id: string;
  userId: string;
  planId: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  plan: PlanInfo;
}

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function planBadgeVariant(
  slug: string,
): "default" | "info" | "success" | "warning" {
  if (slug === "enterprise") return "success";
  if (slug === "pro") return "info";
  return "default";
}

function invoiceStatusVariant(
  status: string,
): "success" | "warning" | "error" | "default" {
  if (status === "paid") return "success";
  if (status === "open") return "warning";
  if (status === "void" || status === "uncollectible") return "error";
  return "default";
}

// ── Account Settings Section ─────────────────────────────────────────

function AccountSettings(): JSX.Element {
  const auth = useAuth();
  const user = (): ReturnType<typeof auth.currentUser> => auth.currentUser();

  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="md">
        <Text variant="h3" weight="semibold">
          Account Settings
        </Text>
        <Separator orientation="horizontal" />

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Display Name */}
          <Stack direction="vertical" gap="xs">
            <Text variant="caption" class="text-zinc-400">
              Display Name
            </Text>
            <Text variant="body" weight="medium" class="text-zinc-200">
              {user()?.displayName ?? "Not set"}
            </Text>
          </Stack>

          {/* Email */}
          <Stack direction="vertical" gap="xs">
            <Text variant="caption" class="text-zinc-400">
              Email
            </Text>
            <Text variant="body" weight="medium" class="text-zinc-200">
              {user()?.email ?? "Not set"}
            </Text>
          </Stack>

          {/* Role */}
          <Stack direction="vertical" gap="xs">
            <Text variant="caption" class="text-zinc-400">
              Role
            </Text>
            <Badge
              variant={user()?.role === "admin" ? "info" : "default"}
              label={user()?.role ?? "user"}
            />
          </Stack>

          {/* Member Since */}
          <Stack direction="vertical" gap="xs">
            <Text variant="caption" class="text-zinc-400">
              Member Since
            </Text>
            <Text variant="body" class="text-zinc-200">
              {user()?.createdAt
                ? formatDate(user()!.createdAt)
                : "N/A"}
            </Text>
          </Stack>
        </div>
      </Stack>
    </Card>
  );
}

// ── Usage Stats ──────────────────────────────────────────────────────

function UsageBar(props: {
  label: string;
  used: number;
  limit: number;
  unlimited?: boolean;
}): JSX.Element {
  const percentage = (): number =>
    props.unlimited ? 0 : Math.min((props.used / props.limit) * 100, 100);

  const isNearLimit = (): boolean =>
    !props.unlimited && percentage() >= 80;

  return (
    <Stack direction="vertical" gap="xs">
      <Stack direction="horizontal" justify="between" align="center">
        <Text variant="caption" class="text-zinc-400">
          {props.label}
        </Text>
        <Text
          variant="caption"
          weight="medium"
          class={isNearLimit() ? "text-amber-400" : "text-zinc-300"}
        >
          {props.used} / {props.unlimited ? "Unlimited" : props.limit}
        </Text>
      </Stack>
      <div class="h-2 w-full overflow-hidden rounded-full bg-zinc-700">
        <Show when={!props.unlimited}>
          <div
            class={`h-full rounded-full transition-all ${
              isNearLimit() ? "bg-amber-500" : "bg-blue-500"
            }`}
            style={{ width: `${percentage()}%` }}
          />
        </Show>
      </div>
    </Stack>
  );
}

// ── Subscription Section ─────────────────────────────────────────────

function SubscriptionSection(): JSX.Element {
  const [actionLoading, setActionLoading] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [actionSuccess, setActionSuccess] = createSignal<string | null>(null);

  const [subscription, { refetch: refetchSub }] = createResource(
    async (): Promise<SubscriptionInfo | null> => {
      try {
        const result = await trpc.billing.subscription.query();
        return result as SubscriptionInfo | null;
      } catch {
        return null;
      }
    },
  );

  const [siteCount] = createResource(async (): Promise<number> => {
    try {
      const result = await trpc.sites.list.query({ limit: 1, offset: 0 });
      return (result as { total?: number }).total ?? 0;
    } catch {
      return 0;
    }
  });

  const [invoiceList] = createResource(async (): Promise<Invoice[]> => {
    try {
      const result = await trpc.billing.invoices.query({ limit: 10 });
      return result as Invoice[];
    } catch {
      return [];
    }
  });

  const isFreePlan = (): boolean => {
    const sub = subscription();
    if (!sub) return true;
    return sub.plan.slug === "free" || sub.plan.price === 0;
  };

  const isPaidPlan = (): boolean => !isFreePlan();

  const handleManageBilling = async (): Promise<void> => {
    setActionLoading("billing");
    setActionError(null);
    try {
      const baseUrl =
        typeof window !== "undefined" ? window.location.origin : "";
      const result = await trpc.billing.billingPortal.mutate({
        returnUrl: `${baseUrl}/settings`,
      });
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to open billing portal",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSubscription = async (): Promise<void> => {
    setActionLoading("cancel");
    setActionError(null);
    setActionSuccess(null);
    try {
      await trpc.billing.cancelSubscription.mutate();
      setActionSuccess(
        "Subscription will be canceled at the end of the current billing period.",
      );
      refetchSub();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to cancel subscription",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleResumeSubscription = async (): Promise<void> => {
    setActionLoading("resume");
    setActionError(null);
    setActionSuccess(null);
    try {
      await trpc.billing.resumeSubscription.mutate();
      setActionSuccess("Subscription has been resumed.");
      refetchSub();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to resume subscription",
      );
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="md">
        <Text variant="h3" weight="semibold">
          Subscription & Billing
        </Text>
        <Separator orientation="horizontal" />

        {/* Loading State */}
        <Show when={!subscription.loading} fallback={
          <Stack direction="horizontal" gap="sm" align="center">
            <Spinner size="sm" />
            <Text variant="body" class="text-zinc-400">
              Loading subscription details...
            </Text>
          </Stack>
        }>
          {/* Current Plan */}
          <Stack direction="vertical" gap="sm">
            <Stack direction="horizontal" gap="sm" align="center">
              <Text variant="body" class="text-zinc-400">
                Current Plan
              </Text>
              <Badge
                variant={planBadgeVariant(
                  subscription()?.plan.slug ?? "free",
                )}
                label={subscription()?.plan.name ?? "Free"}
              />
              <Show when={subscription()?.status === "active"}>
                <Badge variant="success" size="sm" label="Active" />
              </Show>
              <Show when={subscription()?.cancelAtPeriodEnd}>
                <Badge variant="warning" size="sm" label="Canceling" />
              </Show>
            </Stack>

            {/* Billing Period */}
            <Show when={subscription()?.currentPeriodStart}>
              <Text variant="caption" class="text-zinc-500">
                Current period:{" "}
                {formatDate(subscription()?.currentPeriodStart)} -{" "}
                {formatDate(subscription()?.currentPeriodEnd)}
              </Text>
            </Show>

            {/* Cancellation Notice */}
            <Show when={subscription()?.cancelAtPeriodEnd}>
              <Alert variant="warning">
                Your subscription will end on{" "}
                {formatDate(subscription()?.currentPeriodEnd)}. You can resume
                at any time before then.
              </Alert>
            </Show>
          </Stack>

          <Separator orientation="horizontal" />

          {/* Usage Stats */}
          <Stack direction="vertical" gap="sm">
            <Text variant="body" weight="medium" class="text-zinc-300">
              Usage
            </Text>
            <UsageBar
              label="Sites"
              used={siteCount() ?? 0}
              limit={subscription()?.plan.sitesLimit ?? 1}
              unlimited={
                (subscription()?.plan.sitesLimit ?? 1) >= 999
              }
            />
            <UsageBar
              label="Deploys this month"
              used={0}
              limit={
                subscription()?.plan.deploymentsPerMonth ?? 10
              }
              unlimited={
                (subscription()?.plan.deploymentsPerMonth ?? 10) >= 999
              }
            />
          </Stack>

          <Separator orientation="horizontal" />

          {/* Action Buttons */}
          <Stack direction="horizontal" gap="sm" class="flex-wrap">
            <Show
              when={isPaidPlan()}
              fallback={
                <A href="/pricing">
                  <Button variant="primary">Upgrade Plan</Button>
                </A>
              }
            >
              <Button
                variant="outline"
                onClick={handleManageBilling}
                loading={actionLoading() === "billing"}
              >
                Manage Billing
              </Button>
              <Show
                when={subscription()?.cancelAtPeriodEnd}
                fallback={
                  <Button
                    variant="destructive"
                    onClick={handleCancelSubscription}
                    loading={actionLoading() === "cancel"}
                  >
                    Cancel Subscription
                  </Button>
                }
              >
                <Button
                  variant="primary"
                  onClick={handleResumeSubscription}
                  loading={actionLoading() === "resume"}
                >
                  Resume Subscription
                </Button>
              </Show>
            </Show>
          </Stack>

          {/* Feedback Messages */}
          <Show when={actionError()}>
            {(error) => <Alert variant="error">{error()}</Alert>}
          </Show>
          <Show when={actionSuccess()}>
            {(success) => <Alert variant="success">{success()}</Alert>}
          </Show>
        </Show>
      </Stack>
    </Card>
  );
}

// ── Invoice History Section ──────────────────────────────────────────

function InvoiceHistory(): JSX.Element {
  const [invoiceList] = createResource(async (): Promise<Invoice[]> => {
    try {
      const result = await trpc.billing.invoices.query({ limit: 10 });
      return result as Invoice[];
    } catch {
      return [];
    }
  });

  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="md">
        <Text variant="h3" weight="semibold">
          Invoice History
        </Text>
        <Separator orientation="horizontal" />

        <Show when={!invoiceList.loading} fallback={
          <Stack direction="horizontal" gap="sm" align="center">
            <Spinner size="sm" />
            <Text variant="body" class="text-zinc-400">
              Loading invoices...
            </Text>
          </Stack>
        }>
          <Show
            when={invoiceList()?.length}
            fallback={
              <Text variant="body" class="text-zinc-500">
                No invoices yet.
              </Text>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b border-zinc-700">
                    <th class="px-3 py-2 text-zinc-400 font-medium">Date</th>
                    <th class="px-3 py-2 text-zinc-400 font-medium">Amount</th>
                    <th class="px-3 py-2 text-zinc-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={invoiceList()}>
                    {(invoice) => (
                      <tr class="border-b border-zinc-800">
                        <td class="px-3 py-2 text-zinc-300">
                          {formatDate(invoice.createdAt)}
                        </td>
                        <td class="px-3 py-2 text-zinc-200 font-medium">
                          {formatCurrency(invoice.amount, invoice.currency)}
                        </td>
                        <td class="px-3 py-2">
                          <Badge
                            variant={invoiceStatusVariant(invoice.status)}
                            size="sm"
                            label={invoice.status}
                          />
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </Stack>
    </Card>
  );
}

// ── Settings Page ────────────────────────────────────────────────────

export default function SettingsPage(): JSX.Element {
  return (
    <ProtectedRoute>
      <Title>Settings - Back to the Future</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        {/* Page Header */}
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">
            Settings
          </Text>
          <Text variant="body" class="text-muted">
            Manage your account, subscription, and billing.
          </Text>
        </Stack>

        {/* Account Settings */}
        <AccountSettings />

        <Separator orientation="horizontal" />

        {/* Subscription & Billing */}
        <SubscriptionSection />

        {/* Invoice History */}
        <InvoiceHistory />
      </Stack>
    </ProtectedRoute>
  );
}
