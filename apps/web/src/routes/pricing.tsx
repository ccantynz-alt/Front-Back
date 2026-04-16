import { Title } from "@solidjs/meta";
import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";

// ── Types ────────────────────────────────────────────────────────────

interface PlanTier {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  features: string[];
  highlighted: boolean;
  ctaLabel: string;
  accentColor: string;
}

interface FAQItem {
  question: string;
  answer: string;
}

// ── Data ─────────────────────────────────────────────────────────────

const PLANS: PlanTier[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    description: "For individuals exploring AI-powered development",
    features: [
      "1 project",
      "5 AI generations per day",
      "Client-side GPU inference",
      "Community support",
      "Basic templates",
      "1 GB storage",
    ],
    highlighted: false,
    ctaLabel: "Start free",
    accentColor: "#6b7280",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 29,
    annualPrice: 24,
    description: "For developers and teams shipping AI-native products",
    features: [
      "Unlimited projects",
      "Unlimited AI generations",
      "Three-tier compute (GPU + Edge + Cloud)",
      "Real-time collaboration",
      "Advanced AI agents",
      "Video editor access",
      "Custom AI agent builder",
      "Priority support",
      "50 GB storage",
      "API access",
    ],
    highlighted: true,
    ctaLabel: "Start building",
    accentColor: "#3b82f6",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: -1,
    annualPrice: -1,
    description: "For organizations requiring scale, security, and compliance",
    features: [
      "Everything in Pro",
      "Sentinel competitive intelligence",
      "SSO / SAML / SCIM",
      "SOC 2 Type II compliance",
      "Dedicated H100 GPU allocation",
      "Custom AI model fine-tuning",
      "On-premise deployment option",
      "Dedicated account manager",
      "SLA guarantee (99.99%)",
      "Unlimited storage",
      "Audit logs and RBAC",
      "Custom integrations",
    ],
    highlighted: false,
    ctaLabel: "Talk to the team",
    accentColor: "#a78bfa",
  },
];

const COMPARISON_FEATURES = [
  { name: "Projects", free: "1", pro: "Unlimited", enterprise: "Unlimited" },
  { name: "AI Generations", free: "5/day", pro: "Unlimited", enterprise: "Unlimited" },
  { name: "Client GPU Inference", free: true, pro: true, enterprise: true },
  { name: "Edge Compute", free: false, pro: true, enterprise: true },
  { name: "Cloud GPU (H100)", free: false, pro: true, enterprise: "Dedicated" },
  { name: "Real-time Collaboration", free: false, pro: true, enterprise: true },
  { name: "AI Agent Builder", free: false, pro: true, enterprise: true },
  { name: "Video Editor", free: false, pro: true, enterprise: true },
  { name: "API Access", free: false, pro: true, enterprise: true },
  { name: "SSO / SAML", free: false, pro: false, enterprise: true },
  { name: "Sentinel Intelligence", free: false, pro: false, enterprise: true },
  { name: "Custom Integrations", free: false, pro: false, enterprise: true },
  { name: "SLA Guarantee", free: false, pro: false, enterprise: "99.99%" },
  { name: "Support", free: "Community", pro: "Priority", enterprise: "Dedicated" },
  { name: "Storage", free: "1 GB", pro: "50 GB", enterprise: "Unlimited" },
];

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Can I run AI models for free?",
    answer: "Yes. Client-side GPU inference via WebGPU is completely free on all plans. Models like Llama 3.1 8B run at 41 tokens/second directly in your browser. You pay nothing for these tokens -- your device does the work.",
  },
  {
    question: "What happens when I hit the free tier limits?",
    answer: "Your existing projects continue to work. You simply cannot create new AI generations beyond the daily limit. Upgrade to Pro anytime to unlock unlimited generations and access to edge and cloud compute tiers.",
  },
  {
    question: "How does the three-tier compute model work?",
    answer: "Workloads automatically route to the optimal tier: your browser GPU for small models (free), Cloudflare edge network for mid-range tasks (sub-50ms latency), or H100 cloud GPUs for heavy inference and training. The platform handles routing transparently.",
  },
  {
    question: "Can I switch plans at any time?",
    answer: "Yes. Upgrade or downgrade instantly. When upgrading, you get immediate access to all new features. When downgrading, your current billing period completes before the change takes effect. No lock-in contracts.",
  },
  {
    question: "Do you offer discounts for startups or open-source projects?",
    answer: "Yes. We offer 50% off Pro for verified startups (under $5M ARR) and free Pro access for qualifying open-source projects. Contact our sales team with details about your project.",
  },
];

// ── Plan Card ────────────────────────────────────────────────────────

function PlanCard(props: { plan: PlanTier; isAnnual: boolean }): JSX.Element {
  const price = (): number => props.isAnnual ? props.plan.annualPrice : props.plan.monthlyPrice;
  const isCustom = (): boolean => props.plan.monthlyPrice === -1;

  const handleCtaClick = (): void => {
    if (props.plan.id === "enterprise") {
      window.location.href = "/support?topic=enterprise";
    } else if (props.plan.id === "pro") {
      window.location.href = "/register?plan=pro&billing=" + (props.isAnnual ? "annual" : "monthly");
    } else {
      window.location.href = "/register?plan=free";
    }
  };

  return (
    <div
      class={`relative flex flex-col rounded-2xl p-6 transition-all duration-300 ${
        props.plan.highlighted
          ? "shadow-2xl"
          : ""
      }`}
      style={{
        background: props.plan.highlighted
          ? "var(--color-bg-elevated)"
          : "var(--color-bg-subtle)",
        border: props.plan.highlighted
          ? "1px solid var(--color-primary)"
          : "1px solid var(--color-border)",
      }}
    >
      {/* Popular badge */}
      <Show when={props.plan.highlighted}>
        <div class="absolute -top-3 left-1/2 -translate-x-1/2">
          <span
            class="rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "var(--color-primary)", color: "var(--color-primary-text)" }}
          >
            Most Popular
          </span>
        </div>
      </Show>

      {/* Header */}
      <div class="mb-6">
        <div class="flex items-center gap-2">
          <h3 class="text-lg font-bold" style={{ color: "var(--color-text)" }}>{props.plan.name}</h3>
        </div>
        <p class="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{props.plan.description}</p>
      </div>

      {/* Price */}
      <div class="mb-6">
        <Show
          when={!isCustom()}
          fallback={
            <div>
              <span class="text-4xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>Custom</span>
              <p class="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>Tailored to your needs</p>
            </div>
          }
        >
          <div class="flex items-baseline gap-1">
            <span class="text-4xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>${price()}</span>
            <span class="text-sm" style={{ color: "var(--color-text-muted)" }}>/mo</span>
          </div>
          <Show when={props.isAnnual && price() > 0}>
            <p class="mt-1 text-xs" style={{ color: "var(--color-success)" }}>
              Save ${(props.plan.monthlyPrice - props.plan.annualPrice) * 12}/year
            </p>
          </Show>
        </Show>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={handleCtaClick}
        class={`mb-6 w-full rounded-xl py-3 text-sm font-semibold transition-all duration-200 ${
          props.plan.highlighted
            ? "hover:brightness-110"
            : ""
        }`}
        style={{
          background: props.plan.highlighted
            ? "var(--color-primary)"
            : "var(--color-bg-muted)",
          color: props.plan.highlighted
            ? "var(--color-primary-text)"
            : "var(--color-text-secondary)",
          border: props.plan.highlighted
            ? "none"
            : "1px solid var(--color-border)",
        }}
      >
        {props.plan.ctaLabel}
      </button>

      {/* Features */}
      <div class="flex flex-col gap-3">
        <For each={props.plan.features}>
          {(feature) => (
            <div class="flex items-start gap-2.5">
              <span class="mt-0.5 text-sm" style={{ color: props.plan.accentColor }}>&#10003;</span>
              <span class="text-sm" style={{ color: "var(--color-text-secondary)" }}>{feature}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

// ── FAQ Item ─────────────────────────────────────────────────────────

function FAQSection(props: { item: FAQItem }): JSX.Element {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <div style={{ "border-bottom": "1px solid var(--color-border)" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen())}
        class="flex w-full items-center justify-between py-5 text-left transition-colors duration-200"
      >
        <span class="pr-8 text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>{props.item.question}</span>
        <span class={`shrink-0 text-lg transition-transform duration-300 ${isOpen() ? "rotate-45" : ""}`} style={{ color: "var(--color-text-muted)" }}>+</span>
      </button>
      <Show when={isOpen()}>
        <div class="pb-5">
          <p class="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{props.item.answer}</p>
        </div>
      </Show>
    </div>
  );
}

// ── Feature Check Cell ───────────────────────────────────────────────

function FeatureCell(props: { value: boolean | string }): JSX.Element {
  return (
    <td class="px-4 py-3 text-center text-sm">
      <Show
        when={typeof props.value === "string"}
        fallback={
          <Show
            when={props.value === true}
            fallback={<span style={{ color: "var(--color-text-faint)" }}>--</span>}
          >
            <span style={{ color: "var(--color-success)" }}>&#10003;</span>
          </Show>
        }
      >
        <span style={{ color: "var(--color-text-secondary)" }}>{props.value as string}</span>
      </Show>
    </td>
  );
}

// ── Pricing Page ─────────────────────────────────────────────────────

export default function PricingPage(): JSX.Element {
  const [isAnnual, setIsAnnual] = createSignal(true);

  return (
    <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Pricing — Crontech</Title>

      {/* Hero */}
      <div class="relative overflow-hidden">
        <div class="relative mx-auto max-w-6xl px-6 pt-16 pb-12 text-center">
          <h1 class="text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: "var(--color-text)" }}>
            Pricing that scales with what you ship
          </h1>
          <p class="mx-auto mt-4 max-w-2xl text-base" style={{ color: "var(--color-text-muted)" }}>
            Free to start. On-device AI inference at $0. Edge and cloud compute when you need more power. No hidden fees, no surprise bills, no credit card to begin.
          </p>

          {/* Billing Toggle */}
          <div class="mt-8 flex items-center justify-center gap-4">
            <span
              class="text-sm font-medium transition-colors"
              style={{ color: !isAnnual() ? "var(--color-text)" : "var(--color-text-muted)" }}
            >Monthly</span>
            <button
              type="button"
              onClick={() => setIsAnnual(!isAnnual())}
              class="relative h-7 w-14 rounded-full transition-all duration-300"
              style={{ background: isAnnual() ? "var(--color-primary)" : "var(--color-bg-muted)" }}
            >
              <div
                class={`absolute top-0.5 h-6 w-6 rounded-full shadow-md transition-all duration-300 ${isAnnual() ? "left-[30px]" : "left-0.5"}`}
                style={{ background: "var(--color-text)" }}
              />
            </button>
            <span
              class="text-sm font-medium transition-colors"
              style={{ color: isAnnual() ? "var(--color-text)" : "var(--color-text-muted)" }}
            >
              Annual
              <span
                class="ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
              >Save 17%</span>
            </span>
          </div>
        </div>
      </div>

      {/* Founding customer banner */}
      <div class="mx-auto max-w-4xl px-6 pb-10">
        <div
          class="rounded-2xl px-6 py-5 text-center"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
        >
          <p class="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-primary-light)" }}>
            Founding customer program · private beta
          </p>
          <p class="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            The first wave of paid customers lock in <span class="font-semibold" style={{ color: "var(--color-text)" }}>50% off any plan for life</span> and a direct line to the team building the platform.
          </p>
        </div>
      </div>

      {/* Plan Cards */}
      <div class="mx-auto max-w-6xl px-6 pb-16">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
          <For each={PLANS}>
            {(plan) => <PlanCard plan={plan} isAnnual={isAnnual()} />}
          </For>
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div class="mx-auto max-w-5xl px-6 pb-20">
        <h2 class="mb-8 text-center text-2xl font-bold" style={{ color: "var(--color-text)" }}>Feature Comparison</h2>
        <div
          class="overflow-hidden rounded-2xl"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
        >
          <table class="w-full">
            <thead>
              <tr style={{ "border-bottom": "1px solid var(--color-border-strong)" }}>
                <th class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Feature</th>
                <th class="px-4 py-4 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Free</th>
                <th class="px-4 py-4 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-primary)" }}>Pro</th>
                <th class="px-4 py-4 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-primary-light)" }}>Enterprise</th>
              </tr>
            </thead>
            <tbody>
              <For each={COMPARISON_FEATURES}>
                {(feature) => (
                  <tr
                    class="transition-colors"
                    style={{ "border-bottom": "1px solid var(--color-border)" }}
                  >
                    <td class="px-6 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>{feature.name}</td>
                    <FeatureCell value={feature.free} />
                    <FeatureCell value={feature.pro} />
                    <FeatureCell value={feature.enterprise} />
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div class="mx-auto max-w-3xl px-6 pb-20">
        <h2 class="mb-8 text-center text-2xl font-bold" style={{ color: "var(--color-text)" }}>Frequently Asked Questions</h2>
        <div
          class="rounded-2xl px-6"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
        >
          <For each={FAQ_ITEMS}>
            {(item) => <FAQSection item={item} />}
          </For>
        </div>
      </div>

      {/* CTA Banner */}
      <div class="mx-auto max-w-4xl px-6 pb-20">
        <div
          class="relative overflow-hidden rounded-2xl px-8 py-12 text-center"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
        >
          <div class="relative">
            <h3 class="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Ready to build on the next decade's stack?</h3>
            <p class="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Start free with on-device AI inference. Upgrade when you need the edge or the cloud.
            </p>
            <div class="mt-6 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => { window.location.href = "/register?plan=free"; }}
                class="rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-200 hover:brightness-110"
                style={{ background: "var(--color-primary)", color: "var(--color-primary-text)" }}
              >
                Start building
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = "/support?topic=enterprise"; }}
                class="rounded-xl px-8 py-3 text-sm font-medium transition-all"
                style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
              >
                Talk to the team
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
