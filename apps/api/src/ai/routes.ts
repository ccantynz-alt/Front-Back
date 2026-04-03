// ── AI Routes (Hono) ──────────────────────────────────────────────
// Raw Hono routes for AI endpoints. NOT tRPC -- AI streaming works
// better with direct HTTP responses (SSE / data streams).
// All inputs validated with Zod. All responses streamed.

import { Hono } from "hono";
import { streamText, generateObject, type ModelMessage } from "ai";
import { z } from "zod";
import {
  getModelForTier,
  readProviderEnv,
  streamSiteBuilder,
  type ComputeTier,
} from "@cronix/ai-core";
import { ComponentSchema } from "@cronix/schemas";
import { traceAICall } from "../telemetry";
import { ragRoutes } from "./rag-routes";
import { agentRoutes } from "./agent-routes";
import { vectorRoutes } from "./vector-routes";

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

// ── Route Definitions ─────────────────────────────────────────────

export const aiRoutes = new Hono();

// Mount RAG sub-routes at /ai/rag/*
aiRoutes.route("/rag", ragRoutes);
aiRoutes.route("/agents", agentRoutes);

// Mount Qdrant vector routes at /ai/vectors/*
aiRoutes.route("/vectors", vectorRoutes);

/**
 * POST /ai/chat
 * General AI chat with streaming. Uses streamText from AI SDK.
 * Streams tokens as they arrive via text stream protocol.
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
  const providerEnv = readProviderEnv();
  const model = getModelForTier(computeTier as ComputeTier, providerEnv);

  const result = await traceAICall(
    "ai.chat",
    { model: String((model as { modelId?: string }).modelId ?? "unknown"), computeTier, maxTokens, temperature },
    async () => {
      return streamText({
        model,
        messages: messages as ModelMessage[],
        maxOutputTokens: maxTokens,
        temperature,
      });
    },
  );

  return result.toTextStreamResponse({
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

/**
 * POST /ai/generate-ui
 * Generate a validated UI component tree from a natural language description.
 * Uses generateObject with the ComponentSchema for guaranteed valid output.
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

  const { description, computeTier } = parsed.data;
  const providerEnv = readProviderEnv();
  const model = getModelForTier(computeTier as ComputeTier, providerEnv);

  const UIOutputSchema = z.object({
    layout: z.array(ComponentSchema).describe("The generated UI components"),
    reasoning: z.string().describe("Brief explanation of design decisions"),
  });

  try {
    const { object } = await traceAICall(
      "ai.generate-ui",
      { model: String((model as { modelId?: string }).modelId ?? "unknown"), computeTier },
      async () => {
        return generateObject({
          model,
          schema: UIOutputSchema,
          prompt: `Generate a UI layout using ONLY these components: Button, Input, Card, Stack, Text, Modal.

User request: ${description}

Compose a clean, well-structured component tree. Use Stack for layout, Card for grouping, Text for headings and content, Button for actions, Input for form fields.`,
          temperature: 0.7,
        });
      },
    );

    return c.json({ success: true, ui: object });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "UI generation failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /ai/site-builder
 * Site builder agent with tool calling and streaming.
 * The agent can search content, generate components, and analyze code.
 * Multi-step: the agent calls tools and continues generating.
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

  const result = await traceAICall(
    "ai.site-builder",
    { computeTier, maxTokens, temperature, maxSteps: 5 },
    async () => {
      return streamSiteBuilder(messages as ModelMessage[], {
        computeTier: computeTier as ComputeTier,
        providerEnv: readProviderEnv(),
        maxTokens,
        temperature,
        maxSteps: 5,
      });
    },
  );

  return result.toTextStreamResponse({
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

export default aiRoutes;
