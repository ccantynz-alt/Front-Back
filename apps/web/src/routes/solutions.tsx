import { A } from "@solidjs/router";
import { For } from "solid-js";
import type { JSX } from "solid-js";
import { SEOHead } from "../components/SEOHead";

// ── Data ────────────────────────────────────────────────────────────

interface Vertical {
  emoji: string;
  eyebrow: string;
  title: string;
  valueProp: string;
  href: string;
}

// The ten verticals Crontech is built to power. Copy is tuned to be
// concrete and outcome-led — every tile tells someone in that line of
// work what they will walk away with, not what the platform is.
const verticals: Vertical[] = [
  {
    emoji: "🛍️",
    eyebrow: "E-commerce",
    title: "Online store",
    valueProp:
      "Launch a store. Crontech handles hosting, payments, and AI product recommendations.",
    href: "/builder?template=store",
  },
  {
    emoji: "🍽️",
    eyebrow: "Hospitality",
    title: "Restaurant & bookings",
    valueProp:
      "Menu, bookings, online orders — one link you can share on Instagram.",
    href: "/builder?template=restaurant",
  },
  {
    emoji: "✍️",
    eyebrow: "Creator",
    title: "Creator & newsletter",
    valueProp:
      "Publish, grow an audience, monetise. AI writes the welcome sequence.",
    href: "/builder?template=creator",
  },
  {
    emoji: "🏢",
    eyebrow: "Agency",
    title: "Agency & consultancy",
    valueProp:
      "White-label client sites with recurring infra revenue per site you manage.",
    href: "/builder?template=agency",
  },
  {
    emoji: "🏡",
    eyebrow: "Real estate",
    title: "Listings & leads",
    valueProp:
      "Listings, viewings, lead capture. AI drafts the listing copy.",
    href: "/builder?template=real-estate",
  },
  {
    emoji: "🚀",
    eyebrow: "SaaS",
    title: "SaaS founder",
    valueProp:
      "Frontend, backend, database, auth, billing — one deploy. Ship in days, not weeks.",
    href: "/builder?template=saas",
  },
  {
    emoji: "🤝",
    eyebrow: "Nonprofit",
    title: "Nonprofit & community",
    valueProp:
      "Free tier for registered nonprofits. Tell your story, accept donations, sign up volunteers.",
    href: "/builder?template=nonprofit",
  },
  {
    emoji: "🛒",
    eyebrow: "Marketplace",
    title: "Two-sided marketplace",
    valueProp:
      "Two-sided platforms with payments, reviews, and moderation — AI handles the abuse detection.",
    href: "/builder?template=marketplace",
  },
  {
    emoji: "🔧",
    eyebrow: "Local service",
    title: "Trades, fitness, legal, medical",
    valueProp:
      "Bookings, reviews, payments. Looks professional day one.",
    href: "/builder?template=local",
  },
  {
    emoji: "🤖",
    eyebrow: "AI app",
    title: "AI app builder",
    valueProp:
      "No code? No problem. Describe the app. Claude ships it.",
    href: "/builder?template=ai-app",
  },
];

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "Do I need to know how to code?",
    answer:
      "No. The AI Builder handles the code — you describe what you want and Claude ships it. If you do code, you can drop into the project any time and edit it like a normal repo.",
  },
  {
    question: "How much does it cost?",
    answer:
      "See /pricing for the full breakdown. The short version: there's a free tier that stays free until you're making revenue, and paid plans only kick in when your business does.",
  },
  {
    question: "What if my business doesn't fit one of these tiles?",
    answer:
      "Click the last tile — AI app builder. Describe your idea in plain English and Claude will figure out the right starter. The ten tiles are shortcuts, not a cap on what's possible.",
  },
  {
    question: "What about my existing website?",
    answer:
      "Paste the URL on /projects/new and we'll accelerate it. Crontech can take over hosting, add AI features on top, or port it piece by piece — your call.",
  },
];

// ── Vertical tile ──────────────────────────────────────────────────
// Real anchor tags so crawlers can follow every tile into the builder.
// No onClick-on-div patterns — SEO and keyboard users both win.

function VerticalTile(props: Vertical): JSX.Element {
  return (
    <A
      href={props.href}
      class="landing-card group block h-full p-7 transition-transform hover:-translate-y-0.5"
      aria-label={`Start building a ${props.title.toLowerCase()} with Crontech`}
    >
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

        <span
          class="mt-auto inline-flex items-center gap-1 pt-2 text-[0.8125rem] font-semibold"
          style={{ color: "#6366f1" }}
        >
          Start building <span aria-hidden="true">&#8594;</span>
        </span>
      </div>
    </A>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function Solutions(): JSX.Element {
  return (
    <>
      <SEOHead
        title={"Solutions — One platform. Every business."}
        description="From online stores to nonprofits, Crontech powers the internet part so you can focus on your customers. AI-native, Claude-powered, built to scale with you."
        path="/solutions"
      />

      <div>
        {/* ── Hero (dark) ───────────────────────────────────────── */}
        <section class="landing-hero">
          <div class="relative z-10 mx-auto max-w-[1120px] px-6 pt-32 pb-24 md:pt-40 md:pb-28 lg:px-8 lg:pt-44 lg:pb-32">
            <div class="flex flex-col items-center text-center">
              <div class="landing-hero-badge mb-10">
                <span class="landing-hero-badge-dot" aria-hidden="true" />
                <span class="landing-hero-badge-text">
                  Built for every marketplace &mdash; not just developers
                </span>
              </div>

              <h1
                class="max-w-4xl text-[2.75rem] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[3.5rem] lg:text-[4.5rem]"
                style={{ color: "#f8fafc" }}
              >
                One platform.{" "}
                <span class="landing-gradient-text">Every business.</span>
              </h1>

              <p
                class="mt-8 max-w-3xl text-[1.125rem] leading-[1.7] sm:text-[1.1875rem] lg:text-xl"
                style={{ color: "rgba(248,250,252,0.78)" }}
              >
                From online stores to nonprofits, Crontech powers the internet
                part so you can focus on your customers. AI-native,
                Claude-powered, built to scale with you.
              </p>

              <div class="mt-12 flex flex-col items-center gap-4 sm:flex-row">
                <A href="/register">
                  <button class="landing-hero-btn-primary-dark" type="button">
                    Get started &#8594;
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

        {/* ── 10 vertical tiles (light) ────────────────────────── */}
        <section class="landing-dark-section py-28 lg:py-36">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="mb-16 flex flex-col items-center text-center">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#6366f1" }}
                />
                Pick your starting line
              </div>
              <h2
                class="max-w-3xl text-[2rem] font-bold tracking-tight sm:text-[2.5rem] lg:text-[2.75rem]"
                style={{ color: "#0f172a" }}
              >
                Ten ways to start. One platform underneath.
              </h2>
              <p
                class="mt-5 max-w-2xl text-[1.0625rem] leading-[1.7]"
                style={{ color: "#64748b" }}
              >
                Every tile is a real starter project with hosting, payments,
                auth, and AI wired in. Pick the one that looks most like your
                business and the AI Builder takes it from there.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              <For each={verticals}>
                {(vertical) => (
                  <VerticalTile
                    emoji={vertical.emoji}
                    eyebrow={vertical.eyebrow}
                    title={vertical.title}
                    valueProp={vertical.valueProp}
                    href={vertical.href}
                  />
                )}
              </For>
            </div>
          </div>
        </section>

        {/* ── Mission strip (light, honest) ─────────────────────── */}
        <section class="landing-dark-section-alt py-24 lg:py-28">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <div class="max-w-3xl">
              <div class="landing-section-label">
                <div
                  class="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#8b5cf6" }}
                />
                Why we're building this
              </div>
              <p
                class="mt-6 text-[1.0625rem] leading-[1.8] sm:text-[1.125rem]"
                style={{ color: "#334155" }}
              >
                We&apos;re building Crontech to make it cheap and fast for
                anyone to start a business, employ people, and serve customers.
                The internet should be open to everyone &mdash; not gated by
                whether you can afford a dev team or figure out how ten
                different SaaS tools fit together. If you&apos;ve got an idea
                and a customer, the platform should get out of your way.
              </p>
            </div>
          </div>
        </section>

        {/* ── "Not sure where to start?" card (dark) ─────────────── */}
        <section class="landing-dark-section py-24 lg:py-32">
          <div class="mx-auto max-w-[1120px] px-6 lg:px-8">
            <A
              href="/builder"
              class="landing-card group block overflow-hidden p-10 transition-transform hover:-translate-y-0.5 lg:p-14"
              aria-label="Tell us your idea and Claude will build a starter"
            >
              <div
                class="absolute top-0 left-0 right-0 h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)",
                }}
                aria-hidden="true"
              />
              <div class="flex flex-col items-start gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
                <div class="flex flex-col gap-3">
                  <span
                    class="text-[11px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: "#6366f1" }}
                  >
                    Not sure where to start?
                  </span>
                  <h3
                    class="text-[1.5rem] font-bold tracking-tight sm:text-[1.875rem]"
                    style={{ color: "#0f172a" }}
                  >
                    Tell us your idea. Claude will build a starter for you.
                  </h3>
                  <p
                    class="max-w-2xl text-[0.9375rem] leading-[1.7]"
                    style={{ color: "#475569" }}
                  >
                    Describe what you want to build in plain English. The AI
                    Builder picks the right stack, wires the integrations, and
                    hands you a running project you can edit or ship as-is.
                  </p>
                </div>
                <span
                  class="inline-flex shrink-0 items-center gap-2 text-[0.9375rem] font-semibold"
                  style={{ color: "#6366f1" }}
                >
                  Open the AI Builder <span aria-hidden="true">&#8594;</span>
                </span>
              </div>
            </A>
          </div>
        </section>

        {/* ── FAQ (light) ───────────────────────────────────────── */}
        <section class="landing-dark-section-alt py-28 lg:py-36">
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
              Whatever you&apos;re{" "}
              <span class="landing-gradient-text">shipping</span>, start here.
            </h2>
            <p
              class="mt-6 text-[1.0625rem] leading-[1.7] sm:text-lg"
              style={{ color: "rgba(226,232,240,0.78)" }}
            >
              Free to start. No credit card. Upgrade when your business does.
            </p>
            <div class="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <A href="/register">
                <button class="landing-hero-btn-primary-dark" type="button">
                  Get started &#8594;
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
