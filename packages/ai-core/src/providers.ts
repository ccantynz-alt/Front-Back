// ── AI Provider Factory ────────���──────────────────────────────────
// Creates AI providers based on compute tier and environment config.
// Supports OpenAI-compatible endpoints AND Anthropic natively.

import { createOpenAI, type OpenAIProviderSettings } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { ComputeTier } from "./compute-tier";

// ── Anthropic Model IDs ──────────────────────────────────────────

export const ANTHROPIC_MODELS = {
  "claude-opus-4-20250514": { name: "Claude Opus 4", inputCostPer1M: 15, outputCostPer1M: 75 },
  "claude-sonnet-4-20250514": { name: "Claude Sonnet 4", inputCostPer1M: 3, outputCostPer1M: 15 },
  "claude-haiku-4-20250506": { name: "Claude Haiku 4", inputCostPer1M: 0.80, outputCostPer1M: 4 },
} as const;

export type AnthropicModelId = keyof typeof ANTHROPIC_MODELS;

// ── Environment Configuration Schema ──────────────────────────────

export interface AIProviderConfig {
  apiKey: string;
  baseURL: string | undefined;
  model: string;
  organization: string | undefined;
}

export interface AnthropicProviderConfig {
  apiKey: string;
  model: string;
}

export interface AIProviderEnv {
  /** Primary provider (cloud tier) - typically OpenAI GPT-4 class */
  cloud: AIProviderConfig;
  /** Edge provider - lighter model for fast inference */
  edge: AIProviderConfig;
  /** Fallback model when primary is unavailable */
  fallback: AIProviderConfig | undefined;
  /** Anthropic provider — used as primary when ANTHROPIC_API_KEY is set */
  anthropic: AnthropicProviderConfig | undefined;
}

/**
 * Reads a single env var, returning undefined (not "") when absent.
 */
function env(key: string): string | undefined {
  // Works in Bun, Node, and Cloudflare Workers
  try {
    // biome-ignore lint/complexity/useLiteralKeys: dynamic env access
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    return proc?.env[key] ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads AI provider configuration from environment variables.
 * All keys are optional at read time — validated at usage time.
 */
export function readProviderEnv(): AIProviderEnv {
  const anthropicKey = env("ANTHROPIC_API_KEY");

  return {
    cloud: {
      apiKey: env("OPENAI_API_KEY") ?? "",
      baseURL: env("OPENAI_BASE_URL"),
      model: env("AI_CLOUD_MODEL") ?? "gpt-4o",
      organization: env("OPENAI_ORG_ID"),
    },
    edge: {
      apiKey: env("AI_EDGE_API_KEY") ?? env("OPENAI_API_KEY") ?? "",
      baseURL: env("AI_EDGE_BASE_URL") ?? env("OPENAI_BASE_URL"),
      model: env("AI_EDGE_MODEL") ?? "gpt-4o-mini",
      organization: env("OPENAI_ORG_ID"),
    },
    fallback: env("AI_FALLBACK_API_KEY")
      ? {
          apiKey: env("AI_FALLBACK_API_KEY") ?? "",
          baseURL: env("AI_FALLBACK_BASE_URL"),
          model: env("AI_FALLBACK_MODEL") ?? "gpt-4o-mini",
          organization: undefined,
        }
      : undefined,
    anthropic:
      anthropicKey && anthropicKey.length > 5
        ? {
            apiKey: anthropicKey,
            model: env("AI_ANTHROPIC_MODEL") ?? "claude-sonnet-4-20250514",
          }
        : undefined,
  };
}

// ── Provider Factory ─────────────────��────────────────────────────

/**
 * Creates an OpenAI-compatible provider instance from config.
 * Works with OpenAI, Azure OpenAI, Together AI, Groq, local models, etc.
 *
 * Handles `exactOptionalPropertyTypes` by only including defined values.
 */
function createProviderFromConfig(
  config: AIProviderConfig,
): ReturnType<typeof createOpenAI> {
  const settings: OpenAIProviderSettings = {
    apiKey: config.apiKey,
  };
  if (config.baseURL !== undefined) {
    settings.baseURL = config.baseURL;
  }
  if (config.organization !== undefined) {
    settings.organization = config.organization;
  }
  return createOpenAI(settings);
}

/**
 * Creates an Anthropic provider instance.
 */
function createAnthropicFromConfig(
  config: AnthropicProviderConfig,
): LanguageModel {
  const provider = createAnthropic({ apiKey: config.apiKey });
  return provider(config.model);
}

/**
 * Returns a language model for the given compute tier.
 *
 * Provider selection priority:
 *   - If ANTHROPIC_API_KEY is set, Anthropic Claude is the primary for cloud tier
 *   - If only OPENAI_API_KEY is set, OpenAI is primary
 *   - Edge tier always uses the lighter OpenAI-compatible model
 *   - Client tier falls back to edge (browser-side handled by WebLLM)
 */
export function getModelForTier(
  tier: ComputeTier,
  providerEnv?: AIProviderEnv,
): LanguageModel {
  const config = providerEnv ?? readProviderEnv();

  switch (tier) {
    case "cloud": {
      // Prefer Anthropic for cloud tier when available
      if (config.anthropic) {
        return createAnthropicFromConfig(config.anthropic);
      }
      const provider = createProviderFromConfig(config.cloud);
      return provider(config.cloud.model);
    }
    case "edge": {
      const provider = createProviderFromConfig(config.edge);
      return provider(config.edge.model);
    }
    case "client": {
      // Client-side inference is handled by WebLLM in the browser.
      // If this is called server-side, fall back to edge tier.
      const edgeProvider = createProviderFromConfig(config.edge);
      return edgeProvider(config.edge.model);
    }
    default: {
      const _exhaustive: never = tier;
      throw new Error(`Unknown compute tier: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Returns a fallback model when the primary provider fails.
 *
 * Fallback chain:
 *   - If primary was Anthropic → fall back to OpenAI (if configured)
 *   - If primary was OpenAI    → fall back to Anthropic (if configured)
 *   - If explicit AI_FALLBACK_ vars are set, those take precedence
 *   - Returns undefined if no fallback is available
 */
export function getFallbackModel(
  providerEnv?: AIProviderEnv,
): LanguageModel | undefined {
  const config = providerEnv ?? readProviderEnv();

  // Explicit fallback config takes priority
  if (config.fallback) {
    const provider = createProviderFromConfig(config.fallback);
    return provider(config.fallback.model);
  }

  // Auto-failover: if Anthropic is primary, OpenAI is fallback (and vice versa)
  if (config.anthropic && config.cloud.apiKey.length > 5) {
    // Primary is Anthropic, fallback to OpenAI
    const provider = createProviderFromConfig(config.cloud);
    return provider(config.cloud.model);
  }
  if (!config.anthropic && config.anthropic === undefined) {
    // Primary is OpenAI; check if Anthropic key exists for fallback
    // (this branch only triggers if anthropic was not set as primary)
    return undefined;
  }

  return undefined;
}

/**
 * Returns the default model (cloud tier) for general-purpose use.
 */
export function getDefaultModel(providerEnv?: AIProviderEnv): LanguageModel {
  return getModelForTier("cloud", providerEnv);
}

// ── Anthropic Provider ───────────────────────────────────────────

/**
 * Creates an Anthropic language model from an API key and model ID.
 * Used by the internal chat interface where the user supplies their
 * own Anthropic API key.
 */
export function getAnthropicModel(
  apiKey: string,
  modelId?: string,
): LanguageModel {
  const provider = createAnthropic({ apiKey });
  return provider(modelId ?? "claude-sonnet-4-20250514");
}

/**
 * Returns an Anthropic model from environment variables if configured.
 */
export function getAnthropicModelFromEnv(): LanguageModel | undefined {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return undefined;
  const modelId = env("ANTHROPIC_MODEL") ?? "claude-sonnet-4-20250514";
  return getAnthropicModel(key, modelId);
}

/**
 * Checks whether an Anthropic API key is available (from env or user-supplied).
 */
export function hasAnthropicProvider(): boolean {
  const key = env("ANTHROPIC_API_KEY");
  return key !== undefined && key.length > 5;
}

// ── Automatic Failover ───────────────────────────────────────────

const RETRYABLE_PATTERNS = [
  "429", "rate limit", "too many requests",
  "500", "internal server error",
  "503", "service unavailable", "overloaded",
  "timed out", "timeout", "ECONNRESET", "ECONNREFUSED",
];

export function isRetryableError(err: Error | { status?: number; message: string }): boolean {
  const msg = (err.message ?? "").toLowerCase();
  if ("status" in err && typeof err.status === "number") {
    const s = err.status;
    if (s === 429 || s === 500 || s === 502 || s === 503 || s === 504) return true;
    if (s === 400 || s === 401 || s === 403 || s === 404 || s === 422) return false;
  }
  return RETRYABLE_PATTERNS.some((p) => msg.includes(p.toLowerCase()));
}

/**
 * Routes an AI call through the primary provider, automatically
 * failing over to the fallback on retryable errors (429, 503, etc.).
 * Non-retryable errors (401, 400) propagate immediately.
 */
export async function routeAICall<T>(
  providerEnv: AIProviderEnv,
  fn: (model: LanguageModel) => Promise<T>,
  tier: ComputeTier = "cloud",
): Promise<T> {
  const primaryModel = getModelForTier(tier, providerEnv);
  try {
    return await fn(primaryModel);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (!isRetryableError(error)) throw error;

    // Attempt fallback
    const fallbackModel = getFallbackModel(providerEnv);
    if (!fallbackModel) throw error;

    return fn(fallbackModel);
  }
}

/**
 * Estimate cost in microdollars for a given model and token counts.
 * Returns cost in microdollars (1/1,000,000 of a dollar) for precision.
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const modelInfo = ANTHROPIC_MODELS[modelId as AnthropicModelId];
  if (!modelInfo) return 0;
  const inputCost = (inputTokens / 1_000_000) * modelInfo.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * modelInfo.outputCostPer1M;
  return Math.round((inputCost + outputCost) * 1_000_000);
}
