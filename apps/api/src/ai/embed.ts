// ── Embedding API Routes ─────────────────────────────────────────────
// Server-side embedding generation for RAG pipeline and semantic search.
// Provides embeddings via the native OpenAI SDK (BLK-020 — Vercel AI SDK
// wrappers dropped in favour of direct vendor SDKs so we can lose the
// `ai` + `@ai-sdk/openai` weight and ship on Cloudflare Workers cleanly).
//
// Runtime compatibility: the `openai` package targets both Node/Bun and
// Cloudflare Workers (fetch-based transport, no Node-only APIs).

import { Hono } from "hono";
import { z } from "zod";
import OpenAI from "openai";
import { readProviderEnv } from "@back-to-the-future/ai-core";

const EmbedInputSchema = z.object({
  text: z.string().min(1).max(32000),
});

const EmbedBatchInputSchema = z.object({
  texts: z.array(z.string().min(1).max(32000)).min(1).max(100),
});

export const embedRoutes = new Hono();

const EMBEDDING_MODEL = "text-embedding-3-small";

interface OpenAIClientOptions {
  apiKey: string;
  baseURL?: string;
  organization?: string;
}

/**
 * Creates an OpenAI client from the shared provider-env config.
 *
 * Uses `exactOptionalPropertyTypes`-safe construction: only defined
 * properties are forwarded to the SDK.
 */
function createOpenAIClient(): OpenAI {
  const providerEnv = readProviderEnv();
  const options: OpenAIClientOptions = {
    apiKey: providerEnv.cloud.apiKey,
  };
  if (providerEnv.cloud.baseURL !== undefined) {
    options.baseURL = providerEnv.cloud.baseURL;
  }
  if (providerEnv.cloud.organization !== undefined) {
    options.organization = providerEnv.cloud.organization;
  }
  return new OpenAI(options);
}

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
    const client = createOpenAIClient();
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: parsed.data.text,
    });

    const vector = response.data[0]?.embedding;
    if (!vector) {
      return c.json({ error: "OpenAI returned no embedding" }, 502);
    }

    return c.json({
      vector,
      dimensions: vector.length,
      model: EMBEDDING_MODEL,
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
    const client = createOpenAIClient();
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: parsed.data.texts,
    });

    const vectors = response.data.map((d) => d.embedding);

    return c.json({
      vectors,
      dimensions: vectors[0]?.length ?? 0,
      count: vectors.length,
      model: EMBEDDING_MODEL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batch embedding failed";
    return c.json({ error: message }, 500);
  }
});
