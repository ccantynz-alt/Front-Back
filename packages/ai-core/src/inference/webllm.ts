// ── WebLLM Client-Side Inference ──────────────────────────────────
// Runs LLMs directly in the browser via WebGPU. Cost per token: $0.
// Supports streaming chat completions with progress callbacks for model loading.
// Gracefully falls back when WebGPU is unavailable.

import { z } from "zod";

// ── Schemas & Types ──────────────────────────────────────────────

/**
 * Available models for client-side WebLLM inference.
 * Each model has known VRAM requirements and performance characteristics.
 */
export const WebLLMModelId = z.enum([
  "Llama-3.1-8B-Instruct-q4f32_1-MLC",
  "Phi-3.5-mini-instruct-q4f16_1-MLC",
  "gemma-2-2b-it-q4f32_1-MLC",
]);
export type WebLLMModelId = z.infer<typeof WebLLMModelId>;

/** Human-readable model metadata for UI display and selection. */
export interface WebLLMModelInfo {
  id: WebLLMModelId;
  name: string;
  parametersBillion: number;
  minVRAMMB: number;
  description: string;
}

/** All available client-side models with their requirements. */
export const WEBLLM_MODELS: readonly WebLLMModelInfo[] = [
  {
    id: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
    name: "Llama 3.1 8B",
    parametersBillion: 8,
    minVRAMMB: 6144,
    description: "Meta's Llama 3.1 8B — strong general-purpose chat, 41 tok/s on WebGPU",
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    name: "Phi-3.5 Mini",
    parametersBillion: 3.8,
    minVRAMMB: 3072,
    description: "Microsoft Phi-3.5 Mini — fast reasoning, small footprint",
  },
  {
    id: "gemma-2-2b-it-q4f32_1-MLC",
    name: "Gemma 2 2B",
    parametersBillion: 2,
    minVRAMMB: 2048,
    description: "Google Gemma 2 2B — ultra-light, ideal for low-VRAM devices",
  },
] as const;

/** Configuration for initializing a WebLLM engine. */
export const WebLLMConfigSchema = z.object({
  modelId: WebLLMModelId,
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(4096).default(1024),
  topP: z.number().min(0).max(1).default(0.95),
});
export type WebLLMConfig = z.infer<typeof WebLLMConfigSchema>;

/** A single message in a chat conversation. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Progress report during model download/initialization. */
export interface ModelLoadProgress {
  phase: "download" | "init" | "ready";
  progress: number; // 0..1
  timeElapsedMs: number;
  text: string;
}

/** Callback invoked during model loading with progress updates. */
export type ModelLoadProgressCallback = (progress: ModelLoadProgress) => void;

/** Result of a non-streaming chat completion. */
export interface ChatCompletionResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelId: WebLLMModelId;
  tier: "client";
}

/** A single chunk from a streaming chat completion. */
export interface ChatCompletionChunk {
  delta: string;
  done: boolean;
}

// ── Engine Singleton ─────────────────────────────────────────────

/**
 * Lazy-loaded WebLLM engine reference. We keep at most one engine alive
 * to avoid blowing through VRAM with multiple model instances.
 */
interface EngineState {
  engine: WebLLMEngine;
  modelId: WebLLMModelId;
}

/** Minimal interface matching the WebLLM MLCEngine we depend on. */
interface WebLLMEngine {
  chat: {
    completions: {
      create: (params: {
        messages: ChatMessage[];
        temperature: number;
        max_tokens: number;
        top_p: number;
        stream: boolean;
      }) => Promise<WebLLMChatCompletion | AsyncIterable<WebLLMStreamChunk>>;
    };
  };
  unload: () => Promise<void>;
}

interface WebLLMChatCompletion {
  choices: Array<{
    message: { content: string | null };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface WebLLMStreamChunk {
  choices: Array<{
    delta: { content?: string | null };
    finish_reason: string | null;
  }>;
}

let currentEngine: EngineState | null = null;

// ── Public API ───────────────────────────────────────────────────

/**
 * Returns true if WebGPU is available in the current environment.
 * Fast synchronous check -- does not probe the adapter.
 */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/**
 * Initializes the WebLLM engine with the specified model.
 * Downloads model weights on first use (cached in IndexedDB after that).
 *
 * If an engine is already loaded with a different model, the old engine
 * is unloaded first. If the same model is already loaded, this is a no-op.
 *
 * @throws Error if WebGPU is not available.
 */
export async function initializeWebLLM(
  config: WebLLMConfig,
  onProgress?: ModelLoadProgressCallback,
): Promise<void> {
  if (!isWebGPUAvailable()) {
    throw new Error(
      "WebGPU is not available in this environment. " +
        "Client-side inference requires a WebGPU-capable browser (Chrome 113+, Edge 113+).",
    );
  }

  // Already loaded with the same model -- nothing to do.
  if (currentEngine !== null && currentEngine.modelId === config.modelId) {
    onProgress?.({
      phase: "ready",
      progress: 1,
      timeElapsedMs: 0,
      text: `Model ${config.modelId} already loaded`,
    });
    return;
  }

  // Unload any existing engine first to free VRAM.
  if (currentEngine !== null) {
    await currentEngine.engine.unload();
    currentEngine = null;
  }

  const startTime = performance.now();

  // Dynamic import -- WebLLM is a large dependency that should only load in the browser.
  const { CreateMLCEngine } = (await import("@mlc-ai/web-llm")) as {
    CreateMLCEngine: (
      modelId: string,
      opts: {
        initProgressCallback?: (report: { progress: number; text: string }) => void;
      },
    ) => Promise<WebLLMEngine>;
  };

  const engine = await CreateMLCEngine(config.modelId, {
    initProgressCallback: (report: { progress: number; text: string }) => {
      const elapsed = performance.now() - startTime;
      const phase: ModelLoadProgress["phase"] = report.progress < 1 ? "download" : "init";
      onProgress?.({
        phase,
        progress: report.progress,
        timeElapsedMs: elapsed,
        text: report.text,
      });
    },
  });

  currentEngine = { engine, modelId: config.modelId };

  onProgress?.({
    phase: "ready",
    progress: 1,
    timeElapsedMs: performance.now() - startTime,
    text: `Model ${config.modelId} ready`,
  });
}

/**
 * Runs a chat completion against the loaded WebLLM engine.
 * Returns the full response (non-streaming).
 *
 * @throws Error if the engine is not initialized.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  config?: Partial<WebLLMConfig>,
): Promise<ChatCompletionResult> {
  if (currentEngine === null) {
    throw new Error(
      "WebLLM engine is not initialized. Call initializeWebLLM() first.",
    );
  }

  const defaults = WebLLMConfigSchema.parse({
    modelId: currentEngine.modelId,
    ...config,
  });

  const response = (await currentEngine.engine.chat.completions.create({
    messages,
    temperature: defaults.temperature,
    max_tokens: defaults.maxTokens,
    top_p: defaults.topP,
    stream: false,
  })) as WebLLMChatCompletion;

  const choice = response.choices[0];
  if (!choice) {
    throw new Error("WebLLM returned empty response -- no choices.");
  }

  return {
    content: choice.message.content ?? "",
    usage: {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    },
    modelId: currentEngine.modelId,
    tier: "client",
  };
}

/**
 * Runs a streaming chat completion against the loaded WebLLM engine.
 * Yields chunks as they arrive -- each chunk contains a delta string.
 *
 * @throws Error if the engine is not initialized.
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  config?: Partial<WebLLMConfig>,
): AsyncGenerator<ChatCompletionChunk, void, undefined> {
  if (currentEngine === null) {
    throw new Error(
      "WebLLM engine is not initialized. Call initializeWebLLM() first.",
    );
  }

  const defaults = WebLLMConfigSchema.parse({
    modelId: currentEngine.modelId,
    ...config,
  });

  const stream = (await currentEngine.engine.chat.completions.create({
    messages,
    temperature: defaults.temperature,
    max_tokens: defaults.maxTokens,
    top_p: defaults.topP,
    stream: true,
  })) as AsyncIterable<WebLLMStreamChunk>;

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    const delta = choice.delta.content ?? "";
    const done = choice.finish_reason !== null;

    yield { delta, done };

    if (done) return;
  }
}

/**
 * Returns metadata for a specific model by ID.
 */
export function getModelInfo(modelId: WebLLMModelId): WebLLMModelInfo {
  const info = WEBLLM_MODELS.find((m) => m.id === modelId);
  if (!info) {
    throw new Error(`Unknown WebLLM model: ${modelId}`);
  }
  return info;
}

/**
 * Returns the best model that fits within the given VRAM budget.
 * Models are sorted by size descending -- the largest that fits is returned.
 * Returns undefined if no model fits.
 */
export function selectModelForVRAM(vramMB: number): WebLLMModelInfo | undefined {
  // Sort by parameters descending -- prefer the most capable model
  const sorted = [...WEBLLM_MODELS].sort(
    (a, b) => b.parametersBillion - a.parametersBillion,
  );
  return sorted.find((m) => m.minVRAMMB <= vramMB);
}

/**
 * Unloads the current engine and frees VRAM.
 * No-op if no engine is loaded.
 */
export async function unloadWebLLM(): Promise<void> {
  if (currentEngine !== null) {
    await currentEngine.engine.unload();
    currentEngine = null;
  }
}

/**
 * Returns true if a model is currently loaded and ready for inference.
 */
export function isWebLLMReady(): boolean {
  return currentEngine !== null;
}

/**
 * Returns the currently loaded model ID, or undefined if no model is loaded.
 */
export function getLoadedModelId(): WebLLMModelId | undefined {
  return currentEngine?.modelId;
}
