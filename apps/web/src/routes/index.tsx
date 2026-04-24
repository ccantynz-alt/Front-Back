import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { useAuth } from "../stores";
import { SEOHead } from "../components/SEOHead";
import { Icon, type IconName } from "../components/Icon";

// ── Data ────────────────────────────────────────────────────────────

interface VerticalPreview {
  icon: IconName;
  label: string;
  blurb: string;
}

const verticalPreviews: VerticalPreview[] = [
  { icon: "shopping-cart", label: "Online store", blurb: "Stripe + products + AI recs" },
  { icon: "utensils", label: "Restaurant", blurb: "Menu, bookings, online orders" },
  { icon: "pen-tool", label: "Creator", blurb: "Publish, grow, monetise" },
  { icon: "briefcase", label: "Agency", blurb: "White-label client sites" },
  { icon: "home", label: "Real estate", blurb: "Listings + AI copy" },
  { icon: "code", label: "SaaS", blurb: "Frontend + backend + DB in one" },
  { icon: "heart", label: "Nonprofit", blurb: "Free tier + donations" },
  { icon: "sparkles", label: "AI app", blurb: "Describe it, Claude builds it" },
];

interface Pillar {
  icon: IconName;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
}

const pillars: Pillar[] = [
  {
    icon: "sparkles",
    eyebrow: "AI-native",
    title: "Claude in every layer",
    description:
      "Anthropic Claude is the primary intelligence across the platform — builder, debugger, observability, customer chat. Not bolted on. Native from the first commit.",
    points: [
      "Claude powers the AI builder",
      "Errors explained in plain English",
      "Self-healing deploys — Claude ships PRs to fix failures",
    ],
  },
  {
    icon: "layers",
    eyebrow: "Every business",
    title: "Not just for developers",
    description:
      "Online stores, restaurants, creators, agencies, real estate, SaaS, nonprofits, marketplaces, AI apps. One platform, every vertical. Describe your business — Claude will build it.",
    points: [
      "Paste a website URL — we accelerate it",
      "Describe a business — Claude ships a starter",
      "Or connect a GitHub repo — the dev path still works",
    ],
  },
  {
    icon: "zap",
    eyebrow: "Runs itself",
    title: "Four products on one platform",
    description:
      "Crontech hosts Crontech. Gluecron hosts the git. Gatetest gates the CI. AlecRae sends the email. Four products, one platform — the moat nobody else can copy.",
    points: [
      "The platform runs on the platform",
      "Cross-product admin + health visibility baked in",
      "You can see us using it, live, today",
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
      "Global edge deploys. Push a URL, a repo, or a Claude prompt — ship to 330+ cities in seconds.",
  },
  {
    icon: "database",
    title: "Database",
    description:
      "Edge SQL via embedded Turso replicas for zero-latency reads. Serverless Postgres on demand. Vector search built in.",
  },
  {
    icon: "lock",
    title: "Auth",
    description:
      "Passkeys first — the 98% login-success future of auth. OAuth, email, magic links wired in. Sessions, RBAC, audit logs you don't have to build.",
  },
  {
    icon: "sparkles",
    title: "AI",
    description:
      "Claude as primary, OpenAI as fallback. Streaming LLM calls, multi-agent workflows, RAG pipelines. One SDK, every tier of compute.",
  },
  {
    icon: "credit-card",
    title: "Billing",
    description:
      "Subscriptions, metered usage, proration, invoices — fully integrated. One line to charge. Zero integration tax.",
  },
  {
    icon: "mail",
    title: "Email & SMS",
    description:
      "Powered by AlecRae, our own transactional email product. Transactional, marketing, SMS — same pipeline, same observability.",
  },
  {
    icon: "users",
    title: "Real-time collab",
    description:
      "CRDT-backed multi-user editing, presence, cursors — with AI agents as first-class participants. Sub-50ms globally.",
  },
  {
    icon: "bar-chart",
    title: "Observability",
    description:
      "Weekly AI insights in plain English. 'Conversion dropped 8% — Claude thinks it's the button colour. Here's a PR.' One tool, not five.",
  },
];

interface Signal {
  value: string;
  label: string;
}

const signals: Signal[] = [
  { value: "Claude-powered", label: "The best AI, native" },
  { value: "4 products", label: "Running on one platform" },
  { value: "Every business", label: "Not just developers" },
  { value: "Edge-native", label: "330+ cities worldwide" },
];

interface FamilyProduct {
  name: string;
  role: string;
  description: string;
  url: string;
}

const family: FamilyProduct[] = [
  {
    name: "Crontech",
    role: "The platform",
    description: "Hosting, database, auth, AI, billing — one product, one bill.",
    url: "/",
  },
  {
    name: "Gluecron",
    role: "Git hosting",
    description: "Where every commit lives. Our own git hosting product.",
    url: "https://gluecron.com",
  },
  {
    name: "Gatetest",
    role: "CI & visual QA",
    description: "Modern testing, visual regression, and accessibility checks — runs on the platform.",
    url: "https://gatetest.io",
  },
  {
    name: "AlecRae",
    role: "Transactional email",
    description: "Every outbound email for the empire. Deliverability-first.",
    url: "https://alecrae.com",
  },
];

// ── Components ──────────────────────────────────────────────────────

function VerticalTile(props: VerticalPreview): JSX.Element {
  return (
    <A href="/solutions" class="landing-card block p-5 transition-transform hover:scale-[1.02]">
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12))",
            color: "#a5b4fc",
            border: "1px solid rgba(99,102,241,0.2)",
          }}
        >
          <Icon name={props.icon} size={16} />
        </div>
        <div class="flex flex-col">
          <span class="text-sm font-semibold" style={{ color: "#f0f0f5" }}>
            {props.label}
          </span>
          <span class="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
            {props.blurb}
          </span>
        </div>
      </div>
    </A>
  );
}

function PillarCard(props: Pillar): JSX.Element {
  return (
    <div class="landing-card h-full p-8">
      <div class="flex h-full flex-col gap-6">
        <div class="flex items-center gap-3">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))",
              color: "#a5b4fc",
              border: "1px solid rgba(99,102,241,0.2)",
            }}
          >
            <Icon name={props.icon} size={22} />
          </div>
          <span
            class="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "#818cf8" }}
          >
            {props.eyebrow}
          </span>
        </div>

        <div class="flex flex-col gap-3">
          <h3 class="text-[1.25rem] font-bold tracking-tight" style={{ color: "#f0f0f5" }}>
            {props.title}
          </h3>
          <p class="text-[0.9375rem] leading-[1.7]" style={{ color: "rgba(255,255,255,0.55)" }}>
            {props.description}
          </p>
        </div>

        <ul class="mt-auto flex flex-col gap-2.5 pt-2">
          <For each={props.points}>
            {(point) => (
              <li
                class="flex items-start gap-2.5 text-[0.875rem] leading-[1.6]"
                style={{ color: "rgba(255,255,255,0.65)" }}
              >
                <span
                  class="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
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
          <h3 class="text-[1rem] font-semibold tracking-tight" style={{ color: "#0f172a" }}>
            {props.title}
          </h3>
          <p class="text-[0.875rem] leading-[1.65]" style={{ color: "#64748b" }}>
            {props.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function FamilyCard(props: FamilyProduct): JSX.Element {
  return (
    <div class="landing-card h-full p-6">
      <div class="flex h-full flex-col gap-3">
        <span
          class="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "#818cf8" }}
        >
          {props.role}
        </span>
        <h3 class="text-[1.125rem] font-bold tracking-tight" style={{ color: "#f0f0f5" }}>
          {props.name}
        </h3>
        <p class="text-[0.875rem] leading-[1.65]" style={{ color: "rgba(255,255,255,0.55)" }}>
          {props.description}
        </p>
      </div>
    </div>
  );
}

function SignalBlock(props: Signal): JSX.Element {
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
        title={"Crontech — Build a business. We'll power the internet part."}
        description="The AI-native platform for every business. Claude-powered. Hosting, database, auth, AI, billing, email — one product, every layer. Not just for developers."
        path="/"
      />

      <div>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section class="landing-hero">
          <div class="relative z-10 mx-auto max-w-[1120px] px-6 pt-32 pb-36 lg:px-8 lg:pt-44 lg:pb-48">
            <div class="flex flex-col items-center text-center">
              {/* Early access badge */}
              <div class="landing-hero-badge mb-10">
                <span class="landing-hero-badge-dot" aria-hidden="true" />
                <span class="landing-hero-badge-text">
                  Now in early access &mdash; Powered by Claude
                </span>
              </div>

              {/* Headline — locked per docs/POSITIONING.md §3 */}
              <h1
                class="max-w-4xl text-[2.75rem] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[3.5rem] lg:text-[4.25rem]"
                style={{ color: "#0f172a" }}
              >
                The developer platform for the{" "}
                <span class="landing-gradient-text">
                  next decade
                </span>
              </h1>

              {/* Subheading */}
              <p
                class="mt-7 max-w-2xl text-[1.0625rem] leading-[1.8] sm:text-lg"
                style={{ color: "#475569" }}
              >
                The AI-native platform for online stores, restaurants, creators,
                agencies, SaaS founders, and every business that deserves a
                better internet. Hosting, database, auth, AI, billing, email
                &mdash; one product, zero ops.
              </p>

              {/* CTAs — locked per docs/POSITIONING.md */}
              <div class="mt-14 flex flex-col items-center gap-5 sm:flex-row">
                <A href="/register">
                  <button class="landing-hero-btn-primary" type="button">
                    Start building
                  </button>
                </A>
                <A href="/docs">
                  <button class="landing-hero-btn-outline" type="button">
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
                      "Claude-powered AI",
                      "SOC 2 Type II in progress",
                      "Runs on itself",
                      "Four products, one platform",
                      "Edge-native hosting",
                      "Self-hostable in your VPC",
                      "Cloudflare Workers",
                      "SolidJS",
                      "Bun + Hono",
                      "Drizzle + Turso",
                      "Type-safe end to end",
                    ]}
                  >
                    {(signal) => (
                      <span class="landing-tech-strip-item">{signal}</span>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats strip ───────────────────────────────────────── */}
        <section class="landing-stats-section">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="landing-stats-grid">
              <For each={signals}>
                {(signal) => (
                  <div class="landing-stat-cell">
                    <SignalBlock value={signal.value} label={signal.label} />
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Every business preview ────────────────────────────── */}
        <section class="landing-dark-section py-28 lg:py-36">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-14 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div class="h-1.5 w-1.5 rounded-full" style={{ background: "#818cf8" }} />
                Who it&apos;s for
              </div>
              <h2
                class="max-w-3xl text-[2rem] font-bold tracking-tight sm:text-[2.5rem] lg:text-[2.75rem]"
                style={{ color: "#f0f0f5" }}
              >
                One platform.{" "}
                <span class="landing-gradient-text">Every business.</span>
              </h2>
              <p
                class="mt-5 max-w-2xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                From online stores to nonprofits, Crontech powers the internet
                part so you can focus on your customers.
              </p>
            </div>

            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <For each={verticalPreviews}>
                {(v) => <VerticalTile icon={v.icon} label={v.label} blurb={v.blurb} />}
              </For>
            </div>

            <div class="mt-10 flex justify-center">
              <A
                href="/solutions"
                class="text-sm font-semibold"
                style={{ color: "#a5b4fc" }}
              >
                See all 10 verticals &#8594;
              </A>
            </div>
          </div>
        </section>

        {/* ── Three pillars ─────────────────────────────────────── */}
        <section class="landing-dark-section-alt py-28 lg:py-40">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-20 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div class="h-1.5 w-1.5 rounded-full" style={{ background: "#818cf8" }} />
                Why Crontech
              </div>
              <h2
                class="max-w-2xl text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem]"
                style={{ color: "#f0f0f5" }}
              >
                Three things we&apos;ve built differently.
                Three promises. No trade-offs.
              </h2>
              <p
                class="mt-5 max-w-xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                AI-native from the first commit. Open to every business, not
                just developers. Running on the platform we&apos;re selling
                you.
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

        {/* ── Capabilities grid ─────────────────────────────────── */}
        <section class="landing-dark-section-alt py-28 lg:py-40">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-16 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div class="h-1.5 w-1.5 rounded-full" style={{ background: "#6366f1" }} />
                Every layer
              </div>
              <h2
                class="max-w-3xl text-[2rem] font-bold tracking-tight sm:text-[2.5rem] lg:text-[2.75rem]"
                style={{ color: "#f0f0f5" }}
              >
                One product replaces many.
              </h2>
              <p
                class="mt-5 max-w-2xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                Every capability a modern application needs, unified into one
                platform, one dashboard, one bill. No vendor stitching.
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

        {/* ── The family (dogfood proof) ────────────────────────── */}
        <section class="landing-dark-section py-28 lg:py-36">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-14 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div class="h-1.5 w-1.5 rounded-full" style={{ background: "#34d399" }} />
                The moat
              </div>
              <h2
                class="max-w-3xl text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem]"
                style={{ color: "#f0f0f5" }}
              >
                Crontech runs on Crontech.
              </h2>
              <p
                class="mt-5 max-w-2xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Four products, one platform, all using each other. Most
                platforms can&apos;t say that. We can.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <For each={family}>
                {(p) => (
                  <FamilyCard
                    name={p.name}
                    role={p.role}
                    description={p.description}
                    url={p.url}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Mission strip ─────────────────────────────────────── */}
        <section class="landing-dark-section py-24 lg:py-28">
          <div class="mx-auto max-w-[720px] px-6 lg:px-8">
            <div class="flex flex-col gap-4">
              <span
                class="text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "#818cf8" }}
              >
                The mission
              </span>
              <p
                class="text-[1.0625rem] leading-[1.8]"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                We&apos;re building Crontech to make it cheap and fast for
                anyone to start a business, employ people, and serve customers.
                The internet should be open to everyone &mdash; not just the
                people with engineering teams and enterprise contracts. If
                you&apos;re here to build something, we&apos;re here to power
                it.
              </p>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ────────────────────────────────────────── */}
        <section class="landing-cta-section">
          <div class="relative z-10 mx-auto max-w-[880px] px-6 py-32 text-center lg:px-8 lg:py-44">
            <h2
              class="text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem] lg:text-[2.75rem]"
              style={{ color: "#0f172a" }}
            >
              Start with a sentence.{" "}
              <span class="landing-gradient-text">Ship a business.</span>
            </h2>
            <p
              class="mt-6 text-[1.0625rem] leading-[1.7] sm:text-lg"
              style={{ color: "#64748b" }}
            >
              Describe what you&apos;re building in plain English. Claude drafts
              the app, the database, the auth, the billing. You iterate.
            </p>
            <div class="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <A href="/builder">
                <button class="landing-hero-btn-primary" type="button">
                  Try the AI builder &#8594;
                </button>
              </A>
              <Show
                when={auth.isAuthenticated()}
                fallback={
                  <A href="/register">
                    <button class="landing-hero-btn-outline" type="button">
                      Create an account
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
          </div>
        </section>
      </div>
    </>
  );
}
