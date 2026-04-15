// ── AI Routes (Hono) ──────────────────────────────────────────────
// Raw Hono routes for AI endpoints. NOT tRPC -- AI streaming works
// better with direct HTTP responses (SSE / data streams).
// All inputs validated with Zod. All responses streamed.
// Supports demo mode when no AI provider keys are configured.

import { Hono } from "hono";
import { streamText, generateObject, type ModelMessage } from "ai";
import { z } from "zod";
import {
  getModelForTier,
  readProviderEnv,
  streamSiteBuilder,
  processGenerativeUIOutput,
  type ComputeTier,
} from "@back-to-the-future/ai-core";
import { ComponentSchema } from "@back-to-the-future/schemas";

// ── Input Schemas ─────────────────────────────────────────────────

const ChatInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .min(1, "At least one message is required"),
  computeTier: z.enum(["client", "edge", "cloud"]).default("cloud"),
  maxTokens: z.number().int().min(1).max(16384).default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
});

const GenerateUIInputSchema = z.object({
  description: z.string().min(1, "Description is required"),
  computeTier: z.enum(["client", "edge", "cloud"]).default("cloud"),
  mode: z.enum(["ai", "demo"]).default("ai"),
});

const SiteBuilderInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .min(1, "At least one message is required"),
  computeTier: z.enum(["client", "edge", "cloud"]).default("cloud"),
  maxTokens: z.number().int().min(1).max(16384).default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
});

// ── Demo Mode Utilities ──────────────────────────────────────────

/**
 * Checks whether an AI provider API key is configured.
 */
function hasAIProvider(): boolean {
  const env = readProviderEnv();
  return env.cloud.apiKey !== "" && env.cloud.apiKey.length > 5;
}

/**
 * Returns a demo component tree based on the user description.
 * Provides a working experience without API keys.
 */
function generateDemoLayout(description: string): {
  layout: z.infer<typeof ComponentSchema>[];
  reasoning: string;
} {
  const lower = description.toLowerCase();

  // Detect intent and generate appropriate demo layouts
  if (lower.includes("landing") || lower.includes("home") || lower.includes("hero")) {
    return {
      layout: [
        {
          component: "Stack",
          props: { direction: "vertical", gap: "lg", align: "center", justify: "center" },
          children: [
            { component: "Text", props: { content: "Welcome to Your New Website", variant: "h1", weight: "bold", align: "center" } },
            { component: "Text", props: { content: "Built with AI-powered component generation. This is a demo layout showing what the builder can create.", variant: "body", weight: "normal", align: "center" } },
            {
              component: "Stack",
              props: { direction: "horizontal", gap: "md", align: "center", justify: "center" },
              children: [
                { component: "Button", props: { variant: "primary", size: "lg", disabled: false, loading: false, label: "Get Started" } },
                { component: "Button", props: { variant: "outline", size: "lg", disabled: false, loading: false, label: "Learn More" } },
              ],
            },
            { component: "Separator", props: { orientation: "horizontal" } },
            {
              component: "Stack",
              props: { direction: "horizontal", gap: "lg", align: "start", justify: "center" },
              children: [
                {
                  component: "Card",
                  props: { title: "Fast", padding: "md" },
                  children: [
                    { component: "Text", props: { content: "Lightning-fast performance with edge computing and WebGPU acceleration.", variant: "body", weight: "normal", align: "left" } },
                  ],
                },
                {
                  component: "Card",
                  props: { title: "Smart", padding: "md" },
                  children: [
                    { component: "Text", props: { content: "AI-native architecture that learns and adapts to your needs.", variant: "body", weight: "normal", align: "left" } },
                  ],
                },
                {
                  component: "Card",
                  props: { title: "Secure", padding: "md" },
                  children: [
                    { component: "Text", props: { content: "Zero-trust security with passkey authentication and encryption.", variant: "body", weight: "normal", align: "left" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
      reasoning: "Demo mode: Generated a landing page layout with hero section, CTA buttons, and feature cards. Set OPENAI_API_KEY for AI-generated layouts.",
    };
  }

  if (lower.includes("form") || lower.includes("contact") || lower.includes("signup") || lower.includes("login")) {
    return {
      layout: [
        {
          component: "Stack",
          props: { direction: "vertical", gap: "md", align: "center", justify: "start" },
          children: [
            {
              component: "Card",
              props: { title: "Contact Us", padding: "lg" },
              children: [
                {
                  component: "Stack",
                  props: { direction: "vertical", gap: "md", align: "stretch", justify: "start" },
                  children: [
                    { component: "Text", props: { content: "Fill out the form below and we will get back to you.", variant: "body", weight: "normal", align: "left" } },
                    { component: "Input", props: { type: "text", placeholder: "Your name", name: "name", required: true, disabled: false } },
                    { component: "Input", props: { type: "email", placeholder: "your@email.com", name: "email", required: true, disabled: false } },
                    { component: "Textarea", props: { placeholder: "Your message...", rows: 4, resize: "vertical" } },
                    { component: "Button", props: { variant: "primary", size: "md", disabled: false, loading: false, label: "Send Message" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
      reasoning: "Demo mode: Generated a contact form layout with name, email, message fields and submit button. Set OPENAI_API_KEY for AI-generated layouts.",
    };
  }

  if (lower.includes("dashboard") || lower.includes("admin") || lower.includes("panel")) {
    return {
      layout: [
        {
          component: "Stack",
          props: { direction: "vertical", gap: "md", align: "stretch", justify: "start" },
          children: [
            {
              component: "Stack",
              props: { direction: "horizontal", gap: "md", align: "center", justify: "between" },
              children: [
                { component: "Text", props: { content: "Dashboard", variant: "h2", weight: "bold", align: "left" } },
                { component: "Badge", props: { variant: "success", size: "md", label: "Online" } },
              ],
            },
            {
              component: "Stack",
              props: { direction: "horizontal", gap: "md", align: "stretch", justify: "start" },
              children: [
                {
                  component: "Card",
                  props: { title: "Total Users", padding: "md" },
                  children: [
                    { component: "Text", props: { content: "12,345", variant: "h2", weight: "bold", align: "center" } },
                    { component: "Text", props: { content: "+12% this month", variant: "caption", weight: "normal", align: "center" } },
                  ],
                },
                {
                  component: "Card",
                  props: { title: "Revenue", padding: "md" },
                  children: [
                    { component: "Text", props: { content: "$98,765", variant: "h2", weight: "bold", align: "center" } },
                    { component: "Text", props: { content: "+8% this month", variant: "caption", weight: "normal", align: "center" } },
                  ],
                },
                {
                  component: "Card",
                  props: { title: "Active Projects", padding: "md" },
                  children: [
                    { component: "Text", props: { content: "42", variant: "h2", weight: "bold", align: "center" } },
                    { component: "Text", props: { content: "3 due this week", variant: "caption", weight: "normal", align: "center" } },
                  ],
                },
              ],
            },
            {
              component: "Card",
              props: { title: "Recent Activity", padding: "md" },
              children: [
                {
                  component: "Stack",
                  props: { direction: "vertical", gap: "sm", align: "stretch", justify: "start" },
                  children: [
                    { component: "Alert", props: { variant: "info", title: "New user signed up" } },
                    { component: "Alert", props: { variant: "success", title: "Payment received" } },
                    { component: "Alert", props: { variant: "warning", title: "Server load high" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
      reasoning: "Demo mode: Generated a dashboard layout with stat cards and activity feed. Set OPENAI_API_KEY for AI-generated layouts.",
    };
  }

  // Default: generic page layout based on description
  return {
    layout: [
      {
        component: "Stack",
        props: { direction: "vertical", gap: "lg", align: "stretch", justify: "start" },
        children: [
          { component: "Text", props: { content: description, variant: "h1", weight: "bold", align: "left" } },
          { component: "Text", props: { content: "This page was generated in demo mode. Connect an AI provider (set OPENAI_API_KEY) for intelligent, context-aware layouts.", variant: "body", weight: "normal", align: "left" } },
          { component: "Separator", props: { orientation: "horizontal" } },
          {
            component: "Card",
            props: { title: "Getting Started", padding: "md" },
            children: [
              {
                component: "Stack",
                props: { direction: "vertical", gap: "sm", align: "stretch", justify: "start" },
                children: [
                  { component: "Text", props: { content: "The AI builder can generate any layout from a natural language description. Try these prompts:", variant: "body", weight: "normal", align: "left" } },
                  { component: "Badge", props: { variant: "info", size: "md", label: "Build a landing page with hero and features" } },
                  { component: "Badge", props: { variant: "info", size: "md", label: "Create a contact form" } },
                  { component: "Badge", props: { variant: "info", size: "md", label: "Design a dashboard with stats" } },
                ],
              },
            ],
          },
          {
            component: "Stack",
            props: { direction: "horizontal", gap: "md", align: "center", justify: "start" },
            children: [
              { component: "Button", props: { variant: "primary", size: "md", disabled: false, loading: false, label: "Try Again" } },
              { component: "Button", props: { variant: "outline", size: "md", disabled: false, loading: false, label: "View Docs" } },
            ],
          },
        ],
      },
    ],
    reasoning: `Demo mode: Generated a default layout for "${description}". Set OPENAI_API_KEY for AI-powered generation.`,
  };
}

/**
 * Generates a demo chat response based on the last user message.
 * Used when no AI provider key is configured.
 */
function generateDemoChatResponse(messages: Array<{ role: string; content: string }>): string {
  const lastUserMessage = messages.filter((m) => m.role === "user").pop();
  const query = lastUserMessage?.content ?? "";
  const lower = query.toLowerCase();

  if (lower.includes("landing") || lower.includes("home") || lower.includes("hero")) {
    return `I will create a landing page for you. Here is the component layout:

\`\`\`json
${JSON.stringify(generateDemoLayout(query).layout, null, 2)}
\`\`\`

This layout includes a hero section with a headline, description, call-to-action buttons, and three feature cards. You can customize any part by asking me to change it.

**Note:** Running in demo mode. Set OPENAI_API_KEY for full AI-powered generation.`;
  }

  if (lower.includes("form") || lower.includes("contact")) {
    return `I will build a contact form for you. Here is the component layout:

\`\`\`json
${JSON.stringify(generateDemoLayout(query).layout, null, 2)}
\`\`\`

This form includes name, email, and message fields with a submit button. I can add more fields or adjust the styling.

**Note:** Running in demo mode. Set OPENAI_API_KEY for full AI-powered generation.`;
  }

  if (lower.includes("dashboard") || lower.includes("admin")) {
    return `I will create a dashboard layout. Here is the component layout:

\`\`\`json
${JSON.stringify(generateDemoLayout(query).layout, null, 2)}
\`\`\`

This dashboard includes stat cards, badges, and an activity feed. I can add charts, tables, or other components.

**Note:** Running in demo mode. Set OPENAI_API_KEY for full AI-powered generation.`;
  }

  return `I am the Component Composer. I generate validated SolidJS component trees from your prompt, routing through the three-tier compute model (client GPU → edge → cloud) and reporting the tier and cost on every generation.

**Available components:** Button, Input, Card, Stack, Text, Modal, Badge, Alert, Avatar, Tabs, Select, Textarea, Spinner, Tooltip, Separator.

Try asking me to:
- "Compose a hero section with announcement badge, H1, CTAs, and tech strip"
- "Generate a contact form with name, email, and message fields"
- "Compose a stats dashboard with four metric cards"

Output is a validated component tree that renders directly in the preview panel.

**Note:** Running in demo mode. Set OPENAI_API_KEY environment variable for full AI-powered generation with streaming responses.`;
}

// ── Route Definitions ─────────────────────────────────────────────

import { embedRoutes } from "./embed";

export const aiRoutes = new Hono();

// Mount embedding routes
aiRoutes.route("/", embedRoutes);

/**
 * GET /ai/status
 * Returns AI provider configuration status.
 * Useful for the frontend to know whether to use demo mode.
 */
aiRoutes.get("/status", (c) => {
  const hasProvider = hasAIProvider();
  return c.json({
    provider: hasProvider ? "configured" : "none",
    demoMode: !hasProvider,
    message: hasProvider
      ? "AI provider is configured and ready."
      : "No AI provider key set. Running in demo mode. Set OPENAI_API_KEY for full AI generation.",
  });
});

/**
 * POST /ai/chat
 * General AI chat with streaming. Uses streamText from AI SDK.
 * Falls back to demo responses when no AI provider is configured.
 */
aiRoutes.post("/chat", async (c) => {
  const body = await c.req.json();
  const parsed = ChatInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { messages, computeTier, maxTokens, temperature } = parsed.data;

  // Demo mode fallback when no AI provider is configured
  if (!hasAIProvider()) {
    const demoResponse = generateDemoChatResponse(messages);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller: ReadableStreamDefaultController): void {
        // Stream the demo response character by character for realistic feel
        const chunks = demoResponse.match(/.{1,20}/g) ?? [demoResponse];
        let i = 0;
        const interval = setInterval(() => {
          if (i >= chunks.length) {
            clearInterval(interval);
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(chunks[i]));
          i++;
        }, 30);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const providerEnv = readProviderEnv();
    const model = getModelForTier(computeTier as ComputeTier, providerEnv);

    const result = streamText({
      model,
      messages: messages as ModelMessage[],
      maxOutputTokens: maxTokens,
      temperature,
    });

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat request failed";
    return c.json(
      {
        error: message,
        hint: "Check that OPENAI_API_KEY is set correctly and the API is accessible.",
      },
      500,
    );
  }
});

/**
 * POST /ai/generate-ui
 * Generate a validated UI component tree from a natural language description.
 * Uses generateObject with the ComponentSchema for guaranteed valid output.
 * Falls back to demo layouts when no AI provider is configured.
 */
aiRoutes.post("/generate-ui", async (c) => {
  const body = await c.req.json();
  const parsed = GenerateUIInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { description, computeTier, mode } = parsed.data;

  // Demo mode: return pre-built layouts
  if (mode === "demo" || !hasAIProvider()) {
    const demo = generateDemoLayout(description);
    return c.json({
      success: true,
      demoMode: true,
      ui: demo,
    });
  }

  // AI mode: use generateObject for schema-validated output
  const UIOutputSchema = z.object({
    layout: z.array(ComponentSchema).describe("The generated UI components"),
    reasoning: z.string().describe("Brief explanation of design decisions"),
  });

  try {
    const providerEnv = readProviderEnv();
    const model = getModelForTier(computeTier as ComputeTier, providerEnv);

    const { object } = await generateObject({
      model,
      schema: UIOutputSchema,
      prompt: `Generate a UI layout using ONLY these components: Button, Input, Card, Stack, Text, Modal, Badge, Alert, Avatar, Tabs, Select, Textarea, Spinner, Tooltip, Separator.

User request: ${description}

Compose a clean, well-structured component tree. Use Stack for layout (direction: horizontal/vertical, gap: none/xs/sm/md/lg/xl). Use Card for grouping related content. Use Text for headings (variant: h1/h2/h3) and content (variant: body/caption). Use Button for actions. Use Input for form fields. Nest components inside Stack and Card children arrays.`,
      temperature: 0.7,
    });

    // Validate the output through the generative UI processor
    const validation = processGenerativeUIOutput(JSON.stringify(object.layout));
    if (!validation.success) {
      return c.json({
        success: false,
        error: "Generated UI failed validation",
        details: validation.errors,
        ui: object,
      }, 422);
    }

    return c.json({ success: true, demoMode: false, ui: object });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "UI generation failed";

    // If AI fails, fall back to demo mode
    const demo = generateDemoLayout(description);
    return c.json({
      success: true,
      demoMode: true,
      fallbackReason: message,
      ui: demo,
    });
  }
});

/**
 * POST /ai/site-builder
 * Site builder agent with tool calling and streaming.
 * The agent can search content, generate components, and analyze code.
 * Multi-step: the agent calls tools and continues generating.
 * Falls back to demo responses when no AI provider is configured.
 */
aiRoutes.post("/site-builder", async (c) => {
  const body = await c.req.json();
  const parsed = SiteBuilderInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  const { messages, computeTier, maxTokens, temperature } = parsed.data;

  // Demo mode fallback when no AI provider is configured
  if (!hasAIProvider()) {
    const demoResponse = generateDemoChatResponse(messages);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller: ReadableStreamDefaultController): void {
        const chunks = demoResponse.match(/.{1,20}/g) ?? [demoResponse];
        let i = 0;
        const interval = setInterval(() => {
          if (i >= chunks.length) {
            clearInterval(interval);
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(chunks[i]));
          i++;
        }, 30);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const result = streamSiteBuilder(messages as ModelMessage[], {
      computeTier: computeTier as ComputeTier,
      providerEnv: readProviderEnv(),
      maxTokens,
      temperature,
      maxSteps: 5,
    });

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Site builder request failed";
    return c.json(
      {
        error: message,
        hint: "Check that OPENAI_API_KEY is set correctly and the API is accessible.",
      },
      500,
    );
  }
});

export default aiRoutes;
