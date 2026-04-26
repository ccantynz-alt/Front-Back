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
