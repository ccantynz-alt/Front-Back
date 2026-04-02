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
