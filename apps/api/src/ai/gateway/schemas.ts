/**
 * AI Gateway — wire-format Zod schemas.
 *
 * Per CLAUDE.md §6.3: every component exports a Zod schema describing
 * its props. The TypeScript types in this file are inferred from these
 * schemas — never declared independently — so the validator and the
 * type system can never disagree.
 */

import { z } from "zod";

const RoleSchema = z.enum(["system", "user", "assistant", "tool"]);

const ChatMessageSchema = z.object({
  role: RoleSchema,
  content: z.string().min(1),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(64_000).optional(),
  /** When true, the response is streamed via SSE. v1 only supports false. */
  stream: z.boolean().optional(),
});
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

const UsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});

/** Two providers wired in v1 — schema must stay in sync with PROVIDERS. */
const ProviderEnumSchema = z.enum(["anthropic", "openai"]);

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number().int(),
  model: z.string(),
  /** Always false in v1 — present so the v2 streaming switch is a wire-compatible flag. */
  stream: z.literal(false),
  choices: z
    .array(
      z.object({
        index: z.number().int(),
        message: z.object({
          role: z.literal("assistant"),
          content: z.string(),
        }),
        finish_reason: z.string(),
      }),
    )
    .min(1),
  usage: UsageSchema,
  /** Crontech extension — surfaces provider routing and cache for clients. */
  crontech: z.object({
    provider: ProviderEnumSchema,
    cache_hit: z.boolean(),
    latency_ms: z.number().int().nonnegative(),
    cost_usd_micros: z.number().int().nonnegative(),
    failover: z.boolean(),
  }),
});
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;
