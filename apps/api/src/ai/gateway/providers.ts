/**
 * AI Gateway — provider taxonomy + HTTP callers.
 *
 * The two providers wired in v1 (Anthropic + OpenAI) are already in the
 * Crontech stack per BLK-002 / BLK-020 — this module wraps them into
 * a single `ProviderCaller` shape so the gateway router does not have
 * to know vendor-specific details.
 */

import type { ChatMessage } from "./schemas";

/**
 * The set of providers the gateway knows how to talk to. New providers
 * are added here and in `defaultProviderCaller()` below — no other call
 * sites need to change.
 */
export const PROVIDERS = ["anthropic", "openai"] as const;
export type Provider = (typeof PROVIDERS)[number];

/**
 * Map a model id to the provider that owns it. Anthropic claims any
 * `claude-*` model; everything else falls through to OpenAI. This is
 * deliberately the same convention the Vercel AI SDK uses so customer
 * code that already routes by prefix keeps working unchanged.
 */
export function providerForModel(model: string): Provider {
  if (model.startsWith("claude-")) return "anthropic";
  return "openai";
}

/**
 * The fallback provider for a given primary. We do NOT fall back from
 * Anthropic to itself or OpenAI to itself — that would defeat the
 * purpose of failover. v1 is a strict primary→secondary chain.
 */
export function fallbackProvider(primary: Provider): Provider | undefined {
  if (primary === "anthropic") return "openai";
  if (primary === "openai") return "anthropic";
  return undefined;
}

export interface ProviderCallInput {
  provider: Provider;
  model: string;
  messages: readonly ChatMessage[];
  temperature: number | undefined;
  maxTokens: number | undefined;
  signal: AbortSignal;
}

export interface ProviderCallResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  finishReason: string;
}

export type ProviderCaller = (input: ProviderCallInput) => Promise<ProviderCallResult>;

/**
 * Upstream provider error — carries the HTTP status so the gateway
 * router can decide whether to attempt failover.
 */
export class GatewayUpstreamError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GatewayUpstreamError";
    this.status = status;
  }
}

export function isFailoverable(err: unknown): boolean {
  if (err instanceof GatewayUpstreamError) {
    return err.status >= 500 && err.status <= 599;
  }
  // Timeouts surface as DOMException("AbortError") via fetch + AbortSignal.timeout.
  if (err instanceof Error) {
    return err.name === "AbortError" || err.name === "TimeoutError";
  }
  return false;
}

function readEnv(key: string): string | undefined {
  try {
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    return proc?.env[key] ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Default provider caller — talks HTTP directly to the Anthropic and
 * OpenAI Chat Completions endpoints using the global `fetch`. Tests
 * inject their own caller via `createAiGatewayApp({ deps })` so we
 * never hit the network in CI.
 */
export const defaultProviderCaller: ProviderCaller = async (input) => {
  if (input.provider === "anthropic") return await callAnthropic(input);
  return await callOpenAI(input);
};

async function callAnthropic(input: ProviderCallInput): Promise<ProviderCallResult> {
  const apiKey = readEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new GatewayUpstreamError(503, "ANTHROPIC_API_KEY not configured");
  }
  // Anthropic expects system prompts as a separate top-level field, not
  // a message role, so we lift them out here.
  const systemContent = input.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const conversation = input.messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.maxTokens ?? 1024,
    messages: conversation,
  };
  if (systemContent.length > 0) body["system"] = systemContent;
  if (input.temperature !== undefined) body["temperature"] = input.temperature;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new GatewayUpstreamError(res.status, `anthropic ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string;
  };
  const content = (json.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text ?? "")
    .join("");
  return {
    content,
    promptTokens: json.usage?.input_tokens ?? 0,
    completionTokens: json.usage?.output_tokens ?? 0,
    finishReason: json.stop_reason ?? "stop",
  };
}

async function callOpenAI(input: ProviderCallInput): Promise<ProviderCallResult> {
  const apiKey = readEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new GatewayUpstreamError(503, "OPENAI_API_KEY not configured");
  }
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
  };
  if (input.maxTokens !== undefined) body["max_tokens"] = input.maxTokens;
  if (input.temperature !== undefined) body["temperature"] = input.temperature;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new GatewayUpstreamError(res.status, `openai ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const first = json.choices?.[0];
  return {
    content: first?.message?.content ?? "",
    promptTokens: json.usage?.prompt_tokens ?? 0,
    completionTokens: json.usage?.completion_tokens ?? 0,
    finishReason: first?.finish_reason ?? "stop",
  };
}

/**
 * Hono only accepts a narrow status union via `c.json(value, status)`.
 * We clamp arbitrary upstream HTTP statuses into the 4xx/5xx error
 * range we want to surface, defaulting to 502 for anything we cannot
 * meaningfully forward.
 */
export type ClientErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 408
  | 409
  | 422
  | 429
  | 500
  | 502
  | 503
  | 504;

export function clampClientErrorStatus(status: number): ClientErrorStatus {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 408:
    case 409:
    case 422:
    case 429:
    case 500:
    case 502:
    case 503:
    case 504:
      return status;
    default:
      return 502;
  }
}

/** Bearer extraction shared with the gateway router. */
export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] ?? "").trim() : null;
}

/** Env access — exported so the gateway router can read AI_GATEWAY_BEARER. */
export const __readEnv = readEnv;
