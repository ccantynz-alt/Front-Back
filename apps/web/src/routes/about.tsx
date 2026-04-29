import { For } from "solid-js";
import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Box, Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";

// ── Data ──────────────────────────────────────────────────────────────

interface Principle {
  icon: string;
  title: string;
  description: string;
}

const principles: Principle[] = [
  {
    icon: "\u26A1",
    title: "Speed is survival",
    description:
      "Sub-5ms cold starts. 52K requests per second. If something is slow, it is dead to us. Every millisecond we shave is a millisecond your users never wait.",
  },
  {
    icon: "\uD83E\uDDE0",
    title: "AI is the architecture",
    description:
      "AI is not a feature we bolted on. It is the nervous system. Routing, data fetching, error recovery, collaboration \u2014 every layer has intelligence woven into its DNA.",
  },
  {
    icon: "\uD83C\uDF10",
    title: "Edge-first, cloud as fallback",
    description:
      "Your code runs in 330+ cities worldwide by default. Cloud GPUs activate only when the edge and client cannot handle the workload. Cheaper. Faster. Better.",
  },
  {
    icon: "\uD83D\uDD12",
    title: "Type safety is non-negotiable",
    description:
      "End-to-end type safety from database to DOM. tRPC, Zod, and TypeScript strict mode eliminate entire classes of bugs before a single line ships to production.",
  },
  {
    icon: "\uD83D\uDCA0",
    title: "Zero HTML, components only",
    description:
      "The browser is a render target, not a document viewer. SolidJS signals compile JSX to surgical DOM mutations. No virtual DOM. No diffing overhead. Pure speed.",
  },
  {
    icon: "\uD83D\uDE80",
    title: "Self-evolving platform",
    description:
      "24/7 competitive intelligence. Automated dependency evolution. AI-powered rollout decisions. The platform does not just ship features \u2014 it improves itself while you sleep.",
  },
];

interface ServiceItem {
  name: string;
  description: string;
}

const unifiedServices: ServiceItem[] = [
  { name: "Edge Hosting", description: "Sub-5ms cold starts across 330+ cities worldwide" },
  { name: "Serverless Database", description: "Edge SQLite replicas with zero-latency reads" },
  { name: "Authentication", description: "Passkey-first, phishing-immune WebAuthn" },
  { name: "AI Inference", description: "Three-tier compute: client GPU, edge, cloud" },
  { name: "Real-Time Collaboration", description: "CRDTs for conflict-free multi-user editing" },
  { name: "Video Processing", description: "WebGPU-accelerated encoding in the browser" },
  { name: "Generative UI", description: "AI composes validated component trees from schemas" },
  { name: "Vector Search", description: "Semantic search on every piece of data, automatically" },
  { name: "RAG Pipelines", description: "Retrieval-augmented generation as a first-class primitive" },
  { name: "Payments & Billing", description: "Stripe integration with subscription management" },
  { name: "API Gateway", description: "tRPC for internal, REST and GraphQL for external" },
  { name: "Webhooks", description: "Event-driven notifications with cryptographic signing" },
  { name: "Feature Flags", description: "Progressive delivery with AI-powered rollout decisions" },
  { name: "Observability", description: "OpenTelemetry traces, Grafana dashboards, full LGTM stack" },
  { name: "CI/CD Pipeline", description: "Automated builds, tests, and deploys on every commit" },
  { name: "Competitive Intelligence", description: "Sentinel monitors competitors 24/7" },
  { name: "Multi-Agent Orchestration", description: "LangGraph workflows for complex AI tasks" },
  { name: "Client-Side ML", description: "Transformers.js and WebLLM for zero-cost inference" },
  { name: "Object Storage", description: "S3-compatible storage with zero egress fees" },
  { name: "Serverless GPU", description: "A100/H100 on demand for heavy workloads" },
  { name: "Enterprise SSO", description: "SAML 2.0, OIDC, and SCIM provisioning" },
  { name: "Compliance", description: "SOC 2, HIPAA, GDPR, immutable audit trails" },
];

interface StatItem {
  value: string;
  label: string;
}

const stats: StatItem[] = [
  { value: "22", label: "Services unified" },
  { value: "330+", label: "Edge cities" },
  { value: "<5ms", label: "Cold start" },
  { value: "$0", label: "Client inference" },
];

interface TechLayer {
  label: string;
  techs: string[];
}

const techStack: TechLayer[] = [
  { label: "Frontend", techs: ["SolidJS + SolidStart", "Tailwind v4", "WebGPU", "Motion"] },
  { label: "Backend", techs: ["Hono on Bun", "tRPC v11", "Drizzle ORM", "Axum (Rust)"] },
  { label: "AI", techs: ["Vercel AI SDK 6", "LangGraph", "WebLLM", "Transformers.js v4"] },
  { label: "Database", techs: ["Turso (Edge SQLite)", "Neon (Serverless PG)", "Qdrant (Vector)"] },
  { label: "Infrastructure", techs: ["Cloudflare Workers", "Modal.com GPUs", "Fly.io"] },
  { label: "Security", techs: ["Passkeys / FIDO2", "Zero-Trust", "AES-256", "Immutable Audit"] },
];

// ── Components ────────────────────────────────────────────────────────

function PrincipleCard(props: { principle: Principle }): JSX.Element {
  return (
    <Card padding="lg">
      <Stack direction="vertical" gap="sm">
        <Box class="stat-value" style={{ "font-size": "1.75rem" }}>
          {props.principle.icon}
        </Box>
        <Text variant="h4" weight="semibold">
          {props.principle.title}
        </Text>
        <Text variant="body" class="text-muted">
          {props.principle.description}
        </Text>
      </Stack>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function AboutPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="About Crontech"
        description="Crontech unifies hosting, database, auth, AI, real-time collaboration, and 16 more services into one AI-native developer platform. Built on the bleeding edge."
        path="/about"
      />

      <Stack direction="vertical" gap="xl" class="page-padded">
        {/* ── Hero ── */}
        <Stack direction="vertical" gap="md" align="center" class="about-hero">
          <Badge variant="info" size="sm">
            The developer platform for the next decade
          </Badge>
          <Text variant="h1" weight="bold" align="center" class="heading hero-gradient">
            One platform. Every layer.
          </Text>
          <Text variant="body" align="center" class="about-subtitle text-muted" style={{ "font-size": "1.25rem" }}>
            Crontech replaces the patchwork of hosting, database, auth, AI, real-time,
            payments, and a dozen other services with a single, unified, AI-native
            developer platform. Built on the bleeding edge. Ready to ship.
          </Text>
        </Stack>

        {/* ── Stats ── */}
        <Box class="stats-grid">
          <For each={stats}>
            {(s) => (
              <Box class="stat-card">
                <Box class="stat-value">{s.value}</Box>
                <Box class="stat-label">{s.label}</Box>
              </Box>
            )}
          </For>
        </Box>

        {/* ── Mission ── */}
        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h2" weight="bold">
              Our mission
            </Text>
            <Text variant="body" style={{ "font-size": "1.125rem", "line-height": "1.75" }}>
              The entire industry is fragmented. Backend frameworks over here, frontend
              frameworks over there, AI bolted on as an afterthought, edge computing
              treated as a deployment target instead of a compute primitive. We reject
              all of that.
            </Text>
            <Text variant="body" style={{ "font-size": "1.125rem", "line-height": "1.75" }}>
              Crontech unifies everything into a single, cohesive platform purpose-built
              for AI website builders and AI video builders. One dashboard. One bill. One
              runtime that spans client GPU, edge, and cloud. The developer specifies
              intent \u2014 the platform handles infrastructure.
            </Text>
            <Text variant="body" style={{ "font-size": "1.125rem", "line-height": "1.75" }}>
              We are building in a category that does not exist yet. No one has ever
              combined the most advanced backend service with the most advanced frontend
              service into a single, unified, AI-native platform. This is the first.
            </Text>
          </Stack>
        </Card>

        {/* ── Principles ── */}
        <Stack direction="vertical" gap="md">
          <Stack direction="vertical" gap="xs" align="center">
            <Text variant="h2" weight="bold" align="center">
              What we believe
            </Text>
            <Text variant="body" class="text-muted" align="center">
              Six principles that shape every decision we make.
            </Text>
          </Stack>
          <Box class="grid-3">
            <For each={principles}>
              {(p) => <PrincipleCard principle={p} />}
            </For>
          </Box>
        </Stack>

        {/* ── 22 Services ── */}
        <Stack direction="vertical" gap="md">
          <Stack direction="vertical" gap="xs" align="center">
            <Badge variant="success" size="sm">
              One product instead of many
            </Badge>
            <Text variant="h2" weight="bold" align="center">
              22 services. One platform.
            </Text>
            <Text variant="body" class="text-muted" align="center" style={{ "max-width": "640px" }}>
              Stop stitching together a dozen vendors. Crontech provides everything your
              application needs in a single, type-safe, AI-native runtime.
            </Text>
          </Stack>
          <Box class="grid-4">
            <For each={unifiedServices}>
              {(svc) => (
                <Card padding="md">
                  <Stack direction="vertical" gap="xs">
                    <Text variant="caption" weight="semibold">
                      {svc.name}
                    </Text>
                    <Text variant="caption" class="text-muted">
                      {svc.description}
                    </Text>
                  </Stack>
                </Card>
              )}
            </For>
          </Box>
        </Stack>

        {/* ── Three-Tier Compute ── */}
        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h2" weight="bold">
              Three-tier compute. One runtime.
            </Text>
            <Text variant="body" class="text-muted" style={{ "font-size": "1.0625rem", "line-height": "1.75" }}>
              AI workloads automatically flow between three compute tiers. No
              configuration. No manual routing. The platform decides where each
              computation runs based on model size, device capability, and latency
              requirements.
            </Text>
            <Box class="grid-3">
              <Card padding="md">
                <Stack direction="vertical" gap="sm">
                  <Badge variant="success" size="sm">$0 / token</Badge>
                  <Text variant="h4" weight="semibold">Client GPU</Text>
                  <Text variant="body" class="text-muted">
                    WebGPU-accelerated inference runs models directly in the browser.
                    Sub-10ms latency. Zero server cost. Handles summarization,
                    classification, embeddings, and small completions.
                  </Text>
                </Stack>
              </Card>
              <Card padding="md">
                <Stack direction="vertical" gap="sm">
                  <Badge variant="info" size="sm">Sub-50ms global</Badge>
                  <Text variant="h4" weight="semibold">Edge</Text>
                  <Text variant="body" class="text-muted">
                    Cloudflare Workers AI for lightweight inference across 330+ cities.
                    Always warm. No cold starts. Handles mid-range tasks that exceed
                    client GPU capacity.
                  </Text>
                </Stack>
              </Card>
              <Card padding="md">
                <Stack direction="vertical" gap="sm">
                  <Badge variant="default" size="sm">H100 power</Badge>
                  <Text variant="h4" weight="semibold">Cloud</Text>
                  <Text variant="body" class="text-muted">
                    Modal.com with H100 GPUs on demand. Scale to zero, scale to
                    thousands. Heavy inference, fine-tuning, training, and video
                    processing.
                  </Text>
                </Stack>
              </Card>
            </Box>
          </Stack>
        </Card>

        {/* ── Technology Stack ── */}
        <Stack direction="vertical" gap="md">
          <Stack direction="vertical" gap="xs" align="center">
            <Text variant="h2" weight="bold" align="center">
              Built on the bleeding edge
            </Text>
            <Text variant="body" class="text-muted" align="center">
              Every tool earns its place through performance, capability, and strategic
              value.
            </Text>
          </Stack>
          <Box class="grid-3">
            <For each={techStack}>
              {(layer) => (
                <Card padding="md">
                  <Stack direction="vertical" gap="sm">
                    <Text variant="h4" weight="semibold">{layer.label}</Text>
                    <Stack direction="vertical" gap="xs">
                      <For each={layer.techs}>
                        {(tech) => (
                          <Text variant="body" class="text-muted">
                            {tech}
                          </Text>
                        )}
                      </For>
                    </Stack>
                  </Stack>
                </Card>
              )}
            </For>
          </Box>
        </Stack>

        {/* ── CTA ── */}
        <Card padding="lg">
          <Stack direction="vertical" gap="md" align="center">
            <Text variant="h3" weight="semibold" align="center">
              The future does not wait. Neither should you.
            </Text>
            <Text variant="body" class="text-muted" align="center" style={{ "max-width": "520px" }}>
              Join the teams building two years ahead of the market. Free to start. No
              credit card required.
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
