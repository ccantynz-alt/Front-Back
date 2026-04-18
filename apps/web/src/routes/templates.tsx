import { createSignal, For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { Badge } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";
import {
  projectTemplates,
  TEMPLATE_TAG_FILTERS,
  type ProjectTemplate,
  type TemplateTag,
} from "../lib/project-templates";

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
    gradient: "var(--color-primary)",
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
    gradient: "var(--color-primary)",
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
    gradient: "var(--color-danger)",
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
    gradient: "var(--color-success)",
    difficulty: "Intermediate",
    estimatedTime: "5 min",
  },
  {
    id: "saas-dashboard",
    name: "SaaS Dashboard",
    description:
      "Analytics dashboard with real-time charts, user management, billing portal, and feature flags. Complete admin panel out of the box.",
    category: "saas",
    gradient: "var(--color-primary)",
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
    gradient: "var(--color-warning)",
    difficulty: "Beginner",
    estimatedTime: "3 min",
  },
  {
    id: "ai-image-gen",
    name: "AI Image Generator",
    description:
      "Text-to-image generation interface with prompt builder, style presets, gallery view, and download management. Client-side inference via WebGPU.",
    category: "ai-app",
    gradient: "var(--color-primary)",
    difficulty: "Intermediate",
    estimatedTime: "6 min",
  },
  {
    id: "video-showcase",
    name: "Video Showcase",
    description:
      "Video-first landing page with background playback, chapter navigation, and embedded player. Optimized for product demos and course previews.",
    category: "video",
    gradient: "var(--color-success)",
    difficulty: "Beginner",
    estimatedTime: "3 min",
  },
  {
    id: "agency-site",
    name: "Agency Website",
    description:
      "Multi-page agency site with services, case studies, team section, and contact form. Enterprise-grade design with glassmorphism effects.",
    category: "website",
    gradient: "var(--color-text-muted)",
    difficulty: "Intermediate",
    estimatedTime: "7 min",
  },
  {
    id: "saas-pricing",
    name: "SaaS Pricing Page",
    description:
      "Three-tier pricing table with feature comparison, annual/monthly toggle, and Stripe checkout integration. Conversion-optimized layout.",
    category: "saas",
    gradient: "var(--color-primary)",
    difficulty: "Beginner",
    estimatedTime: "2 min",
  },
  {
    id: "ai-document-analyzer",
    name: "AI Document Analyzer",
    description:
      "Upload documents for AI-powered analysis, summarization, and entity extraction. Built-in RAG pipeline with semantic search across uploaded files.",
    category: "ai-app",
    gradient: "var(--color-primary)",
    difficulty: "Advanced",
    estimatedTime: "8 min",
  },
  {
    id: "product-launch",
    name: "Product Launch Page",
    description:
      "Countdown timer, email capture, feature previews, and social proof. Everything you need to build anticipation before launch day.",
    category: "landing",
    gradient: "var(--color-danger)",
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
      class="group relative flex flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:scale-[1.02]"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
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
          <span class="text-lg font-bold text-center px-4" style={{ color: "var(--color-text)" }}>
            {props.template.name}
          </span>
        </div>
        {/* Featured badge */}
        <Show when={props.template.featured}>
          <div class="absolute top-3 right-3">
            <span class="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--color-bg-muted)", color: "var(--color-text)" }}>
              Featured
            </span>
          </div>
        </Show>
        {/* Hover overlay */}
        <div class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/40 group-hover:opacity-100">
          <button
            type="button"
            class="rounded-xl px-5 py-2.5 text-sm font-semibold shadow-xl transition-transform duration-200 hover:scale-105"
            style={{ background: "var(--color-primary)", color: "var(--color-primary-text)" }}
            onClick={() => props.onUse(props.template.id)}
          >
            Preview Template
          </button>
        </div>
      </div>

      {/* Card body */}
      <div class="flex flex-1 flex-col p-5">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-base font-semibold" style={{ color: "var(--color-text)" }}>
            {props.template.name}
          </span>
        </div>
        <p class="text-sm leading-relaxed mb-4 flex-1" style={{ color: "var(--color-text-muted)" }}>
          {props.template.description}
        </p>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="rounded-md px-2 py-0.5 text-xs font-medium"
              style={{
                background: "color-mix(in oklab, var(--color-primary) 15%, transparent)",
                color: "var(--color-primary)",
              }}
            >
              {props.template.category}
            </span>
            <span class="rounded-md px-2 py-0.5 text-xs" style={{ background: "var(--color-bg-muted)", color: "var(--color-text-faint)" }}>
              {props.template.difficulty}
            </span>
          </div>
          <span class="text-xs font-mono" style={{ color: "var(--color-text-faint)" }}>
            {props.template.estimatedTime}
          </span>
        </div>

        {/* Action buttons */}
        <div class="mt-4 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-primary-text)",
            }}
            onClick={() => props.onUse(props.template.id)}
          >
            Use Template
          </button>
          <button
            type="button"
            class="rounded-xl px-4 py-2.5 text-sm transition-all duration-200"
            style={{
              background: "var(--color-bg-subtle)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
            }}
            onClick={() => props.onUse(props.template.id + "?ai=true")}
          >
            Customize with AI
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Starter Project Card ────────────────────────────────────────────

function StarterProjectCard(props: {
  template: ProjectTemplate;
  onUse: (id: string) => void;
}): JSX.Element {
  return (
    <div
      class="group relative flex flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:scale-[1.02]"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Hero block with icon + framework gradient */}
      <div
        class="relative flex h-32 w-full items-center justify-center overflow-hidden"
        style={{ background: props.template.gradient }}
      >
        <div
          class="absolute inset-0 opacity-10"
          style={{
            "background-image":
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            "background-size": "20px 20px",
          }}
        />
        <span
          class="relative text-5xl drop-shadow-sm"
          aria-hidden="true"
        >
          {props.template.icon}
        </span>
      </div>

      <div class="flex flex-1 flex-col p-5">
        <div class="flex items-start justify-between gap-2">
          <span
            class="text-base font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            {props.template.name}
          </span>
          <span
            class="rounded-md px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide"
            style={{
              background: "var(--color-bg-muted)",
              color: "var(--color-text-faint)",
            }}
          >
            {props.template.framework}
          </span>
        </div>
        <p
          class="mt-2 text-sm leading-relaxed flex-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          {props.template.description}
        </p>

        <div class="mt-4 flex flex-wrap gap-1.5">
          <For each={props.template.tags}>
            {(tag) => (
              <span
                class="rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background:
                    "color-mix(in oklab, var(--color-primary) 15%, transparent)",
                  color: "var(--color-primary)",
                }}
              >
                {tag}
              </span>
            )}
          </For>
        </div>

        <Show when={props.template.envVarsRequired.length > 0}>
          <p
            class="mt-3 text-[11px] font-mono"
            style={{ color: "var(--color-text-faint)" }}
          >
            Needs: {props.template.envVarsRequired.join(", ")}
          </p>
        </Show>

        <button
          type="button"
          onClick={() => props.onUse(props.template.id)}
          class="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold transition-all duration-200"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-primary-text)",
          }}
        >
          Use template
        </button>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function TemplatesPage(): JSX.Element {
  const navigate = useNavigate();
  const [search, setSearch] = createSignal("");
  const [activeFilter, setActiveFilter] = createSignal("all");
  const [starterFilter, setStarterFilter] =
    createSignal<TemplateTag | "all">("all");

  const filteredStarters = createMemo((): readonly ProjectTemplate[] => {
    const tag = starterFilter();
    if (tag === "all") return projectTemplates;
    return projectTemplates.filter((t) => t.tags.includes(tag));
  });

  const handleUseStarter = (id: string): void => {
    navigate(`/projects/new?template=${id}`);
  };

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

      <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
        {/* ── Hero ───────────────────────────────────────────────── */}
        <div class="relative overflow-hidden">
          <div class="absolute inset-0" />

          <div class="relative mx-auto max-w-6xl px-6 pt-20 pb-12">
            <div class="flex flex-col items-center text-center">
              <Badge variant="info" size="sm">
                {TEMPLATE_ITEMS.length} templates and growing
              </Badge>
              <h1
                class="mt-6 text-5xl font-bold tracking-tight sm:text-6xl"
                style={{
                  color: "var(--color-text)",
                  "line-height": "1.1",
                }}
              >
                Start with a template.
                <br />
                Ship in minutes.
              </h1>
              <p class="mt-4 max-w-2xl text-lg" style={{ color: "var(--color-text-secondary)" }}>
                Production-ready designs built on the Crontech stack.
                Every template is AI-composable, fully responsive, and
                deploys to the edge in one click.
              </p>

              {/* Search */}
              <div class="mt-8 w-full max-w-xl">
                <div
                  class="relative rounded-2xl overflow-hidden"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
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
                    placeholder="Search templates..."
                    value={search()}
                    onInput={(e) =>
                      setSearch(e.currentTarget.value)
                    }
                    class="w-full bg-transparent py-4 pl-12 pr-4 outline-none text-sm"
                    style={{ color: "var(--color-text)" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Starter Projects ───────────────────────────────────── */}
        <div class="mx-auto max-w-6xl px-6 pb-12">
          <div class="mb-6 flex flex-col items-center text-center">
            <Badge variant="success" size="sm">
              Starter projects
            </Badge>
            <h2
              class="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ color: "var(--color-text)" }}
            >
              Skip the blank page.
            </h2>
            <p
              class="mt-2 max-w-xl text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Pre-configured projects with framework, runtime, and build
              command wired up. One click and you are deploying.
            </p>
          </div>

          {/* Tag filter chips */}
          <div class="mb-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              class="rounded-full px-4 py-2 text-sm font-medium transition-all duration-200"
              style={{
                background:
                  starterFilter() === "all"
                    ? "var(--color-primary)"
                    : "var(--color-bg-subtle)",
                color:
                  starterFilter() === "all"
                    ? "var(--color-primary-text)"
                    : "var(--color-text-secondary)",
                border:
                  starterFilter() === "all"
                    ? "1px solid var(--color-primary-light)"
                    : "1px solid var(--color-border)",
              }}
              onClick={() => setStarterFilter("all")}
            >
              All
            </button>
            <For each={TEMPLATE_TAG_FILTERS}>
              {(tag) => (
                <button
                  type="button"
                  class="rounded-full px-4 py-2 text-sm font-medium transition-all duration-200"
                  style={{
                    background:
                      starterFilter() === tag
                        ? "var(--color-primary)"
                        : "var(--color-bg-subtle)",
                    color:
                      starterFilter() === tag
                        ? "var(--color-primary-text)"
                        : "var(--color-text-secondary)",
                    border:
                      starterFilter() === tag
                        ? "1px solid var(--color-primary-light)"
                        : "1px solid var(--color-border)",
                  }}
                  onClick={() => setStarterFilter(tag)}
                >
                  {tag}
                </button>
              )}
            </For>
          </div>

          <Show
            when={filteredStarters().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-10 text-center">
                <p
                  class="text-sm"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No starter projects match that filter.
                </p>
              </div>
            }
          >
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <For each={filteredStarters()}>
                {(template) => (
                  <StarterProjectCard
                    template={template}
                    onUse={handleUseStarter}
                  />
                )}
              </For>
            </div>
          </Show>
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
                        ? "var(--color-primary)"
                        : "var(--color-bg-subtle)",
                    color:
                      activeFilter() === cat.value
                        ? "var(--color-primary-text)"
                        : "var(--color-text-secondary)",
                    border:
                      activeFilter() === cat.value
                        ? "1px solid var(--color-primary-light)"
                        : "1px solid var(--color-border)",
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
                <p class="text-lg" style={{ color: "var(--color-text-muted)" }}>
                  No templates match your search
                </p>
                <p class="text-sm mt-1" style={{ color: "var(--color-text-faint)" }}>
                  Try adjusting your filters or search query
                </p>
                <button
                  type="button"
                  class="mt-4 rounded-lg px-4 py-2 text-sm transition-colors"
                  style={{ background: "var(--color-bg-subtle)", color: "var(--color-text-secondary)" }}
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
            class="mt-20 rounded-2xl p-10 text-center"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h2 class="text-2xl font-bold mb-3" style={{ color: "var(--color-text)" }}>
              Need something custom?
            </h2>
            <p class="max-w-lg mx-auto mb-6" style={{ color: "var(--color-text-muted)" }}>
              Describe what you want in plain English and our AI builder
              will generate a fully functional project from scratch.
              No template required.
            </p>
            <A href="/builder">
              <button
                type="button"
                class="rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-200 hover:scale-105"
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-primary-text)",
                }}
              >
                Open Composer
              </button>
            </A>
          </div>
        </div>
      </div>
    </>
  );
}
