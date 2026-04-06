import { Title } from "@solidjs/meta";
import { For } from "solid-js";
import { A } from "@solidjs/router";
import { Button, Card, Stack, Text } from "@back-to-the-future/ui";

// ── Feature Card ──────────────────────────────────────────────────────

interface FeatureProps {
  title: string;
  description: string;
}

function FeatureCard(props: FeatureProps): ReturnType<typeof Card> {
  return (
    <Card padding="md" class="feature-card">
      <Stack direction="vertical" gap="sm">
        <Text variant="h4" weight="semibold">{props.title}</Text>
        <Text variant="body" class="text-muted">{props.description}</Text>
      </Stack>
    </Card>
  );
}

// ── About Page ────────────────────────────────────────────────────────

export default function AboutPage(): ReturnType<typeof Stack> {
  const features: FeatureProps[] = [
    {
      title: "AI-Native Architecture",
      description:
        "AI is not a feature -- it is the architecture. Every layer, from routing to data fetching to error recovery, has AI woven into its DNA.",
    },
    {
      title: "Three-Tier Compute",
      description:
        "Workloads flow automatically between client GPU (free), edge (fast), and cloud (powerful). The platform decides where to run each computation.",
    },
    {
      title: "Zero-HTML Components",
      description:
        "You never write HTML. SolidJS signals compile JSX to direct, surgical DOM mutations. Every component is AI-composable via Zod schemas.",
    },
    {
      title: "Real-Time Collaboration",
      description:
        "CRDTs enable conflict-free editing. AI agents participate as first-class collaborators alongside human users, with sub-50ms global latency.",
    },
    {
      title: "Client-Side AI Inference",
      description:
        "WebGPU-powered inference runs models directly in the browser at zero cost per token. Summarization, classification, and embeddings -- all local.",
    },
    {
      title: "Edge-First Data",
      description:
        "Turso embedded replicas provide zero-latency reads at the edge. Data lives next to your users, not in a distant data center.",
    },
  ];

  return (
    <Stack direction="vertical" gap="xl" class="page-padded">
      <Title>About - Marco Reid</Title>

      <Stack direction="vertical" gap="md" align="center" class="about-hero">
        <Text variant="h1" weight="bold" align="center">
          Marco Reid
        </Text>
        <Text variant="body" align="center" class="about-subtitle text-muted">
          The most advanced full-stack platform purpose-built for AI website builders and AI video builders.
          AI-native. Edge-first. Zero-HTML. Self-evolving.
        </Text>
      </Stack>

      <Stack direction="vertical" gap="md">
        <Text variant="h2" weight="bold">Platform Capabilities</Text>
        <div class="grid-3">
          <For each={features}>
            {(feature) => (
              <FeatureCard title={feature.title} description={feature.description} />
            )}
          </For>
        </div>
      </Stack>

      <Stack direction="vertical" gap="md">
        <Text variant="h2" weight="bold">Technology Stack</Text>
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="body">
              <strong>Frontend:</strong> SolidJS + SolidStart, Tailwind v4, WebGPU
            </Text>
            <Text variant="body">
              <strong>Backend:</strong> Hono on Bun, tRPC v11, Drizzle ORM
            </Text>
            <Text variant="body">
              <strong>AI:</strong> Vercel AI SDK 6, LangGraph, WebLLM, Transformers.js v4
            </Text>
            <Text variant="body">
              <strong>Database:</strong> Turso (Edge SQLite), Neon (Serverless PG), Qdrant (Vector)
            </Text>
            <Text variant="body">
              <strong>Infrastructure:</strong> Cloudflare Workers, Modal.com, Fly.io
            </Text>
            <Text variant="body">
              <strong>Auth:</strong> Passkeys / WebAuthn (FIDO2)
            </Text>
          </Stack>
        </Card>
      </Stack>

      <Stack direction="horizontal" gap="md" justify="center">
        <A href="/register">
          <Button variant="primary" size="lg">Get Started</Button>
        </A>
        <A href="/">
          <Button variant="outline" size="lg">Back to Home</Button>
        </A>
      </Stack>
    </Stack>
  );
}
