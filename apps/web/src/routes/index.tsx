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
    badge: "AI-Native",
    title: "Build sites by describing them",
    description: "Type a sentence. Ship a product. Our agents compose validated component trees in real time — no templates, no boilerplate.",
  },
  {
    badge: "WebGPU",
    title: "Video editing at $0/token",
    description: "GPU-accelerated encoding, effects, and inference that runs on your users' hardware. Zero server cost. Near-native speed.",
  },
  {
    badge: "Live",
    title: "Humans and agents, one canvas",
    description: "CRDT-powered collaboration where your team and AI agents edit the same document at the same time. Sub-50ms globally.",
  },
  {
    badge: "Edge-First",
    title: "Three tiers. One runtime.",
    description: "Client GPU, edge, and cloud unified into a single compute mesh. Workloads route themselves to the cheapest tier that can handle them.",
  },
  {
    badge: "Always On",
    title: "Sentinel watches the market",
    description: "24/7 competitive intelligence. Know about every competitor release, every new model, every threat — before your rivals announce them.",
  },
  {
    badge: "Type-Safe",
    title: "Runtime errors are a choice",
    description: "End-to-end type safety from database to DOM. tRPC, Zod, and TypeScript strict mode eliminate whole classes of bugs before they ship.",
  },
];

const stats = [
  { value: "10x", label: "Faster than Next.js" },
  { value: "$0", label: "Per token on WebGPU" },
  { value: "<50ms", label: "Global edge latency" },
  { value: "41 t/s", label: "Llama 3.1 in browser" },
];

const testimonials = [
  {
    quote: "We cut our time-to-prototype from two weeks to a single afternoon. The AI-composable components are unlike anything else on the market.",
    name: "Jordan Mercer",
    title: "CTO, Fortune 500 Media Group",
  },
  {
    quote: "Three-tier compute sounded like marketing until we shipped it. Our inference bill dropped 94% overnight.",
    name: "Priya Anand",
    title: "VP Engineering, Series C SaaS",
  },
  {
    quote: "Finally, a platform that treats AI as architecture instead of a feature. We will never go back.",
    name: "Marcus Reeves",
    title: "Head of Product, AI Video Startup",
  },
];

export default function Home(): JSX.Element {
  const auth = useAuth();

  return (
    <>
      <SEOHead
        title="Marco Reid — The AI-native full-stack platform"
        description="Build websites and edit video with AI agents, WebGPU, and real-time collaboration. Edge-first. Type-safe end-to-end. Zero HTML."
        path="/"
      />
      <Stack direction="vertical" gap="xl" class="page-padded">
        {/* Hero */}
        <Stack direction="vertical" align="center" justify="center" gap="md" class="hero">
          <Badge variant="info" size="sm">Now in private beta</Badge>
          <Text variant="h1" weight="bold" align="center" class="heading hero-gradient">
            Ship the impossible.
          </Text>
          <Text variant="body" align="center" class="tagline">
            The AI-native full-stack platform for builders who refuse to wait for the future.
          </Text>
          <Text variant="body" align="center" class="description">
            WebGPU inference. Edge-first compute. Real-time collaboration with AI agents as first-class peers.
            One unified runtime. Zero HTML.
          </Text>
          <Stack direction="horizontal" gap="md" justify="center">
            <Show
              when={auth.isAuthenticated()}
              fallback={
                <A href="/register">
                  <Button variant="primary" size="lg">Start building — free</Button>
                </A>
              }
            >
              <A href="/dashboard">
                <Button variant="primary" size="lg">Open dashboard</Button>
              </A>
            </Show>
            <A href="/pricing">
              <Button variant="outline" size="lg">See pricing</Button>
            </A>
          </Stack>
        </Stack>

        {/* Stats */}
        <div class="stats-grid">
          <For each={stats}>
            {(s) => (
              <div class="stat-card">
                <div class="stat-value">{s.value}</div>
                <div class="stat-label">{s.label}</div>
              </div>
            )}
          </For>
        </div>

        {/* Features Grid */}
        <Stack direction="vertical" gap="md">
          <Stack direction="vertical" gap="xs" align="center">
            <Text variant="h2" weight="bold" align="center">
              Everything you need. Nothing you don't.
            </Text>
            <Text variant="body" class="text-muted" align="center">
              Six primitives that replace your entire stack.
            </Text>
          </Stack>
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

        {/* Social proof */}
        <Stack direction="vertical" gap="md">
          <Text variant="h2" weight="bold" align="center">
            Trusted by teams who ship first.
          </Text>
          <div class="grid-3">
            <For each={testimonials}>
              {(t) => (
                <div class="testimonial-card">
                  <div class="testimonial-quote">"{t.quote}"</div>
                  <div class="testimonial-author">
                    <strong>{t.name}</strong> — {t.title}
                  </div>
                </div>
              )}
            </For>
          </div>
        </Stack>

        {/* CTA */}
        <Card padding="lg">
          <Stack direction="vertical" gap="md" align="center">
            <Text variant="h3" weight="semibold" align="center">Your competitors are still shipping last year's stack.</Text>
            <Text variant="body" class="text-muted" align="center">
              Join the teams building two years ahead of the market. Free to start. No credit card required.
            </Text>
            <Stack direction="horizontal" gap="sm" justify="center">
              <A href="/register">
                <Button variant="primary" size="lg">Start building</Button>
              </A>
              <A href="/docs">
                <Button variant="outline" size="lg">Read the docs</Button>
              </A>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
