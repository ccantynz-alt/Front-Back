// ── Project Templates Library ────────────────────────────────────────
// Premium starter templates for new Crontech projects.
// Each template pre-fills the /projects/new wizard with sensible
// defaults for its framework + runtime combination.

import type { JSX } from "solid-js";

// ── Types ───────────────────────────────────────────────────────────

/** Supported framework keys (must match the backend projects.create input). */
export type TemplateFramework =
  | "solidstart"
  | "nextjs"
  | "remix"
  | "astro"
  | "hono"
  | "other";

/** Supported runtime keys (must match the backend projects.create input). */
export type TemplateRuntime = "bun" | "node" | "deno";

/** High-level capability tag used for filtering on the /templates page. */
export type TemplateTag = "Web" | "API" | "AI" | "Python" | "Static" | "Blank";

/** Public shape of a starter template. */
export interface ProjectTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Single emoji or short glyph rendered in the card icon slot. */
  readonly icon: string;
  /** Gradient used for the card's hero block. */
  readonly gradient: string;
  /** Framework identifier for the create-project wizard. */
  readonly framework: TemplateFramework;
  /** Runtime identifier for the create-project wizard. */
  readonly runtime: TemplateRuntime;
  /** Default build command that will pre-fill the wizard. */
  readonly buildCommand: string;
  /** Default output directory produced by the build command. */
  readonly outputDir: string;
  /** Environment variables the template needs (for display only). */
  readonly envVarsRequired: readonly string[];
  /** Tags used by the filter chips on the templates page. */
  readonly tags: readonly TemplateTag[];
  /** Upstream repo that backs this template. */
  readonly repoUrl: string;
}

// ── Template Catalog ─────────────────────────────────────────────────

export const projectTemplates: readonly ProjectTemplate[] = [
  {
    id: "web-app-solidjs",
    name: "Web App (SolidJS)",
    description:
      "Full-stack SolidJS + Hono application with tRPC, Tailwind v4, and Drizzle ORM pre-wired. The fastest way to ship a production web app on Crontech.",
    icon: "\u26A1",
    gradient:
      "linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 40%, var(--color-accent, #06b6d4)))",
    framework: "solidstart",
    runtime: "bun",
    buildCommand: "bun run build",
    outputDir: ".output/public",
    envVarsRequired: ["DATABASE_URL", "SESSION_SECRET"],
    tags: ["Web"],
    repoUrl: "https://github.com/crontech/template-web-solidjs",
  },
  {
    id: "api-service-hono",
    name: "API Service (Hono)",
    description:
      "Pure API service built on Hono + tRPC v11, running on Bun. End-to-end type safety, zero boilerplate, sub-5ms cold starts at the edge.",
    icon: "\uD83D\uDD0C",
    gradient:
      "linear-gradient(135deg, var(--color-success), color-mix(in oklab, var(--color-success) 40%, var(--color-primary)))",
    framework: "hono",
    runtime: "bun",
    buildCommand: "bun run build",
    outputDir: "dist",
    envVarsRequired: ["DATABASE_URL", "JWT_SECRET"],
    tags: ["API"],
    repoUrl: "https://github.com/crontech/template-api-hono",
  },
  {
    id: "ai-chat-app",
    name: "AI Chat App",
    description:
      "Streaming chat interface backed by the Anthropic SDK with generative UI, tool-calls, and three-tier compute routing. Ships with Claude 4.7 wired in.",
    icon: "\uD83E\uDD16",
    gradient:
      "linear-gradient(135deg, var(--color-primary), var(--color-danger))",
    framework: "solidstart",
    runtime: "bun",
    buildCommand: "bun run build",
    outputDir: ".output/public",
    envVarsRequired: ["ANTHROPIC_API_KEY", "DATABASE_URL"],
    tags: ["AI", "Web"],
    repoUrl: "https://github.com/crontech/template-ai-chat",
  },
  {
    id: "python-api-fastapi",
    name: "Python API (FastAPI)",
    description:
      "Python backend powered by FastAPI + Uvicorn with async SQL, Pydantic models, and OpenAPI docs generated out of the box. Ideal for ML endpoints and data services.",
    icon: "\uD83D\uDC0D",
    gradient:
      "linear-gradient(135deg, var(--color-warning), color-mix(in oklab, var(--color-warning) 40%, var(--color-danger)))",
    framework: "other",
    runtime: "node",
    buildCommand: "pip install -r requirements.txt",
    outputDir: "dist",
    envVarsRequired: ["DATABASE_URL", "PYTHON_ENV"],
    tags: ["Python", "API"],
    repoUrl: "https://github.com/crontech/template-python-fastapi",
  },
  {
    id: "static-site-astro",
    name: "Static Site (Astro)",
    description:
      "Content-driven Astro site with MDX, image optimisation, and zero JS by default. Ships to Cloudflare Pages with a single command.",
    icon: "\uD83D\uDCC4",
    gradient:
      "linear-gradient(135deg, var(--color-accent, #06b6d4), var(--color-primary))",
    framework: "astro",
    runtime: "node",
    buildCommand: "bun run build",
    outputDir: "dist",
    envVarsRequired: [],
    tags: ["Static", "Web"],
    repoUrl: "https://github.com/crontech/template-static-astro",
  },
  {
    id: "blank-project",
    name: "Blank Project",
    description:
      "An empty starting point with only the Crontech deploy hooks wired up. Bring your own framework, runtime, and build pipeline.",
    icon: "\u2728",
    gradient:
      "linear-gradient(135deg, var(--color-bg-muted), var(--color-bg-elevated))",
    framework: "other",
    runtime: "bun",
    buildCommand: "",
    outputDir: "dist",
    envVarsRequired: [],
    tags: ["Blank"],
    repoUrl: "https://github.com/crontech/template-blank",
  },
] as const;

// ── Filter Tags ─────────────────────────────────────────────────────

/** Tags rendered as filter chips on the templates page (plus an "All" option). */
export const TEMPLATE_TAG_FILTERS: readonly TemplateTag[] = [
  "Web",
  "API",
  "AI",
  "Python",
  "Static",
  "Blank",
] as const;

// ── Helpers ─────────────────────────────────────────────────────────

/** Look up a template by its id. Returns undefined when not found. */
export function getTemplateById(
  id: string | null | undefined,
): ProjectTemplate | undefined {
  if (!id) return undefined;
  return projectTemplates.find((t) => t.id === id);
}

/** Filter templates by a single tag. Pass "all" (or undefined) to disable. */
export function filterTemplatesByTag(
  tag: TemplateTag | "all" | undefined,
): readonly ProjectTemplate[] {
  if (!tag || tag === "all") return projectTemplates;
  return projectTemplates.filter((t) => t.tags.includes(tag));
}

/** Convenience: JSX-friendly re-export of the ProjectTemplate type. */
export type ProjectTemplateElement = JSX.Element;
