import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button } from "@back-to-the-future/ui";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";
import { Icon, type IconName } from "../components/Icon";
import { ProductShowcase } from "../components/ProductShowcase";

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
      "Deploy to the edge with sub-5ms cold starts. No containers, no regions, no capacity planning. Your code runs close to your users.",
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
      "Sub-5ms cold starts at the edge. SolidJS for the fastest reactivity. Bun + Hono for the fastest runtime. Type-safe end to end.",
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
              class="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))",
                color: "#6366f1",
                border: "1px solid rgba(99,102,241,0.2)",
              }}
            >
              <Icon name={props.icon} size={20} />
            </div>
            <Show when={props.badge}>
              <span
                class="shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: "rgba(99,102,241,0.12)",
                  color: "#6366f1",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}
              >
                {props.badge}
              </span>
            </Show>
          </div>

          <div class="flex flex-col gap-2.5">
            <h3
              class="text-[1.0625rem] font-semibold tracking-tight"
              style={{ color: "#0f172a" }}
            >
              {props.title}
            </h3>
            <p
              class="text-[0.875rem] leading-[1.75]"
              style={{ color: "#64748b" }}
            >
              {props.description}
            </p>
          </div>

          <div
            class="mt-auto flex items-center gap-1.5 pt-3 text-sm font-medium transition-colors duration-200 group-hover:opacity-80"
            style={{ color: "#6366f1" }}
          >
            <span>Learn more</span>
            <span class="transition-transform duration-200 group-hover:translate-x-1.5">{"\u2192"}</span>
          </div>
        </div>
      </div>
    </A>
  );
}

// ── Step Card ───────────────────────────────────────────────────────

function StepCard(props: Step & { isLast: boolean }): JSX.Element {
  return (
    <div class="relative flex flex-col items-center gap-6 text-center">
      <div class="relative">
        <div
          class="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            "box-shadow": "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {props.icon}
        </div>
        <div
          class="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold"
          style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "#fff",
            "box-shadow": "0 2px 6px rgba(99,102,241,0.4)",
          }}
        >
          {props.number}
        </div>
      </div>

      <h3
        class="text-lg font-semibold tracking-tight"
        style={{ color: "#0f172a" }}
      >
        {props.title}
      </h3>
      <p
        class="max-w-[280px] text-[0.875rem] leading-[1.75]"
        style={{ color: "#64748b" }}
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
    <div class="landing-stat-block">
      <span class="landing-stat-value">{props.value}</span>
      <span class="landing-stat-label">{props.label}</span>
    </div>
  );
}

// ── Tech Pillar Card ────────────────────────────────────────────────

function TechPillarCard(props: TechPillar): JSX.Element {
  return (
    <div class="landing-card relative overflow-hidden p-8">
      <div
        class="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)",
        }}
      />
      <span
        class="mb-5 inline-block text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "#6366f1" }}
      >
        {props.label}
      </span>
      <h3
        class="mb-3 text-xl font-bold tracking-tight"
        style={{ color: "#0f172a" }}
      >
        {props.title}
      </h3>
      <p
        class="text-[0.875rem] leading-[1.75]"
        style={{ color: "#64748b" }}
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
          <div class="relative z-10 mx-auto max-w-[1120px] px-6 pt-40 pb-44 lg:px-8 lg:pt-52 lg:pb-56">
            <div class="flex flex-col items-center text-center">
              {/* Announcement badge */}
              <div class="landing-hero-badge mb-10">
                <span class="landing-hero-badge-dot" aria-hidden="true" />
                <span class="landing-hero-badge-text">Now in early access</span>
              </div>

              {/* Headline */}
              <h1
                class="max-w-4xl text-[2.75rem] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[3.5rem] lg:text-[4.25rem]"
                style={{ color: "#0f172a" }}
              >
                The developer platform{" "}
                <span class="landing-gradient-text">
                  for the next decade.
                </span>
              </h1>

              {/* Subheading */}
              <p
                class="mt-7 max-w-2xl text-[1.0625rem] leading-[1.8] sm:text-lg"
                style={{ color: "#475569" }}
              >
                Backend and frontend, joined as one product. Hosting, database,
                auth, AI, real-time, and billing &mdash; every layer your app
                needs, type-safe end to end, built on the bleeding edge and
                ready the moment your team is.
              </p>

              {/* CTAs */}
              <div class="mt-14 flex flex-col items-center gap-5 sm:flex-row">
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
              <div class="landing-tech-strip-wrap mt-28">
                <div class="landing-tech-strip-divider" aria-hidden="true" />
                <div class="landing-tech-strip">
                  <For
                    each={[
                      "SolidJS",
                      "Bun",
                      "Hono",
                      "tRPC",
                      "Edge Compute",
                      "Turso",
                      "WebGPU",
                    ]}
                  >
                    {(tech) => (
                      <span class="landing-tech-strip-item">{tech}</span>
                    )}
                  </For>
                </div>
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
                      "border-right": i() < stats.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
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
        <section class="landing-dark-section py-40 lg:py-52">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-20 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#818cf8" }}
                />
                Platform
              </div>
              <h2
                class="max-w-2xl text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem]"
                style={{ color: "#0f172a" }}
              >
                Every layer your app needs, in one product
              </h2>
              <p
                class="mt-5 max-w-xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "#64748b" }}
              >
                Stop stitching together a dozen services. Crontech is one
                product with one dashboard and one bill.
              </p>
            </div>

            <div class="landing-feature-grid grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* ── Product Ecosystem ─────────────────────────────────── */}
        <ProductShowcase />

        {/* ── How it works ──────────────────────────────────────── */}
        <section class="landing-dark-section-alt py-40 lg:py-52">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-20 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#818cf8" }}
                />
                Onboarding
              </div>
              <h2
                class="max-w-2xl text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem]"
                style={{ color: "#0f172a" }}
              >
                Move your app to Crontech in three steps
              </h2>
              <p
                class="mt-5 max-w-xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "#64748b" }}
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
        <section class="landing-dark-section py-40 lg:py-52">
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
          <div class="relative z-10 mx-auto max-w-[800px] px-6 py-40 text-center lg:px-8 lg:py-52">
            <h2
              class="text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem] lg:text-[2.75rem]"
              style={{ color: "#0f172a" }}
            >
              The developer platform{" "}
              <span class="landing-gradient-text">
                for the next decade.
              </span>
            </h2>
            <p
              class="mt-6 text-[1.0625rem] leading-[1.7] sm:text-lg"
              style={{ color: "#64748b" }}
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
