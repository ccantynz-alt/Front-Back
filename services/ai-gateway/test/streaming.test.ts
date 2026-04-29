// ── Streaming Pass-Through Tests ──────────────────────────────────────
// We test the OpenAI/Groq/Mistral pass-through path (raw body forwarded)
// AND the Anthropic synthesised single-chunk path. No real network calls.

import { describe, expect, test } from "bun:test";
import { LruCache } from "../src/cache";
import { buildHandler, type GatewayDeps } from "../src/index";
import { InMemoryApiKeyStore } from "../src/keys";
import { encodeSseChunk, parseOpenAiSseStream } from "../src/streaming";
import type { GatewayChatResponse } from "../src/types";
import { resetForTesting as resetUsage } from "../src/usage";

function streamFetch(chunks: string[]): typeof fetch {
  return (async (): Promise<Response> => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) {
          controller.enqueue(encoder.encode(c));
        }
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }) as unknown as typeof fetch;
}

describe("encodeSseChunk", () => {
  test("formats payload as one SSE frame", () => {
    expect(encodeSseChunk({ a: 1 })).toBe('data: {"a":1}\n\n');
  });
});

describe("parseOpenAiSseStream", () => {
  test("yields delta.content fragments and stops on [DONE]", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const res = new Response(body, { status: 200 });
    const out: string[] = [];
    for await (const tok of parseOpenAiSseStream(res)) {
      out.push(tok);
    }
    expect(out).toEqual(["Hello ", "world"]);
  });
});

describe("streaming pass-through (OpenAI)", () => {
  test("openai stream: response framed as text/event-stream and bytes pass through", async () => {
    resetUsage();
    const upstream = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const keys = new InMemoryApiKeyStore([
      { token: "tok", customerId: "c", mode: "managed" },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      fetchImpl: streamFetch(upstream),
      env: { OPENAI_API_KEY: "K" },
    };
    const res = await buildHandler(deps)(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer tok",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    // Verify we got the raw upstream bytes back.
    expect(text).toContain("Hi");
    expect(text).toContain("there");
    expect(text).toContain("[DONE]");
  });
});

describe("streaming synthesised (Anthropic)", () => {
  test("anthropic stream: gateway emits a single SSE chunk + DONE", async () => {
    resetUsage();
    const fakeAnthropicResponse = (async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          id: "msg_x",
          model: "claude-3-5-sonnet-latest",
          content: [{ type: "text", text: "synthesised stream" }],
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const keys = new InMemoryApiKeyStore([
      { token: "tok", customerId: "c", mode: "managed" },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      fetchImpl: fakeAnthropicResponse,
      env: { ANTHROPIC_API_KEY: "K" },
    };
    const res = await buildHandler(deps)(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer tok",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("synthesised stream");
    expect(text).toContain("data: [DONE]");
  });
});
