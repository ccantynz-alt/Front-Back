// ── Client-Side AI Inference Layer ───────────────────────────────────
// Provides in-browser AI inference via WebLLM and Transformers.js.
// Cost per token: $0. No API call. No latency. No server.

import { getDeviceCapabilities, canRunLocally } from "./webgpu";
import type { ComputeTier, DeviceCapabilities } from "@back-to-the-future/ai-core";

// ── Types ────────────────────────────────────────────────────────────

export interface InferenceEngine {
  tier: ComputeTier;
  ready: boolean;
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
  embed(text: string): Promise<number[]>;
  dispose(): void;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  onToken?: (token: string) => void;
}

export interface GenerateResult {
  text: string;
  tokenCount: number;
  latencyMs: number;
  tier: ComputeTier;
}

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  latencyMs: number;
  tier: ComputeTier;
}

// ── Client-Side Inference Engine ─────────────────────────────────────
// Uses WebLLM for text generation and Transformers.js for embeddings.
// Falls back to edge/cloud when device can't handle the workload.

let cachedCapabilities: DeviceCapabilities | null = null;

async function getCachedCapabilities(): Promise<DeviceCapabilities> {
  if (!cachedCapabilities) {
    cachedCapabilities = await getDeviceCapabilities();
  }
  return cachedCapabilities;
}

/**
 * Creates an inference engine that automatically routes to the best
 * available compute tier.
 *
 * Priority: Client GPU ($0) → Edge (fast) → Cloud (powerful)
 */
export async function createInferenceEngine(): Promise<InferenceEngine> {
  const capabilities = await getCachedCapabilities();

  // Check if we can run a small model locally (1.5B params)
  if (canRunLocally(capabilities, 1.5)) {
    return createClientEngine();
  }

  // Fall back to edge/cloud proxy
  return createProxyEngine("edge");
}

// ── Client Engine (WebGPU) ───────────────────────────────────────────

function createClientEngine(): InferenceEngine {
  let isReady = false;

  // WebLLM and Transformers.js are loaded dynamically to avoid
  // bundling them when not needed (they're large).
  return {
    tier: "client" as ComputeTier,
    get ready() { return isReady; },

    async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
      const start = performance.now();

      // Dynamic import of WebLLM for text generation
      // In production, this loads the WASM + model weights on first use
      try {
        const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
        const engine = await CreateMLCEngine("Llama-3.1-8B-Instruct-q4f16_1-MLC", {
          initProgressCallback: (progress) => {
            if (progress.progress === 1) isReady = true;
          },
        });

        const reply = await engine.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          max_tokens: options?.maxTokens ?? 512,
          temperature: options?.temperature ?? 0.7,
          top_p: options?.topP ?? 0.9,
          stream: !!options?.onToken,
        });

        if (options?.onToken && Symbol.asyncIterator in (reply as object)) {
          let text = "";
          for await (const chunk of reply as AsyncIterable<{ choices: Array<{ delta: { content?: string } }> }>) {
            const token = chunk.choices[0]?.delta?.content ?? "";
            text += token;
            options.onToken(token);
          }
          return {
            text,
            tokenCount: text.split(/\s+/).length,
            latencyMs: Math.round(performance.now() - start),
            tier: "client",
          };
        }

        const message = (reply as { choices: Array<{ message: { content: string } }> }).choices[0]?.message?.content ?? "";
        return {
          text: message,
          tokenCount: message.split(/\s+/).length,
          latencyMs: Math.round(performance.now() - start),
          tier: "client",
        };
      } catch {
        // If client-side fails, fall back to edge
        const proxy = createProxyEngine("edge");
        return proxy.generate(prompt, options);
      }
    },

    async embed(text: string): Promise<number[]> {
      try {
        // Use Transformers.js for embeddings
        const { pipeline } = await import("@huggingface/transformers");
        const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
        const output = await extractor(text, { pooling: "mean", normalize: true });
        return Array.from(output.data as Float32Array);
      } catch {
        // Fall back to edge
        const proxy = createProxyEngine("edge");
        return proxy.embed(text);
      }
    },

    dispose() {
      isReady = false;
      cachedCapabilities = null;
    },
  };
}

// ── Proxy Engine (Edge/Cloud) ────────────────────────────────────────

function createProxyEngine(tier: "edge" | "cloud"): InferenceEngine {
  const apiBase = typeof window !== "undefined"
    ? `${window.location.origin}/api`
    : "http://localhost:3001/api";

  return {
    tier,
    ready: true,

    async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
      const start = performance.now();

      if (options?.onToken) {
        // Stream via SSE
        const response = await fetch(`${apiBase}/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            stream: true,
            maxTokens: options.maxTokens ?? 512,
            temperature: options.temperature ?? 0.7,
          }),
        });

        let text = "";
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            text += chunk;
            options.onToken(chunk);
          }
        }

        return {
          text,
          tokenCount: text.split(/\s+/).length,
          latencyMs: Math.round(performance.now() - start),
          tier,
        };
      }

      const response = await fetch(`${apiBase}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          stream: false,
          maxTokens: options?.maxTokens ?? 512,
          temperature: options?.temperature ?? 0.7,
        }),
      });

      const data = await response.json() as { text: string };
      return {
        text: data.text,
        tokenCount: data.text.split(/\s+/).length,
        latencyMs: Math.round(performance.now() - start),
        tier,
      };
    },

    async embed(text: string): Promise<number[]> {
      const response = await fetch(`${apiBase}/ai/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json() as { vector: number[] };
      return data.vector;
    },

    dispose() { /* no-op for proxy */ },
  };
}
