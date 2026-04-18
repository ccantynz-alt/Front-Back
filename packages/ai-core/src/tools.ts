// ── Reusable AI Tools ─────────────────────────────────────────────
// Tools that AI agents can call during conversations.
// Each tool has a Zod input schema and a typed execute function.
//
// TODO(BLK-020 Phase B): uses Vercel `ai`'s `tool()` helper so the
// shape is compatible with `streamText`/`generateObject`'s tool-calling
// contract. When the agents above are ported to raw vendor SDKs, these
// will be rewritten as plain tool-descriptor objects (Anthropic tools
// API or OpenAI function-calling schema).

import { tool } from "ai";
import { z } from "zod";
import {
  ComponentSchema,
  type ComponentName,
  ComponentCatalog,
} from "@back-to-the-future/schemas";

// ── searchContent ─────────────────────────────────────────────────
// Searches indexed content using semantic or keyword matching.
// Placeholder implementation -- will integrate with Qdrant/Turso vectors.

const SearchInputSchema = z.object({
  query: z.string().describe("The search query -- natural language or keywords"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of results to return"),
  contentType: z
    .enum(["all", "page", "component", "document", "media"])
    .default("all")
    .describe("Filter results by content type"),
});

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  score: number;
  contentType: string;
  url: string;
}

export const searchContent = tool({
  description:
    "Search indexed content by query. Returns relevant content snippets for RAG or user queries. " +
    "Use this when the user asks about existing content, documentation, or data.",
  inputSchema: SearchInputSchema,
  execute: async (input): Promise<SearchResult[]> => {
    try {
      // Try Qdrant vector search if available
      const { createQdrantClient, searchSimilar } = await import("./vector/qdrant");
      const { createEmbedFunction } = await import("./rag/embeddings");
      const client = createQdrantClient();

      // Generate real embeddings for the query (uses AI SDK or hash fallback)
      const embedFn = createEmbedFunction();
      const queryVector = await embedFn(input.query);

      const searchOpts: {
        collection: string;
        limit: number;
        scoreThreshold: number;
        filter?: Record<string, unknown>;
      } = {
        collection: "content_embeddings",
        limit: input.limit,
        scoreThreshold: 0.5,
      };
      if (input.contentType !== "all") {
        searchOpts.filter = { type: input.contentType };
      }

      const hits = await searchSimilar(client, queryVector, searchOpts);

      return hits.map((hit) => ({
        id: String(hit.id),
        title: (hit.payload["title"] as string) ?? "Untitled",
        snippet: ((hit.payload["content"] as string) ?? "").slice(0, 300),
        score: hit.score,
        contentType: (hit.payload["type"] as string) ?? "document",
        url: (hit.payload["url"] as string) ?? `/content/${hit.id}`,
      }));
    } catch {
      // Qdrant not available — return informative empty result
      return [
        {
          id: `search-${Date.now()}`,
          title: `Search: ${input.query}`,
          snippet: `Semantic search for "${input.query}" requires Qdrant to be running. Start Qdrant or set QDRANT_URL.`,
          score: 0,
          contentType: input.contentType === "all" ? "document" : input.contentType,
          url: "#",
        },
      ].slice(0, input.limit);
    }
  },
});

// ── generateComponent ─────────────────────────────────────────────
// Generates a validated UI component configuration from the catalog.
// AI agents use this to compose UI from the Zod schema registry.

const GenerateComponentInputSchema = z.object({
  componentName: z
    .enum(Object.keys(ComponentCatalog) as [ComponentName, ...ComponentName[]])
    .describe("The component type to generate"),
  description: z
    .string()
    .describe("Natural language description of what the component should look like and do"),
  context: z
    .string()
    .optional()
    .describe("Additional context about where this component will be used"),
});

export interface GenerateComponentResult {
  success: boolean;
  error: string | null;
  component: z.infer<typeof ComponentSchema> | null;
}

export const generateComponent = tool({
  description:
    "Generate a UI component configuration from the component catalog. " +
    "Use this to create buttons, inputs, cards, text, stacks, and modals. " +
    `Available components: ${Object.keys(ComponentCatalog).join(", ")}. ` +
    "Returns a validated component configuration that can be rendered.",
  inputSchema: GenerateComponentInputSchema,
  execute: async (input): Promise<GenerateComponentResult> => {
    // Build a component config based on the description.
    // In production, this would call the LLM to interpret the description
    // and generate props. For now, return sensible defaults.
    const defaults = getComponentDefaults(input.componentName, input.description);

    // Validate against the schema
    const parsed = ComponentSchema.safeParse(defaults);
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation failed: ${parsed.error.message}`,
        component: null,
      };
    }

    return {
      success: true,
      error: null,
      component: parsed.data,
    };
  },
});

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

// ── analyzeCode ───────────────────────────────────────────────────
// Analyzes code snippets for quality, security, and improvement suggestions.

const AnalyzeCodeInputSchema = z.object({
  code: z.string().describe("The code snippet to analyze"),
  language: z
    .enum(["typescript", "javascript", "css", "html", "json", "other"])
    .default("typescript")
    .describe("The programming language of the code"),
  focus: z
    .enum(["quality", "security", "performance", "all"])
    .default("all")
    .describe("What aspect to focus the analysis on"),
});

export interface CodeIssue {
  severity: "error" | "warning" | "info";
  message: string;
  category: "quality" | "security" | "performance";
}

export interface CodeAnalysisResult {
  language: string;
  focus: string;
  lineCount: number;
  issues: CodeIssue[];
  summary: string;
}

export const analyzeCode = tool({
  description:
    "Analyze a code snippet for quality, security issues, performance problems, and suggest improvements. " +
    "Use this when the user shares code or asks for code review.",
  inputSchema: AnalyzeCodeInputSchema,
  execute: async (input): Promise<CodeAnalysisResult> => {
    // TODO: Wire to LLM-powered deep analysis pipeline
    // For now, return structural analysis
    const lineCount = input.code.split("\n").length;
    const hasAny = /:\s*any\b/.test(input.code);
    const hasTsIgnore = /@ts-ignore/.test(input.code);
    const hasConsoleLog = /console\.log/.test(input.code);

    const issues: CodeIssue[] = [];

    if (hasAny) {
      issues.push({
        severity: "error",
        message: "Usage of `any` type detected. Use proper types.",
        category: "quality",
      });
    }
    if (hasTsIgnore) {
      issues.push({
        severity: "error",
        message: "@ts-ignore detected. Fix the type error instead of suppressing it.",
        category: "quality",
      });
    }
    if (hasConsoleLog) {
      issues.push({
        severity: "warning",
        message: "console.log detected. Use structured logging (OpenTelemetry) in production.",
        category: "quality",
      });
    }

    return {
      language: input.language,
      focus: input.focus,
      lineCount,
      issues,
      summary:
        issues.length === 0
          ? "No issues detected in the provided code."
          : `Found ${issues.length} issue(s) in ${lineCount} lines of ${input.language}.`,
    };
  },
});

// ── Tool Registry ─────────────────────────────────────────────────
// All available tools in one object for easy agent composition.

export const allTools = {
  searchContent,
  generateComponent,
  analyzeCode,
} as const;

export type ToolName = keyof typeof allTools;
