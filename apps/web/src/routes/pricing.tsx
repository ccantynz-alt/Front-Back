import { For, Show, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";

interface PlanInfo {
  id: string;
  name: string;
  price: number;
  interval: string;
  features: string[];
  popular: boolean;
}

const plans: PlanInfo[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    interval: "month",
    features: ["1 project", "Basic AI builder", "Community support", "5 AI generations/day"],
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    interval: "month",
    features: [
      "Unlimited projects",
      "Advanced AI builder",
      "Video editor",
      "Real-time collaboration",
      "Priority support",
      "Unlimited AI generations",
      "Custom AI agents",
    ],
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 99,
    interval: "month",
    features: [
      "Everything in Pro",
      "Sentinel intelligence",
      "SSO / SAML",
      "Dedicated support",
      "SLA guarantee",
      "Custom integrations",
      "On-premise option",
    ],
    popular: false,
  },
];

function PlanCard(props: { plan: PlanInfo }): JSX.Element {
  const auth = useAuth();
  return (
    <Card
      class={`pricing-card ${props.plan.popular ? "pricing-card-popular" : ""}`}
      padding="lg"
    >
      <Stack direction="vertical" gap="md">
        <Stack direction="horizontal" gap="sm" align="center">
          <Text variant="h3" weight="bold">{props.plan.name}</Text>
          <Show when={props.plan.popular}>
            <Badge variant="success" size="sm">Most Popular</Badge>
          </Show>
        </Stack>

        <Stack direction="horizontal" align="end" gap="xs">
          <Text variant="h1" weight="bold">${props.plan.price}</Text>
          <Text variant="body" class="text-muted">/{props.plan.interval}</Text>
        </Stack>

        <Stack direction="vertical" gap="xs">
          <For each={props.plan.features}>
            {(feature) => (
              <Text variant="body" class="pricing-feature">
                {feature}
              </Text>
            )}
          </For>
        </Stack>

        <Show
          when={auth.isAuthenticated()}
          fallback={
            <A href="/register">
              <Button
                variant={props.plan.popular ? "primary" : "outline"}
                class="w-full"
              >
                Get Started
              </Button>
            </A>
          }
        >
          <Button
            variant={props.plan.popular ? "primary" : "outline"}
            class="w-full"
            disabled={props.plan.id === "free"}
          >
            {props.plan.id === "free" ? "Current Plan" : "Upgrade"}
          </Button>
        </Show>
      </Stack>
    </Card>
  );
}

export default function PricingPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Pricing"
        description="Simple, transparent pricing for Back to the Future. Start free, upgrade when you need more AI power, collaboration, and enterprise features."
        path="/pricing"
      />
      <Stack direction="vertical" gap="xl" align="center" class="page-padded">
        <Stack direction="vertical" gap="sm" align="center">
          <Text variant="h1" weight="bold" align="center">
            Simple, transparent pricing
          </Text>
          <Text variant="body" align="center" class="text-muted">
            Start free. Upgrade when you need more power.
          </Text>
        </Stack>

        <div class="grid-3">
          <For each={plans}>
            {(plan) => <PlanCard plan={plan} />}
          </For>
        </div>

        <Card padding="lg" class="w-full">
          <Stack direction="vertical" gap="sm" align="center">
            <Text variant="h3" weight="semibold">Need something custom?</Text>
            <Text variant="body" class="text-muted">
              Contact us for volume pricing, custom AI agents, and enterprise deployments.
            </Text>
            <Button variant="outline">Contact Sales</Button>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
