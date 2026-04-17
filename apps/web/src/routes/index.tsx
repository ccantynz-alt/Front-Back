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
    <A href={props.href} class="block group" style={{ "text-decoration": "none" }}>
      <div class="landing-card h-full p-7">
        <div class="flex h-full flex-col gap-5">
          <div class="flex items-start justify-between gap-3">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{
                background: "linear-gradient(135deg, #eef2ff, #e8e0ff)",
                color: "#4f46e5",
              }}
            >
              <Icon name={props.icon} size={22} />
            </div>
            <Show when={props.badge}>
              <span
                class="shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: "#eef2ff",
                  color: "#4f46e5",
                }}
              >
                {props.badge}
              </span>
            </Show>
          </div>

          <div class="flex flex-col gap-2">
            <h3
              class="text-[1.0625rem] font-semibold tracking-tight"
              style={{ color: "var(--color-text)" }}
            >
              {props.title}
            </h3>
            <p
              class="text-[0.9rem] leading-[1.7]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {props.description}
            </p>
          </div>

          <div
            class="mt-auto flex items-center gap-1.5 pt-3 text-sm font-medium"
            style={{ color: "#4f46e5" }}
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

function StepCard(props: Step & { isLast: boolean }): JSX.Element {
  return (
    <div class="relative flex flex-col items-center gap-5 text-center">
      <div class="relative">
        <div
          class="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            "box-shadow": "0 4px 12px rgba(0,0,0,0.06)",
          }}
        >
          {props.icon}
        </div>
        <div
          class="absolute -top-2.5 -right-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold"
          style={{
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            color: "#fff",
            "box-shadow": "0 2px 8px rgba(79,70,229,0.4)",
          }}
        >
          {props.number}
        </div>
      </div>

      <h3
        class="text-lg font-semibold tracking-tight"
        style={{ color: "var(--color-text)" }}
      >
        {props.title}
      </h3>
      <p
        class="max-w-[280px] text-[0.9rem] leading-[1.7]"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {props.description}
      </p>

      <Show when={!props.isLast}>
        <div class="landing-step-connector" />
      </Show>
    </div>
  );
}

// ── Stat Block ──────────────────────────────────────────────────────

function StatBlock(props: Stat): JSX.Element {
  return (
    <div class="flex flex-col items-center justify-center gap-2 px-6 py-10 sm:py-12">
      <span
        class="text-2xl font-extrabold tracking-tight sm:text-3xl"
        style={{ color: "#fff" }}
      >
        {props.value}
      </span>
      <span
        class="text-[11px] font-medium uppercase tracking-[0.16em]"
        style={{ color: "rgba(255,255,255,0.5)" }}
      >
        {props.label}
      </span>
    </div>
  );
}

// ── Tech Pillar Card ────────────────────────────────────────────────

function TechPillarCard(props: TechPillar): JSX.Element {
  return (
    <div class="landing-card relative overflow-hidden p-8">
      <div
        class="absolute top-0 left-0 right-0 h-[3px]"
        style={{
          background: "linear-gradient(90deg, #4f46e5, #7c3aed, #a78bfa)",
        }}
      />
      <span
        class="mb-4 inline-block text-xs font-semibold uppercase tracking-[0.14em]"
        style={{ color: "#4f46e5" }}
      >
        {props.label}
      </span>
      <h3
        class="mb-3 text-xl font-bold tracking-tight"
        style={{ color: "var(--color-text)" }}
      >
        {props.title}
      </h3>
      <p
        class="text-[0.9rem] leading-[1.7]"
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

      <div>
        {/* ── Hero (dark) ──────────────────────────────────────── */}
        <section class="landing-hero">
          <div class="relative z-10 mx-auto max-w-[1120px] px-6 pt-28 pb-24 lg:px-8 lg:pt-44 lg:pb-36">
            <div class="flex flex-col items-center text-center">
              {/* Announcement badge */}
              <div
                class="mb-10 inline-flex items-center gap-2.5 rounded-full px-4 py-2"
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  "backdrop-filter": "blur(8px)",
                }}
              >
                <div
                  class="h-2 w-2 rounded-full animate-pulse"
                  style={{ background: "#34d399" }}
                />
                <span
                  class="text-[0.8125rem] font-medium"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  Now in early access
                </span>
              </div>

              {/* Headline */}
              <h1
                class="max-w-4xl text-[2.75rem] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[3.5rem] lg:text-[4.25rem]"
                style={{ color: "#fff" }}
              >
                The developer platform{" "}
                <span class="landing-gradient-text">
                  for the next decade.
                </span>
              </h1>

              {/* Subheading */}
              <p
                class="mt-7 max-w-2xl text-[1.0625rem] leading-[1.75] sm:text-lg"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                Backend and frontend, joined as one product. Hosting, database,
                auth, AI, real-time, and billing &mdash; every layer your app
                needs, type-safe end to end, built on the bleeding edge and
                ready the moment your team is.
              </p>

              {/* CTAs */}
              <div class="mt-12 flex flex-col items-center gap-4 sm:flex-row">
                <A href="/register">
                  <button class="landing-hero-btn-primary" type="button">
                    Start building &#8594;
                  </button>
                </A>
                <Show
                  when={auth.isAuthenticated()}
                  fallback={
                    <A href="/pricing">
                      <button class="landing-hero-btn-outline" type="button">
                        See pricing
                      </button>
                    </A>
                  }
                >
                  <A href="/dashboard">
                    <button class="landing-hero-btn-outline" type="button">
                      Open dashboard
                    </button>
                  </A>
                </Show>
              </div>

              {/* Tech stack strip */}
              <div class="mt-20 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
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
                      class="text-[0.6875rem] font-medium uppercase tracking-[0.18em] transition-colors duration-200"
                      style={{ color: "rgba(255,255,255,0.3)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "rgba(255,255,255,0.3)";
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

        {/* ── Stats strip (dark-to-light transition) ────────────── */}
        <section class="landing-stats-section">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="grid grid-cols-2 sm:grid-cols-4">
              <For each={stats}>
                {(stat, i) => (
                  <div
                    style={{
                      "border-right": i() < stats.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
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
        <section class="py-28 lg:py-36" style={{ background: "var(--color-bg)" }}>
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-16 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#4f46e5" }}
                />
                Platform
              </div>
              <h2
                class="max-w-2xl text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem]"
                style={{ color: "var(--color-text)" }}
              >
                Every layer your app needs, in one product
              </h2>
              <p
                class="mt-5 max-w-xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Stop stitching together a dozen services. Crontech is one
                product with one dashboard and one bill.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
          class="py-28 lg:py-36"
          style={{
            background: "var(--color-bg-subtle)",
            "border-top": "1px solid var(--color-border)",
            "border-bottom": "1px solid var(--color-border)",
          }}
        >
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-16 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#4f46e5" }}
                />
                Onboarding
              </div>
              <h2
                class="max-w-2xl text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem]"
                style={{ color: "var(--color-text)" }}
              >
                Move your app to Crontech in three steps
              </h2>
              <p
                class="mt-5 max-w-xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "var(--color-text-muted)" }}
              >
                No rebuild. No long migration. Bring the code you already have,
                layer Crontech underneath, ship.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-14 sm:grid-cols-3 sm:gap-8">
              <For each={steps}>
                {(step, i) => (
                  <StepCard
                    number={step.number}
                    title={step.title}
                    description={step.description}
                    icon={step.icon}
                    isLast={i() === steps.length - 1}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Tech pillars ──────────────────────────────────────── */}
        <section class="py-28 lg:py-36" style={{ background: "var(--color-bg)" }}>
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
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

        {/* ── Bottom CTA (dark) ─────────────────────────────────── */}
        <section class="landing-cta-section">
          <div class="relative z-10 mx-auto max-w-[800px] px-6 py-28 text-center lg:px-8 lg:py-36">
            <h2
              class="text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem] lg:text-[2.75rem]"
              style={{ color: "#fff" }}
            >
              The developer platform{" "}
              <span class="landing-gradient-text">
                for the next decade.
              </span>
            </h2>
            <p
              class="mt-6 text-[1.0625rem] leading-[1.7] sm:text-lg"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              One product. Every layer. Built for teams who refuse to settle
              for yesterday&#39;s tools.
            </p>
            <div class="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <A href="/register">
                <button class="landing-hero-btn-primary" type="button">
                  Start building &#8594;
                </button>
              </A>
              <A href="/dashboard">
                <button class="landing-hero-btn-outline" type="button">
                  Explore the platform
                </button>
              </A>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
