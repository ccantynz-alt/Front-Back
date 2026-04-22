import { A } from "@solidjs/router";
import { For } from "solid-js";
import type { JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";

// ── Data ────────────────────────────────────────────────────────────
//
// /wordpress is the landing page aimed at the 40% of the internet that
// already runs on WordPress. Positioning is deliberately partner-shaped:
// Crontech is the AI performance layer that sits in front of ANY
// WordPress host (Kinsta, WP Engine, SiteGround). No migration. No
// database access. Just speed + AI + observability, bolted onto the
// front of an existing stack.

interface Benefit {
  emoji: string;
  eyebrow: string;
  title: string;
  valueProp: string;
}

const benefits: Benefit[] = [
  {
    emoji: "🌐",
    eyebrow: "Edge caching",
    title: "Global delivery from 330+ cities",
    valueProp:
      "Your WordPress pages cached and served from the Cloudflare city nearest to each visitor. No more trans-Pacific round trips for every page view.",
  },
  {
    emoji: "🤖",
    eyebrow: "AI optimisation",
    title: "Claude-driven image + cache tuning",
    valueProp:
      "Claude watches your Core Web Vitals, rewrites image formats, tunes cache keys, and fixes LCP regressions before they hit your rankings.",
  },
  {
    emoji: "📊",
    eyebrow: "One dashboard",
    title: "Metrics, alerts, auto-fixes",
    valueProp:
      "Speed, uptime, and cache hit rates in plain English. When something slows down, Crontech tells you what broke and what it already fixed.",
  },
];

interface Audience {
  emoji: string;
  eyebrow: string;
  title: string;
  valueProp: string;
}

const audiences: Audience[] = [
  {
    emoji: "🏡",
    eyebrow: "Site owners",
    title: "WordPress owners tired of slow sites",
    valueProp:
      "You do not want to migrate, you do not want to rebuild, you want your existing WordPress site to load fast. Plug Crontech in and it does.",
  },
  {
    emoji: "🏢",
    eyebrow: "Agencies",
    title: "WP agencies managing client sites",
    valueProp:
      "White-label the performance layer across every client you host. Recurring infra revenue per site, one dashboard, measurable speed wins to show on the monthly report.",
  },
  {
    emoji: "🛒",
    eyebrow: "WooCommerce",
    title: "Stores where speed equals revenue",
    valueProp:
      "Every 100ms shaved off a product page shows up in conversion. Crontech treats your checkout path as the most valuable real estate on the internet.",
  },
];

interface Step {
  number: string;
  title: string;
  body: string;
}

const steps: Step[] = [
  {
    number: "01",
    title: "Install the Crontech Connect plugin",
    body: "Drop the plugin onto your WordPress install (coming soon to the WordPress.org directory — early access available via the install guide). It wires up the proxy handshake and nothing else.",
  },
  {
    number: "02",
    title: "We proxy your site through our global edge",
    body: "Your existing host stays exactly where it is. Kinsta, WP Engine, SiteGround, Hostinger, self-hosted — whoever. Crontech sits in front, handling cache, compression, and edge delivery.",
  },
  {
    number: "03",
    title: "AI caching and image optimisation kick in",
    body: "Claude-driven optimisation starts tuning your cache keys, rewriting images to modern formats, and fixing Core Web Vitals automatically. Your host never gets touched.",
  },
];

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "Will this break my existing site?",
    answer:
      "No. Crontech acts as a reverse proxy — your WordPress installation keeps running exactly where it is today. We serve cached responses from the edge and pass anything dynamic through to your origin untouched.",
  },
  {
    question: "What happens to my existing host?",
    answer:
      "Stays. Kinsta, WP Engine, SiteGround, Hostinger, self-hosted — whoever you are with, they stay. Crontech is a performance layer bolted onto the front, not a replacement host. Your contract, your database, your admin, all unchanged.",
  },
  {
    question: "What about my plugins?",
    answer:
      "All supported. Crontech does not care what is installed on your WordPress — WooCommerce, Elementor, Yoast, ACF, custom plugins — they all run on your origin as normal. We just make the public-facing pages arrive faster.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Same security posture as your existing host. Crontech never sees your database, never reads wp-admin traffic, and terminates TLS with modern ciphers at the edge. We are a cache and optimisation layer, not a data store.",
  },
  {
    question: "What does it cost?",
    answer:
      "See /pricing for the full breakdown. The short version: there is a free tier while you are getting started, and paid plans scale with traffic — not per-site, not per-seat.",
  },
];

// ── Benefit card ────────────────────────────────────────────────────
// Matches the solutions.tsx vertical-tile pattern: landing-card,
// gradient icon chip, eyebrow label, title, body, disclaimer strip at
// the bottom to keep performance claims honest.

function BenefitCard(props: Benefit): JSX.Element {
  return (
    <div class="landing-card h-full p-7">
      <div class="flex h-full flex-col gap-5">
        <div class="flex items-center gap-3">
          <div
            class="flex h-11 w-11 items-center justify-center rounded-xl text-[1.25rem]"
            style={{
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12))",
              border: "1px solid rgba(99,102,241,0.2)",
            }}
            aria-hidden="true"
          >
            <span>{props.emoji}</span>
          </div>
          <span
            class="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "#6366f1" }}
          >
            {props.eyebrow}
          </span>
        </div>

        <div class="flex flex-col gap-2.5">
          <h3
            class="text-[1.125rem] font-bold tracking-tight"
            style={{ color: "#0f172a" }}
          >
            {props.title}
          </h3>
          <p
            class="text-[0.9375rem] leading-[1.65]"
            style={{ color: "#475569" }}
          >
            {props.valueProp}
          </p>
        </div>

        <p
          class="mt-auto pt-2 text-[0.75rem] italic leading-[1.55]"
          style={{ color: "#94a3b8" }}
        >
          Measured on beta deployments — your mileage varies.
        </p>
      </div>
    </div>
  );
}

// ── Audience tile ───────────────────────────────────────────────────

function AudienceTile(props: Audience): JSX.Element {
  return (
    <div class="landing-card h-full p-7">
      <div class="flex h-full flex-col gap-5">
        <div class="flex items-center gap-3">
          <div
            class="flex h-11 w-11 items-center justify-center rounded-xl text-[1.25rem]"
            style={{
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(167,139,250,0.12))",
              border: "1px solid rgba(139,92,246,0.2)",
            }}
            aria-hidden="true"
          >
            <span>{props.emoji}</span>
          </div>
          <span
            class="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "#8b5cf6" }}
          >
            {props.eyebrow}
          </span>
        </div>

        <div class="flex flex-col gap-2.5">
          <h3
            class="text-[1.125rem] font-bold tracking-tight"
            style={{ color: "#0f172a" }}
          >
            {props.title}
          </h3>
          <p
            class="text-[0.9375rem] leading-[1.65]"
            style={{ color: "#475569" }}
          >
            {props.valueProp}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Step row ────────────────────────────────────────────────────────

function StepRow(props: Step): JSX.Element {
  return (
    <div class="landing-card h-full p-7">
      <div class="flex h-full flex-col gap-4">
        <span
          class="text-[0.75rem] font-semibold uppercase tracking-[0.2em]"
          style={{ color: "#6366f1" }}
        >
          Step {props.number}
        </span>
        <h3
          class="text-[1.125rem] font-bold tracking-tight"
          style={{ color: "#0f172a" }}
        >
          {props.title}
        </h3>
        <p
          class="text-[0.9375rem] leading-[1.7]"
          style={{ color: "#475569" }}
        >
          {props.body}
        </p>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function WordPress(): JSX.Element {
  return (
    <>
      <SEOHead
        title={"WordPress — Make your site 3× faster with AI."}
        description="Crontech sits in front of any WordPress host — Kinsta, WP Engine, SiteGround, whoever. Zero migration. Instant speed. AI-driven caching, image optimisation, and Core Web Vitals fixes."
        path="/wordpress"
      />

      <div>
        {/* ── Hero (dark) ───────────────────────────────────────── */}
        <section class="landing-hero">
          <div class="relative z-10 mx-auto max-w-[1120px] px-6 pt-32 pb-24 md:pt-40 md:pb-28 lg:px-8 lg:pt-44 lg:pb-32">
            <div class="flex flex-col items-center text-center">
              <div class="landing-hero-badge mb-10">
                <span class="landing-hero-badge-dot" aria-hidden="true" />
                <span class="landing-hero-badge-text">
                  The AI performance layer for WordPress &mdash; works with any host
                </span>
              </div>

              <h1
                class="max-w-4xl text-[2.75rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[3.5rem] lg:text-[4.5rem]"
                style={{ color: "#f8fafc" }}
              >
                Make your WordPress site{" "}
                <span class="landing-gradient-text">3&times; faster</span> with AI.
              </h1>

              <p
                class="mt-8 max-w-3xl text-[1.125rem] leading-[1.7] sm:text-[1.1875rem] lg:text-xl"
                style={{ color: "rgba(248,250,252,0.78)" }}
              >
                Crontech sits in front of any WordPress host &mdash; Kinsta, WP
                Engine, SiteGround, whoever. Zero migration. Instant speed.
                Your existing host stays exactly where it is.
              </p>

              <div class="mt-12 flex flex-col items-center gap-4 sm:flex-row">
                <A href="/register?source=wordpress">
                  <button class="landing-hero-btn-primary-dark" type="button">
                    Speed up your site &#8594;
                  </button>
                </A>
                <A href="/pricing">
                  <button class="landing-hero-btn-outline-dark" type="button">
                    See pricing
                  </button>
                </A>
              </div>
            </div>
          </div>
        </section>

        {/* ── Three benefit cards (light) ──────────────────────── */}
        <section class="landing-dark-section py-28 lg:py-36">
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
                Three layers of speed, bolted onto your existing stack.
              </h2>
              <p
                class="mt-5 max-w-2xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "#64748b" }}
              >
                No migration. No rebuild. No new host. Just a measurable jump
                in page speed, Core Web Vitals, and visitor retention.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-5 md:grid-cols-3">
              <For each={benefits}>
                {(benefit) => (
                  <BenefitCard
                    emoji={benefit.emoji}
                    eyebrow={benefit.eyebrow}
                    title={benefit.title}
                    valueProp={benefit.valueProp}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Who it's for (light alt) ─────────────────────────── */}
        <section class="landing-dark-section-alt py-28 lg:py-36">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-16 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#8b5cf6" }}
                />
                Who it's for
              </div>
              <h2
                class="max-w-3xl text-[2rem] font-bold tracking-tight sm:text-[2.5rem] lg:text-[2.75rem]"
                style={{ color: "#0f172a" }}
              >
                Built for the 40% of the internet that runs on WordPress.
              </h2>
              <p
                class="mt-5 max-w-2xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "#64748b" }}
              >
                Whether you own one site, manage fifty client sites, or run a
                WooCommerce store, the math is the same: faster pages, more
                customers, less churn.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-5 md:grid-cols-3">
              <For each={audiences}>
                {(audience) => (
                  <AudienceTile
                    emoji={audience.emoji}
                    eyebrow={audience.eyebrow}
                    title={audience.title}
                    valueProp={audience.valueProp}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── How it works (light) ─────────────────────────────── */}
        <section class="landing-dark-section py-28 lg:py-36">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-16 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#818cf8" }}
                />
                How it works
              </div>
              <h2
                class="max-w-3xl text-[2rem] font-bold tracking-tight sm:text-[2.5rem] lg:text-[2.75rem]"
                style={{ color: "#0f172a" }}
              >
                Three steps. Zero migration.
              </h2>
              <p
                class="mt-5 max-w-2xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "#64748b" }}
              >
                Your host stays untouched. Your database is never read. The
                only thing that changes is how fast your pages arrive.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-5 md:grid-cols-3">
              <For each={steps}>
                {(step) => (
                  <StepRow
                    number={step.number}
                    title={step.title}
                    body={step.body}
                  />
                )}
              </For>
            </div>

            <div class="mt-10 flex justify-center">
              <A
                href="/docs/wordpress/install"
                class="inline-flex items-center gap-2 text-[0.9375rem] font-semibold"
                style={{ color: "#6366f1" }}
              >
                Read the install guide (plugin coming soon){" "}
                <span aria-hidden="true">&#8594;</span>
              </A>
            </div>
          </div>
        </section>

        {/* ── Partner framing strip (light alt, honest) ──────────── */}
        <section class="landing-dark-section-alt py-24 lg:py-28">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="max-w-3xl">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#8b5cf6" }}
                />
                Partner, not replacement
              </div>
              <p
                class="mt-6 text-[1.0625rem] leading-[1.8] sm:text-[1.125rem]"
                style={{ color: "#334155" }}
              >
                Crontech is not a WordPress host. We don&apos;t want to be one.
                Your managed host is doing a job we have no interest in doing
                &mdash; running the admin, storing the database, keeping PHP
                patched. What we do is the piece your host was never built for:
                a global AI performance layer that makes every public page on
                your site faster without touching a single thing you already
                have. Keep your host. Bolt us on the front.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ (light) ───────────────────────────────────────── */}
        <section class="landing-dark-section py-28 lg:py-36">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-14 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#818cf8" }}
                />
                Common questions
              </div>
              <h2
                class="max-w-2xl text-[2rem] font-bold tracking-tight sm:text-[2.5rem]"
                style={{ color: "#0f172a" }}
              >
                Straight answers.
              </h2>
            </div>

            <div class="mx-auto grid max-w-[900px] grid-cols-1 gap-5 md:grid-cols-2">
              <For each={faqs}>
                {(faq) => (
                  <div class="landing-card h-full p-7">
                    <h3
                      class="text-[1rem] font-semibold tracking-tight"
                      style={{ color: "#0f172a" }}
                    >
                      {faq.question}
                    </h3>
                    <p
                      class="mt-3 text-[0.9375rem] leading-[1.7]"
                      style={{ color: "#475569" }}
                    >
                      {faq.answer}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Footer CTA (dark) ─────────────────────────────────── */}
        <section class="landing-cta-section">
          <div class="relative z-10 mx-auto max-w-[800px] px-6 py-28 text-center lg:px-8 lg:py-36">
            <h2
              class="text-[2rem] font-bold tracking-tight sm:text-[2.5rem] lg:text-[3rem]"
              style={{ color: "#f8fafc" }}
            >
              Speed up your{" "}
              <span class="landing-gradient-text">WordPress</span> site.
            </h2>
            <p
              class="mt-6 text-[1.0625rem] leading-[1.7] sm:text-lg"
              style={{ color: "rgba(226,232,240,0.78)" }}
            >
              Keep your host. Bolt Crontech on the front. Measure the
              difference in a week.
            </p>
            <div class="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <A href="/register?source=wordpress">
                <button class="landing-hero-btn-primary-dark" type="button">
                  Speed up your WordPress site &#8594;
                </button>
              </A>
              <A href="/pricing">
                <button class="landing-hero-btn-outline-dark" type="button">
                  See pricing
                </button>
              </A>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
