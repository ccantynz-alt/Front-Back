import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button } from "@back-to-the-future/ui";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";
import { Icon, type IconName } from "../components/Icon";

// ── Data ────────────────────────────────────────────────────────────

interface Feature {
  icon: IconName;
  title: string;
  description: string;
  href: string;
  badge?: string | undefined;
}

const features: Feature[] = [
  {
    icon: "zap",
    title: "Edge Compute",
    description:
      "Cloudflare Workers at the edge. Sub-5ms cold starts across 330+ cities. No containers, no regions, no capacity planning.",
    href: "/deployments",
    badge: "Core",
  },
  {
    icon: "database",
    title: "Unified Data",
    description:
      "Turso SQLite replicas at the edge for zero-latency reads. Neon Postgres when you need the full engine. Qdrant for vector search.",
    href: "/admin",
  },
  {
    icon: "link-2",
    title: "Type-Safe APIs",
    description:
      "tRPC v11 end to end. Change a server type, see the client error instantly. No OpenAPI specs, no codegen step, no drift.",
    href: "/pricing",
  },
  {
    icon: "radio",
    title: "Real-Time Layer",
    description:
      "WebSockets, SSE, and Yjs CRDTs on every edge node. Multi-user editing with AI agents as first-class peers.",
    href: "/chat",
  },
  {
    icon: "brain",
    title: "AI Runtime",
    description:
      "Three-tier compute routes inference where it is cheapest: client GPU, edge, or cloud H100s on demand. Generative UI and streaming native.",
    href: "/chat",
  },
  {
    icon: "lock",
    title: "Auth + Admin",
    description:
      "Passkeys, OAuth, 2FA. Role-based access control. Audit logs, analytics, and user management. Ships with the platform.",
    href: "/admin",
    badge: "Built-in",
  },
];

interface Step {
  number: string;
  title: string;
  description: string;
  icon: string;
}

const steps: Step[] = [
  {
    number: "01",
    title: "Connect",
    description:
      "Point your domain at Crontech. Your app moves to the edge. DNS propagation is the longest step.",
    icon: "\u{1F50C}",
  },
  {
    number: "02",
    title: "Compose",
    description:
      "Pick the layers you need \u2014 data, auth, AI, real-time, billing. One config line each.",
    icon: "\u{1F9F1}",
  },
  {
    number: "03",
    title: "Ship",
    description:
      "Git push deploys. Type-safe end to end. Every layer observable. Global in seconds.",
    icon: "\u{1F680}",
  },
];

interface Stat {
  value: string;
  label: string;
}

const stats: Stat[] = [
  { value: "< 5ms", label: "Edge Cold Start" },
  { value: "330+", label: "Cities Worldwide" },
  { value: "End-to-End", label: "Type Safety" },
  { value: "Built-In", label: "Auth, RBAC, Audit" },
];

interface TechPillar {
  label: string;
  title: string;
  description: string;
}

const techPillars: TechPillar[] = [
  {
    label: "One platform, every layer",
    title: "Replace your entire stack",
    description:
      "Hosting, database, authentication, AI, real-time collaboration, payments, email, and storage. One product. One dashboard. One bill.",
  },
  {
    label: "Built on the bleeding edge",
    title: "The fastest stack on the web",
    description:
      "Cloudflare Workers for sub-5ms cold starts. SolidJS for the fastest reactivity. Bun + Hono for the fastest runtime. Type-safe end to end.",
  },
  {
    label: "AI-native at every layer",
    title: "AI is the architecture, not an add-on",
    description:
      "AI agents, generative UI, three-tier compute routing, RAG pipelines, and real-time AI co-authoring. Native from the ground up.",
  },
];

// ── Feature Card ────────────────────────────────────────────────────

function FeatureCard(props: Feature): JSX.Element {
  return (
    <A href={props.href} class="block group">
      {/*
        Outer card is NOT overflow-hidden — that was clipping the "L" of
        "Learn more" on the bottom row (issue #1). Instead we isolate the
        glow inside its own overflow-hidden layer, and give the card
        generous padding so its content has breathing room (issue #7).
      */}
      <div
        class="h-full rounded-xl p-6 transition-all duration-200"
        style={{
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border-strong)";
          e.currentTarget.style.boxShadow = "var(--shadow-md)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <div class="flex h-full flex-col gap-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3.5">
              <div
                class="flex h-11 w-11 items-center justify-center rounded-lg text-lg"
                style={{
                  background: "var(--color-primary-light)",
                  color: "var(--color-primary-text)",
                }}
              >
                <Icon name={props.icon} size={20} />
              </div>
              <span
                class="text-base font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                {props.title}
              </span>
            </div>
            <Show when={props.badge}>
              <span
                class="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: "var(--color-primary-light)",
                  color: "var(--color-primary-text)",
                }}
              >
                {props.badge}
              </span>
            </Show>
          </div>
          <p
            class="text-sm leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {props.description}
          </p>
          <div
            class="mt-auto flex items-center gap-1.5 pt-2 text-xs font-medium"
            style={{ color: "var(--color-primary-text)" }}
          >
            <span>Learn more</span>
            <span class="transition-transform duration-200 group-hover:translate-x-1">&#8594;</span>
          </div>
        </div>
      </div>
    </A>
  );
}

// ── Step Card ───────────────────────────────────────────────────────

function StepCard(props: Step): JSX.Element {
  return (
    <div class="flex flex-col items-center gap-4 text-center">
      <div class="relative">
        <div
          class="flex h-16 w-16 items-center justify-center rounded-xl text-xl"
          style={{
            background: "var(--color-primary-light)",
            border: "1px solid var(--color-border)",
          }}
        >
          <span style={{ color: "var(--color-primary-text)" }}>{props.icon}</span>
        </div>
        <div
          class="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold"
          style={{ background: "var(--color-primary)", color: "var(--color-text)" }}
        >
          {props.number}
        </div>
      </div>
      <h3
        class="text-lg font-bold"
        style={{ color: "var(--color-text)" }}
      >
        {props.title}
      </h3>
      <p
        class="max-w-xs text-sm leading-relaxed"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {props.description}
      </p>
    </div>
  );
}

// ── Stat Block ──────────────────────────────────────────────────────

function StatBlock(props: Stat): JSX.Element {
  return (
    <div class="flex flex-col items-center justify-center gap-3 bg-[color-mix(in_oklab,var(--color-text)_2%,transparent)] px-6 py-10 transition-colors duration-300 hover:bg-[color-mix(in_oklab,var(--color-text)_3.5%,transparent)] sm:py-12">
      <span
        class="text-2xl font-bold tracking-tight sm:text-3xl"
        style={{ color: "var(--color-primary)" }}
      >
        {props.value}
      </span>
      <span
        class="text-[11px] font-medium uppercase tracking-widest"
        style={{ color: "var(--color-text-muted)" }}
      >
        {props.label}
      </span>
    </div>
  );
}

// ── Section Eyebrow Pill ────────────────────────────────────────────
// Shared pill used for small section labels like "PLATFORM" and
// "ONBOARDING". Previously these floated mid-page as bare violet text —
// now they render as proper bordered pill badges so they look
// intentional (issues #3 and #4).

interface EyebrowPillProps {
  label: string;
  color: string;
}

function EyebrowPill(props: EyebrowPillProps): JSX.Element {
  return (
    <span
      class="mb-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em]"
      style={{
        "border-color": `${props.color}40`,
        background: `${props.color}12`,
        color: props.color,
      }}
    >
      <span
        class="h-1.5 w-1.5 rounded-full"
        style={{ background: props.color }}
      />
      {props.label}
    </span>
  );
}

// ── Tech Pillar Card ────────────────────────────────────────────────

function TechPillarCard(props: TechPillar): JSX.Element {
  return (
    <div
      class="rounded-xl p-7 transition-all duration-200"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border-strong)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span
        class="mb-3 inline-block text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-primary-text)" }}
      >
        {props.label}
      </span>
      <h3
        class="mb-3 text-xl font-bold"
        style={{ color: "var(--color-text)" }}
      >
        {props.title}
      </h3>
      <p
        class="text-sm leading-relaxed"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {props.description}
      </p>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function Home(): JSX.Element {
  const auth = useAuth();

  return (
    <>
      <SEOHead
        title="Crontech \u2014 The developer platform for the next decade"
        description="One unified platform. Backend and frontend, joined as one. Hosting, database, auth, AI, real-time, billing, storage \u2014 all in one product, type-safe end to end, built on the bleeding edge."
        path="/"
      />

      <div style={{ background: "var(--color-bg)" }}>
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section class="relative overflow-hidden">
          <div class="mx-auto max-w-[1200px] px-6 pt-24 pb-20 lg:px-8 lg:pt-36 lg:pb-28">
            <div class="flex flex-col items-center text-center">
              <div
                class="mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
                style={{
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-elevated)",
                }}
              >
                <div
                  class="h-1.5 w-1.5 rounded-full animate-pulse"
                  style={{ background: "var(--color-success)" }}
                />
                <span
                  class="text-xs font-medium"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Now in early access
                </span>
              </div>

              <h1
                class="max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.75rem]"
                style={{ color: "var(--color-text)" }}
              >
                The developer platform{" "}
                <span style={{ color: "var(--color-primary)" }}>
                  for the next decade.
                </span>
              </h1>

              <p
                class="mt-6 max-w-2xl text-base leading-relaxed sm:text-lg"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Backend and frontend, joined as one product. Hosting, database,
                auth, AI, real-time, and billing &mdash; every layer your app
                needs, type-safe end to end, built on the bleeding edge and
                ready the moment your team is.
              </p>

              <div class="mt-10 flex flex-col items-center gap-4 sm:flex-row">
                <A href="/register">
                  <Button variant="primary" size="lg">
                    Start building &#8594;
                  </Button>
                </A>
                <Show
                  when={auth.isAuthenticated()}
                  fallback={
                    <A href="/pricing">
                      <Button variant="outline" size="lg">
                        See pricing
                      </Button>
                    </A>
                  }
                >
                  <A href="/dashboard">
                    <Button variant="outline" size="lg">
                      Open dashboard
                    </Button>
                  </A>
                </Show>
              </div>

              <div class="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                <For
                  each={[
                    "SolidJS",
                    "Bun",
                    "Hono",
                    "tRPC",
                    "Cloudflare Workers",
                    "Turso",
                    "WebGPU",
                  ]}
                >
                  {(tech) => (
                    <span
                      class="text-xs font-medium uppercase tracking-widest transition-colors duration-200"
                      style={{ color: "var(--color-text-faint)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--color-text-secondary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--color-text-faint)";
                      }}
                    >
                      {tech}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats strip ───────────────────────────────────────── */}
        <section style={{ "border-top": "1px solid var(--color-border)", "border-bottom": "1px solid var(--color-border)" }}>
          <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="grid grid-cols-2 sm:grid-cols-4" style={{ "column-gap": "0" }}>
              <For each={stats}>
                {(stat, i) => (
                  <div
                    style={{
                      "border-right": i() < stats.length - 1 ? "1px solid var(--color-border)" : "none",
                    }}
                  >
                    <StatBlock value={stat.value} label={stat.label} />
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Platform layers ───────────────────────────────────── */}
        <section class="py-24 lg:py-32">
          <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="mb-16 flex flex-col items-center text-center">
              <span
                class="mb-4 text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-primary-text)" }}
              >
                Platform
              </span>
              <h2
                class="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: "var(--color-text)" }}
              >
                Every layer your app needs, in one product
              </h2>
              <p
                class="mt-4 max-w-xl text-base leading-relaxed"
                style={{ color: "var(--color-text-muted)" }}
              >
                Stop stitching together a dozen services. Crontech is one
                product with one dashboard and one bill.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <For each={features}>
                {(feature) => (
                  <FeatureCard
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                    href={feature.href}
                    badge={feature.badge}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────── */}
        <section
          class="py-24 lg:py-32"
          style={{
            "border-top": "1px solid var(--color-border)",
            "border-bottom": "1px solid var(--color-border)",
          }}
        >
          <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="mb-16 flex flex-col items-center text-center">
              <span
                class="mb-4 text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-primary-text)" }}
              >
                Onboarding
              </span>
              <h2
                class="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ color: "var(--color-text)" }}
              >
                Move your app to Crontech in three steps
              </h2>
              <p
                class="mt-4 max-w-xl text-base leading-relaxed"
                style={{ color: "var(--color-text-muted)" }}
              >
                No rebuild. No long migration. Bring the code you already have,
                layer Crontech underneath, ship.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-8">
              <For each={steps}>
                {(step) => (
                  <StepCard
                    number={step.number}
                    title={step.title}
                    description={step.description}
                    icon={step.icon}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Tech pillars ──────────────────────────────────────── */}
        <section class="py-32 lg:py-40">
          <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <For each={techPillars}>
                {(pillar) => (
                  <TechPillarCard
                    label={pillar.label}
                    title={pillar.title}
                    description={pillar.description}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ────────────────────────────────────────── */}
        <section
          class="py-24 lg:py-32"
          style={{ "border-top": "1px solid var(--color-border)" }}
        >
          <div class="mx-auto max-w-[800px] px-6 text-center lg:px-8">
            <h2
              class="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
              style={{ color: "var(--color-text)" }}
            >
              The developer platform{" "}
              <span style={{ color: "var(--color-primary)" }}>
                for the next decade.
              </span>
            </h2>
            <p
              class="mt-5 text-base leading-relaxed sm:text-lg"
              style={{ color: "var(--color-text-secondary)" }}
            >
              One product. Every layer. Built for teams who refuse to settle
              for yesterday&#39;s tools.
            </p>
            <div class="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <A href="/register">
                <Button variant="primary" size="lg">
                  Start building &#8594;
                </Button>
              </A>
              <A href="/dashboard">
                <Button variant="outline" size="lg">
                  Explore the platform
                </Button>
              </A>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
