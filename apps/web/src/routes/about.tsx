import { Title } from "@solidjs/meta";
import { For } from "solid-js";
import { A } from "@solidjs/router";
import {
  Badge,
  Button,
  Card,
  Separator,
  Stack,
  Text,
} from "@back-to-the-future/ui";

// ── Feature Card ──────────────────────────────────────────────────────

interface FeatureCardProps {
  title: string;
  description: string;
  badge: string;
}

function FeatureCard(props: FeatureCardProps): ReturnType<typeof Card> {
  return (
    <Card padding="md" class="h-full">
      <Stack direction="vertical" gap="sm">
        <Stack direction="horizontal" gap="sm" align="center">
          <Text variant="h4" weight="semibold">
            {props.title}
          </Text>
          <Badge variant="primary">{props.badge}</Badge>
        </Stack>
        <Text variant="body" class="text-muted">
          {props.description}
        </Text>
      </Stack>
    </Card>
  );
}

// ── Tech Stack Item ──────────────────────────────────────────────────

interface TechItemProps {
  category: string;
  technologies: string;
}

function TechItem(props: TechItemProps): ReturnType<typeof Text> {
  return (
    <Text variant="body">
      <strong>{props.category}:</strong> {props.technologies}
    </Text>
  );
}

// ── About Page ────────────────────────────────────────────────────────

export default function AboutPage(): ReturnType<typeof Stack> {
  const features: FeatureCardProps[] = [
    {
      title: "AI-Native",
      badge: "Core",
      description:
        "AI is not a feature — it is the architecture. Every layer has AI woven into its DNA: routing optimizes itself, data fetching predicts your next query, and error recovery self-heals before you notice.",
    },
    {
      title: "Edge-First",
      badge: "Fast",
      description:
        "Workloads flow between client GPU ($0/token), edge (sub-50ms), and cloud (H100 power). Sub-5ms cold starts across 330+ cities. Data lives next to your users via Turso embedded replicas.",
    },
    {
      title: "Zero-HTML",
      badge: "Modern",
      description:
        "You never write HTML. SolidJS signals compile JSX to surgical DOM mutations — no virtual DOM, no diffing. Every component is AI-composable via Zod schemas and the json-render pattern.",
    },
  ];

  const techStack: TechItemProps[] = [
    {
      category: "Frontend",
      technologies: "SolidJS + SolidStart, Tailwind v4, WebGPU, Motion",
    },
    {
      category: "Backend",
      technologies: "Hono on Bun, tRPC v11, Drizzle ORM, Axum (Rust)",
    },
    {
      category: "AI",
      technologies:
        "Vercel AI SDK 6, LangGraph, Mastra, WebLLM, Transformers.js v4",
    },
    {
      category: "Database",
      technologies: "Turso (Edge SQLite), Neon (Serverless PG), Qdrant (Vector)",
    },
    {
      category: "Infrastructure",
      technologies: "Cloudflare Workers, Modal.com GPUs, Fly.io",
    },
    {
      category: "Auth",
      technologies: "Passkeys / WebAuthn (FIDO2), Zero-Trust Architecture",
    },
    {
      category: "Real-Time",
      technologies: "Yjs CRDTs, Liveblocks, WebSockets + SSE",
    },
    {
      category: "Observability",
      technologies: "OpenTelemetry, Grafana LGTM Stack",
    },
  ];

  return (
    <Stack direction="vertical" gap="xl" class="page-padded max-w-4xl mx-auto py-12">
      <Title>About - Back to the Future</Title>

      {/* Hero Section */}
      <Stack direction="vertical" gap="md" align="center" class="text-center">
        <Text variant="h1" weight="bold" align="center">
          About Back to the Future
        </Text>
        <Text variant="body" align="center" class="text-muted max-w-2xl">
          The most advanced full-stack platform purpose-built for AI website
          builders and AI video builders. We occupy whitespace no one else is
          even attempting — combining WebGPU, AI, real-time collaboration, and
          edge computing into a single unified platform.
        </Text>
      </Stack>

      <Separator />

      {/* Feature Grid */}
      <Stack direction="vertical" gap="md">
        <Text variant="h2" weight="bold">
          Platform Pillars
        </Text>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <For each={features}>
            {(feature) => (
              <FeatureCard
                title={feature.title}
                description={feature.description}
                badge={feature.badge}
              />
            )}
          </For>
        </div>
      </Stack>

      <Separator />

      {/* Tech Stack Section */}
      <Stack direction="vertical" gap="md">
        <Text variant="h2" weight="bold">
          Technology Stack
        </Text>
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <For each={techStack}>
              {(item) => (
                <TechItem
                  category={item.category}
                  technologies={item.technologies}
                />
              )}
            </For>
          </Stack>
        </Card>
      </Stack>

      <Separator />

      {/* CTA Section */}
      <Stack direction="vertical" gap="md" align="center" class="text-center py-8">
        <Text variant="h3" weight="semibold">
          Ready to build the future?
        </Text>
        <Text variant="body" class="text-muted max-w-lg">
          Join the platform that is 80% ahead of the competition. AI-native
          from the ground up, not bolted on as an afterthought.
        </Text>
        <Stack direction="horizontal" gap="md" justify="center">
          <A href="/register">
            <Button variant="primary" size="lg">
              Get Started
            </Button>
          </A>
          <A href="/">
            <Button variant="outline" size="lg">
              Back to Home
            </Button>
          </A>
        </Stack>
      </Stack>
    </Stack>
  );
}
