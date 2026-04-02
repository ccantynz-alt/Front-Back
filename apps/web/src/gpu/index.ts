// ── GPU Module Barrel Export ─────────────────────────────────────────
// Everything GPU: detection, compute, inference, Chrome AI.

// ── WebGPU Detection ────────────────────────────────────────────────
export {
  detectWebGPU,
  getComputeTier,
  detectGraphicsBackend,
  type GPUCapabilities,
  type GPUComputeTier,
  type GraphicsBackend,
  type GPUAdapterInfo,
} from "./webgpu-detect";

// ── WebGPU Compute ──────────────────────────────────────────────────
export {
  WebGPUCompute,
  type ShaderBinding,
  type WorkgroupSize,
} from "./compute";

// ── Client-Side AI Inference ────────────────────────────────────────
export {
  ClientInferenceEngine,
  type ClassificationResult,
  type LoadedModel,
  type InferenceTier,
  type InferenceResult,
} from "./inference/client-inference";

// ── Chrome Built-in AI ──────────────────────────────────────────────
export {
  isChromeAIAvailable,
  chromeAISummarize,
  chromeAITranslate,
  chromeAIPrompt,
  chromeAIPromptStream,
  type ChromeAICapabilities,
  type ChromeAISummarizeOptions,
  type ChromeAITranslateOptions,
  type ChromeAIPromptOptions,
} from "./inference/chrome-ai";
