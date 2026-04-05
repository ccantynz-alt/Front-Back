import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";

interface FeatureCard {
  title: string;
  description: string;
  badge: string;
}

const features: FeatureCard[] = [
  {
    title: "AI Website Builder",
    description: "Describe what you want. Watch AI build it in real-time with validated component trees.",
    badge: "AI-Native",
  },
  {
    title: "Video Editor",
    description: "WebGPU-accelerated video processing directly in your browser. $0 compute cost.",
    badge: "WebGPU",
  },
  {
    title: "Real-Time Collaboration",
    description: "CRDT-powered editing where humans and AI agents co-create simultaneously.",
    badge: "Live",
  },
  {
    title: "Three-Tier Compute",
    description: "Client GPU, edge, and cloud seamlessly unified. AI runs where it's fastest and cheapest.",
    badge: "Edge-First",
  },
  {
    title: "Sentinel Intelligence",
    description: "24/7 competitive monitoring. Know about threats before your competitors announce them.",
    badge: "Always On",
  },
  {
    title: "Type-Safe Everything",
    description: "End-to-end type safety from database to UI. tRPC + Zod + TypeScript strict mode.",
    badge: "Zero Runtime Errors",
  },
];

export default function Home(): JSX.Element {
  const auth = useAuth();

  return (
    <>
      <SEOHead
        title="Back to the Future"
        description="The most advanced AI-native full-stack platform. Build websites and edit video with AI assistance, real-time collaboration, and edge-first performance."
        path="/"
      />
      <Stack direction="vertical" gap="xl" class="page-padded">
        {/* Hero */}
        <Stack direction="vertical" align="center" justify="center" class="hero">
          <Badge variant="info" size="sm">Now in Beta</Badge>
          <Text variant="h1" weight="bold" align="center" class="heading">
            Back to the Future
          </Text>
          <Text variant="body" align="center" class="tagline">
            The most advanced AI-native full-stack platform ever built.
          </Text>
          <Text variant="body" align="center" class="description">
            AI-native. Edge-first. Zero-HTML. Self-evolving.
          </Text>
          <Stack direction="horizontal" gap="md" justify="center">
            <Show
              when={auth.isAuthenticated()}
              fallback={
                <A href="/register">
                  <Button variant="primary" size="lg">Get Started Free</Button>
                </A>
              }
            >
              <A href="/dashboard">
                <Button variant="primary" size="lg">Go to Dashboard</Button>
              </A>
            </Show>
            <A href="/pricing">
              <Button variant="outline" size="lg">View Pricing</Button>
            </A>
          </Stack>
        </Stack>

        {/* Features Grid */}
        <Stack direction="vertical" gap="md">
          <Text variant="h2" weight="bold" align="center">
            Everything you need. Nothing you don't.
          </Text>
          <div class="grid-3">
            <For each={features}>
              {(feature) => (
                <Card padding="lg">
                  <Stack direction="vertical" gap="sm">
                    <Badge variant="info" size="sm">{feature.badge}</Badge>
                    <Text variant="h4" weight="semibold">{feature.title}</Text>
                    <Text variant="body" class="text-muted">{feature.description}</Text>
                  </Stack>
                </Card>
              )}
            </For>
          </div>
        </Stack>

        {/* CTA */}
        <Card padding="lg">
          <Stack direction="vertical" gap="md" align="center">
            <Text variant="h3" weight="semibold">Ready to build the future?</Text>
            <Text variant="body" class="text-muted" align="center">
              Join the platform that's 80% ahead of the competition. Start for free.
            </Text>
            <A href="/register">
              <Button variant="primary" size="lg">Start Building</Button>
            </A>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
