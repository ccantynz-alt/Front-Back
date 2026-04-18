// ── Client-side AI integration ──────────────────────────────────────
// Provides unified AI access that routes through compute tiers.
// Tries client-side inference first (free), falls back to API.

import { createSignal } from "solid-js";
import type { ComputeTier } from "@back-to-the-future/ai-core";
import {
  isModelLoaded,
  generate as clientGenerate,
  getEmbeddings as clientEmbeddings,
  detectCapabilities,
  type GenerateResult,
  type EmbeddingResult,
  InferenceError,
} from "./inference";

// ── Compute Tier Signal ─────────────────────────────────────────────

const [computeTier, setComputeTier] = createSignal<ComputeTier>("cloud");
const [tierReason, setTierReason] = createSignal<string>("Initializing...");

export { computeTier, tierReason };

/** Update tier based on current device capabilities. */
export async function detectAndSetTier(): Promise<ComputeTier> {
  try {
    const caps = await detectCapabilities();
    if (caps.canRunClientInference && isModelLoaded()) {
      setComputeTier("client");
      setTierReason("Client GPU active - $0/token");
      return "client";
    }
    if (caps.canRunClientInference) {
      setComputeTier("client");
      setTierReason("Client GPU available - load a model to use");
      return "client";
    }
    if (caps.hasWebGPU) {
      setComputeTier("edge");
      setTierReason("WebGPU available but insufficient VRAM for models");
      return "edge";
    }
    setComputeTier("edge");
    setTierReason("No WebGPU - using edge inference");
    return "edge";
  } catch {
    setComputeTier("cloud");
    setTierReason("Capability detection failed - using cloud");
    return "cloud";
  }
}

// ── API Configuration ───────────────────────────────────────────────

function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_PUBLIC_API_URL as string | undefined;
  if (envUrl) return envUrl;

  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname === "crontech.ai" || hostname === "www.crontech.ai") {
      return "https://api.crontech.ai";
    }
  }
  return "http://localhost:3001";
}

const API_URL = getApiUrl();

// ── Unified Chat Streaming ──────────────────────────────────────────

export async function streamChat(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  onDone: (result: { tier: ComputeTier; tokensPerSecond: number; latencyMs: number }) => void,
  onError: (error: string) => void,
): Promise<void> {
  // Try client-side inference first
  if (isModelLoaded()) {
    try {
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage) {
        onError("No messages provided");
        return;
      }

      // Build system prompt from earlier system messages
      const systemMessages = messages.filter((m) => m.role === "system");
      const systemPrompt = systemMessages.map((m) => m.content).join("\n") || undefined;

      setComputeTier("client");
      setTierReason("Running on client GPU - $0/token");

      const result: GenerateResult = await clientGenerate(lastMessage.content, {
        onToken,
        systemPrompt,
        maxTokens: 1024,
        temperature: 0.7,
      });

      onDone({
        tier: "client",
        tokensPerSecond: result.tokensPerSecond,
        latencyMs: result.latencyMs,
      });
      return;
    } catch (err) {
      // Client inference failed, fall through to API
      const message = err instanceof InferenceError ? err.message : "Client inference failed";
      console.warn(`Client inference failed, falling back to API: ${message}`);
    }
  }

  // Fall back to API streaming (edge/cloud)
  await streamChatViaAPI(messages, onToken, onDone, onError);
}

/** Stream chat completions via the API (edge or cloud tier). */
async function streamChatViaAPI(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  onDone: (result: { tier: ComputeTier; tokensPerSecond: number; latencyMs: number }) => void,
  onError: (error: string) => void,
): Promise<void> {
  const start = performance.now();
  setComputeTier("edge");
  setTierReason("Streaming from edge/cloud API");

  try {
    const res = await fetch(`${API_URL}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
      setComputeTier("cloud");
      setTierReason(`API error: ${res.status}`);
      onError(`AI request failed: ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError("No response stream");
      return;
    }

    const decoder = new TextDecoder();
    let tokenCount = 0;
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        tokenCount++;
        onToken(chunk);
      }
    }

    const latencyMs = Math.round(performance.now() - start);
    onDone({
      tier: computeTier(),
      tokensPerSecond: latencyMs > 0 ? Math.round((tokenCount / latencyMs) * 1000) : 0,
      latencyMs,
    });
  } catch (err) {
    setComputeTier("cloud");
    setTierReason("API request failed");
    onError(err instanceof Error ? err.message : "AI request failed");
  }
}

// ── Legacy API (backwards compatible) ───────────────────────────────

export async function streamSiteBuilderChat(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  await streamChat(
    messages,
    onToken,
    () => onDone(),
    onError,
  );
}

// ── Unified Embeddings ──────────────────────────────────────────────

export async function getEmbeddings(text: string): Promise<EmbeddingResult> {
  // Try client-side embeddings first
  const caps = await detectCapabilities();
  if (caps.hasWebGPU) {
    try {
      setComputeTier("client");
      setTierReason("Generating embeddings on client GPU - $0");
      return await clientEmbeddings(text);
    } catch {
      // Fall through to API
    }
  }

  // Fall back to API
  setComputeTier("edge");
  setTierReason("Generating embeddings via API");

  const start = performance.now();
  const response = await fetch(`${API_URL}/api/ai/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  const data = (await response.json()) as { vector: number[] };
  const latencyMs = Math.round(performance.now() - start);

  return {
    vector: data.vector,
    dimensions: data.vector.length,
    latencyMs,
    tier: "edge",
  };
}

// ── Generate UI ─────────────────────────────────────────────────────

export async function generateUI(
  description: string,
): Promise<{ success: boolean; ui?: { layout: unknown }; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/ai/generate-ui`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });

    if (!res.ok) {
      return { success: false, error: `Request failed: ${res.status}` };
    }

    const data = await res.json();
    return { success: true, ui: data as { layout: unknown } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
