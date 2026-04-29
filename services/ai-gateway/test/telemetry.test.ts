// ── Telemetry / OTel Span Tests ───────────────────────────────────────

import { describe, expect, test } from "bun:test";
import { LruCache } from "../src/cache";
import { buildHandler, type GatewayDeps } from "../src/index";
import { InMemoryApiKeyStore } from "../src/keys";
import { InMemorySpanSink } from "../src/telemetry";
import type { GatewayChatResponse } from "../src/types";
import { resetForTesting as resetUsage } from "../src/usage";

function fakeFetch(plans: { status: number; body: unknown }[]): typeof fetch {
  let i = 0;
  return (async (): Promise<Response> => {
    const plan = plans[i] ?? plans[plans.length - 1];
    if (!plan) {
      throw new Error("no plan");
    }
    i += 1;
    return new Response(JSON.stringify(plan.body), {
      status: plan.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function anthropicOk(): unknown {
  return {
    id: "msg",
    model: "claude-3-5-sonnet-latest",
    content: [{ type: "text", text: "ok" }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

describe("OpenTelemetry-shaped spans", () => {
  test("successful request emits one ok span with full attributes", async () => {
    resetUsage();
    const sink = new InMemorySpanSink();
    const keys = new InMemoryApiKeyStore([
      { token: "tok", customerId: "cust_1", mode: "managed" },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      spans: sink,
      fetchImpl: fakeFetch([{ status: 200, body: anthropicOk() }]),
      env: { ANTHROPIC_API_KEY: "K" },
    };
    await buildHandler(deps)(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer tok",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(sink.spans.length).toBe(1);
    const span = sink.spans[0]!;
    expect(span.name).toBe("ai-gateway.chat.completions");
    expect(span.status).toBe("ok");
    expect(span.attributes.customerId).toBe("cust_1");
    expect(span.attributes.keyMode).toBe("managed");
    expect(span.attributes.provider).toBe("anthropic");
    expect(span.attributes.model).toBe("claude-3-5-sonnet-latest");
    expect(span.attributes.promptTokens).toBe(10);
    expect(span.attributes.completionTokens).toBe(20);
    expect(span.attributes.httpStatus).toBe(200);
  });

  test("cache hit span is tagged exact", async () => {
    resetUsage();
    const sink = new InMemorySpanSink();
    const keys = new InMemoryApiKeyStore([
      { token: "tok", customerId: "cust_1", mode: "managed" },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      spans: sink,
      fetchImpl: fakeFetch([{ status: 200, body: anthropicOk() }]),
      env: { ANTHROPIC_API_KEY: "K" },
    };
    const handler = buildHandler(deps);
    const payload = JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      messages: [{ role: "user", content: "hi" }],
    });
    const headers = {
      authorization: "Bearer tok",
      "content-type": "application/json",
    };
    await handler(new Request("http://x/v1/chat/completions", { method: "POST", headers, body: payload }));
    await handler(new Request("http://x/v1/chat/completions", { method: "POST", headers, body: payload }));
    expect(sink.spans.length).toBe(2);
    expect(sink.spans[1]!.attributes.cacheHit).toBe("exact");
  });
});
