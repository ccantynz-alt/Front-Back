import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { showToast } from "../components/Toast";
import { trpc } from "../lib/trpc";
import { useQuery, useMutation, friendlyError } from "../lib/use-trpc";

export default function BillingPage(): JSX.Element {
  const navigate = useNavigate();

  const subscription = useQuery(() => trpc.billing.getSubscription.query());
  const usage = useQuery(() =>
    trpc.analytics.getUsageStats.query().catch(() => ({
      pageViews: 0,
      featureUsage: 0,
      aiGenerations: 0,
      recentEvents: [],
    })),
  );

  const portal = useMutation((customerId: string) =>
    trpc.billing.createPortalSession.mutate({ customerId }),
  );

  const handleUpgrade = (): void => {
    navigate("/pricing");
  };

  const handleManageBilling = async (): Promise<void> => {
    const sub = subscription.data();
    const customerId = sub?.stripeCustomerId ?? null;
    if (!customerId) {
      showToast("Billing portal unavailable. Subscribe to a paid plan first.", "warning");
      return;
    }
    try {
      const result = (await portal.mutate(customerId)) as unknown as { url?: string };
      if (result?.url) {
        window.location.href = result.url;
      } else {
        showToast("Billing portal URL unavailable.", "error");
      }
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  const planName = (): string => subscription.data()?.plan ?? "Free";
  const status = (): string => subscription.data()?.status ?? "free";

  return (
    <ProtectedRoute>
      <Title>Billing - Marco Reid</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">Billing</Text>
          <Text variant="body" class="text-muted">
            Manage your subscription and payment methods.
          </Text>
        </Stack>

        <Show when={subscription.error()}>
          <Card padding="sm">
            <Text variant="caption" class="text-muted">
              Could not load subscription: {friendlyError(subscription.error())}
            </Text>
          </Card>
        </Show>

        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h3" weight="semibold">Current Plan</Text>
            <Stack direction="horizontal" gap="sm" align="center">
              <Text variant="h2" weight="bold">
                {subscription.loading() ? "Loading..." : planName()}
              </Text>
              <Badge variant="info" size="sm">{status()}</Badge>
            </Stack>
            <Text variant="body" class="text-muted">
              Your plan renews automatically. Upgrade anytime to unlock more features.
            </Text>
            <Stack direction="horizontal" gap="sm">
              <Button variant="primary" onClick={handleUpgrade}>Upgrade Plan</Button>
              <Button
                variant="outline"
                onClick={() => void handleManageBilling()}
                loading={portal.loading()}
              >
                Manage Billing
              </Button>
            </Stack>
          </Stack>
        </Card>

        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h3" weight="semibold">Usage This Period</Text>
            <div class="grid-3">
              <Card padding="sm">
                <Stack direction="vertical" gap="xs">
                  <Text variant="caption" class="text-muted">AI Generations</Text>
                  <Text variant="h3" weight="bold">
                    {usage.loading() ? "--" : String(usage.data()?.aiGenerations ?? 0)}
                  </Text>
                </Stack>
              </Card>
              <Card padding="sm">
                <Stack direction="vertical" gap="xs">
                  <Text variant="caption" class="text-muted">Page Views</Text>
                  <Text variant="h3" weight="bold">
                    {usage.loading() ? "--" : String(usage.data()?.pageViews ?? 0)}
                  </Text>
                </Stack>
              </Card>
              <Card padding="sm">
                <Stack direction="vertical" gap="xs">
                  <Text variant="caption" class="text-muted">Feature Uses</Text>
                  <Text variant="h3" weight="bold">
                    {usage.loading() ? "--" : String(usage.data()?.featureUsage ?? 0)}
                  </Text>
                </Stack>
              </Card>
            </div>
          </Stack>
        </Card>

        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h3" weight="semibold">Payment History</Text>
            <Text variant="body" class="text-muted">
              No payments yet. Upgrade to see your billing history.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </ProtectedRoute>
  );
}
