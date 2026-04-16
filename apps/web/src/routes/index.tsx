import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button } from "@back-to-the-future/ui";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";

// ── Palette ─────────────────────────────────────────────────────────
// Restricted to three accent colors so the page reads as one brand,
// not as a rainbow. Everything else uses white/gray tiers.
//   - VIOLET  primary accent (brand, CTAs)
//   - CYAN    secondary accent (platform/technical pillars)
//   - EMERALD positive/live signals (status dots, "built-in" badges)
const ACCENT = {
  violet: "#8b5cf6",
  cyan: "#06b6d4",
  emerald: "#10b981",
} as const;

// ── Data ────────────────────────────────────────────────────────────

interface Feature {
  icon: string;
  title: string;
  description: string;
  href: string;
  accent: string;
  badge?: string | undefined;
}

// Feature cards showcase PLATFORM LAYERS, not end-user products.
// Per docs/POSITIONING.md: Crontech is a developer platform, not an
// AI website builder for non-developers.
const features: Feature[] = [
  {
    icon: "\u26A1",
    title: "Edge Compute",
    description:
      "Cloudflare Workers at the edge. Sub-5ms cold starts across 330+ cities. No containers, no regions, no capacity planning. Your code lives next to your users.",
    href: "/deployments",
    accent: ACCENT.violet,
    badge: "Core",
  },
  {
    icon: "\u{1F5C4}\uFE0F",
    title: "Unified Data",
    description:
      "Turso SQLite replicas at the edge for zero-latency reads. Neon Postgres when you need the full engine. Qdrant for vector search. All type-safe through Drizzle.",
    href: "/database",
    accent: ACCENT.cyan,
  },
  {
    icon: "\u{1F517}",
    title: "Type-Safe APIs",
    description:
      "tRPC v11 end to end. Change a server type, see the client error instantly. No OpenAPI specs, no codegen step, no drift between backend and frontend. Ever.",
    href: "/docs",
    accent: ACCENT.violet,
  },
  {
    icon: "\u{1F310}",
    title: "Real-Time Layer",
    description:
      "WebSockets, SSE, and Yjs CRDTs on every edge node. Multi-user editing with AI agents as first-class peers. Conflict-free by mathematics, not by lock.",
    href: "/collab",
    accent: ACCENT.cyan,
  },
  {
    icon: "\u{1F9E0}",
    title: "AI Runtime",
    description:
      "Three-tier compute routes inference where it is cheapest: client GPU (free), edge (sub-5ms), or cloud H100s on demand. Generative UI and streaming native to the platform.",
    href: "/ai-playground",
    accent: ACCENT.violet,
  },
  {
    icon: "\u{1F512}",
    title: "Auth + Admin",
    description:
      "Passkeys, OAuth, 2FA. Role-based access control. Audit logs, analytics, and user management. A full admin dashboard ships with the platform, not as a separate product.",
    href: "/admin",
    accent: ACCENT.emerald,
    badge: "Built-in",
  },
];

interface Step {
  number: string;
  title: string;
  description: string;
  accent: string;
  icon: string;
}

const steps: Step[] = [
  {
    number: "01",
    title: "Connect",
    description:
      "Point your domain at Crontech. Your app moves to the edge. DNS propagation is the longest step in the whole process.",
    accent: ACCENT.violet,
    icon: "\u{1F50C}",
  },
  {
    number: "02",
    title: "Compose",
    description:
      "Pick the layers you need — data, auth, AI, real-time, billing. One config line each, not one vendor contract each.",
    accent: ACCENT.cyan,
    icon: "\u{1F9F1}",
  },
  {
    number: "03",
    title: "Ship",
    description:
      "Git push deploys. Type-safe end to end. Every layer observable. Global in seconds, with no infrastructure to manage.",
    accent: ACCENT.emerald,
    icon: "\u{1F680}",
  },
];

interface Stat {
  value: string;
  label: string;
  color: string;
}

const stats: Stat[] = [
  { value: "\u003C 5ms", label: "Edge Cold Start", color: ACCENT.violet },
  { value: "330+", label: "Cities Worldwide", color: ACCENT.cyan },
  { value: "End-to-End", label: "Type Safety", color: ACCENT.violet },
  { value: "Built-In", label: "Auth, RBAC, Audit", color: ACCENT.emerald },
];

interface TechPillar {
  label: string;
  title: string;
  description: string;
  color: string;
  labelColor: string;
}

const techPillars: TechPillar[] = [
  {
    label: "One platform, every layer",
    title: "Replace your entire stack",
    description:
      "Hosting, database, authentication, AI, real-time collaboration, payments, email, and storage. One product. One dashboard. One bill.",
    color: ACCENT.violet,
    labelColor: "text-violet-400",
  },
  {
    label: "Built on the bleeding edge",
    title: "The fastest stack on the web",
    description:
      "Cloudflare Workers for sub-5ms cold starts. SolidJS for the fastest reactivity. Bun + Hono for the fastest runtime. Type-safe end to end.",
    color: ACCENT.cyan,
    labelColor: "text-cyan-400",
  },
  {
    label: "AI-native at every layer",
    title: "AI is the architecture, not an add-on",
    description:
      "AI agents, generative UI, three-tier compute routing, RAG pipelines, and real-time AI co-authoring. Native to the platform from the ground up.",
    color: ACCENT.emerald,
    labelColor: "text-emerald-400",
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
        class="relative h-full rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-8 transition-all duration-300 hover:border-white/[0.14] hover:bg-[#0d0d0d]"
      >
        {/* Glow confined to its own clipped layer so it can't affect text */}
        <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div
            class="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-[0.18]"
            style={{ background: props.accent }}
          />
        </div>

        <div class="relative z-10 flex h-full flex-col gap-5">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3.5">
              <div
                class="flex h-11 w-11 items-center justify-center rounded-lg text-lg"
                style={{
                  background: `${props.accent}14`,
                  color: props.accent,
                }}
              >
                {props.icon}
              </div>
              <span class="text-base font-semibold text-white">
                {props.title}
              </span>
            </div>
            <Show when={props.badge}>
              <span
                class="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: `${props.accent}1a`,
                  color: props.accent,
                }}
              >
                {props.badge}
              </span>
            </Show>
          </div>
          <p class="text-sm leading-[1.7] text-gray-400">
            {props.description}
          </p>
          <div
            class="mt-auto flex items-center gap-2 pt-3 text-xs font-medium transition-colors duration-200 group-hover:text-white"
            style={{ color: props.accent }}
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
    <div class="group relative flex flex-col items-center gap-5 text-center">
      <div class="relative">
        <div
          class="flex h-20 w-20 items-center justify-center rounded-2xl text-2xl transition-all duration-300 group-hover:scale-105"
          style={{
            background: `${props.accent}14`,
            border: `1px solid ${props.accent}33`,
          }}
        >
          <span style={{ color: props.accent }}>{props.icon}</span>
        </div>
        <div
          class="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white"
          style={{ background: props.accent }}
        >
          {props.number}
        </div>
      </div>
      <h3 class="text-xl font-bold text-white">{props.title}</h3>
      <p class="max-w-xs text-sm leading-relaxed text-gray-400">
        {props.description}
      </p>
    </div>
  );
}

// ── Stat Block ──────────────────────────────────────────────────────

function StatBlock(props: Stat): JSX.Element {
  return (
    <div class="flex flex-col items-center justify-center gap-3 bg-white/[0.02] px-6 py-10 transition-colors duration-300 hover:bg-white/[0.035] sm:py-12">
      <span
        class="text-3xl font-bold tracking-tight sm:text-4xl"
        style={{ color: props.color }}
      >
        {props.value}
      </span>
      <span class="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500">
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
    <div class="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-8 transition-all duration-300 hover:border-white/[0.14]">
      <div
        class="absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-[0.08] blur-3xl transition-opacity duration-500 group-hover:opacity-20"
        style={{ background: props.color }}
      />
      <div class="relative z-10">
        <span
          class={`mb-3 inline-block text-xs font-semibold uppercase tracking-widest ${props.labelColor}`}
        >
          {props.label}
        </span>
        <h3 class="mb-3 text-xl font-bold text-white">{props.title}</h3>
        <p class="text-sm leading-relaxed text-gray-400">{props.description}</p>
      </div>
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

      {/* overflow-x-hidden on the outer wrapper prevents any stray
          absolute element from creating horizontal scroll on narrow
          viewports (which was clipping cards on tablets). */}
      <div class="min-h-screen overflow-x-hidden bg-[#060606]">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section class="relative overflow-hidden">
          {/* Single restrained background orb — violet only, not a rainbow */}
          <div
            class="pointer-events-none absolute top-[-200px] left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-[0.08] blur-[120px]"
            style={{
              background: `linear-gradient(135deg, ${ACCENT.violet}, ${ACCENT.cyan})`,
            }}
          />

          {/* Subtle grid pattern — kept very low opacity */}
          <div
            class="pointer-events-none absolute inset-0 opacity-[0.015]"
            style={{
              "background-image":
                "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
              "background-size": "64px 64px",
            }}
          />

          <div class="relative z-10 mx-auto max-w-[1200px] px-6 pt-32 pb-28 lg:px-8 lg:pt-44 lg:pb-36">
            <div class="flex flex-col items-center text-center">
              {/* Announcement badge */}
              <div class="mb-10 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 backdrop-blur-sm">
                <div class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span class="text-xs font-medium text-gray-400">
                  Now in early access
                </span>
              </div>

              {/* Doctrine headline — per docs/POSITIONING.md */}
              <h1 class="max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[4rem]">
                The developer platform{" "}
                <span
                  class="bg-clip-text text-transparent"
                  style={{
                    "background-image": `linear-gradient(135deg, ${ACCENT.violet}, ${ACCENT.cyan})`,
                  }}
                >
                  for the next decade.
                </span>
              </h1>

              {/* Subhead — leads with backend+frontend unified, first-of-its-kind */}
              <p class="mt-6 max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg">
                Backend and frontend, joined as one product. Hosting, database,
                auth, AI, real-time, and billing &mdash; every layer your app
                needs, type-safe end to end, built on the bleeding edge and
                ready the moment your team is.
              </p>

              {/* CTAs */}
              <div class="mt-10 flex flex-col items-center gap-4 sm:flex-row">
                <A href="/register">
                  <Button variant="primary" size="lg">
                    Start building &#8594;
                  </Button>
                </A>
                <Show
                  when={auth.isAuthenticated()}
                  fallback={
                    <A href="/docs">
                      <Button variant="outline" size="lg">
                        See the docs
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

              {/* Tech stack strip — pill-shaped chips with subtle borders
                  and breathing room between labels (issue #5). Kept as
                  text; a later agent will swap in real logos. */}
              <div class="mt-20 flex flex-wrap items-center justify-center gap-2.5">
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
                    <span class="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-gray-500 transition-colors duration-200 hover:border-white/[0.12] hover:text-gray-300">
                      <span class="h-1 w-1 rounded-full bg-gray-600" />
                      {tech}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats strip ───────────────────────────────────────── */}
        <section class="border-y border-white/[0.04] bg-white/[0.015]">
          <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="grid grid-cols-2 divide-x divide-y divide-white/[0.06] sm:grid-cols-4 sm:divide-y-0">
              <For each={stats}>
                {(stat) => (
                  <StatBlock
                    value={stat.value}
                    label={stat.label}
                    color={stat.color}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Platform layers ───────────────────────────────────── */}
        <section class="relative overflow-hidden py-32 lg:py-40">
          <div
            class="pointer-events-none absolute left-[-200px] top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full opacity-[0.04] blur-[120px]"
            style={{ background: ACCENT.violet }}
          />

          <div class="relative z-10 mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="mb-20 flex flex-col items-center text-center">
              <EyebrowPill label="Platform" color={ACCENT.violet} />
              <h2 class="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Every layer your app needs, in one product
              </h2>
              <p class="mt-5 max-w-xl text-base leading-relaxed text-gray-500">
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
                    accent={feature.accent}
                    badge={feature.badge}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────── */}
        <section class="relative overflow-hidden border-y border-white/[0.04] py-32 lg:py-40">
          <div
            class="pointer-events-none absolute right-[-200px] top-1/3 h-[400px] w-[400px] rounded-full opacity-[0.04] blur-[100px]"
            style={{ background: ACCENT.cyan }}
          />

          <div class="relative z-10 mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="mb-20 flex flex-col items-center text-center">
              <EyebrowPill label="Onboarding" color={ACCENT.cyan} />
              <h2 class="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Move your app to Crontech in three steps
              </h2>
              <p class="mt-5 max-w-xl text-base leading-relaxed text-gray-500">
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
                    accent={step.accent}
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
                    color={pillar.color}
                    labelColor={pillar.labelColor}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ────────────────────────────────────────── */}
        <section class="relative overflow-hidden border-t border-white/[0.04] py-32 lg:py-40">
          <div
            class="pointer-events-none absolute bottom-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full opacity-[0.06] blur-[120px]"
            style={{
              background: `linear-gradient(135deg, ${ACCENT.violet}, ${ACCENT.cyan})`,
            }}
          />

          <div class="relative z-10 mx-auto max-w-[800px] px-6 text-center lg:px-8">
            <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              The developer platform{" "}
              <span
                class="bg-clip-text text-transparent"
                style={{
                  "background-image": `linear-gradient(135deg, ${ACCENT.violet}, ${ACCENT.cyan})`,
                }}
              >
                for the next decade.
              </span>
            </h2>
            <p class="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg">
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
