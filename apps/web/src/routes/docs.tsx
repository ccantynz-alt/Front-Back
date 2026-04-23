// ── /docs — Honest Documentation Landing ────────────────────────────
//
// The previous version of this page shipped "149 articles across 8
// categories" in a headline badge, with each category card showing
// fabricated counts (12, 34, 18, 42, 9, 15, 8, 11) and every quick-
// link / category href pointing to a route that didn't exist. Users
// clicking any card or quick link landed on a 404. "Popular articles"
// was six hardcoded rows with synthetic read-times and dynamically-
// composed dead hrefs.
//
// Rewritten here as an honest landing that reflects the true state of
// the docs: one article shipped (getting-started/install), seven
// categories intentionally marked "Coming soon" until their content
// lands. No fake counts. No dead links. Search filters over the real
// category list plus the one real article.

import { createSignal, For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Badge } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";

// ── Types ───────────────────────────────────────────────────────────

interface DocCategory {
  id: string;
  icon: string;
  title: string;
  description: string;
  tags: string[];
  gradient: string;
  /** True once at least one article in the category has shipped. */
  ready: boolean;
  /**
   * If `ready` is true, link the card to the first article rather than
   * a category index page that doesn't exist yet.
   */
  firstArticleHref?: string;
}

interface RealArticle {
  title: string;
  category: string;
  readTime: string;
  href: string;
}

// ── Documentation Categories ────────────────────────────────────────

const DOC_CATEGORIES: DocCategory[] = [
  {
    id: "getting-started",
    icon: "⚡",
    title: "Getting Started",
    description:
      "Create your account, install the CLI, and ship your first project to the edge.",
    tags: ["setup", "quickstart", "install"],
    gradient: "var(--color-primary)",
    ready: true,
    firstArticleHref: "/docs/getting-started/install",
  },
  {
    id: "api-reference",
    icon: "⚙️",
    title: "API Reference",
    description:
      "tRPC procedures, REST endpoints, and WebSocket channels. Type-safe schemas end to end.",
    tags: ["tRPC", "REST", "WebSocket"],
    gradient: "var(--color-primary)",
    ready: true,
    firstArticleHref: "/docs/api-reference",
  },
  {
    id: "ai-sdk",
    icon: "🧠",
    title: "AI SDK",
    description:
      "Three-tier compute routing, WebGPU inference, streaming completions, and multi-agent orchestration.",
    tags: ["AI", "WebGPU", "inference"],
    gradient: "var(--color-primary)",
    ready: true,
    firstArticleHref: "/docs/ai-sdk",
  },
  {
    id: "components",
    icon: "🧩",
    title: "Components",
    description:
      "Zod-schema-driven, AI-composable component catalog. From Button to DataTable with prop documentation.",
    tags: ["UI", "Zod", "SolidJS"],
    gradient: "var(--color-success)",
    ready: true,
    firstArticleHref: "/docs/components",
  },
  {
    id: "deployment",
    icon: "🚀",
    title: "Deployment",
    description:
      "Deploy to Cloudflare Workers, Pages, and Fly.io. CI/CD pipelines, env vars, and canary rollouts.",
    tags: ["deploy", "edge", "CI/CD"],
    gradient: "var(--color-warning)",
    ready: true,
    firstArticleHref: "/docs/deployment",
  },
  {
    id: "guides",
    icon: "📖",
    title: "Guides",
    description:
      "End-to-end walkthroughs: build a SaaS, integrate Stripe, wire real-time collaboration.",
    tags: ["tutorial", "walkthrough"],
    gradient: "var(--color-warning)",
    ready: true,
    firstArticleHref: "/docs/guides",
  },
  {
    id: "collaboration",
    icon: "👥",
    title: "Collaboration",
    description:
      "Real-time multi-user editing with Yjs CRDTs. Presence, cursors, conflict resolution.",
    tags: ["CRDT", "Yjs", "multiplayer"],
    gradient: "var(--color-primary)",
    ready: true,
    firstArticleHref: "/docs/collaboration",
  },
  {
    id: "security",
    icon: "🔒",
    title: "Security & Auth",
    description:
      "Passkey/WebAuthn, zero-trust architecture, audit trails, encryption at rest and in transit.",
    tags: ["auth", "passkeys", "compliance"],
    gradient: "var(--color-danger)",
    ready: true,
    firstArticleHref: "/docs/security",
  },
];

const REAL_ARTICLES: RealArticle[] = [
  {
    title: "Install the CLI and create your first project",
    category: "Getting Started",
    readTime: "3 min",
    href: "/docs/getting-started/install",
  },
  {
    title: "Create your first project",
    category: "Getting Started",
    readTime: "3 min",
    href: "/docs/getting-started/new-project",
  },
  {
    title: "Connect a GitHub repository",
    category: "Getting Started",
    readTime: "3 min",
    href: "/docs/getting-started/connect-github",
  },
  {
    title: "Wire a custom domain",
    category: "Getting Started",
    readTime: "4 min",
    href: "/docs/getting-started/custom-domain",
  },
  {
    title: "Pick a plan and manage billing",
    category: "Getting Started",
    readTime: "3 min",
    href: "/docs/getting-started/billing",
  },
  {
    title: "Deployment overview",
    category: "Deployment",
    readTime: "4 min",
    href: "/docs/deployment",
  },
  {
    title: "How a deploy actually runs",
    category: "Deployment",
    readTime: "5 min",
    href: "/docs/deployment/how-a-deploy-runs",
  },
  {
    title: "Environment variables",
    category: "Deployment",
    readTime: "4 min",
    href: "/docs/deployment/environment-variables",
  },
  {
    title: "Custom domains",
    category: "Deployment",
    readTime: "4 min",
    href: "/docs/deployment/custom-domains",
  },
  {
    title: "API Reference overview",
    category: "API Reference",
    readTime: "4 min",
    href: "/docs/api-reference",
  },
  {
    title: "Auth procedures",
    category: "API Reference",
    readTime: "5 min",
    href: "/docs/api-reference/auth",
  },
  {
    title: "Projects procedures",
    category: "API Reference",
    readTime: "5 min",
    href: "/docs/api-reference/projects",
  },
  {
    title: "Billing procedures",
    category: "API Reference",
    readTime: "5 min",
    href: "/docs/api-reference/billing",
  },
  {
    title: "DNS & Domains procedures",
    category: "API Reference",
    readTime: "5 min",
    href: "/docs/api-reference/dns-and-domains",
  },
  {
    title: "AI & Chat procedures",
    category: "API Reference",
    readTime: "5 min",
    href: "/docs/api-reference/ai-and-chat",
  },
  {
    title: "Support procedures",
    category: "API Reference",
    readTime: "4 min",
    href: "/docs/api-reference/support",
  },
  // ── AI SDK ────────────────────────────────────────────────────────
  {
    title: "AI SDK overview",
    category: "AI SDK",
    readTime: "3 min",
    href: "/docs/ai-sdk",
  },
  {
    title: "Three-tier compute routing",
    category: "AI SDK",
    readTime: "5 min",
    href: "/docs/ai-sdk/three-tier-compute",
  },
  {
    title: "Streaming completions",
    category: "AI SDK",
    readTime: "4 min",
    href: "/docs/ai-sdk/streaming-completions",
  },
  {
    title: "Client-GPU inference",
    category: "AI SDK",
    readTime: "4 min",
    href: "/docs/ai-sdk/client-gpu-inference",
  },
  // ── Components ───────────────────────────────────────────────────
  {
    title: "Components overview",
    category: "Components",
    readTime: "3 min",
    href: "/docs/components",
  },
  {
    title: "Component catalog",
    category: "Components",
    readTime: "4 min",
    href: "/docs/components/catalog",
  },
  {
    title: "AI-composable components",
    category: "Components",
    readTime: "4 min",
    href: "/docs/components/ai-composable",
  },
  {
    title: "Customizing components",
    category: "Components",
    readTime: "3 min",
    href: "/docs/components/customization",
  },
  // ── Guides ───────────────────────────────────────────────────────
  {
    title: "Guides overview",
    category: "Guides",
    readTime: "2 min",
    href: "/docs/guides",
  },
  {
    title: "Build a SaaS on Crontech",
    category: "Guides",
    readTime: "3 min",
    href: "/docs/guides/build-a-saas",
  },
  {
    title: "Integrate Stripe",
    category: "Guides",
    readTime: "3 min",
    href: "/docs/guides/integrate-stripe",
  },
  // ── Collaboration ────────────────────────────────────────────────
  {
    title: "Collaboration overview",
    category: "Collaboration",
    readTime: "2 min",
    href: "/docs/collaboration",
  },
  {
    title: "Yjs CRDTs",
    category: "Collaboration",
    readTime: "3 min",
    href: "/docs/collaboration/yjs-crdts",
  },
  {
    title: "Presence and cursors",
    category: "Collaboration",
    readTime: "3 min",
    href: "/docs/collaboration/presence-and-cursors",
  },
  // ── Security & Auth ──────────────────────────────────────────────
  {
    title: "Security overview",
    category: "Security & Auth",
    readTime: "2 min",
    href: "/docs/security",
  },
  {
    title: "Authentication",
    category: "Security & Auth",
    readTime: "3 min",
    href: "/docs/security/authentication",
  },
];

// ── Sub-Components ──────────────────────────────────────────────────

function DocCategoryCard(props: { category: DocCategory }): JSX.Element {
  const inner = (
    <div
      class="relative overflow-hidden rounded-2xl border border-[var(--color-border)] p-6 transition-all duration-300 hover:border-[var(--color-border-strong)]"
      style={{
        background: "var(--color-bg-subtle)",
        opacity: props.category.ready ? 1 : 0.7,
      }}
    >
      <div
        class="absolute inset-x-0 top-0 h-[2px] opacity-60"
        style={{ background: props.category.gradient }}
      />
      <div class="flex items-start gap-4">
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ background: props.category.gradient }}
        >
          {props.category.icon}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span
              class="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              {props.category.title}
            </span>
            <Show when={!props.category.ready}>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background:
                    "color-mix(in oklab, var(--color-warning) 15%, transparent)",
                  color: "var(--color-warning)",
                  border:
                    "1px solid color-mix(in oklab, var(--color-warning) 30%, transparent)",
                }}
              >
                Coming soon
              </span>
            </Show>
          </div>
          <p
            class="text-sm leading-relaxed mb-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            {props.category.description}
          </p>
          <div class="flex flex-wrap gap-1.5">
            <For each={props.category.tags}>
              {(tag) => (
                <span
                  class="rounded-md px-2 py-0.5 text-xs font-mono"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {tag}
                </span>
              )}
            </For>
          </div>
        </div>
      </div>
      <Show when={props.category.ready}>
        <div
          class="absolute right-5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--color-text-faint)" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M7.5 15L12.5 10L7.5 5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </Show>
    </div>
  );

  return (
    <Show
      when={props.category.ready && props.category.firstArticleHref}
      fallback={<div class="block">{inner}</div>}
    >
      <A
        href={props.category.firstArticleHref ?? "#"}
        class="block group"
        style={{ "text-decoration": "none" }}
      >
        {inner}
      </A>
    </Show>
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

  const filteredArticles = createMemo((): RealArticle[] => {
    const query = searchQuery().toLowerCase().trim();
    if (!query) return REAL_ARTICLES;
    return REAL_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        a.category.toLowerCase().includes(query),
    );
  });

  const readyCount = (): number => DOC_CATEGORIES.filter((c) => c.ready).length;
  const articleCount = (): number => REAL_ARTICLES.length;

  return (
    <>
      <SEOHead
        title="Documentation"
        description="Everything you need to build with Crontech. Quickstart, guides, and API references as each category ships."
        path="/docs"
      />

      <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
        {/* ── Hero ───────────────────────────────────────────────── */}
        <div class="relative overflow-hidden">
          <div
            class="absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse at 20% 50%, color-mix(in oklab, var(--color-primary) 15%, transparent) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, color-mix(in oklab, var(--color-primary) 10%, transparent) 0%, transparent 50%)",
            }}
          />
          <div class="relative mx-auto max-w-6xl px-6 pt-20 pb-12">
            <div class="flex flex-col items-center text-center">
              <Badge variant="info" size="sm">
                {articleCount()} {articleCount() === 1 ? "article" : "articles"} · {readyCount()} of {DOC_CATEGORIES.length} categories ready
              </Badge>
              <h1
                class="mt-6 text-5xl font-bold tracking-tight sm:text-6xl"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-text) 0%, var(--color-primary-hover) 50%, var(--color-primary) 100%)",
                  "-webkit-background-clip": "text",
                  "-webkit-text-fill-color": "transparent",
                  "line-height": "1.1",
                }}
              >
                Documentation
              </h1>
              <p
                class="mt-4 max-w-2xl text-lg"
                style={{ color: "var(--color-text-muted)" }}
              >
                Quickstart is live. The rest of the docs land category-by-
                category as each subsystem stabilises — we'd rather ship
                accurate references slowly than inaccurate ones quickly.
              </p>

              {/* ── Search ───────────────────────────────────────── */}
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
                    placeholder="Search documentation"
                    aria-label="Search documentation"
                    value={searchQuery()}
                    onInput={(e) => setSearchQuery(e.currentTarget.value)}
                    class="w-full bg-transparent py-4 pl-12 pr-4 outline-none text-sm"
                    style={{ color: "var(--color-text)" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Category Grid ────────────────────────────────────────── */}
        <div class="mx-auto max-w-6xl px-6 pb-20">
          <div class="mb-5 flex items-baseline justify-between">
            <h2
              class="text-lg font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              Categories
            </h2>
            <p
              class="text-xs"
              style={{ color: "var(--color-text-faint)" }}
            >
              Cards fade out until their first article ships
            </p>
          </div>
          <Show
            when={filteredCategories().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-20 text-center">
                <p
                  class="text-lg"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No results for "{searchQuery()}"
                </p>
                <button
                  type="button"
                  class="mt-4 rounded-lg px-4 py-2 text-sm transition-colors"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-secondary)",
                  }}
                  onClick={() => setSearchQuery("")}
                >
                  Clear search
                </button>
              </div>
            }
          >
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <For each={filteredCategories()}>
                {(category) => <DocCategoryCard category={category} />}
              </For>
            </div>
          </Show>

          {/* ── Real articles ────────────────────────────────────── */}
          <Show when={filteredArticles().length > 0}>
            <div class="mt-16">
              <h2
                class="text-lg font-semibold mb-6"
                style={{ color: "var(--color-text)" }}
              >
                Articles
              </h2>
              <div class="space-y-2">
                <For each={filteredArticles()}>
                  {(article) => (
                    <A
                      href={article.href}
                      class="group flex items-center justify-between rounded-xl border border-[var(--color-border)] px-5 py-4 transition-all duration-200 hover:border-[var(--color-border-strong)]"
                      style={{ "text-decoration": "none" }}
                    >
                      <div class="min-w-0">
                        <span
                          class="text-sm"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {article.title}
                        </span>
                        <span
                          class="ml-3 text-xs font-mono"
                          style={{ color: "var(--color-text-faint)" }}
                        >
                          {article.category}
                        </span>
                      </div>
                      <span
                        class="text-xs shrink-0 ml-4"
                        style={{ color: "var(--color-text-faint)" }}
                      >
                        {article.readTime}
                      </span>
                    </A>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </>
  );
}
