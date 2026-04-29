// ── Exact + Semantic Cache Tests ──────────────────────────────────────

import { describe, expect, test } from "bun:test";
import { LruCache, SemanticCache } from "../src/cache";
import { buildHandler, type GatewayDeps } from "../src/index";
import { InMemoryApiKeyStore } from "../src/keys";
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

function anthropicOk(text: string): unknown {
  return {
    id: "msg_x",
    model: "claude-3-5-sonnet-latest",
    content: [{ type: "text", text }],
    usage: { input_tokens: 4, output_tokens: 6 },
  };
}

function makeReq(body: unknown, token = "tok"): Request {
  return new Request("http://x/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildDeps(plans: { status: number; body: unknown }[]): GatewayDeps {
  const keys = new InMemoryApiKeyStore([
    { token: "tok", customerId: "cust", mode: "managed" },
  ]);
  return {
    cache: new LruCache<GatewayChatResponse>(50),
    semanticCache: new SemanticCache<GatewayChatResponse>({
      capacity: 50,
      threshold: 0.85, // tight enough that orthogonal prompts miss
    }),
    keys,
    fetchImpl: fakeFetch(plans),
    env: { ANTHROPIC_API_KEY: "K" },
  };
}

describe("exact-match cache", () => {
  test("identical request returns x-cache: HIT", async () => {
    resetUsage();
    const handler = buildHandler(buildDeps([
      { status: 200, body: anthropicOk("first") },
    ]));
    const payload = {
      model: "claude-3-5-sonnet-latest",
      messages: [{ role: "user", content: "ping" }],
    };
    const r1 = await handler(makeReq(payload));
    expect(r1.headers.get("x-cache")).toBe("MISS");
    const r2 = await handler(makeReq(payload));
    expect(r2.headers.get("x-cache")).toBe("HIT");
    expect(r2.status).toBe(200);
    const body = (await r2.json()) as GatewayChatResponse;
    expect(body.choices[0]?.message.content).toBe("first");
  });
});

describe("semantic cache", () => {
  test("near-identical prompt returns SEMANTIC hit", async () => {
    resetUsage();
    const handler = buildHandler(
      buildDeps([{ status: 200, body: anthropicOk("identity-answer") }]),
    );
    const original = {
      model: "claude-3-5-sonnet-latest",
      messages: [
        { role: "user" as const, content: "what is the capital of france please" },
      ],
    };
    const r1 = await handler(makeReq(original));
    expect(r1.headers.get("x-cache")).toBe("MISS");

    // Slight rephrasing — exact-match misses, semantic should hit because
    // the bag-of-words overlap is high.
    const similar = {
      model: "claude-3-5-sonnet-latest",
      messages: [
        { role: "user" as const, content: "please tell me what is the capital of france" },
      ],
    };
    const r2 = await handler(makeReq(similar));
    expect(r2.headers.get("x-cache")).toBe("SEMANTIC");
    const sim = parseFloat(r2.headers.get("x-cache-similarity") ?? "0");
    expect(sim).toBeGreaterThan(0.85);
  });

  test("dissimilar prompt does NOT trigger semantic hit", async () => {
    resetUsage();
    const handler = buildHandler(
      buildDeps([
        { status: 200, body: anthropicOk("first-answer") },
        { status: 200, body: anthropicOk("second-answer") },
      ]),
    );
    const r1 = await handler(
      makeReq({
        model: "claude-3-5-sonnet-latest",
        messages: [{ role: "user" as const, content: "weather forecast tomorrow" }],
      }),
    );
    expect(r1.headers.get("x-cache")).toBe("MISS");

    const r2 = await handler(
      makeReq({
        model: "claude-3-5-sonnet-latest",
        messages: [{ role: "user" as const, content: "explain photosynthesis briefly" }],
      }),
    );
    expect(r2.headers.get("x-cache")).toBe("MISS");
  });
});

describe("SemanticCache unit", () => {
  test("eviction at capacity drops oldest", async () => {
    const c = new SemanticCache<string>({ capacity: 2, threshold: 0.99 });
    await c.set("m", [{ role: "user", content: "alpha" }], "A");
    await c.set("m", [{ role: "user", content: "beta" }], "B");
    await c.set("m", [{ role: "user", content: "gamma" }], "C");
    expect(c.stats().size).toBe(2);
  });

  test("constructor rejects bad threshold", () => {
    expect(() => new SemanticCache({ threshold: 2 })).toThrow();
    expect(() => new SemanticCache({ threshold: -0.1 })).toThrow();
  });
});
