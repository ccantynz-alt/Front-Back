import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";

// ── Data ──────────────────────────────────────────────────────────────

interface Pillar {
  badge: string;
  title: string;
  description: string;
}

// Compliance-native pillars. Derived from docs/strategy/WEDGE.md §4.
const pillars: Pillar[] = [
  {
    badge: "SOC 2-ready",
    title: "SOC 2 primitives on day one",
    description:
      "Immutable audit trails, least-privilege access, zero-trust networking, and evidence export — built into every tier, not sold as an add-on.",
  },
  {
    badge: "Encrypted",
    title: "Encrypted-at-rest Postgres",
    description:
      "AES-256-GCM at rest, TLS 1.3 in transit, envelope encryption with rotating KMS keys. The default posture, not a premium upsell.",
  },
  {
    badge: "Tamper-evident",
    title: "Hash-chained audit logs",
    description:
      "Every event signed, every entry chained to the previous hash. Cryptographic integrity your next audit can actually verify.",
  },
  {
    badge: "Polyglot",
    title: "TypeScript, Python, Rust — one runtime",
    description:
      "A polyglot runtime host from day one. Ship your Python AI service and your TypeScript web app on a single compliance-native substrate.",
  },
  {
    badge: "One bill",
    title: "One platform instead of seven",
    description:
      "Hosting, database, auth, audit logging, observability, secrets, evidence storage — unified. One dashboard. One bill. One vendor on your audit questionnaire.",
  },
  {
    badge: "Sovereign",
    title: "Your data, your audit trail",
    description:
      "Configurable data residency, WORM-compliant evidence storage, and exports you own. Sovereign infrastructure for teams that cannot afford ambiguity.",
  },
];

// ── Dogfood proof strip ───────────────────────────────────────────────
// Real migration status from docs/strategy/MIGRATION-PLAN.md.
// Nothing is claimed as "running on Crontech" until it actually is — status
// labels reflect the current state honestly.

interface ProofPoint {
  name: string;
  role: string;
  status: "coming-soon" | "in-migration";
}

const proofPoints: ProofPoint[] = [
  { name: "Crontech",                    role: "Crontech runs Crontech — self-hosted substrate",       status: "in-migration" },
  { name: "MarcoReid.com",               role: "Dress rehearsal migration",                             status: "coming-soon" },
  { name: "emailed",                     role: "Stack-identical dogfood",                               status: "coming-soon" },
  { name: "Astra (ledger.ai)",           role: "Polyglot Python + real banking + Stripe",               status: "coming-soon" },
  { name: "AI-Immigration-Compliance",   role: "§5A primitives under real compliance load",             status: "coming-soon" },
  { name: "GateTest",                    role: "Revenue-bearing SaaS on Crontech",                      status: "coming-soon" },
  { name: "Zoobicon.com",                role: "The AI website builder, running on Crontech",           status: "coming-soon" },
];

export default function Home(): JSX.Element {
  const auth = useAuth();

  return (
    <>
      <SEOHead
        title="Crontech — The compliance-native developer platform for AI SaaS"
        description="SOC 2 primitives, encrypted-at-rest Postgres, hash-chained audit logs, polyglot runtime. Built in. Day one. The compliance-native developer platform for AI SaaS."
        path="/"
      />
      <Stack direction="vertical" gap="xl" class="page-padded">
        {/* Hero */}
        <Stack direction="vertical" align="center" justify="center" gap="md" class="hero">
          <Badge variant="info" size="sm">Founding Member cohort open — first 100 only</Badge>
          <Text variant="h1" weight="bold" align="center" class="heading hero-gradient">
            The compliance-native developer platform for AI SaaS.
          </Text>
          <Text variant="body" align="center" class="tagline">
            SOC 2 primitives, encrypted-at-rest Postgres, hash-chained audit logs, polyglot runtime. Built in. Day one.
          </Text>
          <Text variant="body" align="center" class="description">
            Every AI SaaS hits the SOC 2 wall. Most founders scramble to stitch together seven vendors just to reach the starting line of an audit.
            Crontech is the other option: one platform where every layer is compliance-native from the first deploy.
          </Text>
          <Stack direction="horizontal" gap="md" justify="center">
            <A href="/founding">
              <Button variant="primary" size="lg">Claim Founding Member — first 100 only</Button>
            </A>
            <Show
              when={auth.isAuthenticated()}
              fallback={
                <A href="/docs">
                  <Button variant="outline" size="lg">See the primitives</Button>
                </A>
              }
            >
              <A href="/dashboard">
                <Button variant="outline" size="lg">Open dashboard</Button>
              </A>
            </Show>
          </Stack>
        </Stack>

        {/* Proof strip — real migrations, real status */}
        <Stack direction="vertical" gap="md">
          <Stack direction="vertical" gap="xs" align="center">
            <Text variant="h2" weight="bold" align="center">
              Proved on production workloads.
            </Text>
            <Text variant="body" class="text-muted" align="center">
              Crontech launches with real apps already running on it — not slideware.
              Each migration forces a compliance-native primitive into existence.
            </Text>
          </Stack>
          <div class="grid-3">
            <For each={proofPoints}>
              {(p) => (
                <Card padding="lg">
                  <Stack direction="vertical" gap="sm">
                    <Badge variant="info" size="sm">
                      {p.status === "in-migration" ? "In migration" : "Coming soon"}
                    </Badge>
                    <Text variant="h4" weight="semibold">{p.name}</Text>
                    <Text variant="body" class="text-muted">{p.role}</Text>
                  </Stack>
                </Card>
              )}
            </For>
          </div>
        </Stack>

        {/* Pillars Grid */}
        <Stack direction="vertical" gap="md">
          <Stack direction="vertical" gap="xs" align="center">
            <Text variant="h2" weight="bold" align="center">
              Compliance-native at every layer.
            </Text>
            <Text variant="body" class="text-muted" align="center">
              Not a checklist. Not a premium tier. The default posture of the platform.
            </Text>
          </Stack>
          <div class="grid-3">
            <For each={pillars}>
              {(pillar) => (
                <Card padding="lg">
                  <Stack direction="vertical" gap="sm">
                    <Badge variant="info" size="sm">{pillar.badge}</Badge>
                    <Text variant="h4" weight="semibold">{pillar.title}</Text>
                    <Text variant="body" class="text-muted">{pillar.description}</Text>
                  </Stack>
                </Card>
              )}
            </For>
          </div>
        </Stack>

        {/* Closing CTA */}
        <Card padding="lg">
          <Stack direction="vertical" gap="md" align="center">
            <Text variant="h3" weight="semibold" align="center">
              Your audit log should run on a platform that could pass its own audit.
            </Text>
            <Text variant="body" class="text-muted" align="center">
              Founding Members get the compliance-native primitives, the polyglot runtime, and a direct line to the team building it. First 100 seats only.
            </Text>
            <Stack direction="horizontal" gap="sm" justify="center">
              <A href="/founding">
                <Button variant="primary" size="lg">Claim Founding Member — first 100 only</Button>
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
