import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import {
  Button,
  Card,
  Stack,
  Text,
  Badge,
  Separator,
} from "@back-to-the-future/ui";
import { useAuth } from "../stores";
import { trpc } from "../lib/trpc";

// ── Types ────────────────────────────────────────────────────────────

type BillingInterval = "monthly" | "annual";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: PlanFeature[];
  badge?: string;
  highlighted?: boolean;
  cta: string;
  ctaAction: "register" | "checkout" | "contact";
}

// ── Plan Data ────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    description: "Perfect for getting started with AI-powered site building.",
    monthlyPrice: 0,
    annualPrice: 0,
    features: [
      { text: "1 site", included: true },
      { text: "10 deploys / month", included: true },
      { text: "100 AI requests / month", included: true },
      { text: "Community support", included: true },
      { text: "Custom domains", included: false },
      { text: "Priority support", included: false },
    ],
    cta: "Get Started",
    ctaAction: "register",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For professionals who need more power and flexibility.",
    monthlyPrice: 29,
    annualPrice: 278,
    badge: "Most Popular",
    highlighted: true,
    features: [
      { text: "10 sites", included: true },
      { text: "100 deploys / month", included: true },
      { text: "1,000 AI requests / month", included: true },
      { text: "Custom domains", included: true },
      { text: "Priority email support", included: true },
      { text: "Advanced analytics", included: true },
    ],
    cta: "Upgrade to Pro",
    ctaAction: "checkout",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Unlimited everything for teams that demand the best.",
    monthlyPrice: 99,
    annualPrice: 950,
    badge: "Best Value",
    features: [
      { text: "Unlimited sites", included: true },
      { text: "Unlimited deploys", included: true },
      { text: "Unlimited AI requests", included: true },
      { text: "Custom domains", included: true },
      { text: "Priority support with SLA", included: true },
      { text: "Advanced analytics", included: true },
    ],
    cta: "Contact Sales",
    ctaAction: "contact",
  },
];

// ── Check Icon ───────────────────────────────────────────────────────

function CheckIcon(): JSX.Element {
  return (
    <svg
      class="h-5 w-5 shrink-0 text-green-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon(): JSX.Element {
  return (
    <svg
      class="h-5 w-5 shrink-0 text-zinc-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Plan Card ────────────────────────────────────────────────────────

function PlanCard(props: {
  plan: Plan;
  interval: BillingInterval;
  isAuthenticated: boolean;
  onCheckout: (planId: string) => void;
  checkoutLoading: boolean;
}): JSX.Element {
  const price = (): number =>
    props.interval === "annual" ? props.plan.annualPrice : props.plan.monthlyPrice;

  const displayPrice = (): string => {
    if (props.plan.monthlyPrice === 0) return "$0";
    if (props.interval === "annual") {
      return `$${Math.round(props.plan.annualPrice / 12)}`;
    }
    return `$${props.plan.monthlyPrice}`;
  };

  const billingNote = (): string => {
    if (props.plan.monthlyPrice === 0) return "Free forever";
    if (props.interval === "annual") {
      return `$${props.plan.annualPrice} billed annually`;
    }
    return "per month";
  };

  const ctaVariant = (): "primary" | "outline" | "secondary" =>
    props.plan.highlighted ? "primary" : "outline";

  return (
    <Card
      padding="lg"
      class={`relative flex flex-col ${
        props.plan.highlighted
          ? "ring-2 ring-blue-500 shadow-lg shadow-blue-500/10"
          : ""
      }`}
    >
      <Stack direction="vertical" gap="md" class="flex-1">
        {/* Header */}
        <Stack direction="horizontal" gap="sm" align="center" justify="between">
          <Text variant="h3" weight="bold">
            {props.plan.name}
          </Text>
          <Show when={props.plan.badge}>
            {(badge) => (
              <Badge
                variant={props.plan.highlighted ? "info" : "success"}
                size="sm"
                label={badge()}
              />
            )}
          </Show>
        </Stack>

        <Text variant="body" class="text-zinc-400">
          {props.plan.description}
        </Text>

        {/* Price */}
        <Stack direction="horizontal" gap="xs" align="end">
          <Text variant="h1" weight="bold">
            {displayPrice()}
          </Text>
          <Show when={props.plan.monthlyPrice > 0}>
            <Text variant="body" class="mb-1 text-zinc-400">
              / mo
            </Text>
          </Show>
        </Stack>
        <Text variant="caption" class="text-zinc-500">
          {billingNote()}
        </Text>

        <Separator orientation="horizontal" />

        {/* Features */}
        <Stack direction="vertical" gap="sm" class="flex-1">
          <For each={props.plan.features}>
            {(feature) => (
              <Stack direction="horizontal" gap="sm" align="center">
                <Show when={feature.included} fallback={<XIcon />}>
                  <CheckIcon />
                </Show>
                <Text
                  variant="body"
                  class={feature.included ? "text-zinc-200" : "text-zinc-600"}
                >
                  {feature.text}
                </Text>
              </Stack>
            )}
          </For>
        </Stack>

        {/* CTA */}
        <Show
          when={props.plan.ctaAction === "checkout"}
          fallback={
            <Show
              when={props.plan.ctaAction === "contact"}
              fallback={
                <A href="/register" class="block">
                  <Button variant={ctaVariant()} size="lg" class="w-full">
                    {props.plan.cta}
                  </Button>
                </A>
              }
            >
              <a href="mailto:sales@backtothefuture.dev" class="block">
                <Button variant={ctaVariant()} size="lg" class="w-full">
                  {props.plan.cta}
                </Button>
              </a>
            </Show>
          }
        >
          <Show
            when={props.isAuthenticated}
            fallback={
              <A href="/register" class="block">
                <Button variant={ctaVariant()} size="lg" class="w-full">
                  Get Started
                </Button>
              </A>
            }
          >
            <Button
              variant={ctaVariant()}
              size="lg"
              class="w-full"
              onClick={() => props.onCheckout(props.plan.id)}
              loading={props.checkoutLoading}
            >
              {props.plan.cta}
            </Button>
          </Show>
        </Show>
      </Stack>
    </Card>
  );
}

// ── Pricing Page ─────────────────────────────────────────────────────

export default function PricingPage(): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const [interval, setInterval] = createSignal<BillingInterval>("monthly");
  const [checkoutLoading, setCheckoutLoading] = createSignal(false);
  const [checkoutError, setCheckoutError] = createSignal<string | null>(null);

  const handleCheckout = async (planId: string): Promise<void> => {
    setCheckoutLoading(true);
    setCheckoutError(null);

    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const session = await trpc.billing.createCheckout.mutate({
        planId,
        successUrl: `${baseUrl}/dashboard?checkout=success`,
        cancelUrl: `${baseUrl}/pricing?checkout=canceled`,
      });

      if (session.url) {
        window.location.href = session.url;
      }
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : "Failed to start checkout",
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <Stack direction="vertical" align="center" class="mx-auto max-w-6xl px-4 py-16">
      <Title>Pricing - Back to the Future</Title>

      {/* Header */}
      <Stack direction="vertical" align="center" gap="md" class="mb-12 text-center">
        <Text variant="h1" weight="bold" align="center">
          Simple, Transparent Pricing
        </Text>
        <Text variant="body" align="center" class="max-w-2xl text-zinc-400">
          Start building for free. Upgrade when you need more power. No hidden
          fees, no surprises.
        </Text>

        {/* Billing Toggle */}
        <Stack direction="horizontal" gap="sm" align="center" class="mt-4">
          <Button
            variant={interval() === "monthly" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setInterval("monthly")}
          >
            Monthly
          </Button>
          <Button
            variant={interval() === "annual" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setInterval("annual")}
          >
            Annual
          </Button>
          <Show when={interval() === "annual"}>
            <Badge variant="success" size="sm" label="Save 20%" />
          </Show>
        </Stack>
      </Stack>

      {/* Plan Cards */}
      <div class="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
        <For each={PLANS}>
          {(plan) => (
            <PlanCard
              plan={plan}
              interval={interval()}
              isAuthenticated={auth.isAuthenticated()}
              onCheckout={handleCheckout}
              checkoutLoading={checkoutLoading()}
            />
          )}
        </For>
      </div>

      {/* Checkout Error */}
      <Show when={checkoutError()}>
        {(error) => (
          <Text variant="body" class="mt-4 text-red-400">
            {error()}
          </Text>
        )}
      </Show>

      {/* FAQ / CTA */}
      <Stack direction="vertical" align="center" gap="md" class="mt-16 text-center">
        <Text variant="h3" weight="semibold">
          Questions?
        </Text>
        <Text variant="body" class="text-zinc-400">
          Need a custom plan or have questions about features? We are here to help.
        </Text>
        <a href="mailto:sales@backtothefuture.dev">
          <Button variant="outline" size="lg">
            Talk to Sales
          </Button>
        </a>
      </Stack>
    </Stack>
  );
}
