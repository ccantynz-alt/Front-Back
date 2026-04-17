// ── Site Builder Agent ─────────────────────────────────────────────
// The first AI agent: a website builder assistant.
// Knows the component catalog, can compose UI, search content, and
// generate validated component trees via streaming responses.
//
// TODO(BLK-020 Phase B): still depends on Vercel `ai`'s `streamText`
// with `stopWhen: stepCountIs(...)` (multi-step tool calling) and
// `generateObject` (schema-validated structured output via Zod).
// Both are non-trivial to port to raw vendor SDKs — they require
// reimplementing the tool-call loop and a JSON-mode / schema-coercion
// wrapper around `openai.chat.completions.create` or Anthropic's tool
// use API. Deferred to Phase B so Phase A can ship.

import { streamText, generateObject, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { ComponentSchema, ComponentCatalog } from "@back-to-the-future/schemas";
import { getModelForTier, getDefaultModel, type AIProviderEnv } from "../providers";
import { allTools } from "../tools";
import type { ComputeTier } from "../compute-tier";

// ── System Prompt ─────────────────────────────────────────────────

const SITE_BUILDER_SYSTEM_PROMPT = `You are the Crontech Site Builder Agent -- an expert AI assistant that helps users build websites by composing UI components from a validated catalog.

## Your Capabilities
- Compose UI layouts from the component catalog
- Search existing content and integrate it into pages
- Analyze and improve code quality
- Generate complete page structures with proper component nesting

## Component Catalog
You have access to the following validated UI components:

${Object.entries(ComponentCatalog)
  .map(([name]) => {
    switch (name) {
      case "Button":
        return `- **Button**: Interactive button. Variants: default, primary, secondary, destructive, outline, ghost, link. Sizes: sm, md, lg, icon. Props: variant, size, disabled, loading, label, onClick.`;
      case "Input":
        return `- **Input**: Text input field. Types: text, email, password, number, search, tel, url. Props: type, placeholder, label, required, disabled, error, name.`;
      case "Card":
        return `- **Card**: Content container. Props: title, description, padding (none/sm/md/lg). Can contain children components.`;
      case "Stack":
        return `- **Stack**: Layout container. Direction: horizontal/vertical. Gap: none/xs/sm/md/lg/xl. Align: start/center/end/stretch. Justify: start/center/end/between/around. Can contain children.`;
      case "Text":
        return `- **Text**: Text display. Variants: h1, h2, h3, h4, body, caption, code. Weight: normal/medium/semibold/bold. Align: left/center/right.`;
      case "Modal":
        return `- **Modal**: Dialog overlay. Size: sm/md/lg/xl/full. Props: title, description, open. Can contain children.`;
      default:
        return `- **${name}**: Available component.`;
    }
  })
  .join("\n")}

## Rules
1. ALWAYS use components from the catalog. Never suggest raw HTML.
2. Validate all component configurations against their schemas.
3. Use the generateComponent tool to create individual components.
4. Use the searchContent tool when users ask about existing content.
5. Use the analyzeCode tool when users share code for review.
6. Nest components properly: Stack and Card can have children. Button, Input, Text cannot.
7. Prefer semantic structure: use Text with appropriate variants (h1 for titles, body for paragraphs).
8. Be concise but helpful. Stream responses -- never block.
`;

// ── Agent Configuration ───────────────────────────────────────────

export interface SiteBuilderConfig {
  computeTier?: ComputeTier;
  providerEnv?: AIProviderEnv;
  maxTokens?: number;
  temperature?: number;
  maxSteps?: number;
}

const DEFAULT_CONFIG = {
  computeTier: "cloud" as ComputeTier,
  maxTokens: 4096,
  temperature: 0.7,
  maxSteps: 5,
};

// ── Streaming Chat ────────────────────────────────────────────────

/**
 * Run the site builder agent with streaming text output.
 * Supports multi-step tool calling: the agent can invoke tools
 * and continue generating based on tool results.
 */
export function streamSiteBuilder(
  messages: ModelMessage[],
  config?: SiteBuilderConfig,
): ReturnType<typeof streamText<typeof allTools>> {
  const computeTier = config?.computeTier ?? DEFAULT_CONFIG.computeTier;
  const maxOutputTokens = config?.maxTokens ?? DEFAULT_CONFIG.maxTokens;
  const temperature = config?.temperature ?? DEFAULT_CONFIG.temperature;
  const maxSteps = config?.maxSteps ?? DEFAULT_CONFIG.maxSteps;

  const model = config?.providerEnv
    ? getModelForTier(computeTier, config.providerEnv)
    : getDefaultModel();

  return streamText({
    model,
    system: SITE_BUILDER_SYSTEM_PROMPT,
    messages,
    tools: allTools,
    stopWhen: stepCountIs(maxSteps),
    maxOutputTokens,
    temperature,
  });
}

// ── Structured Component Generation ───────────────────────────────

/** Schema for a full page layout (array of components) */
const PageLayoutSchema = z.object({
  title: z.string().describe("The page title"),
  description: z.string().describe("Brief description of the page purpose"),
  components: z
    .array(ComponentSchema)
    .describe("The ordered list of components that make up the page"),
});

export type PageLayout = z.infer<typeof PageLayoutSchema>;

/**
 * Generate a complete page layout as a structured object.
 * Uses generateObject for guaranteed schema-valid output.
 */
export async function generatePageLayout(
  description: string,
  config?: SiteBuilderConfig,
): Promise<PageLayout> {
  const computeTier = config?.computeTier ?? DEFAULT_CONFIG.computeTier;
  const temperature = config?.temperature ?? DEFAULT_CONFIG.temperature;

  const model = config?.providerEnv
    ? getModelForTier(computeTier, config.providerEnv)
    : getDefaultModel();

  const { object } = await generateObject({
    model,
    schema: PageLayoutSchema,
    prompt: `Generate a page layout for the following description. Use only components from the catalog (Button, Input, Card, Stack, Text, Modal). Compose them into a well-structured page.

Description: ${description}`,
    temperature,
  });

  return object;
}

export { SITE_BUILDER_SYSTEM_PROMPT, PageLayoutSchema };
