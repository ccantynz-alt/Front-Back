import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button } from "@back-to-the-future/ui";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";

// ── Data ──────────────────────────────────────────────────────────────

interface Feature {
  icon: string;
  title: string;
  description: string;
  href: string;
  gradient: string;
  badge?: string | undefined;
}

const features: Feature[] = [
  {
    icon: "\u26A1",
    title: "AI Website Builder",
    description:
      "Describe what you want in plain language. The AI composes validated component trees, wires data and auth, and ships a production site in minutes. Not templates \u2014 generation.",
    href: "/builder",
    gradient: "#8b5cf6",
    badge: "Core",
  },
  {
    icon: "\u{1F4AC}",
    title: "Claude Chat",
    description:
      "Direct Anthropic API access. Bring your own key. Your data stays yours. No subscriptions, no middlemen, no vendor lock-in. Full streaming with SSE.",
    href: "/chat",
    gradient: "#f97316",
  },
  {
    icon: "\u{1F4E6}",
    title: "Project Management",
    description:
      "Repositories, branches, deployments, CI/CD status, and issue tracking. Your entire dev workflow in one command center.",
    href: "/repos",
    gradient: "#06b6d4",
  },
  {
    icon: "\u{1F310}",
    title: "Real-Time Collaboration",
    description:
      "CRDT-powered multi-user editing with AI agents as first-class participants. Co-author with your team and AI simultaneously.",
    href: "/collab",
    gradient: "#10b981",
  },
  {
    icon: "\u{1F6E0}\uFE0F",
    title: "Admin Dashboard",
    description:
      "Analytics, user management, role-based access control, system health monitoring, and audit logs. Full operational visibility.",
    href: "/admin",
    gradient: "#f43f5e",
  },
  {
    icon: "\u{1F4D0}",
    title: "Templates",
    description:
      "Battle-tested blueprints for SaaS apps, landing pages, dashboards, and more. Clone, customize, and deploy in under five minutes.",
    href: "/templates",
    gradient: "#f59e0b",
  },
];

interface Step {
  number: string;
  title: string;
  description: string;
  gradient: string;
  icon: string;
}

const steps: Step[] = [
  {
    number: "01",
    title: "Describe",
    description:
      "Tell the AI what you want to build. A SaaS dashboard, a marketing site, an internal tool. Plain language. No boilerplate.",
    gradient: "#8b5cf6",
    icon: "\u{1F4DD}",
  },
  {
    number: "02",
    title: "Build",
    description:
      "The platform assembles your app from validated component trees, wires up the database, auth, and API layer automatically.",
    gradient: "#06b6d4",
    icon: "\u2699\uFE0F",
  },
  {
    number: "03",
    title: "Ship",
    description:
      "One click to production. Deployed to the edge across 330+ cities worldwide. Sub-5ms cold starts. Zero config.",
    gradient: "#10b981",
    icon: "\u{1F680}",
  },
];

interface Stat {
  value: string;
  label: string;
  color: string;
}

const stats: Stat[] = [
  { value: "24+", label: "API Endpoints", color: "#8b5cf6" },
  { value: "30+", label: "Database Tables", color: "#06b6d4" },
  { value: "Real-time", label: "SSE Updates", color: "#10b981" },
  { value: "RBAC", label: "Admin Built-in", color: "#f97316" },
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
    color: "#8b5cf6",
    labelColor: "text-violet-400",
  },
  {
    label: "Built on the bleeding edge",
    title: "The fastest stack on the web",
    description:
      "Cloudflare Workers for sub-5ms cold starts. SolidJS for the fastest reactivity. Bun + Hono for the fastest runtime. Type-safe end to end.",
    color: "#06b6d4",
    labelColor: "text-cyan-400",
  },
  {
    label: "AI-native at every layer",
    title: "AI is the architecture, not an add-on",
    description:
      "AI agents, generative UI, three-tier compute routing, RAG pipelines, and real-time AI co-authoring. Native to the platform from the ground up.",
    color: "#10b981",
    labelColor: "text-emerald-400",
  },
];

// ── Feature Card ─────────────────────────────────────────────────────

function FeatureCard(props: Feature): JSX.Element {
  return (
    <A href={props.href} class="block group">
      <div
        class="relative overflow-hidden rounded-2xl border border-white/[0.06] p-6 transition-all duration-300 hover:border-white/[0.12] hover:shadow-xl hover:shadow-black/30 h-full"
        style={{
          background:
            "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)",
        }}
      >
        {/* Glow accent */}
        <div
          class="absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-10 blur-3xl transition-opacity duration-500 group-hover:opacity-30"
          style={{ background: props.gradient }}
        />

        {/* Hover gradient overlay */}
        <div
          class="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `linear-gradient(135deg, ${props.gradient}08, transparent 70%)`,
          }}
        />

        <div class="relative z-10 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div
                class="flex h-11 w-11 items-center justify-center rounded-xl text-lg"
                style={{
                  background: `linear-gradient(135deg, ${props.gradient}22, ${props.gradient}44)`,
                  color: props.gradient,
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
                class="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: `${props.gradient}20`,
                  color: props.gradient,
                }}
              >
                {props.badge}
              </span>
            </Show>
          </div>
          <p class="text-sm leading-relaxed text-gray-400">
            {props.description}
          </p>
          <div class="flex items-center gap-1.5 text-xs font-medium transition-colors duration-200 group-hover:text-white" style={{ color: props.gradient }}>
            <span>Explore</span>
            <span class="transition-transform duration-200 group-hover:translate-x-1">&#8594;</span>
          </div>
        </div>

        {/* Bottom shimmer line */}
        <div
          class="absolute bottom-0 left-0 h-[2px] w-full opacity-40 transition-opacity duration-300 group-hover:opacity-70"
          style={{
            background: `linear-gradient(90deg, transparent, ${props.gradient}, transparent)`,
          }}
        />
      </div>
    </A>
  );
}

// ── Step Card ─────────────────────────────────────────────────────────

function StepCard(props: Step): JSX.Element {
  return (
    <div class="group relative flex flex-col items-center gap-5 text-center">
      {/* Number + icon */}
      <div class="relative">
        <div
          class="flex h-20 w-20 items-center justify-center rounded-2xl text-2xl transition-all duration-300 group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${props.gradient}15, ${props.gradient}30)`,
            border: `1px solid ${props.gradient}30`,
          }}
        >
          <span style={{ color: props.gradient }}>{props.icon}</span>
        </div>
        <div
          class="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold"
          style={{
            background: `linear-gradient(135deg, ${props.gradient}, ${props.gradient}cc)`,
            color: "#fff",
          }}
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

// ── Stat Block ────────────────────────────────────────────────────────

function StatBlock(props: Stat): JSX.Element {
  return (
    <div class="flex flex-col items-center gap-1 px-6 py-5">
      <span
        class="text-2xl font-bold tracking-tight sm:text-3xl"
        style={{ color: props.color }}
      >
        {props.value}
      </span>
      <span class="text-[11px] font-medium uppercase tracking-widest text-gray-500">
        {props.label}
      </span>
    </div>
  );
}

// ── Tech Pillar Card ─────────────────────────────────────────────────

function TechPillarCard(props: TechPillar): JSX.Element {
  return (
    <div
      class="group relative overflow-hidden rounded-2xl border border-white/[0.06] p-8 transition-all duration-300 hover:border-white/[0.12]"
      style={{
        background:
          "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)",
      }}
    >
      <div
        class="absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-10 blur-3xl transition-opacity duration-500 group-hover:opacity-25"
        style={{ background: props.color }}
      />
      <div class="relative z-10">
        <span class={`mb-3 inline-block text-xs font-semibold uppercase tracking-widest ${props.labelColor}`}>
          {props.label}
        </span>
        <h3 class="mb-3 text-xl font-bold text-white">
          {props.title}
        </h3>
        <p class="text-sm leading-relaxed text-gray-400">
          {props.description}
        </p>
      </div>
      <div
        class="absolute bottom-0 left-0 h-[2px] w-full opacity-40"
        style={{
          background: `linear-gradient(90deg, transparent, ${props.color}, transparent)`,
        }}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function Home(): JSX.Element {
  const auth = useAuth();

  return (
    <>
      <SEOHead
        title="Crontech \u2014 The developer platform for the next decade"
        description="One unified platform. Hosting, database, auth, AI, real-time collaboration, billing, and more. Built on the bleeding edge. Ship products with AI in minutes."
        path="/"
      />

      <div class="min-h-screen bg-[#060606]">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section class="relative overflow-hidden">
          {/* Background gradient orbs */}
          <div
            class="absolute top-[-200px] left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full opacity-[0.07] blur-[120px]"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #06b6d4)" }}
          />
          <div
            class="absolute top-[100px] right-[-200px] h-[400px] w-[400px] rounded-full opacity-[0.05] blur-[100px]"
            style={{ background: "#10b981" }}
          />
          <div
            class="absolute bottom-[-100px] left-[-150px] h-[350px] w-[350px] rounded-full opacity-[0.04] blur-[100px]"
            style={{ background: "#f97316" }}
          />

          {/* Grid pattern overlay */}
          <div
            class="absolute inset-0 opacity-[0.02]"
            style={{
              "background-image":
                "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
              "background-size": "64px 64px",
            }}
          />

          <div class="relative z-10 mx-auto max-w-[1200px] px-6 pt-24 pb-20 lg:px-8 lg:pt-36 lg:pb-28">
            <div class="flex flex-col items-center text-center">
              {/* Announcement badge */}
              <div class="mb-8 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 backdrop-blur-sm">
                <div class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span class="text-xs font-medium text-gray-400">
                  Now in early access
                </span>
              </div>

              {/* Headline */}
              <h1 class="max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4.5rem]">
                Build products with AI.{" "}
                <br class="hidden sm:block" />
                <span
                  class="bg-clip-text text-transparent"
                  style={{
                    "background-image":
                      "linear-gradient(135deg, #8b5cf6, #06b6d4, #10b981)",
                  }}
                >
                  Ship them in minutes.
                </span>
              </h1>

              {/* Subheadline */}
              <p class="mt-6 max-w-2xl text-lg leading-relaxed text-gray-400 sm:text-xl">
                One unified platform with hosting, database, auth, AI, real-time
                collaboration, payments, and storage. Built on the bleeding edge
                and ready to ship.
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

              {/* Tech stack strip */}
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
                    <span class="text-xs font-medium uppercase tracking-widest text-gray-600 transition-colors duration-200 hover:text-gray-400">
                      {tech}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats strip ───────────────────────────────────────────── */}
        <section class="border-y border-white/[0.04]">
          <div class="mx-auto max-w-[1200px] px-6 lg:px-8">
            <div class="grid grid-cols-2 divide-x divide-white/[0.06] sm:grid-cols-4">
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

        {/* ── Feature pillars ───────────────────────────────────────── */}
        <section class="relative overflow-hidden py-24 lg:py-32">
          {/* Background glow */}
          <div
            class="absolute left-[-200px] top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full opacity-[0.04] blur-[120px]"
            style={{ background: "#8b5cf6" }}
          />

          <div class="relative z-10 mx-auto max-w-[1200px] px-6 lg:px-8">
            {/* Section header */}
            <div class="mb-16 flex flex-col items-center text-center">
              <span class="mb-4 text-xs font-semibold uppercase tracking-widest text-violet-400">
                Platform
              </span>
              <h2 class="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
                One platform, every layer your app needs
              </h2>
              <p class="mt-4 max-w-xl text-base leading-relaxed text-gray-500">
                Stop stitching together a dozen services. Crontech is one
                product with one dashboard and one bill.
              </p>
            </div>

            {/* Feature grid */}
            <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <For each={features}>
                {(feature) => (
                  <FeatureCard
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                    href={feature.href}
                    gradient={feature.gradient}
                    badge={feature.badge}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────── */}
        <section class="relative border-y border-white/[0.04] py-24 lg:py-32">
          {/* Background glow */}
          <div
            class="absolute right-[-200px] top-1/3 h-[400px] w-[400px] rounded-full opacity-[0.04] blur-[100px]"
            style={{ background: "#06b6d4" }}
          />

          <div class="relative z-10 mx-auto max-w-[1200px] px-6 lg:px-8">
            {/* Section header */}
            <div class="mb-16 flex flex-col items-center text-center">
              <span class="mb-4 text-xs font-semibold uppercase tracking-widest text-cyan-400">
                Workflow
              </span>
              <h2 class="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
                From idea to production in three steps
              </h2>
              <p class="mt-4 max-w-xl text-base leading-relaxed text-gray-500">
                No boilerplate. No config files. No infrastructure to manage.
                Just describe, build, ship.
              </p>
            </div>

            {/* Steps */}
            <div class="grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-8">
              <For each={steps}>
                {(step) => (
                  <StepCard
                    number={step.number}
                    title={step.title}
                    description={step.description}
                    gradient={step.gradient}
                    icon={step.icon}
                  />
                )}
              </For>
            </div>

            {/* Connector lines (desktop only) */}
            <div
              class="mt-[-180px] mb-0 hidden items-center justify-center gap-0 pointer-events-none sm:flex"
              aria-hidden="true"
            >
              <div class="h-px w-[28%] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
              <div class="h-px w-[28%] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
            </div>
          </div>
        </section>

        {/* ── Tech pillars ──────────────────────────────────────────── */}
        <section class="py-24 lg:py-32">
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

        {/* ── Bottom CTA ────────────────────────────────────────────── */}
        <section class="relative border-t border-white/[0.04] py-24 lg:py-32">
          {/* Background gradient */}
          <div
            class="absolute bottom-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full opacity-[0.06] blur-[120px]"
            style={{ background: "linear-gradient(135deg, #8b5cf6, #06b6d4)" }}
          />

          <div class="relative z-10 mx-auto max-w-[800px] px-6 text-center lg:px-8">
            <h2 class="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              The developer platform{" "}
              <span
                class="bg-clip-text text-transparent"
                style={{
                  "background-image":
                    "linear-gradient(135deg, #8b5cf6, #06b6d4)",
                }}
              >
                for the next decade.
              </span>
            </h2>
            <p class="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg">
              Sub-5ms cold starts at the edge. Type-safe end to end. AI-native
              at every layer. Built for builders who refuse to settle for
              yesterday&#39;s tools.
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
