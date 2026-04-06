// ── Mastra Agent Definitions ─────────────────────────────────────────
// TypeScript-native AI agents using Mastra framework.
// Replaces LangGraph-style patterns with production-grade agent definitions.
// Each agent has typed tools, instructions, and compute tier routing.

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  ComponentSchema,
  ComponentCatalog,
  type ComponentName,
} from "@back-to-the-future/schemas";

// ── Mastra Tools ────────────────────────────────────────────────────

export const searchContentTool = createTool({
  id: "search-content",
  description:
    "Search indexed content by query. Returns relevant content snippets for RAG or user queries.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    limit: z.number().int().min(1).max(50).default(10),
    contentType: z
      .enum(["all", "page", "component", "document", "media"])
      .default("all"),
  }),
  execute: async (input) => {
    // Placeholder — will wire to Qdrant when available
    return {
      results: [
        {
          id: `search-${Date.now()}`,
          title: `Search: ${input.query}`,
          snippet: `Results for "${input.query}" (${input.contentType})`,
          score: 0.9,
        },
      ],
    };
  },
});

export const generateComponentTool = createTool({
  id: "generate-component",
  description:
    "Generate a validated UI component configuration from the catalog. " +
    `Available: ${Object.keys(ComponentCatalog).join(", ")}.`,
  inputSchema: z.object({
    componentName: z.enum(
      Object.keys(ComponentCatalog) as [ComponentName, ...ComponentName[]],
    ),
    description: z.string(),
    context: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().nullable(),
    component: ComponentSchema.nullable(),
  }),
  execute: async (input) => {
    const defaults = getComponentDefaults(input.componentName, input.description);
    const parsed = ComponentSchema.safeParse(defaults);
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation failed: ${parsed.error.message}`,
        component: null,
      };
    }
    return { success: true, error: null, component: parsed.data };
  },
});

export const analyzeCodeTool = createTool({
  id: "analyze-code",
  description:
    "Analyze code for quality, security, and performance issues.",
  inputSchema: z.object({
    code: z.string(),
    language: z
      .enum(["typescript", "javascript", "css", "html", "json", "other"])
      .default("typescript"),
    focus: z.enum(["quality", "security", "performance", "all"]).default("all"),
  }),
  execute: async (input) => {
    const lineCount = input.code.split("\n").length;
    const issues: Array<{ severity: string; message: string; category: string }> = [];

    if (/:\s*any\b/.test(input.code)) {
      issues.push({ severity: "error", message: "Usage of `any` type detected.", category: "quality" });
    }
    if (/@ts-ignore/.test(input.code)) {
      issues.push({ severity: "error", message: "@ts-ignore detected.", category: "quality" });
    }
    if (/console\.log/.test(input.code)) {
      issues.push({ severity: "warning", message: "console.log detected.", category: "quality" });
    }

    return {
      language: input.language,
      focus: input.focus,
      lineCount,
      issues,
      summary:
        issues.length === 0
          ? "No issues detected."
          : `Found ${issues.length} issue(s) in ${lineCount} lines.`,
    };
  },
});

// ── Agent Definitions ───────────────────────────────────────────────

/**
 * Site Builder Agent — composes UI from the validated component catalog.
 * Uses generateComponent tool to create validated component trees.
 */
export const siteBuilderAgent = new Agent({
  id: "site-builder",
  name: "Site Builder",
  instructions: `You are a website builder AI agent for the Marco Reid platform.
You compose UI layouts using validated components from the Zod schema catalog.

Available components: ${Object.keys(ComponentCatalog).join(", ")}.

Rules:
1. Always use the generate-component tool to create components — never output raw JSON.
2. Compose layouts using Stack (direction: vertical/horizontal) as the primary layout primitive.
3. Use Card for grouping related content.
4. Use Text for headings (variant: h1/h2/h3) and body text.
5. Use Button for actions, Input/Select/Textarea for forms.
6. Validate every component through the tool before presenting to the user.
7. Consider accessibility: every interactive element needs a label.`,
  model: "openai/gpt-4o",
  tools: {
    "search-content": searchContentTool,
    "generate-component": generateComponentTool,
  },
});

/**
 * Code Reviewer Agent — reviews code for quality, security, and performance.
 */
export const codeReviewerAgent = new Agent({
  id: "code-reviewer",
  name: "Code Reviewer",
  instructions: `You are a code review AI agent. Analyze code for:
- Quality issues: any types, @ts-ignore, missing return types, implicit any
- Security vulnerabilities: injection, XSS, CSRF, hardcoded secrets
- Performance problems: unnecessary re-renders, N+1 queries, bundle size

Follow the project's strict TypeScript standards. Use the analyze-code tool for detailed analysis.
Provide specific, actionable feedback with line references when possible.`,
  model: "openai/gpt-4o",
  tools: {
    "analyze-code": analyzeCodeTool,
  },
});

/**
 * Content Writer Agent — generates website copy and content.
 */
export const contentWriterAgent = new Agent({
  id: "content-writer",
  name: "Content Writer",
  instructions: `You are a content writing AI agent. Generate compelling website copy:
- Headlines, descriptions, CTAs, blog posts, documentation
- Use searchContent to find existing content for context and consistency
- Write in clear, professional tone appropriate for the audience
- SEO-aware: include relevant keywords naturally
- Concise: every word must earn its place`,
  model: "openai/gpt-4o",
  tools: {
    "search-content": searchContentTool,
  },
});

// ── Agent Registry ──────────────────────────────────────────────────

export const mastraAgents = {
  "site-builder": siteBuilderAgent,
  "code-reviewer": codeReviewerAgent,
  "content-writer": contentWriterAgent,
} as const;

export type MastraAgentId = keyof typeof mastraAgents;

// ── Helper ──────────────────────────────────────────────────────────

function getComponentDefaults(
  componentName: ComponentName,
  description: string,
): Record<string, unknown> {
  const label = description || componentName;
  const name = description.toLowerCase().replace(/\s+/g, "-") || "field";

  const defaults: Record<ComponentName, Record<string, unknown>> = {
    Button: { component: "Button", props: { variant: "primary", size: "md", disabled: false, loading: false, label } },
    Input: { component: "Input", props: { type: "text", placeholder: label, name, required: false, disabled: false } },
    Card: { component: "Card", props: { title: label, padding: "md" } },
    Stack: { component: "Stack", props: { direction: "vertical", gap: "md", align: "stretch", justify: "start" } },
    Text: { component: "Text", props: { content: label, variant: "body", weight: "normal", align: "left" } },
    Modal: { component: "Modal", props: { title: label, size: "md", open: false } },
    Badge: { component: "Badge", props: { variant: "default", size: "md", label } },
    Alert: { component: "Alert", props: { variant: "info", title: label } },
    Avatar: { component: "Avatar", props: { initials: label.slice(0, 2).toUpperCase(), size: "md" } },
    Tabs: { component: "Tabs", props: { items: [{ id: "tab-1", label: "Tab 1" }, { id: "tab-2", label: "Tab 2" }] } },
    Select: { component: "Select", props: { options: [{ value: "1", label: "Option 1" }, { value: "2", label: "Option 2" }], placeholder: label } },
    Textarea: { component: "Textarea", props: { placeholder: label, rows: 3, resize: "vertical" } },
    Spinner: { component: "Spinner", props: { size: "md" } },
    Tooltip: { component: "Tooltip", props: { content: label, position: "top" } },
    Separator: { component: "Separator", props: { orientation: "horizontal" } },
  };

  return defaults[componentName];
}
