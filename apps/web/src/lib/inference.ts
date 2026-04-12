// ── Client-Side AI Inference Engine ──────────────────────────────────
// Manages in-browser AI inference via WebLLM + Transformers.js.
// Cost per token: $0. No API call. No latency. No server.
// Falls back gracefully to edge/cloud when WebGPU is unavailable.

import { getDeviceCapabilities, canRunLocally, type WebGPUInfo, detectWebGPU } from "./webgpu";
import type { ComputeTier, DeviceCapabilities } from "@back-to-the-future/ai-core";

// ── Types ────────────────────────────────────────────────────────────

export interface InferenceCapabilities {
  hasWebGPU: boolean;
  gpuInfo: WebGPUInfo | null;
  deviceCaps: DeviceCapabilities;
  canRunClientInference: boolean;
  supportedModels: ModelInfo[];
}

export interface ModelInfo {
  id: string;
  name: string;
  parametersBillion: number;
  minVRAMMB: number;
  type: "chat" | "embedding" | "classification";
  backend: "webllm" | "transformers";
  /** The identifier used by the backend library */
  backendId: string;
}

export interface GenerateOptions {
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  topP?: number | undefined;
  onToken?: ((token: string) => void) | undefined;
  systemPrompt?: string | undefined;
}

export interface GenerateResult {
  text: string;
  tokenCount: number;
  tokensPerSecond: number;
  latencyMs: number;
  tier: ComputeTier;
}

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  latencyMs: number;
  tier: ComputeTier;
}

export type ModelStatus = "idle" | "loading" | "ready" | "error" | "unavailable";

export class InferenceError extends Error {
  constructor(
    message: string,
    public readonly code: "NO_WEBGPU" | "MODEL_TOO_LARGE" | "LOAD_FAILED" | "INFERENCE_FAILED" | "NOT_LOADED",
    public readonly tier: ComputeTier = "client",
  ) {
    super(message);
    this.name = "InferenceError";
  }
}

// ── Model Registry ──────────────────────────────────────────────────

export const MODEL_REGISTRY: ModelInfo[] = [
  {
    id: "smollm2-360m",
    name: "SmolLM2 360M",
    parametersBillion: 0.36,
    minVRAMMB: 512,
    type: "chat",
    backend: "webllm",
    backendId: "SmolLM2-360M-Instruct-q4f16_1-MLC",
  },
  {
    id: "smollm2-1.7b",
    name: "SmolLM2 1.7B",
    parametersBillion: 1.7,
    minVRAMMB: 2048,
    type: "chat",
    backend: "webllm",
    backendId: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
  },
  {
    id: "phi-3.5-mini",
    name: "Phi 3.5 Mini",
    parametersBillion: 3.8,
    minVRAMMB: 3072,
    type: "chat",
    backend: "webllm",
    backendId: "Phi-3.5-mini-instruct-q4f16_1-MLC",
  },
  {
    id: "llama-3.2-1b",
    name: "Llama 3.2 1B",
    parametersBillion: 1.0,
    minVRAMMB: 1024,
    type: "chat",
    backend: "webllm",
    backendId: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  },
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2 3B",
    parametersBillion: 3.0,
    minVRAMMB: 2560,
    type: "chat",
    backend: "webllm",
    backendId: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  },
  {
    id: "embedding-minilm",
    name: "MiniLM-L6 Embeddings",
    parametersBillion: 0.02,
    minVRAMMB: 128,
    type: "embedding",
    backend: "transformers",
    backendId: "Xenova/all-MiniLM-L6-v2",
  },
  {
    id: "embedding-bge-small",
    name: "BGE Small Embeddings",
    parametersBillion: 0.03,
    minVRAMMB: 256,
    type: "embedding",
    backend: "transformers",
    backendId: "Xenova/bge-small-en-v1.5",
  },
];

// ── Inference Engine ────────────────────────────────────────────────

type WebLLMEngine = {
  chat: {
    completions: {
      create(params: {
        messages: Array<{ role: string; content: string }>;
        max_tokens?: number;
        temperature?: number;
        top_p?: number;
        stream?: boolean;
      }): Promise<unknown>;
    };
  };
  unload(): Promise<void>;
};

type TransformersPipeline = (
  text: string,
  options?: { pooling?: string; normalize?: boolean },
) => Promise<{ data: Float32Array }>;

let chatEngine: WebLLMEngine | null = null;
let embeddingPipeline: TransformersPipeline | null = null;
let currentModelId: string | null = null;
let modelStatus: ModelStatus = "idle";
let cachedCapabilities: InferenceCapabilities | null = null;

/** Detect full device capabilities for client-side inference. */
export async function detectCapabilities(): Promise<InferenceCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;

  const gpuInfo = await detectWebGPU();
  const deviceCaps = await getDeviceCapabilities();

  const supportedModels = MODEL_REGISTRY.filter((model) => {
    if (!gpuInfo.supported) return false;
    if (model.backend === "webllm") {
      return canRunLocally(deviceCaps, model.parametersBillion) && deviceCaps.vramMB >= model.minVRAMMB;
    }
    // Transformers.js embeddings have very low requirements
    return gpuInfo.supported;
  });

  cachedCapabilities = {
    hasWebGPU: gpuInfo.supported,
    gpuInfo: gpuInfo.supported ? gpuInfo : null,
    deviceCaps,
    canRunClientInference: supportedModels.length > 0,
    supportedModels,
  };

  return cachedCapabilities;
}

/** Load a chat model into the browser via WebLLM. */
export async function loadModel(
  modelId: string,
  onProgress?: (progress: number, message: string) => void,
): Promise<void> {
  const caps = await detectCapabilities();

  if (!caps.hasWebGPU) {
    modelStatus = "unavailable";
    throw new InferenceError("WebGPU is not available on this device", "NO_WEBGPU");
  }

  const model = MODEL_REGISTRY.find((m) => m.id === modelId);
  if (!model) {
    throw new InferenceError(`Unknown model: ${modelId}`, "LOAD_FAILED");
  }

  if (model.type !== "chat") {
    throw new InferenceError(`Model ${modelId} is not a chat model. Use getEmbeddings() instead.`, "LOAD_FAILED");
  }

  const supported = caps.supportedModels.find((m) => m.id === modelId);
  if (!supported) {
    modelStatus = "unavailable";
    throw new InferenceError(
      `Model ${model.name} requires ${model.minVRAMMB}MB VRAM. Device has ~${caps.deviceCaps.vramMB}MB.`,
      "MODEL_TOO_LARGE",
    );
  }

  // Unload previous model if different
  if (currentModelId && currentModelId !== modelId && chatEngine) {
    await unloadModel();
  }

  if (currentModelId === modelId && chatEngine) {
    return; // Already loaded
  }

  modelStatus = "loading";

  try {
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    chatEngine = await CreateMLCEngine(model.backendId, {
      initProgressCallback: (report: { progress: number; text: string }) => {
        onProgress?.(report.progress, report.text);
      },
    }) as unknown as WebLLMEngine;

    currentModelId = modelId;
    modelStatus = "ready";
  } catch (err) {
    modelStatus = "error";
    chatEngine = null;
    currentModelId = null;
    throw new InferenceError(
      `Failed to load model ${model.name}: ${err instanceof Error ? err.message : String(err)}`,
      "LOAD_FAILED",
    );
  }
}

/** Run text generation on the loaded client-side model. Returns streamed tokens via callback. */
export async function generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
  if (!chatEngine || !currentModelId) {
    throw new InferenceError("No model loaded. Call loadModel() first.", "NOT_LOADED");
  }

  const start = performance.now();
  let tokenCount = 0;

  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    if (options.onToken) {
      // Streaming mode
      const stream = await chatEngine.chat.completions.create({
        messages,
        max_tokens: options.maxTokens ?? 512,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP ?? 0.9,
        stream: true,
      });

      let text = "";
      for await (const chunk of stream as AsyncIterable<{ choices: Array<{ delta: { content?: string } }> }>) {
        const token = chunk.choices[0]?.delta?.content ?? "";
        if (token) {
          text += token;
          tokenCount++;
          options.onToken(token);
        }
      }

      const latencyMs = Math.round(performance.now() - start);
      return {
        text,
        tokenCount,
        tokensPerSecond: latencyMs > 0 ? Math.round((tokenCount / latencyMs) * 1000) : 0,
        latencyMs,
        tier: "client",
      };
    }

    // Non-streaming mode
    const reply = await chatEngine.chat.completions.create({
      messages,
      max_tokens: options.maxTokens ?? 512,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.9,
      stream: false,
    });

    const message =
      (reply as { choices: Array<{ message: { content: string } }> }).choices[0]?.message?.content ?? "";
    tokenCount = message.split(/\s+/).filter(Boolean).length;
    const latencyMs = Math.round(performance.now() - start);

    return {
      text: message,
      tokenCount,
      tokensPerSecond: latencyMs > 0 ? Math.round((tokenCount / latencyMs) * 1000) : 0,
      latencyMs,
      tier: "client",
    };
  } catch (err) {
    if (err instanceof InferenceError) throw err;
    throw new InferenceError(
      `Inference failed: ${err instanceof Error ? err.message : String(err)}`,
      "INFERENCE_FAILED",
    );
  }
}

/** Generate embeddings locally via Transformers.js. */
export async function getEmbeddings(
  text: string,
  modelId: string = "embedding-minilm",
): Promise<EmbeddingResult> {
  const caps = await detectCapabilities();

  if (!caps.hasWebGPU) {
    throw new InferenceError("WebGPU is not available for embeddings", "NO_WEBGPU");
  }

  const model = MODEL_REGISTRY.find((m) => m.id === modelId);
  if (!model || model.type !== "embedding") {
    throw new InferenceError(`Unknown embedding model: ${modelId}`, "LOAD_FAILED");
  }

  const start = performance.now();

  try {
    if (!embeddingPipeline) {
      const { pipeline } = await import("@huggingface/transformers");
      embeddingPipeline = (await pipeline(
        "feature-extraction",
        model.backendId,
      )) as unknown as TransformersPipeline;
    }

    const output = await embeddingPipeline(text, { pooling: "mean", normalize: true });
    const vector = Array.from(output.data);
    const latencyMs = Math.round(performance.now() - start);

    return {
      vector,
      dimensions: vector.length,
      latencyMs,
      tier: "client",
    };
  } catch (err) {
    embeddingPipeline = null;
    throw new InferenceError(
      `Embedding failed: ${err instanceof Error ? err.message : String(err)}`,
      "INFERENCE_FAILED",
    );
  }
}

/** Check if a chat model is currently loaded and ready. */
export function isModelLoaded(): boolean {
  return modelStatus === "ready" && chatEngine !== null;
}

/** Get the current model status. */
export function getModelStatus(): ModelStatus {
  return modelStatus;
}

/** Get the currently loaded model ID, or null. */
export function getLoadedModelId(): string | null {
  return currentModelId;
}

/** Free GPU memory by unloading the current model. */
export async function unloadModel(): Promise<void> {
  if (chatEngine) {
    try {
      await chatEngine.unload();
    } catch {
      // Best-effort cleanup
    }
    chatEngine = null;
  }
  currentModelId = null;
  modelStatus = "idle";
}

/** Free all resources including embedding pipeline. */
export async function disposeAll(): Promise<void> {
  await unloadModel();
  embeddingPipeline = null;
  cachedCapabilities = null;
}

/** Get a model from the registry by ID. */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.id === modelId);
}

/** Get all chat models from the registry. */
export function getChatModels(): ModelInfo[] {
  return MODEL_REGISTRY.filter((m) => m.type === "chat");
}

/** Get all embedding models from the registry. */
export function getEmbeddingModels(): ModelInfo[] {
  return MODEL_REGISTRY.filter((m) => m.type === "embedding");
}
