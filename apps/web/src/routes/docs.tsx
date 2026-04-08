import { createSignal, For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";

// ── Types ───────────────────────────────────────────────────────────

interface DocCategory {
  id: string;
  icon: string;
  title: string;
  description: string;
  articles: number;
  tags: string[];
  gradient: string;
}

interface QuickLink {
  label: string;
  href: string;
  description: string;
}

// ── Documentation Categories ────────────────────────────────────────

const DOC_CATEGORIES: DocCategory[] = [
  {
    id: "getting-started",
    icon: "\u26A1",
    title: "Getting Started",
    description:
      "Set up your first project in under five minutes. Install the CLI, scaffold an app, deploy to the edge, and see it live.",
    articles: 12,
    tags: ["setup", "quickstart", "install"],
    gradient: "from-violet-600 to-indigo-600",
  },
  {
    id: "api-reference",
    icon: "\u2699\uFE0F",
    title: "API Reference",
    description:
      "Full reference for every tRPC procedure, REST endpoint, and WebSocket channel. Type-safe schemas, request/response shapes, and curl examples.",
    articles: 34,
    tags: ["tRPC", "REST", "WebSocket", "endpoints"],
    gradient: "from-blue-600 to-cyan-600",
  },
  {
    id: "ai-sdk",
    icon: "\uD83E\uDDE0",
    title: "AI SDK",
    description:
      "Three-tier compute routing, client-side WebGPU inference, streaming completions, generative UI, and multi-agent orchestration with LangGraph.",
    articles: 18,
    tags: ["AI", "WebGPU", "inference", "agents"],
    gradient: "from-purple-600 to-pink-600",
  },
  {
    id: "components",
    icon: "\uD83E\uDDE9",
    title: "Components",
    description:
      "Zod-schema-driven, AI-composable component catalog. Every primitive from Button to DataTable, with live examples and prop documentation.",
    articles: 42,
    tags: ["UI", "Zod", "SolidJS", "catalog"],
    gradient: "from-emerald-600 to-teal-600",
  },
  {
    id: "deployment",
    icon: "\uD83D\uDE80",
    title: "Deployment",
    description:
      "Deploy to Cloudflare Workers, Pages, Fly.io, and Modal.com GPU clusters. CI/CD pipelines, environment variables, and canary rollouts.",
    articles: 9,
    tags: ["deploy", "edge", "CI/CD", "Cloudflare"],
    gradient: "from-orange-600 to-red-600",
  },
  {
    id: "guides",
    icon: "\uD83D\uDCD6",
    title: "Guides",
    description:
      "Step-by-step walkthroughs for real-world workflows: building a SaaS app, integrating Stripe billing, real-time collaboration, and video processing.",
    articles: 15,
    tags: ["tutorial", "walkthrough", "patterns"],
    gradient: "from-amber-500 to-yellow-500",
  },
  {
    id: "collaboration",
    icon: "\uD83D\uDC65",
    title: "Collaboration",
    description:
      "Real-time multi-user editing with Yjs CRDTs. Presence, cursors, conflict resolution, and AI agents as first-class collaborators.",
    articles: 8,
    tags: ["CRDT", "Yjs", "real-time", "multiplayer"],
    gradient: "from-sky-600 to-blue-600",
  },
  {
    id: "security",
    icon: "\uD83D\uDD12",
    title: "Security & Auth",
    description:
      "Passkey/WebAuthn authentication, zero-trust architecture, RBAC, audit trails, encryption at rest and in transit, and compliance certifications.",
    articles: 11,
    tags: ["auth", "passkeys", "encryption", "compliance"],
    gradient: "from-rose-600 to-red-600",
  },
];

const QUICK_LINKS: QuickLink[] = [
  {
    label: "Install the CLI",
    href: "/docs/getting-started/install",
    description: "bun add -g @crontech/cli",
  },
  {
    label: "Create your first project",
    href: "/docs/getting-started/new-project",
    description: "crontech init my-app",
  },
  {
    label: "Deploy to edge",
    href: "/docs/deployment/cloudflare",
    description: "Ship globally in one command",
  },
  {
    label: "AI chat endpoint",
    href: "/docs/api-reference/ai-chat",
    description: "Stream completions via SSE",
  },
];

// ── Sub-Components ──────────────────────────────────────────────────

function DocCategoryCard(props: { category: DocCategory }): JSX.Element {
  return (
    <A
      href={`/docs/${props.category.id}`}
      class="group block"
      style={{ "text-decoration": "none" }}
    >
      <div
        class="relative overflow-hidden rounded-2xl border border-white/[0.06] p-6 transition-all duration-300 hover:scale-[1.02] hover:border-white/[0.12]"
        style={{
          background:
            "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
          "backdrop-filter": "blur(12px)",
        }}
      >
        {/* Gradient accent bar */}
        <div
          class={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${props.category.gradient} opacity-60 transition-opacity duration-300 group-hover:opacity-100`}
        />

        <div class="flex items-start gap-4">
          <div
            class={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${props.category.gradient} text-xl shadow-lg`}
          >
            {props.category.icon}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-lg font-semibold text-white group-hover:text-white/90 transition-colors">
                {props.category.title}
              </span>
              <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-white/50 font-mono">
                {props.category.articles}
              </span>
            </div>
            <p class="text-sm text-white/50 leading-relaxed mb-3">
              {props.category.description}
            </p>
            <div class="flex flex-wrap gap-1.5">
              <For each={props.category.tags}>
                {(tag) => (
                  <span class="rounded-md bg-white/[0.04] px-2 py-0.5 text-xs text-white/40 font-mono">
                    {tag}
                  </span>
                )}
              </For>
            </div>
          </div>
        </div>

        {/* Arrow indicator */}
        <div class="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 transition-all duration-300 group-hover:translate-x-1 group-hover:text-white/50">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M7.5 15L12.5 10L7.5 5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>
    </A>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function DocsPage(): JSX.Element {
  const [searchQuery, setSearchQuery] = createSignal("");

  const filteredCategories = createMemo((): DocCategory[] => {
    const query = searchQuery().toLowerCase().trim();
    if (!query) return DOC_CATEGORIES;
    return DOC_CATEGORIES.filter(
      (cat) =>
        cat.title.toLowerCase().includes(query) ||
        cat.description.toLowerCase().includes(query) ||
        cat.tags.some((t) => t.toLowerCase().includes(query)),
    );
  });

  return (
    <>
      <SEOHead
        title="Documentation"
        description="Everything you need to build with Crontech. Guides, API references, component catalogs, and deployment workflows."
        path="/docs"
      />

      <div class="min-h-screen" style={{ background: "#0a0a0a" }}>
        {/* ── Hero Section ───────────────────────────────────────────── */}
        <div class="relative overflow-hidden">
          {/* Background gradient mesh */}
          <div
            class="absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(59,130,246,0.08) 0%, transparent 50%)",
            }}
          />

          <div class="relative mx-auto max-w-6xl px-6 pt-20 pb-16">
            <div class="flex flex-col items-center text-center">
              <Badge variant="info" size="sm">
                149 articles across 8 categories
              </Badge>
              <h1
                class="mt-6 text-5xl font-bold tracking-tight sm:text-6xl"
                style={{
                  background:
                    "linear-gradient(135deg, #fff 0%, #a78bfa 50%, #6366f1 100%)",
                  "-webkit-background-clip": "text",
                  "-webkit-text-fill-color": "transparent",
                  "line-height": "1.1",
                }}
              >
                Documentation
              </h1>
              <p class="mt-4 max-w-2xl text-lg text-white/50">
                Everything you need to build, deploy, and scale with Crontech.
                From first install to production-grade AI agents.
              </p>

              {/* ── Search Bar ──────────────────────────────────────── */}
              <div class="mt-8 w-full max-w-xl">
                <div
                  class="relative rounded-2xl border border-white/[0.08] overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    "backdrop-filter": "blur(12px)",
                  }}
                >
                  <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <svg
                      class="h-5 w-5 text-white/30"
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
                    placeholder="Search documentation... (e.g. tRPC, passkeys, WebGPU)"
                    value={searchQuery()}
                    onInput={(e) =>
                      setSearchQuery(e.currentTarget.value)
                    }
                    class="w-full bg-transparent py-4 pl-12 pr-4 text-white placeholder-white/30 outline-none text-sm"
                  />
                  <div class="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                    <kbd class="rounded border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-xs text-white/30 font-mono">
                      /
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Links ─────────────────────────────────────────── */}
        <div class="mx-auto max-w-6xl px-6 pb-8">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <For each={QUICK_LINKS}>
              {(link) => (
                <A
                  href={link.href}
                  class="group flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.02]"
                  style={{ "text-decoration": "none" }}
                >
                  <div class="flex-1 min-w-0">
                    <span class="block text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                      {link.label}
                    </span>
                    <span class="block text-xs text-white/30 font-mono mt-0.5 truncate">
                      {link.description}
                    </span>
                  </div>
                  <svg
                    class="h-4 w-4 shrink-0 text-white/20 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white/40"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </A>
              )}
            </For>
          </div>
        </div>

        {/* ── Main Grid ───────────────────────────────────────────── */}
        <div class="mx-auto max-w-6xl px-6 pb-20">
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* ── Sidebar ──────────────────────────────────────────── */}
            <aside class="lg:col-span-1">
              <div class="sticky top-20 space-y-6">
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wider text-white/30 mb-3">
                    Categories
                  </h3>
                  <nav class="space-y-0.5">
                    <For each={DOC_CATEGORIES}>
                      {(cat) => (
                        <a
                          href={`#${cat.id}`}
                          class="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/80"
                          style={{ "text-decoration": "none" }}
                        >
                          <span class="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span>{cat.title}</span>
                          </span>
                          <span class="text-xs text-white/25 font-mono">
                            {cat.articles}
                          </span>
                        </a>
                      )}
                    </For>
                  </nav>
                </div>

                {/* SDK versions */}
                <div
                  class="rounded-xl border border-white/[0.06] p-4"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  <h3 class="text-xs font-semibold uppercase tracking-wider text-white/30 mb-3">
                    SDK Versions
                  </h3>
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <span class="text-white/40">@crontech/cli</span>
                      <span class="text-emerald-400/80 font-mono text-xs">
                        v0.8.2
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-white/40">@crontech/sdk</span>
                      <span class="text-emerald-400/80 font-mono text-xs">
                        v0.6.1
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-white/40">@crontech/ai</span>
                      <span class="text-emerald-400/80 font-mono text-xs">
                        v0.4.0
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            {/* ── Category Cards ────────────────────────────────────── */}
            <div class="lg:col-span-3">
              <Show
                when={filteredCategories().length > 0}
                fallback={
                  <div class="flex flex-col items-center justify-center py-20 text-center">
                    <div class="text-4xl mb-4 opacity-30">
                      {"\uD83D\uDD0D"}
                    </div>
                    <p class="text-white/40 text-lg">
                      No results for "{searchQuery()}"
                    </p>
                    <p class="text-white/25 text-sm mt-1">
                      Try a different search term or browse the categories
                    </p>
                    <button
                      type="button"
                      class="mt-4 rounded-lg bg-white/[0.06] px-4 py-2 text-sm text-white/60 hover:bg-white/[0.1] transition-colors"
                      onClick={() => setSearchQuery("")}
                    >
                      Clear search
                    </button>
                  </div>
                }
              >
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <For each={filteredCategories()}>
                    {(category) => (
                      <DocCategoryCard category={category} />
                    )}
                  </For>
                </div>
              </Show>

              {/* ── Popular Articles ─────────────────────────────────── */}
              <Show when={searchQuery() === ""}>
                <div class="mt-16">
                  <h2 class="text-lg font-semibold text-white/80 mb-6">
                    Popular articles
                  </h2>
                  <div class="space-y-2">
                    {[
                      {
                        title: "Quickstart: Your first Crontech project",
                        category: "Getting Started",
                        readTime: "3 min",
                      },
                      {
                        title: "Three-tier compute explained",
                        category: "AI SDK",
                        readTime: "8 min",
                      },
                      {
                        title: "tRPC procedure reference",
                        category: "API Reference",
                        readTime: "12 min",
                      },
                      {
                        title:
                          "Building AI-composable components with Zod schemas",
                        category: "Components",
                        readTime: "6 min",
                      },
                      {
                        title: "Deploy to Cloudflare Workers in 60 seconds",
                        category: "Deployment",
                        readTime: "2 min",
                      },
                      {
                        title:
                          "Real-time collaboration with Yjs and AI agents",
                        category: "Collaboration",
                        readTime: "10 min",
                      },
                    ].map((article) => (
                      <a
                        href={`/docs/${article.category.toLowerCase().replace(/\s+/g, "-")}/${article.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        class="group flex items-center justify-between rounded-xl border border-white/[0.04] px-5 py-4 transition-all duration-200 hover:border-white/[0.1] hover:bg-white/[0.02]"
                        style={{ "text-decoration": "none" }}
                      >
                        <div>
                          <span class="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                            {article.title}
                          </span>
                          <span class="ml-3 text-xs text-white/25 font-mono">
                            {article.category}
                          </span>
                        </div>
                        <span class="text-xs text-white/20 shrink-0 ml-4">
                          {article.readTime}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
