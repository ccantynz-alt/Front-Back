// ── Site Builder Agent ─────────────────────────────────────────────
// The first AI agent: a website builder assistant.
// Knows the component catalog, can compose UI, search content, and
// generate validated component trees via streaming responses.

import { streamText, generateObject, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { ComponentSchema, ComponentCatalog } from "@back-to-the-future/schemas";
import { getModelForTier, getDefaultModel, type AIProviderEnv } from "../providers";
import { allTools } from "../tools";
import type { ComputeTier } from "../compute-tier";

// ── System Prompt ─────────────────────────────────────────────────

const SITE_BUILDER_SYSTEM_PROMPT = `You are the Back to the Future Site Builder Agent -- an expert AI assistant that helps users build websites by composing UI components from a validated catalog.

## Your Capabilities
- Dynamically discover available components via the MCP component catalog
- Inspect component schemas to understand exact props, types, defaults, and variants
- Compose UI layouts from the component catalog
- Search existing content and integrate it into pages
- Analyze and improve code quality
- Generate complete page structures with proper component nesting

## Component Catalog
You have access to the following validated UI components:

- **Button**: Interactive button. Variants: default, primary, secondary, destructive, outline, ghost, link. Sizes: sm, md, lg, icon. Props: variant, size, disabled, loading, label, onClick.
- **Input**: Text input field. Types: text, email, password, number, search, tel, url. Props: type, placeholder, label, required, disabled, error, name.
- **Card**: Content container. Props: title, description, padding (none/sm/md/lg). Can contain children components.
- **Stack**: Layout container. Direction: horizontal/vertical. Gap: none/xs/sm/md/lg/xl. Align: start/center/end/stretch. Justify: start/center/end/between/around. Can contain children.
- **Text**: Text display. Props: content (the text), variant (h1/h2/h3/h4/body/caption/code), weight (normal/medium/semibold/bold), align (left/center/right).
- **Modal**: Dialog overlay. Props: title, description, open, size (sm/md/lg/xl). Can contain children.
- **Badge**: Status indicator. Variants: default, success, warning, error, info. Sizes: sm, md. Props: variant, size, label.
- **Alert**: Notification banner. Variants: info, success, warning, error. Props: variant, title, description, dismissible. Can contain children.
- **Avatar**: User avatar. Props: src, alt, initials, size (sm/md/lg).
- **Tabs**: Tab navigation. Props: items (array of {id, label, disabled?}), defaultTab.
- **Select**: Dropdown select. Props: options (array of {value, label, disabled?}), value, placeholder, label, error, disabled, name.
- **Textarea**: Multi-line text input. Props: label, error, placeholder, rows, resize (none/vertical/horizontal/both), required, disabled, name.
- **Spinner**: Loading spinner. Props: size (sm/md/lg).
- **Tooltip**: Hover tooltip. Props: content, position (top/bottom/left/right). Can contain children.
- **Separator**: Visual divider. Props: orientation (horizontal/vertical).

## Rules
1. ALWAYS use components from the catalog. Never suggest raw HTML.
2. Use the listAvailableComponents tool to discover what components exist before composing layouts. Do not rely on hardcoded knowledge -- the catalog may change at runtime.
3. Use the getComponentDetails tool to inspect a component's full schema (props, types, defaults, variants) before generating it. This ensures you use correct prop names and values.
4. Validate all component configurations against their schemas.
5. Use the generateComponent tool to create individual components.
6. Use the searchContent tool when users ask about existing content.
7. Use the analyzeCode tool when users share code for review.
8. Nest components properly: Stack and Card can have children. Button, Input, Text cannot.
9. Prefer semantic structure: use Text with appropriate variants (h1 for titles, body for paragraphs).
10. Be concise but helpful. Stream responses -- never block.
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
    prompt: `Generate a page layout for the following description. Use components from the catalog: Button, Input, Card, Stack, Text, Modal, Badge, Alert, Avatar, Tabs, Select, Textarea, Spinner, Tooltip, Separator.

Use Stack for layout structure, Card for content grouping, Text for headings/body, Button for actions. Nest components properly — Stack and Card accept children.

Description: ${description}`,
    temperature,
  });

  return object;
}

export { SITE_BUILDER_SYSTEM_PROMPT, PageLayoutSchema };
