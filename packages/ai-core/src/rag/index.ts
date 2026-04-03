// ── RAG Module Exports ───────────────────────────────────────────

export { VectorStore, cosineSimilarity } from "./vector-store";
export type { VectorDocument, SearchResult } from "./vector-store";

export { RAGPipeline } from "./pipeline";
export type {
  RAGDocument,
  RAGQueryOptions,
  RAGQueryResult,
  RAGPipelineConfig,
} from "./pipeline";

// ── Qdrant Exports ──────────────────────────────────────────────

export { getQdrantClient, ensureCollection, resetQdrantClient } from "./qdrant-client";
export type { QdrantConfig } from "./qdrant-client";

export { QdrantStore } from "./qdrant-store";
export type {
  QdrantPoint,
  QdrantSearchOptions,
  QdrantScrollOptions,
  QdrantStoreConfig,
  QdrantFilterCondition,
} from "./qdrant-store";

export { QdrantPipeline } from "./qdrant-pipeline";
export type {
  QdrantPipelineConfig,
  ContentMetadata,
  IndexContentInput,
  SemanticSearchInput,
  HybridSearchInput,
} from "./qdrant-pipeline";
export {
  ContentMetadataSchema,
  IndexContentInputSchema,
  SemanticSearchInputSchema,
  HybridSearchInputSchema,
} from "./qdrant-pipeline";
