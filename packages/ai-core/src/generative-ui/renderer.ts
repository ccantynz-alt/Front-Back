// ── Generative UI System ─────────────────────────────────────────────
// AI generates UI from Zod-schema component catalogs using json-render.
// Describe what you want → AI selects components → validates → renders.

import { z } from "zod";
import {
  ComponentSchema,
  ComponentCatalog,
  type ComponentName,
} from "@back-to-the-future/schemas";

// ── Types ────────────────────────────────────────────────────────────

export interface GenerativeUIRequest {
  /** Natural language description of the desired UI */
  description: string;
  /** Optional constraints on which components to use */
  allowedComponents?: ComponentName[];
  /** Maximum tree depth for nested components */
  maxDepth?: number;
  /** Additional context for the AI */
  context?: string;
}

export interface GenerativeUIResult {
  success: boolean;
  /** The validated component tree */
  tree: z.infer<typeof ComponentSchema>[] | null;
  /** Validation errors if any */
  errors: string[];
  /** Metadata about the generation */
  meta: {
    componentCount: number;
    componentsUsed: string[];
    generatedAt: string;
  };
}

// ── Component Catalog Description ────────────────────────────────────
// Generates a human-readable description of available components
// that can be injected into LLM prompts.

export function describeComponentCatalog(
  allowedComponents?: ComponentName[],
): string {
  const components = allowedComponents ?? (Object.keys(ComponentCatalog) as ComponentName[]);
  const descriptions: string[] = [];

  for (const name of components) {
    const schema = ComponentCatalog[name];
    if (!schema) continue;

    // Extract shape info from the Zod schema
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const propsShape = (shape.props as z.ZodObject<z.ZodRawShape>)?.shape ?? {};
    const propNames = Object.keys(propsShape);
    const hasChildren = "children" in shape;

    descriptions.push(
      `- **${name}**: Props: [${propNames.join(", ")}]${hasChildren ? " (accepts children)" : ""}`,
    );
  }

  return `Available components:\n${descriptions.join("\n")}`;
}

// ── System Prompt for Generative UI ──────────────────────────────────

export function buildGenerativeUIPrompt(request: GenerativeUIRequest): string {
  const catalog = describeComponentCatalog(request.allowedComponents);

  return `You are a UI generation agent. Generate a JSON array of component configurations based on the user's description.

${catalog}

Rules:
1. Output ONLY a valid JSON array of component objects.
2. Each component must have "component" (string) and "props" (object) fields.
3. Components with children support nesting via the "children" array.
4. Maximum nesting depth: ${request.maxDepth ?? 4}.
5. Use only the components listed above.
6. All prop values must match the component's schema.

${request.context ? `Context: ${request.context}` : ""}

User request: ${request.description}

Respond with ONLY the JSON array, no markdown, no explanation.`;
}

// ── Validation ───────────────────────────────────────────────────────

const ComponentTreeSchema = z.array(ComponentSchema);

/**
 * Validates an AI-generated component tree against the Zod schemas.
 * Returns validated tree or errors.
 */
export function validateComponentTree(
  tree: unknown,
): { success: true; data: z.infer<typeof ComponentSchema>[] } | { success: false; errors: string[] } {
  const result = ComponentTreeSchema.safeParse(tree);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return { success: false, errors };
}

/**
 * Counts total components in a tree (including nested children).
 */
function countComponents(tree: z.infer<typeof ComponentSchema>[]): {
  count: number;
  names: Set<string>;
} {
  const names = new Set<string>();
  let count = 0;

  function walk(nodes: z.infer<typeof ComponentSchema>[]) {
    for (const node of nodes) {
      count++;
      names.add(node.component);
      if ("children" in node && Array.isArray(node.children)) {
        walk(node.children as z.infer<typeof ComponentSchema>[]);
      }
    }
  }

  walk(tree);
  return { count, names };
}

/**
 * Processes raw AI output into a validated GenerativeUIResult.
 * Handles JSON parsing, validation, and error reporting.
 */
export function processGenerativeUIOutput(
  rawOutput: string,
): GenerativeUIResult {
  // Strip markdown code fences if present
  let cleaned = rawOutput.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      success: false,
      tree: null,
      errors: [`Failed to parse JSON: ${cleaned.slice(0, 100)}...`],
      meta: {
        componentCount: 0,
        componentsUsed: [],
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // Wrap single object in array
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    parsed = [parsed];
  }

  // Validate
  const validation = validateComponentTree(parsed);
  if (!validation.success) {
    return {
      success: false,
      tree: null,
      errors: validation.errors,
      meta: {
        componentCount: 0,
        componentsUsed: [],
        generatedAt: new Date().toISOString(),
      },
    };
  }

  const { count, names } = countComponents(validation.data);

  return {
    success: true,
    tree: validation.data,
    errors: [],
    meta: {
      componentCount: count,
      componentsUsed: Array.from(names),
      generatedAt: new Date().toISOString(),
    },
  };
}
