// ── WebGPU Passthrough Tests ──────────────────────────────────────────

import { describe, expect, test } from "bun:test";
import { LruCache } from "../src/cache";
import { buildHandler, type GatewayDeps } from "../src/index";
import { InMemoryApiKeyStore } from "../src/keys";
import {
  callWebGPU,
  synthesiseWebGPUResponse,
  webgpuRecordSchema,
} from "../src/providers/webgpu";
import type { GatewayChatResponse } from "../src/types";
import { resetForTesting as resetUsage, summary } from "../src/usage";

describe("synthesiseWebGPUResponse", () => {
  test("constructs an OpenAI-shaped response", () => {
    const r = synthesiseWebGPUResponse({
      model: "webgpu/llama-3.2-1b",
      messages: [{ role: "user", content: "hi" }],
      output: "hello back",
      inputTokens: 3,
      outputTokens: 5,
    });
    expect(r.choices[0]?.message.content).toBe("hello back");
    expect(r.usage.total_tokens).toBe(8);
    expect(r.model).toBe("webgpu/llama-3.2-1b");
  });

  test("callWebGPU returns ok=true wrapping the synthesised response", () => {
    const out = callWebGPU({
      model: "webgpu/m",
      messages: [{ role: "user", content: "x" }],
      output: "y",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(out.ok).toBe(true);
  });
});

describe("webgpuRecordSchema", () => {
  test("rejects negative tokens", () => {
    const r = webgpuRecordSchema.safeParse({
      model: "m",
      messages: [{ role: "user", content: "x" }],
      output: "y",
      inputTokens: -1,
      outputTokens: 0,
    });
    expect(r.success).toBe(false);
  });

  test("accepts a complete record", () => {
    const r = webgpuRecordSchema.safeParse({
      model: "m",
      messages: [{ role: "user", content: "x" }],
      output: "y",
      inputTokens: 1,
      outputTokens: 2,
      latencyMs: 12.3,
      device: "Apple M3 Max",
    });
    expect(r.success).toBe(true);
  });
});

describe("/v1/webgpu/record", () => {
  test("authenticated record bumps usage ledger with provider=webgpu", async () => {
    resetUsage();
    const keys = new InMemoryApiKeyStore([
      { token: "tok", customerId: "c", mode: "managed" },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      fetchImpl: fetch,
      env: {},
    };
    const res = await buildHandler(deps)(
      new Request("http://x/v1/webgpu/record", {
        method: "POST",
        headers: {
          authorization: "Bearer tok",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "webgpu/llama-3.2-1b",
          messages: [{ role: "user", content: "hi" }],
          output: "result",
          inputTokens: 4,
          outputTokens: 8,
          latencyMs: 25,
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-provider")).toBe("webgpu");
    const s = summary();
    expect(s.byProvider.webgpu.requests).toBe(1);
    expect(s.byProvider.webgpu.inputTokens).toBe(4);
    expect(s.byProvider.webgpu.outputTokens).toBe(8);
    // WebGPU records cost 10 microdollars (flat routing fee).
    expect(s.byProvider.webgpu.costMicrodollars).toBe(10);
  });

  test("rejects unauthenticated record", async () => {
    resetUsage();
    const keys = new InMemoryApiKeyStore([]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      fetchImpl: fetch,
      env: { AI_GATEWAY_SECRET: "not-this" },
    };
    const res = await buildHandler(deps)(
      new Request("http://x/v1/webgpu/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
  });
});
