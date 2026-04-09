// ── Embedding API Routes ─────────────────────────────────────────────
// Server-side embedding generation for RAG pipeline and semantic search.
// Provides embeddings via the AI SDK when client-side inference isn't available.

import { Hono } from "hono";
import { z } from "zod";
import { embed, embedMany } from "ai";
import { readProviderEnv } from "@back-to-the-future/ai-core";
import { createOpenAI } from "@ai-sdk/openai";

const EmbedInputSchema = z.object({
  text: z.string().min(1).max(32000),
});

const EmbedBatchInputSchema = z.object({
  texts: z.array(z.string().min(1).max(32000)).min(1).max(100),
});

export const embedRoutes = new Hono();

/**
 * POST /ai/embed
 * Generate an embedding vector for a single text.
 */
embedRoutes.post("/embed", async (c) => {
  const body = await c.req.json();
  const parsed = EmbedInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  try {
    const providerEnv = readProviderEnv();
    const provider = createOpenAI({
      apiKey: providerEnv.cloud.apiKey,
      ...(providerEnv.cloud.baseURL ? { baseURL: providerEnv.cloud.baseURL } : {}),
    });

    const result = await embed({
      model: provider.embedding("text-embedding-3-small"),
      value: parsed.data.text,
    });

    return c.json({
      vector: result.embedding,
      dimensions: result.embedding.length,
      model: "text-embedding-3-small",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Embedding failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /ai/embed-batch
 * Generate embedding vectors for multiple texts in one call.
 */
embedRoutes.post("/embed-batch", async (c) => {
  const body = await c.req.json();
  const parsed = EmbedBatchInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  try {
    const providerEnv = readProviderEnv();
    const provider = createOpenAI({
      apiKey: providerEnv.cloud.apiKey,
      ...(providerEnv.cloud.baseURL ? { baseURL: providerEnv.cloud.baseURL } : {}),
    });

    const result = await embedMany({
      model: provider.embedding("text-embedding-3-small"),
      values: parsed.data.texts,
    });

    return c.json({
      vectors: result.embeddings,
      dimensions: result.embeddings[0]?.length ?? 0,
      count: result.embeddings.length,
      model: "text-embedding-3-small",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batch embedding failed";
    return c.json({ error: message }, 500);
  }
});
