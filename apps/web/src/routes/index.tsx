import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";
import { Icon, type IconName } from "../components/Icon";

// ── Data ────────────────────────────────────────────────────────────

interface Pillar {
  icon: IconName;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
}

const pillars: Pillar[] = [
  {
    icon: "layers",
    eyebrow: "One platform",
    title: "One platform, every layer",
    description:
      "Hosting, database, authentication, AI, real-time collaboration, payments, email, storage — in one product with one dashboard and one bill. Stop stitching a dozen vendors together to run a modern app.",
    points: [
      "Edge hosting, SQL, and object storage — unified",
      "Auth, billing, email, and SMS — wired in",
      "One API, one schema, one ops surface",
    ],
  },
  {
    icon: "zap",
    eyebrow: "Bleeding edge",
    title: "Built on the bleeding edge",
    description:
      "Cloudflare Workers for sub-5ms cold starts at the edge. SolidJS for the fastest reactivity on the web. Bun + Hono for the fastest JavaScript runtime. Type-safe end to end from database to UI.",
    points: [
      "Sub-5ms cold starts in 330+ cities",
      "SolidJS signals — no virtual DOM overhead",
      "Bun runtime, Hono router, Drizzle ORM",
    ],
  },
  {
    icon: "sparkles",
    eyebrow: "AI-native",
    title: "AI-native at every layer",
    description:
      "Not bolted on. AI agents, generative UI, three-tier compute routing (client → edge → cloud), RAG pipelines, and real-time collaboration — all native to the platform. Your app is AI-native the day you start.",
    points: [
      "Client GPU + edge + cloud compute — one mesh",
      "Generative UI from a typed component catalog",
      "RAG, vector search, and streaming agents built in",
    ],
  },
];

interface Capability {
  icon: IconName;
  title: string;
  description: string;
}

const capabilities: Capability[] = [
  {
    icon: "server",
    title: "Hosting",
    description:
      "Global edge deploys on Cloudflare Workers. Push to git and ship to 330+ cities in seconds. Preview branches, instant rollbacks, zero-config.",
  },
  {
    icon: "database",
    title: "Database",
    description:
      "Edge SQL via embedded Turso replicas for zero-latency reads. Serverless Postgres on demand. Vector search and full-text built in.",
  },
  {
    icon: "lock",
    title: "Authentication",
    description:
      "Passkeys first — the 98% login-success future of auth. OAuth, email, and SSO wired in. Sessions, RBAC, and audit logs you don't have to build.",
  },
  {
    icon: "sparkles",
    title: "AI",
    description:
      "Streaming LLM calls, multi-agent workflows, RAG pipelines, and client-GPU inference for free tokens. One SDK for every tier of compute.",
  },
  {
    icon: "users",
    title: "Real-time collab",
    description:
      "CRDT-backed multi-user editing, presence, cursors — with AI agents as first-class participants. Sub-50ms globally.",
  },
  {
    icon: "credit-card",
    title: "Billing",
    description:
      "Stripe-powered subscriptions, metered usage, proration, and invoices — fully integrated. One line to charge. Zero integration tax.",
  },
  {
    icon: "mail",
    title: "Email & SMS",
    description:
      "Transactional and marketing email, SMS, push — same pipeline, same logs, same observability. One outbox for every channel.",
  },
  {
    icon: "video",
    title: "Video",
    description:
      "WebGPU-accelerated video processing, streaming, and real-time AI transforms. The fastest video pipeline a browser has ever seen.",
  },
];

interface SpeedSignal {
  value: string;
  label: string;
}

const speedSignals: SpeedSignal[] = [
  { value: "< 5ms", label: "Edge cold start" },
  { value: "330+", label: "Cities at the edge" },
  { value: "Type-safe", label: "End to end" },
  { value: "AI-native", label: "Every layer" },
];

// ── Pillar Card ─────────────────────────────────────────────────────

function PillarCard(props: Pillar): JSX.Element {
  return (
    <div class="landing-card h-full p-8">
      <div class="flex h-full flex-col gap-6">
        <div class="flex items-center gap-3">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12))",
              color: "#6366f1",
              border: "1px solid rgba(99,102,241,0.2)",
            }}
          >
            <Icon name={props.icon} size={22} />
          </div>
          <span
            class="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "#6366f1" }}
          >
            {props.eyebrow}
          </span>
        </div>

        <div class="flex flex-col gap-3">
          <h3
            class="text-[1.25rem] font-bold tracking-tight"
            style={{ color: "#0f172a" }}
          >
            {props.title}
          </h3>
          <p
            class="text-[0.9375rem] leading-[1.7]"
            style={{ color: "#475569" }}
          >
            {props.description}
          </p>
        </div>

        <ul class="mt-auto flex flex-col gap-2.5 pt-2">
          <For each={props.points}>
            {(point) => (
              <li
                class="flex items-start gap-2.5 text-[0.875rem] leading-[1.6]"
                style={{ color: "#334155" }}
              >
                <span
                  class="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  }}
                  aria-hidden="true"
                />
                <span>{point}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  );
}

// ── Capability Card ─────────────────────────────────────────────────

function CapabilityCard(props: Capability): JSX.Element {
  return (
    <div class="landing-card h-full p-6">
      <div class="flex h-full flex-col gap-4">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))",
            color: "#6366f1",
            border: "1px solid rgba(99,102,241,0.18)",
          }}
        >
          <Icon name={props.icon} size={18} />
        </div>
        <div class="flex flex-col gap-2">
          <h3
            class="text-[1rem] font-semibold tracking-tight"
            style={{ color: "#0f172a" }}
          >
            {props.title}
          </h3>
          <p
            class="text-[0.875rem] leading-[1.65]"
            style={{ color: "#64748b" }}
          >
            {props.description}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Speed Signal Block ──────────────────────────────────────────────

function SpeedSignalBlock(props: SpeedSignal): JSX.Element {
  return (
    <div class="landing-stat-block">
      <span class="landing-stat-value">{props.value}</span>
      <span class="landing-stat-label">{props.label}</span>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function Home(): JSX.Element {
  const auth = useAuth();

  return (
    <>
      <SEOHead
        title={"Crontech — The developer platform for the next decade"}
        description="One unified product. Every layer your application needs — hosting, database, auth, AI, real-time, billing, video — built on the bleeding edge and ready to ship."
        path="/"
      />

      <div>
        {/* ── Hero (dark, aggressive) ────────────────────────────── */}
        <section class="landing-hero">
          <div class="relative z-10 mx-auto max-w-[1120px] px-6 pt-32 pb-36 lg:px-8 lg:pt-44 lg:pb-48">
            <div class="flex flex-col items-center text-center">
              {/* Announcement badge */}
              <div class="landing-hero-badge mb-10">
                <span class="landing-hero-badge-dot" aria-hidden="true" />
                <span class="landing-hero-badge-text">
                  The unified developer platform &mdash; now in early access
                </span>
              </div>

              {/* Headline — locked in POSITIONING.md */}
              <h1
                class="max-w-5xl text-[2.75rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[3.75rem] lg:text-[4.75rem]"
                style={{ color: "#f8fafc" }}
              >
                The developer platform for the{" "}
                <span class="landing-gradient-text">next decade.</span>
              </h1>

              {/* Subheadline — locked in POSITIONING.md */}
              <p
                class="mt-8 max-w-3xl text-[1.125rem] leading-[1.7] sm:text-[1.1875rem] lg:text-xl"
                style={{ color: "rgba(248,250,252,0.78)" }}
              >
                One unified product. Every layer your application needs &mdash;{" "}
                hosting, database, auth, AI, real-time, billing, video &mdash;{" "}
                built on the bleeding edge and ready to ship.
              </p>

              {/* Body paragraph */}
              <p
                class="mt-6 max-w-2xl text-[0.9375rem] leading-[1.75] sm:text-base"
                style={{ color: "rgba(203,213,225,0.72)" }}
              >
                Crontech runs on the fastest stack on the web. Sub-5ms cold
                starts at the edge. Type-safe end to end. AI-native at every
                layer. Built for builders who refuse to settle for
                yesterday&apos;s tools.
              </p>

              {/* CTAs — locked in POSITIONING.md */}
              <div class="mt-12 flex flex-col items-center gap-4 sm:flex-row">
                <A href="/register">
                  <button class="landing-hero-btn-primary-dark" type="button">
                    Start building &#8594;
                  </button>
                </A>
                <A href="/docs">
                  <button class="landing-hero-btn-outline-dark" type="button">
                    See the docs
                  </button>
                </A>
              </div>

              {/* Tech strip */}
              <div class="landing-tech-strip-wrap mt-24">
                <div class="landing-tech-strip-divider" aria-hidden="true" />
                <div class="landing-tech-strip">
                  <For
                    each={[
                      "Cloudflare Workers",
                      "SolidJS",
                      "Bun + Hono",
                      "Drizzle + Turso",
                      "Type-safe end to end",
                    ]}
                  >
                    {(item) => (
                      <span class="landing-tech-strip-item">{item}</span>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Speed signals strip (dark) ─────────────────────────── */}
        <section class="landing-stats-section">
          <div class="relative z-10 mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="grid grid-cols-2 sm:grid-cols-4">
              <For each={speedSignals}>
                {(signal, i) => (
                  <div
                    style={{
                      "border-right":
                        i() < speedSignals.length - 1
                          ? "1px solid rgba(99,102,241,0.18)"
                          : "none",
                    }}
                  >
                    <SpeedSignalBlock
                      value={signal.value}
                      label={signal.label}
                    />
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Three pillars (light) ─────────────────────────────── */}
        <section class="landing-dark-section py-28 lg:py-40">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-16 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#6366f1" }}
                />
                What you get
              </div>
              <h2
                class="max-w-3xl text-[2rem] font-bold tracking-tight sm:text-[2.5rem] lg:text-[2.75rem]"
                style={{ color: "#0f172a" }}
              >
                Three promises. No trade-offs.
              </h2>
              <p
                class="mt-5 max-w-2xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "#475569" }}
              >
                One product instead of many. The fastest stack on the web. AI
                woven through every layer. Pick any two, you still get the
                third.
              </p>
            </div>

            <div class="landing-feature-grid grid grid-cols-1 gap-6 lg:grid-cols-3">
              <For each={pillars}>
                {(pillar) => (
                  <PillarCard
                    icon={pillar.icon}
                    eyebrow={pillar.eyebrow}
                    title={pillar.title}
                    description={pillar.description}
                    points={pillar.points}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Capabilities grid (light) ─────────────────────────── */}
        <section class="landing-dark-section-alt py-28 lg:py-40">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-16 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#8b5cf6" }}
                />
                Every layer
              </div>
              <h2
                class="max-w-3xl text-[2rem] font-bold tracking-tight sm:text-[2.5rem] lg:text-[2.75rem]"
                style={{ color: "#0f172a" }}
              >
                One product replaces many.
              </h2>
              <p
                class="mt-5 max-w-2xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "#475569" }}
              >
                Every capability a modern application needs, unified into one
                platform, one dashboard, one bill. No vendor stitching. No
                duct-tape integrations.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <For each={capabilities}>
                {(cap) => (
                  <CapabilityCard
                    icon={cap.icon}
                    title={cap.title}
                    description={cap.description}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Proof strip (light) ────────────────────────────────── */}
        <section class="landing-dark-section py-28 lg:py-36">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div class="landing-card relative overflow-hidden p-8">
                <div
                  class="absolute top-0 left-0 right-0 h-[2px]"
                  style={{
                    background:
                      "linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)",
                  }}
                />
                <span
                  class="mb-5 inline-block text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: "#6366f1" }}
                >
                  Eat our own cooking
                </span>
                <h3
                  class="mb-3 text-[1.375rem] font-bold tracking-tight"
                  style={{ color: "#0f172a" }}
                >
                  Crontech runs on Crontech.
                </h3>
                <p
                  class="text-[0.9375rem] leading-[1.7]"
                  style={{ color: "#475569" }}
                >
                  Every layer of this platform &mdash; the dashboard you&apos;re
                  about to log into, the billing system, the edge router, the
                  AI playground &mdash; is built and deployed on the same stack
                  we sell you. The product ships itself.
                </p>
              </div>

              <div class="landing-card relative overflow-hidden p-8">
                <div
                  class="absolute top-0 left-0 right-0 h-[2px]"
                  style={{
                    background:
                      "linear-gradient(90deg, #10b981, #06b6d4, #6366f1)",
                  }}
                />
                <span
                  class="mb-5 inline-block text-[11px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: "#059669" }}
                >
                  Open where it counts
                </span>
                <h3
                  class="mb-3 text-[1.375rem] font-bold tracking-tight"
                  style={{ color: "#0f172a" }}
                >
                  Self-hostable from day one.
                </h3>
                <p
                  class="text-[0.9375rem] leading-[1.7]"
                  style={{ color: "#475569" }}
                >
                  Run Crontech on our cloud or in your own VPC &mdash; same
                  binary, same features, no cripple-ware. Core engines are
                  open-source. You never get locked in to a vendor you
                  can&apos;t walk away from.
                </p>
              </div>
            </div>

            {/* Builder teaser */}
            <div class="mt-14 flex flex-col items-center text-center">
              <p
                class="text-[0.9375rem]"
                style={{ color: "#475569" }}
              >
                Prefer to describe what you want and watch it build itself?
              </p>
              <A
                href="/builder"
                class="mt-2 text-sm font-semibold"
                style={{ color: "#6366f1" }}
              >
                Try the AI builder &#8594;
              </A>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA (dark) ─────────────────────────────────── */}
        <section class="landing-cta-section">
          <div class="relative z-10 mx-auto max-w-[880px] px-6 py-32 text-center lg:px-8 lg:py-44">
            <h2
              class="text-[2rem] font-bold tracking-tight sm:text-[2.5rem] lg:text-[3rem]"
              style={{ color: "#f8fafc" }}
            >
              The platform for what you&apos;ll ship{" "}
              <span class="landing-gradient-text">next.</span>
            </h2>
            <p
              class="mt-6 text-[1.0625rem] leading-[1.7] sm:text-lg"
              style={{ color: "rgba(226,232,240,0.78)" }}
            >
              Pick up the whole stack in one place. Stop paying for ten vendors.
              Start shipping on the platform built for the next decade.
            </p>
            <div class="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <A href="/register">
                <button class="landing-hero-btn-primary-dark" type="button">
                  Start building &#8594;
                </button>
              </A>
              <Show
                when={auth.isAuthenticated()}
                fallback={
                  <A href="/docs">
                    <button class="landing-hero-btn-outline-dark" type="button">
                      See the docs
                    </button>
                  </A>
                }
              >
                <A href="/dashboard">
                  <button class="landing-hero-btn-outline-dark" type="button">
                    Open dashboard
                  </button>
                </A>
              </Show>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
