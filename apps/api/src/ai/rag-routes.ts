// ── RAG API Routes (Hono) ────────────────────────────────────────
// Endpoints for indexing documents, searching, and full RAG queries.
// All inputs validated with Zod. Non-streaming (JSON responses).

import { Hono } from "hono";
import { z } from "zod";
import {
  RAGPipeline,
  setSearchPipeline,
} from "@back-to-the-future/ai-core";

// ── Shared RAG Pipeline Instance ─────────────────────────────────
// Single instance shared across all routes and the searchContent tool.

const pipeline = new RAGPipeline();
setSearchPipeline(pipeline);

// ── Input Schemas ────────────────────────────────────────────────

const IndexInputSchema = z.object({
  documents: z
    .array(
      z.object({
        id: z.string().min(1, "Document ID is required"),
        content: z.string().min(1, "Document content is required"),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .min(1, "At least one document is required"),
});

const SearchInputSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  topK: z.number().int().min(1).max(100).default(5),
  filter: z.record(z.unknown()).optional(),
});

const QueryInputSchema = z.object({
  question: z.string().min(1, "Question is required"),
  topK: z.number().int().min(1).max(100).default(5),
  filter: z.record(z.unknown()).optional(),
  maxTokens: z.number().int().min(1).max(16384).default(2048),
  temperature: z.number().min(0).max(2).default(0.3),
});

// ── Route Definitions ────────────────────────────────────────────

export const ragRoutes = new Hono();

/**
 * POST /ai/rag/index
 * Index documents into the RAG pipeline.
 * Chunks, embeds, and stores documents for later retrieval.
 */
ragRoutes.post("/index", async (c) => {
  const body = await c.req.json();
  const parsed = IndexInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const result = await pipeline.index(parsed.data.documents);
    return c.json({
      success: true,
      indexed: result.indexed,
      chunks: result.chunks,
      totalStored: pipeline.size,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Indexing failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /ai/rag/search
 * Search for similar content using vector similarity.
 * Returns ranked results without AI generation.
 */
ragRoutes.post("/search", async (c) => {
  const body = await c.req.json();
  const parsed = SearchInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const results = await pipeline.retrieve(
      parsed.data.query,
      parsed.data.topK,
      parsed.data.filter,
    );
    return c.json({ success: true, results });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Search failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /ai/rag/query
 * Full RAG query: retrieve context, augment prompt, generate answer.
 * Returns the AI-generated answer plus source documents.
 */
ragRoutes.post("/query", async (c) => {
  const body = await c.req.json();
  const parsed = QueryInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const result = await pipeline.query(parsed.data.question, {
      topK: parsed.data.topK,
      filter: parsed.data.filter,
      maxTokens: parsed.data.maxTokens,
      temperature: parsed.data.temperature,
    });
    return c.json({ success: true, answer: result.answer, sources: result.sources });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "RAG query failed";
    return c.json({ error: message }, 500);
  }
});

export default ragRoutes;
