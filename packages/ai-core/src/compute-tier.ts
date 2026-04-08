// ── Three-Tier Compute Router ──────────────────────────────────────
// Routes AI workloads to the cheapest tier that meets requirements.
// Client GPU ($0/token) → Edge (sub-50ms) → Cloud (full power)

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
