import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Badge } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";
import { trpc } from "../lib/trpc";

type SupportCategory =
  | "technical"
  | "billing"
  | "bug"
  | "feature"
  | "sales"
  | "other";

// ── Types ───────────────────────────────────────────────────────────

interface FAQItem {
  question: string;
  answer: string;
}

interface QuickLinkCard {
  icon: string;
  title: string;
  description: string;
  href: string;
  gradient: string;
}

// ── Data ────────────────────────────────────────────────────────────

const QUICK_LINKS: QuickLinkCard[] = [
  {
    icon: "\uD83D\uDCD6",
    title: "Documentation",
    description:
      "Guides, API references, and tutorials for every feature in the platform.",
    href: "/docs",
    gradient: "var(--color-primary)",
  },
  {
    icon: "\uD83D\uDC65",
    title: "Community",
    description:
      "Join thousands of developers building with Crontech on Discord.",
    href: "https://discord.gg/crontech",
    gradient: "var(--color-primary)",
  },
  {
    icon: "\uD83D\uDFE2",
    title: "API Status",
    description:
      "Real-time operational status for all platform services.",
    href: "/status",
    gradient: "var(--color-success)",
  },
  {
    icon: "\u2709\uFE0F",
    title: "Contact Sales",
    description:
      "Enterprise plans, SLAs, and custom deployments for large teams.",
    href: "mailto:sales@crontech.dev",
    gradient: "var(--color-warning)",
  },
];

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "What is Crontech and how is it different from other platforms?",
    answer:
      "Crontech is the first AI-native full-stack platform that unifies client GPU, edge, and cloud computing into a single runtime. Unlike platforms that bolt AI on as an afterthought, every layer of Crontech — from routing to data fetching to error recovery — has AI woven into its architecture. You get three-tier compute routing, real-time collaboration with AI agents as first-class participants, and WebGPU inference at zero cost per token.",
  },
  {
    question: "How does three-tier compute routing work?",
    answer:
      "AI workloads automatically flow between three compute tiers based on model size, device capability, and latency requirements. Client-side GPU inference via WebGPU handles models under 2B parameters at zero cost. Cloudflare Workers handle mid-range tasks at the edge with sub-50ms latency across 330+ cities. Cloud GPUs (A100/H100 via Modal.com) handle heavy inference, training, and video processing. The platform decides where to run each computation — you never think about deployment targets.",
  },
  {
    question: "What frameworks and languages does Crontech support?",
    answer:
      "The frontend is built on SolidJS with SolidStart for the fastest possible reactive UI — true signals with no virtual DOM overhead. The backend runs on Hono (4x faster than Express) with Bun as the runtime. Everything is TypeScript with strict mode enforced end-to-end. tRPC provides type-safe API calls from database to DOM with zero codegen. For performance-critical microservices, Axum (Rust) handles video processing and heavy compute.",
  },
  {
    question: "Is my data secure on the platform?",
    answer:
      "Security is built into every layer. Authentication uses FIDO2 passkeys — phishing-immune by design. All data is encrypted in transit (TLS 1.3) and at rest (AES-256-GCM). The immutable audit trail uses hash-chained entries with cryptographic signatures. The platform targets SOC 2 Type II, HIPAA, GDPR, and FedRAMP compliance. Zero-trust architecture means every request is authenticated and authorized regardless of network location.",
  },
  {
    question: "Can I use Crontech for real-time collaborative applications?",
    answer:
      "Absolutely. Crontech includes Yjs CRDTs for conflict-free real-time state synchronization. Multiple users and AI agents can edit the same document simultaneously with automatic conflict resolution and sub-50ms global latency. AI agents participate as first-class collaborators — they hold cursors, make selections, and contribute alongside human users. WebSocket and SSE connections are managed automatically.",
  },
  {
    question: "How much does Crontech cost?",
    answer:
      "Crontech offers a free tier with one project, basic AI builder access, and community support. The Pro plan at $29/month unlocks unlimited projects, advanced AI builder, video editor, real-time collaboration, and unlimited AI generations. Enterprise plans start at $99/month with SSO/SAML, SLA guarantees, dedicated support, and the Sentinel competitive intelligence system. Client-side AI inference via WebGPU is always free — your users' GPUs do the work.",
  },
  {
    question: "How do I deploy my project?",
    answer:
      "Deployment is a single command. Your web app deploys to Cloudflare Pages with edge-first rendering. Your API deploys to Cloudflare Workers with sub-5ms cold starts across 330+ cities. GPU workloads deploy to Modal.com with auto-scaling H100 clusters. The CI/CD pipeline handles canary deployments, rollbacks, and blue-green strategies automatically based on the risk level of your changes.",
  },
  {
    question: "What support channels are available?",
    answer:
      "Free tier users have access to community support via Discord and GitHub discussions. Pro users get priority support with most replies within minutes — our AI support agent handles common questions instantly, and anything it cannot answer goes straight to a human teammate. Enterprise users get dedicated support with SLA-backed response times, a named account manager, and direct Slack/Teams integration.",
  },
];

const SUBJECT_OPTIONS = [
  { value: "technical", label: "Technical Question" },
  { value: "billing", label: "Billing & Subscriptions" },
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature Request" },
  { value: "sales", label: "Sales & Enterprise" },
  { value: "other", label: "Something Else" },
];

// ── FAQ Accordion Item ──────────────────────────────────────────────

function FAQAccordion(props: { item: FAQItem; index: number }): JSX.Element {
  const [open, setOpen] = createSignal(false);

  return (
    <div
      class="border-b transition-colors duration-200"
      style={{ "border-color": "var(--color-border)" }}
    >
      <button
        type="button"
        class="flex w-full items-center justify-between py-5 text-left transition-colors"
        style={{ color: "var(--color-text-secondary)" }}
        onClick={() => setOpen(!open())}
      >
        <span class="text-sm font-medium pr-8 leading-relaxed">
          {props.item.question}
        </span>
        <svg
          class="h-5 w-5 shrink-0 transition-transform duration-300"
          style={{
            transform: open() ? "rotate(180deg)" : "rotate(0deg)",
            color: "var(--color-text-faint)",
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <Show when={open()}>
        <div class="pb-5 pr-12">
          <p class="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            {props.item.answer}
          </p>
        </div>
      </Show>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function SupportPage(): JSX.Element {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [subject, setSubject] = createSignal<SupportCategory>("technical");
  const [message, setMessage] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [submitted, setSubmitted] = createSignal(false);
  const [errorText, setErrorText] = createSignal<string | null>(null);

  const handleSubmit = async (e: SubmitEvent): Promise<void> => {
    e.preventDefault();
    setErrorText(null);
    if (
      name().trim().length < 2 ||
      !email().includes("@") ||
      message().trim().length < 10
    ) {
      setErrorText(
        "Please fill in your name, a valid email, and a message of at least 10 characters.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await trpc.support.submitPublic.mutate({
        name: name().trim(),
        email: email().trim(),
        category: subject(),
        message: message().trim(),
      });
      setSubmitted(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "We couldn't send that right now — please try again in a moment, or email support@crontech.ai directly.";
      setErrorText(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEOHead
        title="Support"
        description="Get help with Crontech. Browse documentation, join the community, check system status, or contact our support team."
        path="/support"
      />

      <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
        {/* ── Hero ───────────────────────────────────────────────── */}
        <div class="relative overflow-hidden">
          <div
            class="absolute inset-0 opacity-25"
            style={{
              background:
                "radial-gradient(ellipse at 40% 50%, color-mix(in oklab, var(--color-primary) 12%, transparent) 0%, transparent 50%), radial-gradient(ellipse at 60% 30%, color-mix(in oklab, var(--color-primary) 10%, transparent) 0%, transparent 50%)",
            }}
          />

          <div class="relative mx-auto max-w-5xl px-6 pt-20 pb-12">
            <div class="flex flex-col items-center text-center">
              <h1
                class="text-5xl font-bold tracking-tight sm:text-6xl"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-text) 0%, var(--color-primary-hover) 50%, var(--color-primary) 100%)",
                  "-webkit-background-clip": "text",
                  "-webkit-text-fill-color": "transparent",
                  "line-height": "1.1",
                }}
              >
                How can we help?
              </h1>
              <p class="mt-4 max-w-xl text-lg" style={{ color: "var(--color-text-muted)" }}>
                Most replies arrive within minutes. Our AI handles the
                common questions instantly — everything else goes straight
                to a human teammate.
              </p>

              {/* Search bar */}
              <div class="mt-8 w-full max-w-xl">
                <div
                  class="relative rounded-2xl border border-[var(--color-border)] overflow-hidden"
                  style={{
                    background: "var(--color-bg-subtle)",
                    "backdrop-filter": "blur(12px)",
                  }}
                >
                  <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <svg
                      class="h-5 w-5"
                      style={{ color: "var(--color-text-faint)" }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search for answers..."
                    aria-label="Search support articles"
                    class="w-full bg-transparent py-4 pl-12 pr-4 outline-none text-sm"
                    style={{ color: "var(--color-text)", "--tw-placeholder-color": "var(--color-text-faint)" } as JSX.CSSProperties}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Link Cards ────────────────────────────────────── */}
        <div class="mx-auto max-w-5xl px-6 pb-16">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <For each={QUICK_LINKS}>
              {(link) => (
                <A
                  href={link.href}
                  class="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] p-6 transition-all duration-300 hover:scale-[1.02] hover:border-[var(--color-border-strong)]"
                  style={{
                    background: "var(--color-bg-subtle)",
                    "backdrop-filter": "blur(12px)",
                    "text-decoration": "none",
                  }}
                >
                  {/* Gradient accent */}
                  <div
                    class="absolute inset-x-0 top-0 h-[2px] opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: link.gradient }}
                  />

                  <div
                    class="flex h-10 w-10 items-center justify-center rounded-xl text-lg mb-4"
                    style={{ background: link.gradient }}
                  >
                    {link.icon}
                  </div>
                  <p class="text-sm font-semibold mb-1 transition-colors" style={{ color: "var(--color-text)" }}>
                    {link.title}
                  </p>
                  <p class="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                    {link.description}
                  </p>
                </A>
              )}
            </For>
          </div>
        </div>

        {/* ── FAQ Section ─────────────────────────────────────────── */}
        <div class="mx-auto max-w-3xl px-6 pb-16">
          <div class="text-center mb-10">
            <Badge variant="info" size="sm">
              FAQ
            </Badge>
            <h2 class="mt-4 text-2xl font-bold" style={{ color: "var(--color-text)" }}>
              Frequently asked questions
            </h2>
            <p class="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Quick answers to the most common questions about the
              platform
            </p>
          </div>

          <div
            class="rounded-2xl border border-[var(--color-border)] px-6"
            style={{
              background: "var(--color-bg-subtle)",
              "backdrop-filter": "blur(12px)",
            }}
          >
            <For each={FAQ_ITEMS}>
              {(item, index) => (
                <FAQAccordion item={item} index={index()} />
              )}
            </For>
          </div>
        </div>

        {/* ── Contact Form ────────────────────────────────────────── */}
        <div class="mx-auto max-w-3xl px-6 pb-16">
          <div class="text-center mb-10">
            <h2 class="text-2xl font-bold" style={{ color: "var(--color-text)" }}>
              Send us a message
            </h2>
            <p class="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Cannot find what you need? Our team typically responds
              within 5 minutes during business hours
            </p>
          </div>

          <div
            class="rounded-2xl border border-[var(--color-border)] p-8"
            style={{
              background: "var(--color-bg-subtle)",
              "backdrop-filter": "blur(12px)",
            }}
          >
            <Show
              when={!submitted()}
              fallback={
                <div class="py-12 text-center">
                  <div class="text-4xl mb-4">{"\u2705"}</div>
                  <h3 class="text-lg font-semibold mb-2" style={{ color: "var(--color-text)" }}>
                    Message sent
                  </h3>
                  <p class="text-sm mb-6" style={{ color: "var(--color-text-muted)" }}>
                    We received your message and will respond shortly.
                    Check your inbox.
                  </p>
                  <button
                    type="button"
                    class="rounded-xl px-5 py-2.5 text-sm transition-colors"
                    style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)" }}
                    onClick={() => setSubmitted(false)}
                  >
                    Send another message
                  </button>
                </div>
              }
            >
              <form
                onSubmit={(e) => {
                  void handleSubmit(e);
                }}
                class="space-y-5"
              >
                <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {/* Name */}
                  <div>
                    <label
                      for="support-name"
                      class="block text-xs font-medium mb-1.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Name
                    </label>
                    <input
                      id="support-name"
                      type="text"
                      placeholder="Your name"
                      value={name()}
                      onInput={(e) =>
                        setName(e.currentTarget.value)
                      }
                      required
                      class="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none transition-colors"
                      style={{ background: "var(--color-bg-subtle)", color: "var(--color-text)" }}
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label
                      for="support-email"
                      class="block text-xs font-medium mb-1.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Email
                    </label>
                    <input
                      id="support-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email()}
                      onInput={(e) =>
                        setEmail(e.currentTarget.value)
                      }
                      required
                      class="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none transition-colors"
                      style={{ background: "var(--color-bg-subtle)", color: "var(--color-text)" }}
                    />
                  </div>
                </div>

                {/* Subject dropdown */}
                <div>
                  <label
                    for="support-subject"
                    class="block text-xs font-medium mb-1.5"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Subject
                  </label>
                  <select
                    id="support-subject"
                    value={subject()}
                    onChange={(e) =>
                      setSubject(e.currentTarget.value as SupportCategory)
                    }
                    class="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none transition-colors appearance-none"
                    style={{
                      background: "var(--color-bg-elevated)",
                      color: "var(--color-text-secondary)",
                      "background-image":
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='currentColor' opacity='0.3' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E\")",
                      "background-repeat": "no-repeat",
                      "background-position": "right 16px center",
                    }}
                  >
                    <For each={SUBJECT_OPTIONS}>
                      {(opt) => (
                        <option value={opt.value}>{opt.label}</option>
                      )}
                    </For>
                  </select>
                </div>

                {/* Message textarea */}
                <div>
                  <label
                    for="support-message"
                    class="block text-xs font-medium mb-1.5"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Message
                  </label>
                  <textarea
                    id="support-message"
                    placeholder="Describe what you need. The more detail, the faster the answer."
                    value={message()}
                    onInput={(e) =>
                      setMessage(e.currentTarget.value)
                    }
                    required
                    rows={6}
                    class="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none transition-colors resize-none"
                    style={{ background: "var(--color-bg-subtle)", color: "var(--color-text)" }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting()}
                  class="w-full rounded-xl py-3 text-sm font-semibold transition-all duration-200 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "var(--color-primary)",
                    color: "var(--color-text)",
                  }}
                >
                  {submitting()
                    ? "Sending..."
                    : "Send Message"}
                </button>

                <Show when={errorText()}>
                  <p
                    role="alert"
                    class="rounded-lg border px-3 py-2 text-xs"
                    style={{
                      "border-color": "color-mix(in oklab, var(--color-error) 40%, transparent)",
                      background: "color-mix(in oklab, var(--color-error) 10%, transparent)",
                      color: "var(--color-error)",
                    }}
                  >
                    {errorText()}
                  </p>
                </Show>
              </form>
            </Show>
          </div>
        </div>

        {/* ── Community Section ───────────────────────────────────── */}
        <div class="mx-auto max-w-5xl px-6 pb-20">
          <div
            class="rounded-2xl border border-[var(--color-border)] p-10"
            style={{
              background: "color-mix(in oklab, var(--color-primary) 5%, var(--color-bg))",
              "backdrop-filter": "blur(12px)",
            }}
          >
            <div class="text-center mb-8">
              <h2 class="text-2xl font-bold" style={{ color: "var(--color-text)" }}>
                Join the community
              </h2>
              <p class="mt-2 text-sm max-w-lg mx-auto" style={{ color: "var(--color-text-muted)" }}>
                Connect with thousands of developers building the next
                generation of AI-powered applications. Get help, share
                ideas, and contribute to the platform.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-lg mx-auto">
              {/* Discord */}
              <a
                href="https://discord.gg/crontech"
                target="_blank"
                rel="noopener noreferrer"
                class="group flex items-center gap-4 rounded-xl border border-[var(--color-border)] p-4 transition-all duration-200 hover:border-[var(--color-border-strong)]"
                style={{ "text-decoration": "none", background: "var(--color-bg-subtle)" }}
              >
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
                  style={{ background: "color-mix(in oklab, var(--color-primary) 15%, transparent)" }}
                >
                  <svg
                    class="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="rgb(88,101,242)"
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                  </svg>
                </div>
                <div>
                  <span class="block text-sm font-semibold transition-colors" style={{ color: "var(--color-text)" }}>
                    Discord
                  </span>
                  <span class="block text-xs" style={{ color: "var(--color-text-faint)" }}>
                    Chat with the community
                  </span>
                </div>
              </a>

              {/* GitHub */}
              <a
                href="https://github.com/crontech-dev"
                target="_blank"
                rel="noopener noreferrer"
                class="group flex items-center gap-4 rounded-xl border border-[var(--color-border)] p-4 transition-all duration-200 hover:border-[var(--color-border-strong)]"
                style={{ "text-decoration": "none", background: "var(--color-bg-subtle)" }}
              >
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
                  style={{ background: "var(--color-bg-elevated)" }}
                >
                  <svg
                    class="h-5 w-5"
                    viewBox="0 0 24 24"
                    style={{ fill: "var(--color-text)" }}
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </div>
                <div>
                  <span class="block text-sm font-semibold transition-colors" style={{ color: "var(--color-text)" }}>
                    GitHub
                  </span>
                  <span class="block text-xs" style={{ color: "var(--color-text-faint)" }}>
                    Browse source and issues
                  </span>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
