import { A, useNavigate } from "@solidjs/router";
import { For, Show, createEffect } from "solid-js";
import type { JSX } from "solid-js";
import { Icon, type IconName } from "../components/Icon";
import { SEOHead } from "../components/SEOHead";
import { useAuth } from "../stores";

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
    description:
      "Modern testing, visual regression, and accessibility checks — runs on the platform.",
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
    <A href="/solutions" class="landing-card block p-5" style={{ "text-decoration": "none" }}>
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: "rgba(99,102,241,0.08)",
            color: "#6366f1",
            border: "1px solid rgba(99,102,241,0.14)",
          }}
        >
          <Icon name={props.icon} size={16} />
        </div>
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-sm font-semibold" style={{ color: "#111827" }}>
            {props.label}
          </span>
          <span class="truncate text-xs" style={{ color: "#6b7280" }}>
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
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "rgba(99,102,241,0.08)",
              color: "#6366f1",
              border: "1px solid rgba(99,102,241,0.14)",
            }}
          >
            <Icon name={props.icon} size={20} />
          </div>
          <span
            class="text-[11px] font-semibold uppercase tracking-[0.15em]"
            style={{ color: "#6366f1" }}
          >
            {props.eyebrow}
          </span>
        </div>

        <div class="flex flex-col gap-2.5">
          <h3 class="text-[1.125rem] font-bold tracking-tight" style={{ color: "#111827" }}>
            {props.title}
          </h3>
          <p class="text-[0.9rem] leading-[1.7]" style={{ color: "#4b5563" }}>
            {props.description}
          </p>
        </div>

        <ul class="mt-auto flex flex-col gap-2 pt-2">
          <For each={props.points}>
            {(point) => (
              <li
                class="flex items-start gap-2.5 text-[0.875rem] leading-[1.6]"
                style={{ color: "#374151" }}
              >
                <span
                  class="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "#6366f1" }}
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
            background: "rgba(99,102,241,0.08)",
            color: "#6366f1",
            border: "1px solid rgba(99,102,241,0.14)",
          }}
        >
          <Icon name={props.icon} size={18} />
        </div>
        <div class="flex flex-col gap-1.5">
          <h3 class="text-[1rem] font-semibold tracking-tight" style={{ color: "#111827" }}>
            {props.title}
          </h3>
          <p class="text-[0.875rem] leading-[1.65]" style={{ color: "#6b7280" }}>
            {props.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function FamilyCard(props: FamilyProduct): JSX.Element {
  return (
    <div class="landing-moat-card h-full p-6">
      <div class="flex h-full flex-col gap-3">
        <span
          class="text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "#818cf8" }}
        >
          {props.role}
        </span>
        <h3 class="text-[1.125rem] font-bold tracking-tight" style={{ color: "#f1f5f9" }}>
          {props.name}
        </h3>
        <p class="text-[0.875rem] leading-[1.65]" style={{ color: "rgba(241,245,249,0.6)" }}>
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

// ── Shared section heading ───────────────────────────────────────────

interface SectionHeadProps {
  eyebrow: string;
  eyebrowColor?: string;
  title: JSX.Element;
  body?: string;
  dark?: boolean;
}

function SectionHead(props: SectionHeadProps): JSX.Element {
  const headColor = props.dark ? "#f1f5f9" : "#111827";
  const bodyColor = props.dark ? "rgba(241,245,249,0.62)" : "#6b7280";
  const dotColor = props.eyebrowColor ?? (props.dark ? "#818cf8" : "#6366f1");

  return (
    <div class="mb-16 flex flex-col items-center text-center">
      <div
        class="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em]"
        style={{ color: dotColor }}
      >
        <span
          class="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dotColor }}
          aria-hidden="true"
        />
        {props.eyebrow}
      </div>
      <h2
        class="max-w-2xl text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem] lg:text-[2.625rem]"
        style={{ color: headColor }}
      >
        {props.title}
      </h2>
      <Show when={props.body}>
        <p class="mt-5 max-w-2xl text-[1.0625rem] leading-[1.75]" style={{ color: bodyColor }}>
          {props.body}
        </p>
      </Show>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function Home(): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();

  // Authenticated users skip the landing page entirely → command center.
  createEffect(() => {
    if (auth.isAuthenticated()) {
      navigate("/admin/gate", { replace: true });
    }
  });

  return (
    <>
      <SEOHead
        title={"Crontech — Build a business. We'll power the internet part."}
        description="The AI-native platform for every business. Claude-powered. Hosting, database, auth, AI, billing, email — one product, every layer. Not just for developers."
        path="/"
      />

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section class="landing-hero">
        <div class="relative z-10 mx-auto w-full max-w-[1120px] px-6 pb-16 pt-32 lg:px-8 lg:pb-20 lg:pt-44">
          <div class="flex flex-col items-center text-center">
            {/* Badge */}
            <div class="landing-hero-badge mb-10">
              <span class="landing-hero-badge-dot" aria-hidden="true" />
              <span class="landing-hero-badge-text">
                Now in early access &mdash; Powered by Claude
              </span>
            </div>

            {/* Headline — locked per docs/POSITIONING.md §3 */}
            <h1
              class="max-w-4xl text-[2.75rem] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[3.5rem] lg:text-[4.5rem]"
              style={{ color: "#f1f5f9" }}
            >
              The developer platform for the <span class="landing-gradient-text">next decade</span>
            </h1>

            {/* Subheading */}
            <p
              class="mt-7 max-w-2xl text-[1.0625rem] leading-[1.8] sm:text-[1.125rem]"
              style={{ color: "rgba(241,245,249,0.65)" }}
            >
              The AI-native platform for online stores, restaurants, creators, agencies, SaaS
              founders, and every business that deserves a better internet. Hosting, database, auth,
              AI, billing, email &mdash; one product, zero ops.
            </p>

            {/* CTAs */}
            <div class="mt-12 flex flex-col items-center gap-4 sm:flex-row">
              <A href="/register" class="landing-hero-btn-primary-dark">
                Start building
              </A>
              <A href="/docs" class="landing-hero-btn-outline-dark">
                See the docs
              </A>
            </div>

            {/* Tech strip */}
            <div class="landing-tech-strip-wrap mt-14">
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
                  {(signal) => <span class="landing-tech-strip-item">{signal}</span>}
                </For>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ─────────────────────────────────────────────── */}
      <section class="landing-stats-section">
        <div class="mx-auto w-full max-w-[1120px] px-6 lg:px-8">
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

      {/* ── Every business preview ───────────────────────────────────── */}
      <section
        class="py-28 lg:py-36"
        style={{
          background: "#ffffff",
          "border-top": "1px solid #e5e7eb",
        }}
      >
        <div class="mx-auto w-full max-w-[1120px] px-6 lg:px-8">
          <SectionHead
            eyebrow="Who it's for"
            title={
              <>
                One platform. <span class="landing-gradient-text-dark">Every business.</span>
              </>
            }
            body="From online stores to nonprofits, Crontech powers the internet part so you can focus on your customers."
          />

          <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <For each={verticalPreviews}>
              {(v) => <VerticalTile icon={v.icon} label={v.label} blurb={v.blurb} />}
            </For>
          </div>

          <div class="mt-10 flex justify-center">
            <A
              href="/solutions"
              class="text-sm font-semibold transition-colors"
              style={{ color: "#6366f1" }}
            >
              See all 10 verticals &#8594;
            </A>
          </div>
        </div>
      </section>

      {/* ── Three pillars ───────────────────────────────────────────── */}
      <section
        class="py-28 lg:py-40"
        style={{
          background: "#f9fafb",
          "border-top": "1px solid #e5e7eb",
          "border-bottom": "1px solid #e5e7eb",
        }}
      >
        <div class="mx-auto w-full max-w-[1120px] px-6 lg:px-8">
          <SectionHead
            eyebrow="Why Crontech"
            title="Three things we've built differently."
            body="AI-native from the first commit. Open to every business, not just developers. Running on the platform we're selling you."
          />

          <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
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

      {/* ── Capabilities grid ───────────────────────────────────────── */}
      <section
        class="py-28 lg:py-40"
        style={{
          background: "#ffffff",
          "border-bottom": "1px solid #e5e7eb",
        }}
      >
        <div class="mx-auto w-full max-w-[1120px] px-6 lg:px-8">
          <SectionHead
            eyebrow="Every layer"
            title="One product replaces many."
            body="Every capability a modern application needs, unified into one platform, one dashboard, one bill. No vendor stitching."
          />

          <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <For each={capabilities}>
              {(cap) => (
                <CapabilityCard icon={cap.icon} title={cap.title} description={cap.description} />
              )}
            </For>
          </div>
        </div>
      </section>

      {/* ── The family / moat ───────────────────────────────────────── */}
      <section class="landing-moat-section py-28 lg:py-36">
        <div class="mx-auto w-full max-w-[1120px] px-6 lg:px-8">
          <SectionHead
            dark
            eyebrow="The moat"
            eyebrowColor="#34d399"
            title="Crontech runs on Crontech."
            body="Four products, one platform, all using each other. Most platforms can't say that. We can."
          />

          <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <For each={family}>
              {(p) => (
                <FamilyCard name={p.name} role={p.role} description={p.description} url={p.url} />
              )}
            </For>
          </div>
        </div>
      </section>

      {/* ── Mission strip ───────────────────────────────────────────── */}
      <section
        class="py-24 lg:py-28"
        style={{
          background: "#ffffff",
          "border-top": "1px solid #e5e7eb",
          "border-bottom": "1px solid #e5e7eb",
        }}
      >
        <div class="mx-auto w-full max-w-[720px] px-6 lg:px-8">
          <div class="flex flex-col gap-4">
            <span
              class="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "#6366f1" }}
            >
              The mission
            </span>
            <p class="text-[1.0625rem] leading-[1.85]" style={{ color: "#374151" }}>
              We&apos;re building Crontech to make it cheap and fast for anyone to start a business,
              employ people, and serve customers. The internet should be open to everyone &mdash;
              not just the people with engineering teams and enterprise contracts. If you&apos;re
              here to build something, we&apos;re here to power it.
            </p>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────────────────── */}
      <section class="landing-cta-section">
        <div class="relative z-10 mx-auto w-full max-w-[880px] px-6 py-32 text-center lg:px-8 lg:py-44">
          <h2
            class="text-[1.875rem] font-bold tracking-tight sm:text-[2.25rem] lg:text-[2.75rem]"
            style={{ color: "#f1f5f9" }}
          >
            Start with a sentence. <span class="landing-gradient-text">Ship a business.</span>
          </h2>
          <p
            class="mt-6 text-[1.0625rem] leading-[1.7] sm:text-lg"
            style={{ color: "rgba(241,245,249,0.65)" }}
          >
            Describe what you&apos;re building in plain English. Claude drafts the app, the
            database, the auth, the billing. You iterate.
          </p>
          <div class="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <A href="/builder" class="landing-hero-btn-primary-dark">
              Try the AI builder &#8594;
            </A>
            <Show
              when={auth.isAuthenticated()}
              fallback={
                <A href="/register" class="landing-hero-btn-outline-dark">
                  Create an account
                </A>
              }
            >
              <A href="/dashboard" class="landing-hero-btn-outline-dark">
                Open dashboard
              </A>
            </Show>
          </div>
        </div>
      </section>
    </>
  );
}
