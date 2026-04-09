export { computeTierRouter, type ComputeTier, type DeviceCapabilities } from "./compute-tier";
export type { ModelRequirements } from "./compute-tier";

// ── Client-Side Inference (WebLLM + Transformers.js) ─────────────
export {
  // Unified interface
  clientInfer,
  getClientCapabilities,
  isClientInferenceAvailable,
  InferenceTask,
  type ClientCapabilities,
  type ClientInferOptions,
  type ClientInferResult,
  // WebLLM
  isWebGPUAvailable,
  initializeWebLLM,
  chatCompletion,
  chatCompletionStream,
  getModelInfo,
  selectModelForVRAM,
  unloadWebLLM,
  isWebLLMReady,
  getLoadedModelId,
  WEBLLM_MODELS,
  WebLLMModelId,
  WebLLMConfigSchema,
  type WebLLMConfig,
  type WebLLMModelInfo,
  type ChatMessage,
  type ChatCompletionResult,
  type ChatCompletionChunk,
  type ModelLoadProgress,
  type ModelLoadProgressCallback,
  // Transformers.js
  isTransformersAvailable,
  isTransformersGPUAvailable,
  generateEmbeddings,
  classifyText,
  summarizeText,
  extractFeatures,
  getTransformersModelInfo,
  getModelsForTask,
  disposePipeline,
  disposeAllPipelines,
  getCachedPipelines,
  TRANSFORMERS_MODELS,
  TransformersTask,
  TransformersModelId,
  TransformersConfigSchema,
  type TransformersConfig,
  type TransformersModelInfo,
  type EmbeddingResult,
  type ClassificationLabel,
  type ClassificationResult,
  type SummarizationResult,
  type FeatureExtractionResult,
  type TransformersLoadProgress,
  type TransformersLoadProgressCallback,
} from "./inference/index";

export {
  selectCloudModel,
  buildCloudRequest,
  computeTierWithReason,
  CloudInferenceRequestSchema,
  CloudInferenceResponseSchema,
  CloudStreamChunkSchema,
  type CloudInferenceRequest,
  type CloudInferenceResponse,
  type CloudStreamChunk,
  type TierFallbackResult,
} from "./compute-tier";

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

export {
  createQdrantClient,
  ensureCollection,
  upsertVectors,
  searchSimilar,
  deleteVectors,
  checkQdrantHealth,
  type QdrantConfig,
  type VectorPoint,
  type SearchOptions,
  type SearchHit,
} from "./vector/qdrant";

export {
  RAGPipeline,
  createRAGPipeline,
  ContentDocumentSchema,
  RAGQuerySchema,
  type ContentDocument,
  type RAGQuery,
  type RAGResult,
  type EmbedFunction,
} from "./rag/pipeline";

export {
  hashEmbedding,
  createEmbedFunction,
} from "./rag/embeddings";

export {
  describeComponentCatalog,
  buildGenerativeUIPrompt,
  validateComponentTree,
  processGenerativeUIOutput,
  type GenerativeUIRequest,
  type GenerativeUIResult,
} from "./generative-ui/renderer";

export {
  AgentOrchestrator,
  createOrchestrator,
  SITE_BUILDER_AGENT,
  CODE_REVIEWER_AGENT,
  CONTENT_WRITER_AGENT,
  type AgentDefinition,
  type AgentState,
  type AgentStep,
} from "./agents/orchestrator";

export {
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  getPendingApprovals,
  getApprovalRequest,
  classifyRisk,
  requiresApproval,
  ApprovalRequestSchema,
  type ApprovalRequest,
} from "./agents/approval";

export {
  siteBuilderAgent,
  codeReviewerAgent,
  contentWriterAgent,
  mastraAgents,
  searchContentTool,
  generateComponentTool,
  analyzeCodeTool,
  type MastraAgentId,
} from "./agents/mastra-agents";

export {
  listComponents,
  getComponentSchema,
  validateComponent,
  validateComponentTree as validateComponentTreeMCP,
  getMCPTools,
  getMCPResources,
  handleMCPToolCall,
  handleMCPResourceRead,
  type MCPTool,
  type MCPResource,
} from "./mcp/component-server";
