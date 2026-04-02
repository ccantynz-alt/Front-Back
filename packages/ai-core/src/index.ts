export { computeTierRouter, type ComputeTier, type DeviceCapabilities } from "./compute-tier";
export type { ModelRequirements } from "./compute-tier";

export {
  readProviderEnv,
  getModelForTier,
  getFallbackModel,
  getDefaultModel,
  type AIProviderConfig,
  type AIProviderEnv,
} from "./providers";

export {
  searchContent,
  generateComponent,
  analyzeCode,
  allTools,
  setSearchPipeline,
  getSearchPipeline,
  type SearchResult,
  type GenerateComponentResult,
  type CodeIssue,
  type CodeAnalysisResult,
  type ToolName,
} from "./tools";

export {
  streamSiteBuilder,
  generatePageLayout,
  SITE_BUILDER_SYSTEM_PROMPT,
  PageLayoutSchema,
  type SiteBuilderConfig,
  type PageLayout,
} from "./agents/site-builder";

// ── Embeddings ───────────────────────────────────────────────────
export {
  generateEmbedding,
  generateEmbeddings,
  chunkAndEmbed,
  type EmbeddingConfig,
} from "./embeddings";

// ── Text Chunker ─────────────────────────────────────────────────
export { chunkText, type ChunkOptions } from "./chunker";

// ── RAG Pipeline ─────────────────────────────────────────────────
export {
  VectorStore,
  cosineSimilarity,
  RAGPipeline,
  type VectorDocument,
  type SearchResult as RAGSearchResult,
  type RAGDocument,
  type RAGQueryOptions,
  type RAGQueryResult,
  type RAGPipelineConfig,
} from "./rag";
