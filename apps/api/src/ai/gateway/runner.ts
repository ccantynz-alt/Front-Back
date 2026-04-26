/**
 * AI Gateway — single provider attempt runner.
 *
 * Extracted from `./index.ts` so the route handler stays small and the
 * file-length cap holds. The runner enforces the per-call timeout,
 * records OTel attributes, computes cost via `estimateCost`, writes the
 * cache, and returns the OpenAI-shaped response. The caller decides
 * whether a thrown error triggers failover.
 */

import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { estimateCost } from "@back-to-the-future/ai-core";
import { aiInferenceLatency, aiTokensUsed } from "../../telemetry";
import type { GatewayCache } from "./cache";
import type { Provider, ProviderCaller } from "./providers";
import type { ChatCompletionResponse, ChatMessage } from "./schemas";

const REQUEST_TIMEOUT_MS = 15_000;

export interface AttemptCtx {
  span: Span;
  body: {
    model: string;
    messages: readonly ChatMessage[];
    temperature?: number | undefined;
    max_tokens?: number | undefined;
  };
  callProvider: ProviderCaller;
  cache: GatewayCache;
  cacheKey: string;
  ttlSeconds: number;
  now: () => number;
  start: number;
}

export async function runProviderAttempt(
  ctx: AttemptCtx,
  provider: Provider,
  isFailover: boolean,
): Promise<ChatCompletionResponse> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await ctx.callProvider({
      provider,
      model: ctx.body.model,
      messages: ctx.body.messages,
      temperature: ctx.body.temperature,
      maxTokens: ctx.body.max_tokens,
      signal: ac.signal,
    });
    const latencyMs = Math.max(0, ctx.now() - ctx.start);
    const costMicros = estimateCost(ctx.body.model, res.promptTokens, res.completionTokens);
    aiInferenceLatency.record(latencyMs, { provider, model: ctx.body.model });
    aiTokensUsed.add(res.promptTokens + res.completionTokens, {
      provider,
      model: ctx.body.model,
    });
    ctx.span.setAttribute("provider", provider);
    ctx.span.setAttribute("latency_ms", latencyMs);
    ctx.span.setAttribute("tokens_in", res.promptTokens);
    ctx.span.setAttribute("tokens_out", res.completionTokens);
    ctx.span.setAttribute("cost_usd", costMicros / 1_000_000);
    ctx.span.setAttribute("failover", isFailover);
    ctx.span.setStatus({ code: SpanStatusCode.OK });

    const response: ChatCompletionResponse = {
      id: `chatcmpl-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(ctx.now() / 1000),
      model: ctx.body.model,
      stream: false,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: res.content },
          finish_reason: res.finishReason,
        },
      ],
      usage: {
        prompt_tokens: res.promptTokens,
        completion_tokens: res.completionTokens,
        total_tokens: res.promptTokens + res.completionTokens,
      },
      crontech: {
        provider,
        cache_hit: false,
        latency_ms: latencyMs,
        cost_usd_micros: costMicros,
        failover: isFailover,
      },
    };

    if (ctx.ttlSeconds > 0) ctx.cache.set(ctx.cacheKey, response, ctx.ttlSeconds * 1000);
    return response;
  } finally {
    clearTimeout(timer);
  }
}
