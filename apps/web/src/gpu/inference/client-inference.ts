// ── Client-Side AI Inference Engine ─────────────────────────────────
// The $0/token tier. Every computation here is free.
// Handles local model loading, embedding generation, classification,
// and summarization. Falls back to edge/cloud when the client can't cope.

import {
  type DeviceCapabilities,
  computeTierRouter,
} from "@back-to-the-future/ai-core";
import { detectWebGPU, getComputeTier } from "../webgpu-detect";
import type { GPUCapabilities, GPUComputeTier } from "../webgpu-detect";

// ── Types ────────────────────────────────────────────────────────────

export interface ClassificationResult {
  label: string;
  score: number;
}

export interface LoadedModel {
  id: string;
  type: "embedding" | "classification" | "summarization" | "generation";
  ready: boolean;
}

export type InferenceTier = "client" | "edge" | "cloud";

export interface InferenceResult<T> {
  data: T;
  tier: InferenceTier;
  latencyMs: number;
}

// ── Edge/Cloud Fallback ─────────────────────────────────────────────

async function fallbackToEdge<T>(
  task: string,
  payload: Record<string, unknown>,
): Promise<InferenceResult<T>> {
  const start = performance.now();

  // POST to the edge AI endpoint via tRPC or direct fetch
  const response = await fetch("/api/ai/inference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, ...payload }),
  });

  if (!response.ok) {
    throw new Error(`Edge inference failed: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as { data: T; tier: InferenceTier };
  const latencyMs = performance.now() - start;

  return {
    data: result.data,
    tier: result.tier,
    latencyMs,
  };
}

// ── Client Inference Engine ─────────────────────────────────────────

export class ClientInferenceEngine {
  private gpuCapabilities: GPUCapabilities | null = null;
  private gpuTier: GPUComputeTier = "none";
  private loadedModels: Map<string, LoadedModel> = new Map();
  private _initialized = false;

  // ── Availability Check ────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    if (!this._initialized) {
      await this.detectCapabilities();
    }
    return this.gpuTier !== "none";
  }

  private async detectCapabilities(): Promise<void> {
    this.gpuCapabilities = await detectWebGPU();
    this.gpuTier = getComputeTier(this.gpuCapabilities);
    this._initialized = true;
  }

  // ── Device Capabilities (for compute tier router) ─────────────────

  private getDeviceCapabilities(): DeviceCapabilities {
    const caps = this.gpuCapabilities;
    const nav = typeof navigator !== "undefined" ? navigator : null;

    // Detect connection type
    let connectionType: DeviceCapabilities["connectionType"] = "unknown";
    if (nav && "connection" in nav) {
      const conn = (nav as Navigator & { connection?: { effectiveType?: string } }).connection;
      const etype = conn?.effectiveType;
      if (etype === "4g" || etype === "3g" || etype === "2g" || etype === "slow-2g") {
        connectionType = etype;
      }
    }

    return {
      hasWebGPU: caps?.supported ?? false,
      vramMB: caps?.estimatedVRAMMB ?? 0,
      hardwareConcurrency: nav?.hardwareConcurrency ?? 1,
      deviceMemoryGB: (nav as Navigator & { deviceMemory?: number })?.deviceMemory ?? 2,
      connectionType,
    };
  }

  // ── Tier Decision ─────────────────────────────────────────────────

  private shouldRunLocally(parametersBillion: number, latencyMaxMs: number): boolean {
    const device = this.getDeviceCapabilities();
    const tier = computeTierRouter(device, {
      parametersBillion,
      minVRAMMB: parametersBillion * 1024, // rough: 1GB per billion params
      latencyMaxMs,
    });
    return tier === "client";
  }

  // ── Model Loading ─────────────────────────────────────────────────

  async loadModel(modelId: string): Promise<LoadedModel> {
    if (this.loadedModels.has(modelId)) {
      return this.loadedModels.get(modelId)!;
    }

    if (!this._initialized) {
      await this.detectCapabilities();
    }

    // Placeholder for WebLLM / Transformers.js integration
    // In production, this would:
    // 1. Check if model fits in VRAM
    // 2. Download model weights (cached in IndexedDB)
    // 3. Initialize the inference session
    const model: LoadedModel = {
      id: modelId,
      type: "generation",
      ready: false,
    };

    // Mark as ready — actual loading happens when WebLLM/Transformers.js
    // is integrated. The architecture is in place.
    model.ready = this.gpuTier !== "none";
    this.loadedModels.set(modelId, model);

    return model;
  }

  // ── Embedding Generation ──────────────────────────────────────────

  async embed(text: string): Promise<InferenceResult<number[]>> {
    if (!this._initialized) {
      await this.detectCapabilities();
    }

    const start = performance.now();

    // Embedding models are small (~0.1B params). Run locally if possible.
    if (this.shouldRunLocally(0.1, 200)) {
      try {
        // Placeholder: In production, use Transformers.js pipeline("feature-extraction")
        // For now, generate a deterministic pseudo-embedding from text
        // This will be replaced with actual model inference
        const embedding = this.pseudoEmbed(text);
        const latencyMs = performance.now() - start;

        return {
          data: embedding,
          tier: "client",
          latencyMs,
        };
      } catch {
        // Fall through to edge/cloud
      }
    }

    return fallbackToEdge<number[]>("embed", { text });
  }

  // ── Zero-Shot Classification ──────────────────────────────────────

  async classify(
    text: string,
    labels: string[],
  ): Promise<InferenceResult<ClassificationResult[]>> {
    if (!this._initialized) {
      await this.detectCapabilities();
    }

    const start = performance.now();

    // Classification models ~0.3B params
    if (this.shouldRunLocally(0.3, 500)) {
      try {
        // Placeholder: In production, use Transformers.js pipeline("zero-shot-classification")
        // Generate uniform scores as placeholder
        const results: ClassificationResult[] = labels.map((label) => ({
          label,
          score: 1 / labels.length,
        }));
        const latencyMs = performance.now() - start;

        return {
          data: results,
          tier: "client",
          latencyMs,
        };
      } catch {
        // Fall through to edge/cloud
      }
    }

    return fallbackToEdge<ClassificationResult[]>("classify", { text, labels });
  }

  // ── Text Summarization ────────────────────────────────────────────

  async summarize(text: string): Promise<InferenceResult<string>> {
    if (!this._initialized) {
      await this.detectCapabilities();
    }

    const start = performance.now();

    // Summarization models ~0.5-1B params. Needs decent GPU.
    if (this.gpuTier === "high" && this.shouldRunLocally(0.5, 2000)) {
      try {
        // Placeholder: In production, use Transformers.js pipeline("summarization")
        // or Chrome AI Summarizer API (see chrome-ai.ts)
        const summary = text.length > 200 ? `${text.slice(0, 200)}...` : text;
        const latencyMs = performance.now() - start;

        return {
          data: summary,
          tier: "client",
          latencyMs,
        };
      } catch {
        // Fall through to edge/cloud
      }
    }

    return fallbackToEdge<string>("summarize", { text });
  }

  // ── Pseudo-Embedding (Placeholder) ────────────────────────────────
  // Generates a deterministic 384-dim vector from text.
  // REPLACE with actual Transformers.js embedding model.

  private pseudoEmbed(text: string): number[] {
    const dim = 384;
    const embedding = new Array<number>(dim);
    let hash = 0;

    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }

    for (let i = 0; i < dim; i++) {
      // Deterministic pseudo-random from hash + index
      hash = ((hash << 13) ^ hash) | 0;
      hash = (hash * 0x5bd1e995) | 0;
      hash = (hash ^ (hash >> 15)) | 0;
      embedding[i] = (hash & 0xffff) / 32768.0 - 1.0;
    }

    // L2-normalize
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      const val = embedding[i] ?? 0;
      norm += val * val;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        embedding[i] = (embedding[i] ?? 0) / norm;
      }
    }

    return embedding;
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  destroy(): void {
    this.loadedModels.clear();
    this._initialized = false;
    this.gpuCapabilities = null;
    this.gpuTier = "none";
  }
}
