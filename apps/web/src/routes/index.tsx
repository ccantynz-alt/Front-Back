import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";

// ── Home page copy ──────────────────────────────────────────────────
// Locked to docs/POSITIONING.md — universal audience, polite tone,
// "developer platform for the next decade" headline direction.
// Do NOT name competitors in this file. Any deviation requires
// Craig's explicit authorization.

interface FeaturePillar {
  badge: string;
  title: string;
  description: string;
}

const PILLARS: FeaturePillar[] = [
  {
    badge: "One platform",
    title: "Every layer your app needs",
    description:
      "Hosting, database, authentication, AI, real-time collaboration, payments, email, and storage — in one product with one dashboard and one bill.",
  },
  {
    badge: "Built on the bleeding edge",
    title: "The fastest stack on the web",
    description:
      "Cloudflare Workers for sub-5ms cold starts. SolidJS for the fastest reactivity on the web. Bun + Hono for the fastest JavaScript runtime. Type-safe end to end.",
  },
  {
    badge: "AI-native",
    title: "AI at every layer, not bolted on",
    description:
      "AI agents, generative UI, three-tier compute routing (client → edge → cloud), RAG pipelines, and real-time collaboration — all native to the platform.",
  },
];

const STATS = [
  { value: "<5ms", label: "Cold starts at the edge" },
  { value: "330+", label: "Cities on the edge network" },
  { value: "$0", label: "On-device AI inference" },
  { value: "100%", label: "Type-safe end to end" },
];

const FOUNDING_PERKS = [
  "Lifetime 50% off any paid plan",
  "Direct line to the team that ships the platform",
  "Early access to new features weeks before public release",
  "Your feedback steers the roadmap while it is still being written",
];

export default function Home(): JSX.Element {
  const auth = useAuth();

  return (
    <>
      <SEOHead
        title="Crontech — The developer platform for the next decade"
        description="One unified product. Hosting, database, authentication, AI, real-time collaboration, billing, email, and storage — built on the fastest stack on the web."
        path="/"
      />
      <Stack direction="vertical" gap="xl" class="page-padded">
        {/* Hero */}
        <Stack direction="vertical" align="center" justify="center" gap="md" class="hero">
          <Badge variant="info" size="sm">
            Now in private beta · founding customers welcome
          </Badge>
          <Text variant="h1" weight="bold" align="center" class="heading hero-gradient">
            The developer platform for the next decade.
          </Text>
          <Text variant="body" align="center" class="tagline">
            One unified product. Every layer your application needs — hosting, database, auth,
            AI, real-time, billing, video — built on the bleeding edge and ready to ship.
          </Text>
          <Text variant="body" align="center" class="description">
            Crontech runs on the fastest stack on the web. Sub-5ms cold starts at the edge.
            Type-safe end to end. AI-native at every layer. Built for builders who refuse to
            settle for yesterday's tools.
          </Text>
          <Stack direction="horizontal" gap="md" justify="center">
            <Show
              when={auth.isAuthenticated()}
              fallback={
                <A href="/register">
                  <Button variant="primary" size="lg">
                    Start building
                  </Button>
                </A>
              }
            >
              <A href="/dashboard">
                <Button variant="primary" size="lg">
                  Open dashboard
                </Button>
              </A>
            </Show>
            <A href="/docs">
              <Button variant="outline" size="lg">
                See the docs
              </Button>
            </A>
          </Stack>
        </Stack>

        {/* Stats */}
        <div class="stats-grid">
          <For each={STATS}>
            {(s) => (
              <div class="stat-card">
                <div class="stat-value">{s.value}</div>
                <div class="stat-label">{s.label}</div>
              </div>
            )}
          </For>
        </div>

        {/* Feature pillars (3-column) */}
        <Stack direction="vertical" gap="md">
          <Stack direction="vertical" gap="xs" align="center">
            <Text variant="h2" weight="bold" align="center">
              One product instead of many.
            </Text>
            <Text variant="body" class="text-muted" align="center">
              Three ideas carry the whole platform.
            </Text>
          </Stack>
          <div class="grid-3">
            <For each={PILLARS}>
              {(pillar) => (
                <Card padding="lg">
                  <Stack direction="vertical" gap="sm">
                    <Badge variant="info" size="sm">
                      {pillar.badge}
                    </Badge>
                    <Text variant="h4" weight="semibold">
                      {pillar.title}
                    </Text>
                    <Text variant="body" class="text-muted">
                      {pillar.description}
                    </Text>
                  </Stack>
                </Card>
              )}
            </For>
          </div>
        </Stack>

        {/* Founding customer block */}
        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Stack direction="horizontal" gap="sm" align="center">
              <Badge variant="info" size="sm">
                Founding customer program
              </Badge>
            </Stack>
            <Text variant="h3" weight="semibold">
              Build alongside the team shipping the platform.
            </Text>
            <Text variant="body" class="text-muted">
              We are in private beta. The first wave of customers gets direct access to the
              people building Crontech, pricing locked in for life, and a meaningful seat at the
              table while the product is still being shaped. If you want to ship on a platform
              you helped design, this is the window.
            </Text>
            <div class="grid-2">
              <For each={FOUNDING_PERKS}>
                {(perk) => (
                  <Stack direction="horizontal" gap="sm" align="center">
                    <Text variant="body" weight="semibold" as="span">
                      ✓
                    </Text>
                    <Text variant="body">{perk}</Text>
                  </Stack>
                )}
              </For>
            </div>
            <Stack direction="horizontal" gap="sm">
              <A href="/register">
                <Button variant="primary" size="lg">
                  Apply for founding access
                </Button>
              </A>
              <A href="/pricing">
                <Button variant="outline" size="lg">
                  See pricing
                </Button>
              </A>
            </Stack>
          </Stack>
        </Card>

        {/* Closing CTA */}
        <Card padding="lg">
          <Stack direction="vertical" gap="md" align="center">
            <Text variant="h3" weight="semibold" align="center">
              The next decade of software will be built on something. Why not this?
            </Text>
            <Text variant="body" class="text-muted" align="center">
              Free to start. No credit card. Upgrade only when you ship.
            </Text>
            <Stack direction="horizontal" gap="sm" justify="center">
              <A href="/register">
                <Button variant="primary" size="lg">
                  Start building
                </Button>
              </A>
              <A href="/docs">
                <Button variant="outline" size="lg">
                  Read the docs
                </Button>
              </A>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
