// ── Transformers.js Client-Side ML Inference ─────────────────────
// Runs ML pipelines directly in the browser via WebGPU or WASM.
// Embeddings, classification, summarization, feature extraction.
// Cost per inference: $0. The user's hardware does the work.
// Gracefully falls back to WASM when WebGPU is unavailable.

import { z } from "zod";

// ── Schemas & Types ──────────────────────────────────────────────

/** Supported pipeline tasks for client-side ML. */
export const TransformersTask = z.enum([
  "feature-extraction",
  "text-classification",
  "summarization",
  "embeddings",
]);
export type TransformersTask = z.infer<typeof TransformersTask>;

/** Model identifiers for each pipeline task. */
export const TransformersModelId = z.enum([
  "Xenova/all-MiniLM-L6-v2",
  "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
  "Xenova/distilbart-cnn-6-6",
  "Xenova/bge-small-en-v1.5",
]);
export type TransformersModelId = z.infer<typeof TransformersModelId>;

/** Metadata for a Transformers.js model. */
export interface TransformersModelInfo {
  id: TransformersModelId;
  name: string;
  task: TransformersTask;
  sizeEstimateMB: number;
  description: string;
}

/** All available client-side Transformers.js models. */
export const TRANSFORMERS_MODELS: readonly TransformersModelInfo[] = [
  {
    id: "Xenova/all-MiniLM-L6-v2",
    name: "all-MiniLM-L6-v2",
    task: "embeddings",
    sizeEstimateMB: 23,
    description: "Sentence embeddings — 384-dim, fast, ideal for semantic search",
  },
  {
    id: "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
    name: "DistilBERT SST-2",
    task: "text-classification",
    sizeEstimateMB: 67,
    description: "Sentiment analysis — positive/negative classification",
  },
  {
    id: "Xenova/distilbart-cnn-6-6",
    name: "DistilBART CNN",
    task: "summarization",
    sizeEstimateMB: 305,
    description: "Text summarization — condenses long text into key points",
  },
  {
    id: "Xenova/bge-small-en-v1.5",
    name: "BGE Small EN",
    task: "feature-extraction",
    sizeEstimateMB: 33,
    description: "Feature extraction — 384-dim embeddings for downstream tasks",
  },
] as const;

/** Configuration for a Transformers.js pipeline. */
export const TransformersConfigSchema = z.object({
  modelId: TransformersModelId,
  task: TransformersTask,
  /**
   * Quantization level. "q8" is default for size/quality balance.
   * "fp32" for maximum accuracy, "q4" for minimum size.
   */
  quantization: z.enum(["fp32", "fp16", "q8", "q4"]).default("q8"),
  /** Use WebGPU backend when available for faster inference. */
  preferWebGPU: z.boolean().default(true),
});
export type TransformersConfig = z.infer<typeof TransformersConfigSchema>;

/** Result of a text embedding operation. */
export interface EmbeddingResult {
  embeddings: number[][];
  dimensions: number;
  modelId: TransformersModelId;
  tier: "client";
}

/** A single classification label with its score. */
export interface ClassificationLabel {
  label: string;
  score: number;
}

/** Result of a text classification operation. */
export interface ClassificationResult {
  labels: ClassificationLabel[];
  modelId: TransformersModelId;
  tier: "client";
}

/** Result of a summarization operation. */
export interface SummarizationResult {
  summary: string;
  modelId: TransformersModelId;
  tier: "client";
}

/** Result of a feature extraction operation. */
export interface FeatureExtractionResult {
  features: number[][];
  dimensions: number;
  modelId: TransformersModelId;
  tier: "client";
}

/** Progress callback for model download/initialization. */
export interface TransformersLoadProgress {
  phase: "download" | "init" | "ready";
  progress: number; // 0..1
  file: string;
  text: string;
}

export type TransformersLoadProgressCallback = (progress: TransformersLoadProgress) => void;

// ── Pipeline Cache ──────────────────────────────────────────────

/**
 * Minimal interface for Transformers.js pipeline instances.
 * We define these instead of importing the full library to keep
 * the module tree-shakeable and lazily loadable.
 */
interface PipelineInstance {
  (input: string | string[], options?: Record<string, unknown>): Promise<unknown>;
  dispose?: () => Promise<void>;
}

/** Cache pipelines by model ID to avoid re-downloading. */
const pipelineCache = new Map<TransformersModelId, PipelineInstance>();

// ── Internal Helpers ────────────────────────────────────────────

/**
 * Dynamically imports @huggingface/transformers and creates a pipeline.
 * Lazy-loading keeps the initial bundle tiny.
 */
async function loadPipeline(
  config: TransformersConfig,
  onProgress?: TransformersLoadProgressCallback,
): Promise<PipelineInstance> {
  const cached = pipelineCache.get(config.modelId);
  if (cached) {
    onProgress?.({
      phase: "ready",
      progress: 1,
      file: "",
      text: `Pipeline ${config.modelId} already loaded`,
    });
    return cached;
  }

  // Dynamic import — @huggingface/transformers is heavy and browser-only.
  const { pipeline, env } = (await import("@huggingface/transformers")) as {
    pipeline: (
      task: string,
      model: string,
      options?: Record<string, unknown>,
    ) => Promise<PipelineInstance>;
    env: {
      allowLocalModels: boolean;
      useBrowserCache: boolean;
      backends: {
        onnx: {
          wasm?: { proxy: boolean };
        };
      };
    };
  };

  // Configure environment for browser usage.
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  // Determine the best available device.
  const useGPU = config.preferWebGPU && isWebGPUAvailableSync();

  const pipelineTask = config.task === "embeddings" ? "feature-extraction" : config.task;

  const pipelineInstance = await pipeline(pipelineTask, config.modelId, {
    device: useGPU ? "webgpu" : "wasm",
    dtype: config.quantization,
    progress_callback: (event: { progress?: number; file?: string; status?: string }) => {
      const progress = typeof event.progress === "number" ? event.progress / 100 : 0;
      const phase: TransformersLoadProgress["phase"] = progress < 1 ? "download" : "init";
      onProgress?.({
        phase,
        progress: Math.min(progress, 1),
        file: event.file ?? "",
        text: event.status ?? `Loading ${config.modelId}`,
      });
    },
  });

  pipelineCache.set(config.modelId, pipelineInstance);

  onProgress?.({
    phase: "ready",
    progress: 1,
    file: "",
    text: `Pipeline ${config.modelId} ready`,
  });

  return pipelineInstance;
}

/**
 * Synchronous check for WebGPU availability.
 */
function isWebGPUAvailableSync(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Returns true if the environment supports Transformers.js inference.
 * Transformers.js works via WASM even without WebGPU, so this is almost always true
 * in a browser context.
 */
export function isTransformersAvailable(): boolean {
  return typeof self !== "undefined" && typeof WebAssembly !== "undefined";
}

/**
 * Returns true if WebGPU acceleration is available for Transformers.js.
 */
export function isTransformersGPUAvailable(): boolean {
  return isWebGPUAvailableSync();
}

/**
 * Generates text embeddings for semantic search and similarity.
 * Uses all-MiniLM-L6-v2 by default (384-dim, fast, accurate).
 *
 * @param texts - One or more strings to embed.
 * @param options - Optional model and configuration overrides.
 * @param onProgress - Optional callback for model loading progress.
 * @returns Embedding vectors and metadata.
 */
export async function generateEmbeddings(
  texts: string[],
  options?: Partial<TransformersConfig>,
  onProgress?: TransformersLoadProgressCallback,
): Promise<EmbeddingResult> {
  const config = TransformersConfigSchema.parse({
    modelId: "Xenova/all-MiniLM-L6-v2",
    task: "embeddings",
    ...options,
  });

  const pipe = await loadPipeline(config, onProgress);
  const output = (await pipe(texts, {
    pooling: "mean",
    normalize: true,
  })) as { tolist: () => number[][] };

  const embeddings = output.tolist();
  const dimensions = embeddings[0]?.length ?? 0;

  return {
    embeddings,
    dimensions,
    modelId: config.modelId,
    tier: "client",
  };
}

/**
 * Classifies text using a pre-trained classification model.
 * Uses DistilBERT SST-2 by default (sentiment analysis).
 *
 * @param text - The text to classify.
 * @param options - Optional model and configuration overrides.
 * @param onProgress - Optional callback for model loading progress.
 * @returns Classification labels with confidence scores.
 */
export async function classifyText(
  text: string,
  options?: Partial<TransformersConfig>,
  onProgress?: TransformersLoadProgressCallback,
): Promise<ClassificationResult> {
  const config = TransformersConfigSchema.parse({
    modelId: "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
    task: "text-classification",
    ...options,
  });

  const pipe = await loadPipeline(config, onProgress);
  const output = (await pipe(text)) as ClassificationLabel[] | ClassificationLabel[][];

  // The pipeline may return nested arrays for single inputs.
  const labels = Array.isArray(output[0]) ? (output[0] as ClassificationLabel[]) : (output as ClassificationLabel[]);

  return {
    labels,
    modelId: config.modelId,
    tier: "client",
  };
}

/**
 * Summarizes text using a pre-trained summarization model.
 * Uses DistilBART CNN by default.
 *
 * @param text - The text to summarize.
 * @param options - Optional model and configuration overrides.
 * @param maxLength - Maximum length of the summary in tokens.
 * @param minLength - Minimum length of the summary in tokens.
 * @param onProgress - Optional callback for model loading progress.
 * @returns The summarized text.
 */
export async function summarizeText(
  text: string,
  options?: Partial<TransformersConfig>,
  maxLength = 150,
  minLength = 30,
  onProgress?: TransformersLoadProgressCallback,
): Promise<SummarizationResult> {
  const config = TransformersConfigSchema.parse({
    modelId: "Xenova/distilbart-cnn-6-6",
    task: "summarization",
    ...options,
  });

  const pipe = await loadPipeline(config, onProgress);
  const output = (await pipe(text, {
    max_length: maxLength,
    min_length: minLength,
  })) as Array<{ summary_text: string }>;

  const result = output[0];
  if (!result) {
    throw new Error("Summarization returned empty result.");
  }

  return {
    summary: result.summary_text,
    modelId: config.modelId,
    tier: "client",
  };
}

/**
 * Extracts feature vectors from text for downstream ML tasks.
 * Uses BGE Small EN by default (384-dim).
 *
 * @param texts - One or more strings to extract features from.
 * @param options - Optional model and configuration overrides.
 * @param onProgress - Optional callback for model loading progress.
 * @returns Feature vectors and metadata.
 */
export async function extractFeatures(
  texts: string[],
  options?: Partial<TransformersConfig>,
  onProgress?: TransformersLoadProgressCallback,
): Promise<FeatureExtractionResult> {
  const config = TransformersConfigSchema.parse({
    modelId: "Xenova/bge-small-en-v1.5",
    task: "feature-extraction",
    ...options,
  });

  const pipe = await loadPipeline(config, onProgress);
  const output = (await pipe(texts, {
    pooling: "mean",
    normalize: true,
  })) as { tolist: () => number[][] };

  const features = output.tolist();
  const dimensions = features[0]?.length ?? 0;

  return {
    features,
    dimensions,
    modelId: config.modelId,
    tier: "client",
  };
}

/**
 * Returns metadata for a specific Transformers.js model.
 */
export function getTransformersModelInfo(
  modelId: TransformersModelId,
): TransformersModelInfo {
  const info = TRANSFORMERS_MODELS.find((m) => m.id === modelId);
  if (!info) {
    throw new Error(`Unknown Transformers.js model: ${modelId}`);
  }
  return info;
}

/**
 * Returns all available models for a specific task.
 */
export function getModelsForTask(task: TransformersTask): TransformersModelInfo[] {
  return TRANSFORMERS_MODELS.filter((m) => m.task === task);
}

/**
 * Disposes a cached pipeline and frees resources.
 * No-op if the pipeline is not cached.
 */
export async function disposePipeline(modelId: TransformersModelId): Promise<void> {
  const cached = pipelineCache.get(modelId);
  if (cached) {
    if (typeof cached.dispose === "function") {
      await cached.dispose();
    }
    pipelineCache.delete(modelId);
  }
}

/**
 * Disposes all cached pipelines and frees resources.
 */
export async function disposeAllPipelines(): Promise<void> {
  const entries = [...pipelineCache.entries()];
  for (const [modelId, pipe] of entries) {
    if (typeof pipe.dispose === "function") {
      await pipe.dispose();
    }
    pipelineCache.delete(modelId);
  }
}

/**
 * Returns the list of currently cached pipeline model IDs.
 */
export function getCachedPipelines(): TransformersModelId[] {
  return [...pipelineCache.keys()];
}
