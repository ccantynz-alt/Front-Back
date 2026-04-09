// ── Unified Client-Side Inference Interface ──────────────────────
// Routes AI workloads to the right client-side engine based on task.
// WebLLM handles chat/generation. Transformers.js handles ML pipelines.
// Cost per inference: $0. The user's hardware does all the work.

import { z } from "zod";
import type {
  ChatMessage,
  ChatCompletionResult,
  ChatCompletionChunk,
  WebLLMConfig,
} from "./webllm";
import type {
  EmbeddingResult,
  ClassificationResult,
  SummarizationResult,
  FeatureExtractionResult,
  TransformersConfig,
} from "./transformers";

// ── Re-exports ──────────────────────────────────────────────────

export {
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
} from "./webllm";

export {
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
} from "./transformers";

// ── Unified Inference Types ─────────────────────────────────────

/** The type of inference task to perform. */
export const InferenceTask = z.enum([
  "chat",
  "embeddings",
  "classification",
  "summarization",
  "feature-extraction",
]);
export type InferenceTask = z.infer<typeof InferenceTask>;

/** Client-side inference capabilities assessment. */
export interface ClientCapabilities {
  /** Whether any form of client-side inference is available. */
  available: boolean;
  /** WebGPU is present — enables WebLLM and GPU-accelerated Transformers.js. */
  hasWebGPU: boolean;
  /** WebAssembly is present — enables WASM-based Transformers.js. */
  hasWASM: boolean;
  /** Tasks that can be performed client-side. */
  supportedTasks: InferenceTask[];
  /** Maximum model size (in billions of params) that can run on this device. */
  maxModelSizeBillion: number;
  /** Estimated VRAM in MB (0 if no WebGPU). */
  estimatedVRAMMB: number;
}

/** Options for unified client inference. */
export interface ClientInferOptions {
  /** The task to perform. Determines which engine is used. */
  task: InferenceTask;

  // ── Chat-specific (WebLLM) ────────────────────────────
  /** Chat messages (required for "chat" task). */
  messages?: ChatMessage[];
  /** Whether to stream the chat response. */
  stream?: boolean;
  /** WebLLM config overrides (temperature, maxTokens, topP). */
  webllmConfig?: Partial<WebLLMConfig>;

  // ── ML-pipeline-specific (Transformers.js) ────────────
  /** Input text(s) for non-chat tasks. Single string or array. */
  texts?: string[] | string;
  /** Transformers.js config overrides. */
  transformersConfig?: Partial<TransformersConfig>;
  /** Max summary length in tokens (summarization only). */
  maxLength?: number;
  /** Min summary length in tokens (summarization only). */
  minLength?: number;
}

/** Union result type for all client-side inference operations. */
export type ClientInferResult =
  | { task: "chat"; result: ChatCompletionResult }
  | { task: "chat-stream"; result: AsyncGenerator<ChatCompletionChunk, void, undefined> }
  | { task: "embeddings"; result: EmbeddingResult }
  | { task: "classification"; result: ClassificationResult }
  | { task: "summarization"; result: SummarizationResult }
  | { task: "feature-extraction"; result: FeatureExtractionResult };

// ── Public API ──────────────────────────────────────────────────

/**
 * Assesses what client-side inference capabilities the current device has.
 * Fast synchronous check — no adapter probing or model loading.
 */
export function getClientCapabilities(): ClientCapabilities {
  const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
  const hasWASM = typeof WebAssembly !== "undefined";

  const supportedTasks: InferenceTask[] = [];

  // Transformers.js tasks work with WASM or WebGPU.
  if (hasWASM || hasWebGPU) {
    supportedTasks.push("embeddings", "classification", "summarization", "feature-extraction");
  }

  // WebLLM requires WebGPU.
  if (hasWebGPU) {
    supportedTasks.push("chat");
  }

  // Rough VRAM estimate from device memory (when WebGPU is available).
  let estimatedVRAMMB = 0;
  let maxModelSizeBillion = 0;

  if (hasWebGPU) {
    // Use deviceMemory as a rough proxy (in GB).
    const deviceMemoryGB =
      typeof navigator !== "undefined" && "deviceMemory" in navigator
        ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4)
        : 4;

    // Dedicated GPU VRAM is often separate from system memory.
    // Use system memory as a conservative lower bound.
    estimatedVRAMMB = deviceMemoryGB * 1024;

    // ~1.2GB per billion params (quantized q4). Conservative.
    maxModelSizeBillion = Math.floor(estimatedVRAMMB / 1200);
  }

  return {
    available: supportedTasks.length > 0,
    hasWebGPU,
    hasWASM,
    supportedTasks,
    maxModelSizeBillion,
    estimatedVRAMMB,
  };
}

/**
 * Returns true if any form of client-side inference is available.
 * This is a quick boolean check — use getClientCapabilities() for details.
 */
export function isClientInferenceAvailable(): boolean {
  return getClientCapabilities().available;
}

/**
 * Unified client-side inference entry point.
 * Routes to WebLLM for chat/generation tasks, Transformers.js for ML pipelines.
 *
 * @throws Error if the requested task is not supported on this device.
 * @throws Error if required inputs are missing for the task.
 */
export async function clientInfer(options: ClientInferOptions): Promise<ClientInferResult> {
  const capabilities = getClientCapabilities();

  if (!capabilities.supportedTasks.includes(options.task)) {
    throw new Error(
      `Task "${options.task}" is not supported on this device. ` +
        `Available tasks: ${capabilities.supportedTasks.join(", ") || "none"}. ` +
        `WebGPU: ${String(capabilities.hasWebGPU)}, WASM: ${String(capabilities.hasWASM)}.`,
    );
  }

  switch (options.task) {
    case "chat":
      return handleChatTask(options);
    case "embeddings":
      return handleEmbeddingsTask(options);
    case "classification":
      return handleClassificationTask(options);
    case "summarization":
      return handleSummarizationTask(options);
    case "feature-extraction":
      return handleFeatureExtractionTask(options);
    default: {
      const _exhaustive: never = options.task;
      throw new Error(`Unknown inference task: ${String(_exhaustive)}`);
    }
  }
}

// ── Task Handlers ───────────────────────────────────────────────

async function handleChatTask(options: ClientInferOptions): Promise<ClientInferResult> {
  if (!options.messages || options.messages.length === 0) {
    throw new Error('Task "chat" requires a non-empty "messages" array.');
  }

  // Lazy-import WebLLM functions to keep the module tree-shakeable.
  const { chatCompletion, chatCompletionStream, isWebLLMReady, initializeWebLLM, selectModelForVRAM } =
    await import("./webllm");

  // Auto-initialize if not already ready.
  if (!isWebLLMReady()) {
    const caps = getClientCapabilities();
    const bestModel = selectModelForVRAM(caps.estimatedVRAMMB);
    if (!bestModel) {
      throw new Error(
        "No WebLLM model fits within the estimated VRAM budget. " +
          `Estimated VRAM: ${String(caps.estimatedVRAMMB)}MB.`,
      );
    }
    await initializeWebLLM({
      modelId: bestModel.id,
      temperature: options.webllmConfig?.temperature ?? 0.7,
      maxTokens: options.webllmConfig?.maxTokens ?? 1024,
      topP: options.webllmConfig?.topP ?? 0.95,
    });
  }

  if (options.stream === true) {
    const stream = chatCompletionStream(options.messages, options.webllmConfig);
    return { task: "chat-stream", result: stream };
  }

  const result = await chatCompletion(options.messages, options.webllmConfig);
  return { task: "chat", result };
}

async function handleEmbeddingsTask(options: ClientInferOptions): Promise<ClientInferResult> {
  const texts = normalizeTexts(options.texts, "embeddings");
  const { generateEmbeddings } = await import("./transformers");
  const result = await generateEmbeddings(texts, options.transformersConfig);
  return { task: "embeddings", result };
}

async function handleClassificationTask(
  options: ClientInferOptions,
): Promise<ClientInferResult> {
  const texts = normalizeTexts(options.texts, "classification");
  const text = texts[0];
  if (!text) {
    throw new Error('Task "classification" requires at least one text input.');
  }
  const { classifyText } = await import("./transformers");
  const result = await classifyText(text, options.transformersConfig);
  return { task: "classification", result };
}

async function handleSummarizationTask(
  options: ClientInferOptions,
): Promise<ClientInferResult> {
  const texts = normalizeTexts(options.texts, "summarization");
  const text = texts[0];
  if (!text) {
    throw new Error('Task "summarization" requires at least one text input.');
  }
  const { summarizeText } = await import("./transformers");
  const result = await summarizeText(
    text,
    options.transformersConfig,
    options.maxLength,
    options.minLength,
  );
  return { task: "summarization", result };
}

async function handleFeatureExtractionTask(
  options: ClientInferOptions,
): Promise<ClientInferResult> {
  const texts = normalizeTexts(options.texts, "feature-extraction");
  const { extractFeatures } = await import("./transformers");
  const result = await extractFeatures(texts, options.transformersConfig);
  return { task: "feature-extraction", result };
}

// ── Helpers ─────────────────────────────────────────────────────

function normalizeTexts(
  input: string[] | string | undefined,
  taskName: string,
): string[] {
  if (input === undefined) {
    throw new Error(`Task "${taskName}" requires "texts" to be provided.`);
  }
  if (typeof input === "string") {
    return [input];
  }
  if (input.length === 0) {
    throw new Error(`Task "${taskName}" requires at least one text input.`);
  }
  return input;
}
