// ── Vector API Routes (Hono) ─────────────────────────────────────
// Endpoints for Qdrant-backed vector operations: indexing, semantic
// search, hybrid search, content deletion, and collection stats.
// All inputs validated with Zod. Non-streaming (JSON responses).

import { Hono } from "hono";
import {
  QdrantPipeline,
  IndexContentInputSchema,
  SemanticSearchInputSchema,
  HybridSearchInputSchema,
  getQdrantClient,
  type QdrantFilterCondition,
} from "@cronix/ai-core";

// ── Shared Pipeline Instance ─────────────────────────────────────

const pipeline = new QdrantPipeline();

// ── Input Schemas ────────────────────────────────────────────────

// ── Route Definitions ────────────────────────────────────────────

export const vectorRoutes = new Hono();

/**
 * POST /vectors/index
 * Index content into Qdrant. Chunks, embeds, and stores with metadata.
 */
vectorRoutes.post("/index", async (c) => {
  const body = await c.req.json();
  const parsed = IndexContentInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const result = await pipeline.indexContent(parsed.data);
    return c.json({
      success: true,
      contentId: result.contentId,
      chunksIndexed: result.chunksIndexed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Indexing failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /vectors/search
 * Semantic search using Qdrant vector similarity.
 * Supports metadata filtering by userId, contentType, projectId, tags.
 */
vectorRoutes.post("/search", async (c) => {
  const body = await c.req.json();
  const parsed = SemanticSearchInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const rawFilters = parsed.data.filters;
    const filters: QdrantFilterCondition | undefined = rawFilters
      ? Object.fromEntries(
          Object.entries({
            userId: rawFilters.userId,
            contentType: rawFilters.contentType,
            projectId: rawFilters.projectId,
            tags: rawFilters.tags,
          }).filter(([, v]) => v !== undefined),
        ) as QdrantFilterCondition
      : undefined;

    const results = await pipeline.semanticSearch(
      parsed.data.query,
      filters,
      parsed.data.topK,
      parsed.data.scoreThreshold,
    );

    return c.json({ success: true, results });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Search failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /vectors/hybrid-search
 * Hybrid search combining semantic similarity with keyword matching.
 * Re-ranks results for higher relevance.
 */
vectorRoutes.post("/hybrid-search", async (c) => {
  const body = await c.req.json();
  const parsed = HybridSearchInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const rawFilters = parsed.data.filters;
    const filters: QdrantFilterCondition | undefined = rawFilters
      ? Object.fromEntries(
          Object.entries({
            userId: rawFilters.userId,
            contentType: rawFilters.contentType,
            projectId: rawFilters.projectId,
            tags: rawFilters.tags,
          }).filter(([, v]) => v !== undefined),
        ) as QdrantFilterCondition
      : undefined;

    const results = await pipeline.hybridSearch(
      parsed.data.query,
      filters,
      parsed.data.topK,
      parsed.data.keywordBoost,
    );

    return c.json({ success: true, results });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Hybrid search failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * DELETE /vectors/:contentId
 * Remove all indexed vectors for a content ID.
 */
vectorRoutes.delete("/:contentId", async (c) => {
  const contentId = c.req.param("contentId");

  if (!contentId || contentId.length === 0) {
    return c.json({ error: "Content ID is required" }, 400);
  }

  try {
    const result = await pipeline.deleteContent(contentId);
    return c.json({ success: true, deleted: result.deleted });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Deletion failed";
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /vectors/collections
 * List collections with point counts and status.
 */
vectorRoutes.get("/collections", async (c) => {
  try {
    const client = getQdrantClient();
    const collectionsResponse = await client.getCollections();

    const collections = await Promise.all(
      collectionsResponse.collections.map(async (col) => {
        try {
          const info = await client.getCollection(col.name);
          return {
            name: col.name,
            pointCount: info.points_count ?? 0,
            status: info.status,
            vectorSize: typeof info.config?.params?.vectors === "object" && "size" in info.config.params.vectors
              ? info.config.params.vectors.size
              : null,
          };
        } catch {
          return {
            name: col.name,
            pointCount: 0,
            status: "unknown",
            vectorSize: null,
          };
        }
      }),
    );

    return c.json({ success: true, collections });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list collections";
    return c.json({ error: message }, 500);
  }
});

export default vectorRoutes;
