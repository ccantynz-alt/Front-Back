// ── AI Gateway Shared Types & Schemas ─────────────────────────────────
// Zod schemas at the network boundary per CLAUDE.md §6.1.

import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const gatewayChatRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional(),
});

export type GatewayChatRequest = z.infer<typeof gatewayChatRequestSchema>;

/**
 * Loose schema for the OpenAI-compatible inbound payload. The wire
 * field names are snake_case; we normalise to camelCase before passing
 * to provider adapters. We accept extra fields (passthrough: false on
 * .strict would be too brittle for an OpenAI-compatible proxy).
 */
export const openaiInboundRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional(),
});

export type OpenAIInboundRequest = z.infer<typeof openaiInboundRequestSchema>;

export interface GatewayChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export function normaliseInbound(req: OpenAIInboundRequest): GatewayChatRequest {
  return {
    model: req.model,
    messages: req.messages,
    ...(req.max_tokens !== undefined && { maxTokens: req.max_tokens }),
    ...(req.temperature !== undefined && { temperature: req.temperature }),
    ...(req.stream !== undefined && { stream: req.stream }),
  };
}

// ── v1 additions ─────────────────────────────────────────────────────

/**
 * The set of upstream providers Crontech's gateway can route to. The
 * `webgpu` value is a virtual provider — it doesn't make an HTTP call
 * out, it just records that a client-side WebGPU inference happened so
 * the usage ledger can bill the customer for the offload.
 */
export const PROVIDER_NAMES = [
  "anthropic",
  "openai",
  "google",
  "groq",
  "mistral",
  "webgpu",
] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export const providerNameSchema = z.enum(PROVIDER_NAMES);

/**
 * BYOK ("bring your own key") routes the request using the customer's
 * own provider API key — Crontech bills only for the gateway service
 * (cache hits, rate limiting, observability). MANAGED uses Crontech's
 * pooled provider keys and bills the customer at our markup.
 */
export const KEY_MODES = ["byok", "managed"] as const;
export type KeyMode = (typeof KEY_MODES)[number];

/**
 * A per-customer API key entry as stored in the gateway. The token is
 * the secret the customer sends in `Authorization: Bearer <token>`.
 */
export interface GatewayApiKey {
  /** The bearer token the customer presents on every data-plane request. */
  token: string;
  /** Stable identifier for the owning customer / tenant. */
  customerId: string;
  /** Whether this key uses customer-supplied provider keys (BYOK) or pooled (managed). */
  mode: KeyMode;
  /**
   * Customer-provided provider keys, only consulted when `mode === "byok"`.
   * Missing entries fall through to managed keys *only* if the customer
   * explicitly enabled `managedFallback` — otherwise the request 503s.
   */
  providerKeys?: Partial<Record<ProviderName, string>>;
  /** Per-key requests-per-second budget (token-bucket refill rate). */
  rps?: number;
  /** Per-key burst capacity (token-bucket size). */
  burst?: number;
  /** Ordered fallback chain to try after the primary fails (5xx / timeout). */
  fallbackChain?: ProviderName[];
  /** When true, BYOK requests with no customer key for the chosen provider use managed keys. */
  managedFallback?: boolean;
}

/**
 * Provider invocation result. Shared between adapters so the dispatcher
 * doesn't care which vendor served the request.
 */
export type ProviderInvocationResult =
  | { ok: true; status: number; response: GatewayChatResponse }
  | { ok: false; status: number; errorBody: string };

export interface ProviderAdapterOptions {
  apiKey: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  /** Optional abort signal for upstream cancellation. */
  signal?: AbortSignal;
}
