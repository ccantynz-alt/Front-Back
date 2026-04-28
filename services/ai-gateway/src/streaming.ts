// ── SSE Streaming Pass-Through ────────────────────────────────────────
// When `stream: true` is set, we don't buffer the upstream response —
// we hand it straight back to the caller as it arrives. Two providers
// emit OpenAI-shaped SSE (OpenAI itself, Groq, Mistral); Anthropic
// uses event-stream events that we re-frame to OpenAI-shaped chunks
// so callers using the OpenAI SDK with `stream: true` Just Work.
//
// This module is provider-agnostic at its top edge: it takes a stream
// of "delta tokens" and writes them out as `data: {...}\n\n` SSE frames
// followed by `data: [DONE]\n\n`. Provider adapters supply the source.

import type { GatewayChatRequest, ProviderAdapterOptions } from "./types";

export const STREAM_DONE_LINE = "data: [DONE]\n\n";

/**
 * Encode a JS object as one OpenAI-shaped SSE chunk.
 */
export function encodeSseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/**
 * Build the JSON payload for one streaming delta in OpenAI's chat
 * completion chunk shape. Choices[].delta.content is the only field
 * the OpenAI SDK actually inspects on each tick, so that's all we set.
 */
export function buildStreamChunk(opts: {
  id: string;
  model: string;
  delta: string;
  finishReason?: string | null;
}): unknown {
  return {
    id: opts.id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: opts.model,
    choices: [
      {
        index: 0,
        delta: { content: opts.delta },
        finish_reason: opts.finishReason ?? null,
      },
    ],
  };
}

/**
 * Turn an async iterable of token strings into an `application/event-stream`
 * Response. Provider adapters call this once they've opened the upstream
 * stream; we don't buffer.
 */
export function streamingResponse(
  source: AsyncIterable<string>,
  meta: { id: string; model: string },
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const token of source) {
          if (token.length === 0) {
            continue;
          }
          const chunk = buildStreamChunk({
            id: meta.id,
            model: meta.model,
            delta: token,
          });
          controller.enqueue(encoder.encode(encodeSseChunk(chunk)));
        }
        // Final chunk with finish_reason set + DONE sentinel.
        const last = buildStreamChunk({
          id: meta.id,
          model: meta.model,
          delta: "",
          finishReason: "stop",
        });
        controller.enqueue(encoder.encode(encodeSseChunk(last)));
        controller.enqueue(encoder.encode(STREAM_DONE_LINE));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(encodeSseChunk({ error: message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Streaming adapter signature. Returns an async iterable of partial
 * tokens (strings) — caller is responsible for re-framing them as SSE.
 */
export type StreamingAdapter = (
  req: GatewayChatRequest,
  opts: ProviderAdapterOptions,
) => Promise<AsyncIterable<string>>;

/**
 * Helper: split an OpenAI-style SSE stream into its `delta.content`
 * fragments. Used by the OpenAI / Groq / Mistral streaming adapters.
 */
export async function* parseOpenAiSseStream(
  response: Response,
): AsyncIterable<string> {
  if (!response.body) {
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      const line = ev.trim();
      if (!line.startsWith("data:")) {
        continue;
      }
      const payload = line.slice("data:".length).trim();
      if (payload === "[DONE]") {
        return;
      }
      try {
        const obj = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = obj.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      } catch {
        // Tolerate keep-alive / comment lines.
      }
    }
  }
}
