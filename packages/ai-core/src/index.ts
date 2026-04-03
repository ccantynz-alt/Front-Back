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

// ── Agent Graph ─────────────────────────────────────────────────
export { StateGraph, createAgentGraph, createInitialState } from "./agents/graph";

// ── Agent Nodes ─────────────────────────────────────────────────
export { plannerNode } from "./agents/nodes/planner";
export { executorNode } from "./agents/nodes/executor";
export { reviewerNode } from "./agents/nodes/reviewer";
export { responderNode } from "./agents/nodes/responder";
export type { AgentGraphConfig } from "./agents/graph";

// ── Agent Types ─────────────────────────────────────────────────
export {
  AgentStateSchema,
  PlanStepSchema,
  StepResultSchema,
  AgentEventSchema,
} from "./agents/types";
export type { AgentState, PlanStep, StepResult, AgentEvent, AgentConfig } from "./agents/types";

// ── Specialist Agents ───────────────────────────────────────────
export { runTechScout, streamTechScout, TechScoutInputSchema } from "./agents/specialists/tech-scout";
export { runSiteArchitect, streamSiteArchitect, SiteArchitectInputSchema } from "./agents/specialists/site-architect";
export { runVideoDirector, streamVideoDirector, VideoDirectorInputSchema } from "./agents/specialists/video-director";

// ── Qdrant Vector Store ─────────────────────────────────────────
export {
  getQdrantClient,
  ensureCollection,
  resetQdrantClient,
  QdrantStore,
  QdrantPipeline,
  ContentMetadataSchema,
  IndexContentInputSchema,
  SemanticSearchInputSchema,
  HybridSearchInputSchema,
  type QdrantConfig,
  type QdrantPoint,
  type QdrantSearchOptions,
  type QdrantScrollOptions,
  type QdrantStoreConfig,
  type QdrantFilterCondition,
  type QdrantPipelineConfig,
  type ContentMetadata,
  type IndexContentInput,
  type SemanticSearchInput,
  type HybridSearchInput,
} from "./rag";

// ── Feature Flags ───────────────────────────────────────────────
export {
  evaluateFlag,
  evaluateAllFlags,
  FlagRegistry,
  FlagContextSchema,
  FlagValueSchema,
  FlagDefinitionSchema,
  FLAG_KEYS,
  FLAG_DEFINITIONS,
  flagRegistry,
  featureFlagMiddleware,
  requireFlag,
  isFlagEnabled,
  type FlagContext,
  type FlagValue,
  type FlagDefinition,
  type FlagKey,
  type EvaluatedFlags,
} from "./feature-flags";
