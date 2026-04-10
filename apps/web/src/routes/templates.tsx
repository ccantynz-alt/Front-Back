import { createSignal, For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { Badge } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";

// ── Types ───────────────────────────────────────────────────────────

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  gradient: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  estimatedTime: string;
  featured?: boolean;
}

// ── Filter Categories ───────────────────────────────────────────────

const FILTER_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "website", label: "Website" },
  { value: "video", label: "Video" },
  { value: "ai-app", label: "AI App" },
  { value: "landing", label: "Landing Page" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "saas", label: "SaaS" },
] as const;

// ── Template Data ───────────────────────────────────────────────────

const TEMPLATE_ITEMS: TemplateItem[] = [
  {
    id: "startup-launch",
    name: "Startup Launch",
    description:
      "High-conversion landing page with hero, features grid, testimonials, and CTA. Designed for product launches and early-stage startups.",
    category: "landing",
    gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)",
    difficulty: "Beginner",
    estimatedTime: "2 min",
    featured: true,
  },
  {
    id: "ai-chatbot",
    name: "AI Chatbot Interface",
    description:
      "Streaming chat UI with conversation history, tool calls, and generative UI components. Powered by the AI SDK with three-tier compute routing.",
    category: "ai-app",
    gradient: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #6366f1 100%)",
    difficulty: "Intermediate",
    estimatedTime: "5 min",
    featured: true,
  },
  {
    id: "video-editor",
    name: "Video Editor",
    description:
      "WebGPU-accelerated video editing workspace with timeline, effects panel, and real-time preview. Multi-user collaboration via CRDTs.",
    category: "video",
    gradient: "linear-gradient(135deg, #f97316 0%, #ef4444 50%, #dc2626 100%)",
    difficulty: "Advanced",
    estimatedTime: "10 min",
    featured: true,
  },
  {
    id: "ecommerce-store",
    name: "Online Store",
    description:
      "Product grid with filters, cart, checkout flow, and Stripe integration. Responsive design with AI-powered product recommendations.",
    category: "ecommerce",
    gradient: "linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)",
    difficulty: "Intermediate",
    estimatedTime: "5 min",
  },
  {
    id: "saas-dashboard",
    name: "SaaS Dashboard",
    description:
      "Analytics dashboard with real-time charts, user management, billing portal, and feature flags. Complete admin panel out of the box.",
    category: "saas",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)",
    difficulty: "Advanced",
    estimatedTime: "8 min",
    featured: true,
  },
  {
    id: "portfolio-creative",
    name: "Creative Portfolio",
    description:
      "Showcase projects with animated transitions, image galleries, and a contact form. Designed for designers, photographers, and artists.",
    category: "website",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)",
    difficulty: "Beginner",
    estimatedTime: "3 min",
  },
  {
    id: "ai-image-gen",
    name: "AI Image Generator",
    description:
      "Text-to-image generation interface with prompt builder, style presets, gallery view, and download management. Client-side inference via WebGPU.",
    category: "ai-app",
    gradient: "linear-gradient(135deg, #a78bfa 0%, #c084fc 50%, #e879f9 100%)",
    difficulty: "Intermediate",
    estimatedTime: "6 min",
  },
  {
    id: "video-showcase",
    name: "Video Showcase",
    description:
      "Video-first landing page with background playback, chapter navigation, and embedded player. Optimized for product demos and course previews.",
    category: "video",
    gradient: "linear-gradient(135deg, #14b8a6 0%, #0d9488 50%, #0f766e 100%)",
    difficulty: "Beginner",
    estimatedTime: "3 min",
  },
  {
    id: "agency-site",
    name: "Agency Website",
    description:
      "Multi-page agency site with services, case studies, team section, and contact form. Enterprise-grade design with glassmorphism effects.",
    category: "website",
    gradient: "linear-gradient(135deg, #64748b 0%, #475569 50%, #334155 100%)",
    difficulty: "Intermediate",
    estimatedTime: "7 min",
  },
  {
    id: "saas-pricing",
    name: "SaaS Pricing Page",
    description:
      "Three-tier pricing table with feature comparison, annual/monthly toggle, and Stripe checkout integration. Conversion-optimized layout.",
    category: "saas",
    gradient: "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)",
    difficulty: "Beginner",
    estimatedTime: "2 min",
  },
  {
    id: "ai-document-analyzer",
    name: "AI Document Analyzer",
    description:
      "Upload documents for AI-powered analysis, summarization, and entity extraction. Built-in RAG pipeline with semantic search across uploaded files.",
    category: "ai-app",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)",
    difficulty: "Advanced",
    estimatedTime: "8 min",
  },
  {
    id: "product-launch",
    name: "Product Launch Page",
    description:
      "Countdown timer, email capture, feature previews, and social proof. Everything you need to build anticipation before launch day.",
    category: "landing",
    gradient: "linear-gradient(135deg, #e11d48 0%, #be123c 50%, #9f1239 100%)",
    difficulty: "Beginner",
    estimatedTime: "2 min",
  },
];

// ── Template Card ───────────────────────────────────────────────────

function TemplateCard(props: {
  template: TemplateItem;
  onUse: (id: string) => void;
}): JSX.Element {
  return (
    <div
      class="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] transition-all duration-300 hover:scale-[1.02] hover:border-white/[0.12]"
      style={{
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
        "backdrop-filter": "blur(12px)",
      }}
    >
      {/* Preview gradient area */}
      <div
        class="relative h-44 w-full overflow-hidden"
        style={{ background: props.template.gradient }}
      >
        {/* Subtle grid pattern overlay */}
        <div
          class="absolute inset-0 opacity-10"
          style={{
            "background-image":
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            "background-size": "20px 20px",
          }}
        />
        {/* Template name overlay */}
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-lg font-bold text-white/90 drop-shadow-lg text-center px-4">
            {props.template.name}
          </span>
        </div>
        {/* Featured badge */}
        <Show when={props.template.featured}>
          <div class="absolute top-3 right-3">
            <span class="rounded-full bg-white/20 backdrop-blur-md px-2.5 py-1 text-xs font-semibold text-white">
              Featured
            </span>
          </div>
        </Show>
        {/* Hover overlay */}
        <div class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/40 group-hover:opacity-100">
          <button
            type="button"
            class="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-xl transition-transform duration-200 hover:scale-105"
            onClick={() => props.onUse(props.template.id)}
          >
            Preview Template
          </button>
        </div>
      </div>

      {/* Card body */}
      <div class="flex flex-1 flex-col p-5">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-base font-semibold text-white/90">
            {props.template.name}
          </span>
        </div>
        <p class="text-sm text-white/40 leading-relaxed mb-4 flex-1">
          {props.template.description}
        </p>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="rounded-md px-2 py-0.5 text-xs font-medium"
              style={{
                background: "rgba(99,102,241,0.15)",
                color: "rgb(165,148,249)",
              }}
            >
              {props.template.category}
            </span>
            <span class="rounded-md bg-white/[0.04] px-2 py-0.5 text-xs text-white/30">
              {props.template.difficulty}
            </span>
          </div>
          <span class="text-xs text-white/25 font-mono">
            {props.template.estimatedTime}
          </span>
        </div>

        {/* Action buttons */}
        <div class="mt-4 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all duration-200"
            style={{
              background:
                "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            }}
            onClick={() => props.onUse(props.template.id)}
          >
            Use Template
          </button>
          <button
            type="button"
            class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white/60 transition-all duration-200 hover:bg-white/[0.06] hover:text-white/80"
            onClick={() => props.onUse(props.template.id + "?ai=true")}
          >
            Customize with AI
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function TemplatesPage(): JSX.Element {
  const navigate = useNavigate();
  const [search, setSearch] = createSignal("");
  const [activeFilter, setActiveFilter] = createSignal("all");

  const filtered = createMemo((): TemplateItem[] => {
    let items = TEMPLATE_ITEMS;

    // Filter by category
    const cat = activeFilter();
    if (cat !== "all") {
      items = items.filter((t) => t.category === cat);
    }

    // Filter by search
    const q = search().toLowerCase().trim();
    if (q) {
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q),
      );
    }

    return items;
  });

  const handleUseTemplate = (id: string): void => {
    navigate(`/builder?template=${id}`);
  };

  return (
    <>
      <SEOHead
        title="Templates"
        description="Production-ready starter templates for websites, AI apps, video projects, and SaaS dashboards. Pick one and ship in minutes."
        path="/templates"
      />

      <div class="min-h-screen" style={{ background: "#0a0a0a" }}>
        {/* ── Hero ───────────────────────────────────────────────── */}
        <div class="relative overflow-hidden">
          <div
            class="absolute inset-0 opacity-25"
            style={{
              background:
                "radial-gradient(ellipse at 30% 40%, rgba(139,92,246,0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, rgba(236,72,153,0.1) 0%, transparent 50%)",
            }}
          />

          <div class="relative mx-auto max-w-6xl px-6 pt-20 pb-12">
            <div class="flex flex-col items-center text-center">
              <Badge variant="info" size="sm">
                {TEMPLATE_ITEMS.length} templates and growing
              </Badge>
              <h1
                class="mt-6 text-5xl font-bold tracking-tight sm:text-6xl"
                style={{
                  background:
                    "linear-gradient(135deg, #fff 0%, #c084fc 50%, #ec4899 100%)",
                  "-webkit-background-clip": "text",
                  "-webkit-text-fill-color": "transparent",
                  "line-height": "1.1",
                }}
              >
                Start with a template.
                <br />
                Ship in minutes.
              </h1>
              <p class="mt-4 max-w-2xl text-lg text-white/50">
                Production-ready designs built on the Crontech stack.
                Every template is AI-composable, fully responsive, and
                deploys to the edge in one click.
              </p>

              {/* Search */}
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
                    placeholder="Search templates..."
                    value={search()}
                    onInput={(e) =>
                      setSearch(e.currentTarget.value)
                    }
                    class="w-full bg-transparent py-4 pl-12 pr-4 text-white placeholder-white/30 outline-none text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Filter Bar ─────────────────────────────────────────── */}
        <div class="mx-auto max-w-6xl px-6 pb-8">
          <div class="flex flex-wrap gap-2 justify-center">
            <For each={FILTER_CATEGORIES}>
              {(cat) => (
                <button
                  type="button"
                  class="rounded-full px-4 py-2 text-sm font-medium transition-all duration-200"
                  style={{
                    background:
                      activeFilter() === cat.value
                        ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
                        : "rgba(255,255,255,0.04)",
                    color:
                      activeFilter() === cat.value
                        ? "#fff"
                        : "rgba(255,255,255,0.5)",
                    border:
                      activeFilter() === cat.value
                        ? "1px solid rgba(139,92,246,0.3)"
                        : "1px solid rgba(255,255,255,0.06)",
                  }}
                  onClick={() => setActiveFilter(cat.value)}
                >
                  {cat.label}
                </button>
              )}
            </For>
          </div>
        </div>

        {/* ── Template Grid ──────────────────────────────────────── */}
        <div class="mx-auto max-w-6xl px-6 pb-20">
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-20 text-center">
                <div class="text-4xl mb-4 opacity-30">
                  {"\uD83D\uDD0D"}
                </div>
                <p class="text-white/40 text-lg">
                  No templates match your search
                </p>
                <p class="text-white/25 text-sm mt-1">
                  Try adjusting your filters or search query
                </p>
                <button
                  type="button"
                  class="mt-4 rounded-lg bg-white/[0.06] px-4 py-2 text-sm text-white/60 hover:bg-white/[0.1] transition-colors"
                  onClick={() => {
                    setSearch("");
                    setActiveFilter("all");
                  }}
                >
                  Clear filters
                </button>
              </div>
            }
          >
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <For each={filtered()}>
                {(template) => (
                  <TemplateCard
                    template={template}
                    onUse={handleUseTemplate}
                  />
                )}
              </For>
            </div>
          </Show>

          {/* ── CTA Section ───────────────────────────────────────── */}
          <div
            class="mt-20 rounded-2xl border border-white/[0.06] p-10 text-center"
            style={{
              background:
                "linear-gradient(145deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.04) 50%, rgba(236,72,153,0.06) 100%)",
              "backdrop-filter": "blur(12px)",
            }}
          >
            <h2 class="text-2xl font-bold text-white/90 mb-3">
              Need something custom?
            </h2>
            <p class="text-white/40 max-w-lg mx-auto mb-6">
              Describe what you want in plain English and our AI builder
              will generate a fully functional project from scratch.
              No template required.
            </p>
            <A href="/builder">
              <button
                type="button"
                class="rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:scale-105"
                style={{
                  background:
                    "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                }}
              >
                Open AI Builder
              </button>
            </A>
          </div>
        </div>
      </div>
    </>
  );
}
