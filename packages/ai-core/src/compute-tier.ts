// ── Three-Tier Compute Router ──────────────────────────────────────
// Routes AI workloads to the cheapest tier that meets requirements.
// Client GPU ($0/token) → Edge (sub-50ms) → Cloud (full power)
//
// Cloud tier delegates to Modal.com GPU workers for heavy inference,
// video processing, and fine-tuning on A100/H100 GPUs.

import { z } from "zod";

import type { InferenceTask } from "./inference/index";

export type ComputeTier = "client" | "edge" | "cloud";

export interface DeviceCapabilities {
  hasWebGPU: boolean;
  vramMB: number;
  hardwareConcurrency: number;
  deviceMemoryGB: number;
  connectionType: "4g" | "3g" | "2g" | "slow-2g" | "wifi" | "ethernet" | "unknown";
  /** Whether WebAssembly is available (enables WASM-based Transformers.js). */
  hasWASM?: boolean;
}

export interface ModelRequirements {
  parametersBillion: number;
  minVRAMMB: number;
  latencyMaxMs: number;
  /**
   * Optional inference task hint. When provided, the router can prefer
   * client-side even for non-WebGPU devices (e.g. WASM-based embeddings).
   */
  task?: InferenceTask;
}

/**
 * Tasks that Transformers.js can handle via WASM without WebGPU.
 * These are lightweight ML pipelines, not full LLM inference.
 */
const WASM_CAPABLE_TASKS: ReadonlySet<InferenceTask> = new Set([
  "embeddings",
  "classification",
  "summarization",
  "feature-extraction",
]);

export function computeTierRouter(
  device: DeviceCapabilities,
  model: ModelRequirements,
): ComputeTier {
  // Tier 0 (client, WASM path): Lightweight ML tasks via Transformers.js
  // These can run on WASM even without WebGPU — embeddings, classification, etc.
  // Only applies when the task is explicitly a WASM-capable pipeline task
  // and the model is small enough (< 1B params typically).
  if (
    model.task !== undefined &&
    WASM_CAPABLE_TASKS.has(model.task) &&
    (device.hasWASM === true || device.hasWebGPU) &&
    model.parametersBillion <= 1 &&
    model.latencyMaxMs >= 10
  ) {
    return "client";
  }

  // Tier 1: Client GPU — free, fastest, models under 2B params
  if (
    device.hasWebGPU &&
    device.vramMB >= model.minVRAMMB &&
    model.parametersBillion <= 2 &&
    model.latencyMaxMs >= 10
  ) {
    return "client";
  }

  // Tier 2: Edge — sub-50ms, lightweight inference
  if (model.parametersBillion <= 7 && model.latencyMaxMs >= 50) {
    return "edge";
  }

  // Tier 3: Cloud — full power, heavy inference
  return "cloud";
}

// ── Cloud Tier Types ────────────────────────────────────────────────
// Type definitions for cloud tier GPU worker integration.
// The actual client lives in @back-to-the-future/gpu-workers to
// avoid a circular dependency. These types allow compute-tier
// consumers to understand cloud tier responses without importing
// the full GPU worker package.

export const CloudInferenceRequestSchema = z.object({
  model: z.enum(["llama-3.1-70b", "mixtral-8x7b", "sdxl-1.0"]),
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().int().min(1).max(32_768).default(2048),
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).default(0.9),
  stream: z.boolean().default(true),
});

export type CloudInferenceRequest = z.infer<typeof CloudInferenceRequestSchema>;

export const CloudInferenceResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  text: z.string(),
  finishReason: z.enum(["stop", "length", "error"]),
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
  latencyMs: z.number().nonnegative(),
  tier: z.literal("cloud"),
});

export type CloudInferenceResponse = z.infer<typeof CloudInferenceResponseSchema>;

export const CloudStreamChunkSchema = z.object({
  id: z.string(),
  delta: z.string(),
  finishReason: z.enum(["stop", "length", "error"]).nullable(),
  tier: z.literal("cloud"),
});

export type CloudStreamChunk = z.infer<typeof CloudStreamChunkSchema>;

// ── Cloud Tier Routing Helper ───────────────────────────────────────

/**
 * Maps a model parameter count to the best GPU model available on
 * the cloud tier. Used by the orchestration layer to translate
 * abstract model requirements into concrete Modal.com model IDs.
 */
export function selectCloudModel(
  parametersBillion: number,
): CloudInferenceRequest["model"] {
  // Models > 30B -> Llama 3.1 70B on dual A100
  if (parametersBillion > 30) {
    return "llama-3.1-70b";
  }
  // Models 7B-30B -> Mixtral 8x7B (MoE, effective 12.9B active params)
  return "mixtral-8x7b";
}

/**
 * Creates a cloud tier inference request from generic model requirements
 * and a prompt. This bridges the compute-tier router's output to the
 * GPU worker client's input format.
 */
export function buildCloudRequest(
  model: ModelRequirements,
  prompt: string,
  opts?: {
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
  },
): CloudInferenceRequest {
  return CloudInferenceRequestSchema.parse({
    model: selectCloudModel(model.parametersBillion),
    prompt,
    systemPrompt: opts?.systemPrompt,
    maxTokens: opts?.maxTokens,
    temperature: opts?.temperature,
    stream: opts?.stream,
  });
}

// ── Fallback Chain Helper ───────────────────────────────────────────

export interface TierFallbackResult {
  tier: ComputeTier;
  reason: string;
}

/**
 * Attempts to route to the cheapest tier, returning the selected tier
 * and a human-readable reason. If the selected tier is "cloud",
 * consumers should use buildCloudRequest() to prepare the GPU worker call.
 */
export function computeTierWithReason(
  device: DeviceCapabilities,
  model: ModelRequirements,
): TierFallbackResult {
  // Tier 1: Client GPU
  if (
    device.hasWebGPU &&
    device.vramMB >= model.minVRAMMB &&
    model.parametersBillion <= 2 &&
    model.latencyMaxMs >= 10
  ) {
    return { tier: "client", reason: "Device has WebGPU with sufficient VRAM for sub-2B model" };
  }

  // Tier 2: Edge
  if (model.parametersBillion <= 7 && model.latencyMaxMs >= 50) {
    const reasons: string[] = [];
    if (!device.hasWebGPU) reasons.push("no WebGPU");
    if (device.vramMB < model.minVRAMMB) reasons.push("insufficient VRAM");
    if (model.parametersBillion > 2) reasons.push(`model ${model.parametersBillion}B exceeds client 2B limit`);
    return {
      tier: "edge",
      reason: `Edge selected: ${reasons.length > 0 ? reasons.join(", ") : "model fits edge constraints"}`,
    };
  }

  // Tier 3: Cloud — Modal.com GPU workers
  const reasons: string[] = [];
  if (model.parametersBillion > 7) reasons.push(`model ${model.parametersBillion}B exceeds edge 7B limit`);
  if (model.latencyMaxMs < 50) reasons.push(`latency requirement ${model.latencyMaxMs}ms too tight for edge`);
  return {
    tier: "cloud",
    reason: `Cloud GPU required: ${reasons.join(", ")}. Routing to Modal.com ${selectCloudModel(model.parametersBillion)}.`,
  };
}
