// ── Reusable AI Tools ─────────────────────────────────────────────
// Tools that AI agents can call during conversations.
// Each tool has a Zod input schema and a typed execute function.

import { tool } from "ai";
import { z } from "zod";
import {
  ComponentSchema,
  type ComponentName,
  ComponentCatalog,
} from "@back-to-the-future/schemas";
import { searchVectors, type VectorSearchResult } from "./vector-store";

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
    const COLLECTION = "content";

    // If QDRANT_URL is not configured, fall back to mock results for local dev
    if (!process.env["QDRANT_URL"]) {
      return [
        {
          id: `result-${Date.now()}`,
          title: `Search result for: ${input.query}`,
          snippet: `Placeholder result matching "${input.query}" (type: ${input.contentType}). Set QDRANT_URL to enable semantic search.`,
          score: 0.95,
          contentType: input.contentType === "all" ? "document" : input.contentType,
          url: `/content/${input.query.toLowerCase().replace(/\s+/g, "-")}`,
        },
      ].slice(0, input.limit);
    }

    // TODO: Replace with real embedding model (e.g. Transformers.js or OpenAI embeddings)
    // For now, generate a deterministic pseudo-vector from the query string
    const queryVector = generatePseudoVector(input.query, 384);

    const filter =
      input.contentType !== "all"
        ? { must: [{ key: "contentType", match: { value: input.contentType } }] }
        : undefined;

    let results: VectorSearchResult[];
    try {
      results = await searchVectors(COLLECTION, queryVector, input.limit, filter);
    } catch {
      // Collection may not exist yet — return empty results gracefully
      return [];
    }

    return results.map((r) => ({
      id: String(r.id),
      title: (r.payload["title"] as string) ?? "Untitled",
      snippet: (r.payload["snippet"] as string) ?? "",
      score: r.score,
      contentType: (r.payload["contentType"] as string) ?? "document",
      url: (r.payload["url"] as string) ?? `/content/${String(r.id)}`,
    }));
  },
});

/**
 * Generate a deterministic pseudo-vector from a string.
 * This is a placeholder until a real embedding model is integrated.
 */
function generatePseudoVector(text: string, dimensions: number): number[] {
  const vector: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    let hash = 0;
    const seed = `${text}-${i}`;
    for (let j = 0; j < seed.length; j++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(j)) | 0;
    }
    // Normalize to [-1, 1]
    vector.push(Math.sin(hash));
  }
  return vector;
}

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
  switch (componentName) {
    case "Button":
      return {
        component: "Button",
        props: {
          variant: "primary",
          size: "md",
          disabled: false,
          loading: false,
          label: description || "Click me",
        },
      };
    case "Input":
      return {
        component: "Input",
        props: {
          type: "text",
          placeholder: description || "Enter text...",
          name: description.toLowerCase().replace(/\s+/g, "-") || "input",
          required: false,
          disabled: false,
        },
      };
    case "Card":
      return {
        component: "Card",
        props: {
          title: description || "Card Title",
          padding: "md",
        },
      };
    case "Stack":
      return {
        component: "Stack",
        props: {
          direction: "vertical",
          gap: "md",
          align: "stretch",
          justify: "start",
        },
      };
    case "Text":
      return {
        component: "Text",
        props: {
          content: description || "Text content",
          variant: "body",
          weight: "normal",
          align: "left",
        },
      };
    case "Modal":
      return {
        component: "Modal",
        props: {
          title: description || "Modal Title",
          size: "md",
          open: false,
        },
      };
    case "Badge":
      return {
        component: "Badge",
        props: {
          label: description || "Badge",
          variant: "default",
        },
      };
    case "Alert":
      return {
        component: "Alert",
        props: {
          message: description || "Alert message",
          variant: "info",
        },
      };
    case "Avatar":
      return {
        component: "Avatar",
        props: {
          alt: description || "Avatar",
          size: "md",
        },
      };
    case "Tabs":
      return {
        component: "Tabs",
        props: {
          defaultValue: "tab1",
          tabs: [{ label: description || "Tab 1", value: "tab1" }],
        },
      };
    case "Select":
      return {
        component: "Select",
        props: {
          placeholder: description || "Select an option",
          options: [],
        },
      };
    case "Textarea":
      return {
        component: "Textarea",
        props: {
          placeholder: description || "Enter text...",
          rows: 4,
        },
      };
    case "Spinner":
      return {
        component: "Spinner",
        props: {
          size: "md",
        },
      };
    case "Tooltip":
      return {
        component: "Tooltip",
        props: {
          content: description || "Tooltip text",
        },
      };
    case "Separator":
      return {
        component: "Separator",
        props: {
          orientation: "horizontal",
        },
      };
    default: {
      const _exhaustive: never = componentName;
      throw new Error(`Unknown component: ${String(_exhaustive)}`);
    }
  }
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
