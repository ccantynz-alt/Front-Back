// ── AI Gateway v0 Tests ──────────────────────────────────────────────
// Mocks fetch entirely. No real network calls. Covers router, cache,
// usage ledger, server handler, and failover semantics.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { hashRequest, LruCache } from "./cache";
import { buildHandler, type GatewayDeps } from "./index";
import { failoverProvider, resolveProvider, shouldFailover } from "./router";
import type { GatewayChatResponse } from "./types";
import {
  estimateCostMicrodollars,
  resetForTesting as resetUsage,
  summary as usageSummary,
} from "./usage";

// ── Helpers ──────────────────────────────────────────────────────────

interface FakeFetchPlan {
  status: number;
  body: unknown;
}

function makeFakeFetch(plans: FakeFetchPlan[]): typeof fetch {
  let i = 0;
  const impl = async (_input: unknown, _init?: unknown): Promise<Response> => {
    const plan = plans[i] ?? plans[plans.length - 1];
    if (!plan) {
      throw new Error("fake fetch: no plan available");
    }
    i += 1;
    return new Response(JSON.stringify(plan.body), {
      status: plan.status,
      headers: { "content-type": "application/json" },
    });
  };
  return impl as unknown as typeof fetch;
}

function buildAnthropicSuccessBody(text: string): unknown {
  return {
    id: "msg_test_1",
    model: "claude-3-5-sonnet-latest",
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function buildOpenAISuccessBody(text: string): unknown {
  return {
    id: "chatcmpl_test_1",
    object: "chat.completion",
    created: 1700000000,
    model: "gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 7, completion_tokens: 13, total_tokens: 20 },
  };
}

function makeRequest(body: unknown, opts: { auth?: string } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.auth !== undefined) {
    headers["authorization"] = `Bearer ${opts.auth}`;
  }
  return new Request("http://127.0.0.1/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function buildDeps(plans: FakeFetchPlan[], envOverride: Partial<GatewayDeps["env"]> = {}): GatewayDeps {
  return {
    cache: new LruCache<GatewayChatResponse>(50),
    fetchImpl: makeFakeFetch(plans),
    env: {
      AI_GATEWAY_SECRET: "test-secret",
      ANTHROPIC_API_KEY: "anthropic-key",
      OPENAI_API_KEY: "openai-key",
      ...envOverride,
    },
  };
}

// ── Router ───────────────────────────────────────────────────────────

describe("router.resolveProvider", () => {
  test("claude-* → anthropic", () => {
    expect(resolveProvider("claude-3-5-sonnet-latest")).toBe("anthropic");
  });
  test("anthropic/* → anthropic", () => {
    expect(resolveProvider("anthropic/claude-3-haiku")).toBe("anthropic");
  });
  test("gpt-* → openai", () => {
    expect(resolveProvider("gpt-4o-mini")).toBe("openai");
  });
  test("o1-* and o4-* → openai", () => {
    expect(resolveProvider("o1-preview")).toBe("openai");
    expect(resolveProvider("o4-mini")).toBe("openai");
  });
  test("unknown model defaults to anthropic", () => {
    expect(resolveProvider("mystery-9000")).toBe("anthropic");
  });
  test("empty model defaults to anthropic", () => {
    expect(resolveProvider("")).toBe("anthropic");
  });
});

describe("router.failoverProvider + shouldFailover", () => {
  test("failover swaps anthropic↔openai", () => {
    expect(failoverProvider("anthropic")).toBe("openai");
    expect(failoverProvider("openai")).toBe("anthropic");
  });
  test("shouldFailover only on 5xx", () => {
    expect(shouldFailover(500)).toBe(true);
    expect(shouldFailover(502)).toBe(true);
    expect(shouldFailover(599)).toBe(true);
    expect(shouldFailover(429)).toBe(false);
    expect(shouldFailover(401)).toBe(false);
    expect(shouldFailover(200)).toBe(false);
  });
});

// ── Cache ────────────────────────────────────────────────────────────

describe("LruCache", () => {
  test("hashRequest is deterministic and length-64 hex", async () => {
    const a = await hashRequest("claude-3", [{ role: "user", content: "hi" }]);
    const b = await hashRequest("claude-3", [{ role: "user", content: "hi" }]);
    expect(a).toBe(b);
    expect(a.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(a)).toBe(true);
  });

  test("hashRequest differs for different messages", async () => {
    const a = await hashRequest("m", [{ role: "user", content: "x" }]);
    const b = await hashRequest("m", [{ role: "user", content: "y" }]);
    expect(a).not.toBe(b);
  });

  test("get/set/has work and stats track hits & misses", () => {
    const c = new LruCache<number>(3);
    expect(c.get("k")).toBeUndefined();
    expect(c.stats().misses).toBe(1);
    c.set("k", 1);
    expect(c.has("k")).toBe(true);
    expect(c.get("k")).toBe(1);
    expect(c.stats().hits).toBe(1);
    expect(c.stats().size).toBe(1);
  });

  test("evicts oldest entry when capacity exceeded", () => {
    const c = new LruCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.has("a")).toBe(false);
    expect(c.has("b")).toBe(true);
    expect(c.has("c")).toBe(true);
    expect(c.stats().size).toBe(2);
  });

  test("get refreshes recency so subsequent eviction skips it", () => {
    const c = new LruCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    // touch a → b becomes oldest
    expect(c.get("a")).toBe(1);
    c.set("c", 3);
    expect(c.has("a")).toBe(true);
    expect(c.has("b")).toBe(false);
    expect(c.has("c")).toBe(true);
  });

  test("constructor rejects non-positive capacity", () => {
    expect(() => new LruCache(0)).toThrow();
    expect(() => new LruCache(-1)).toThrow();
  });
});

// ── Usage ledger ─────────────────────────────────────────────────────

describe("usage", () => {
  beforeEach(() => {
    resetUsage();
  });

  test("estimateCostMicrodollars uses 1/5 rate", () => {
    expect(estimateCostMicrodollars(100, 50)).toBe(100 + 250);
  });

  test("summary aggregates by provider after handler runs", async () => {
    const deps = buildDeps([
      { status: 200, body: buildAnthropicSuccessBody("hello") },
    ]);
    const handler = buildHandler(deps);
    const res = await handler(
      makeRequest(
        {
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        },
        { auth: "test-secret" },
      ),
    );
    expect(res.status).toBe(200);
    const s = usageSummary();
    expect(s.totalRequests).toBe(1);
    expect(s.byProvider.anthropic.requests).toBe(1);
    expect(s.byProvider.openai.requests).toBe(0);
    expect(s.totalInputTokens).toBe(10);
    expect(s.totalOutputTokens).toBe(20);
  });
});

// ── Server handler ───────────────────────────────────────────────────

describe("buildHandler", () => {
  afterEach(() => {
    resetUsage();
  });

  test("rejects request with no auth header", async () => {
    const handler = buildHandler(buildDeps([]));
    const res = await handler(
      makeRequest({
        model: "claude-3-5-sonnet-latest",
        messages: [{ role: "user", content: "hi" }],
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  test("rejects wrong bearer token", async () => {
    const handler = buildHandler(buildDeps([]));
    const res = await handler(
      makeRequest(
        {
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        },
        { auth: "WRONG" },
      ),
    );
    expect(res.status).toBe(401);
  });

  test("rejects stream:true with 400", async () => {
    const handler = buildHandler(buildDeps([]));
    const res = await handler(
      makeRequest(
        {
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        },
        { auth: "test-secret" },
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("streaming not supported");
  });

  test("returns 503 when both provider keys are missing", async () => {
    // Both providers unconfigured: primary=anthropic returns 503 (no key),
    // failover to openai also returns 503 (no key). Final status is 503.
    const deps = buildDeps([], { ANTHROPIC_API_KEY: undefined, OPENAI_API_KEY: undefined });
    const handler = buildHandler(deps);
    const res = await handler(
      makeRequest(
        {
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        },
        { auth: "test-secret" },
      ),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  test("returns 503 when AI_GATEWAY_SECRET unset", async () => {
    const deps = buildDeps([], { AI_GATEWAY_SECRET: undefined });
    const handler = buildHandler(deps);
    const res = await handler(
      makeRequest(
        {
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        },
        { auth: "anything" },
      ),
    );
    expect(res.status).toBe(503);
  });

  test("rejects invalid JSON body with 400", async () => {
    const deps = buildDeps([]);
    const handler = buildHandler(deps);
    const req = new Request("http://127.0.0.1/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-secret",
      },
      body: "{not-json",
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  test("rejects unknown route with 404", async () => {
    const deps = buildDeps([]);
    const handler = buildHandler(deps);
    const req = new Request("http://127.0.0.1/v1/nope", {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
      body: "{}",
    });
    const res = await handler(req);
    expect(res.status).toBe(404);
  });

  test("health endpoint returns ok without auth", async () => {
    const deps = buildDeps([]);
    const handler = buildHandler(deps);
    const req = new Request("http://127.0.0.1/health", { method: "GET" });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("ai-gateway");
  });

  test("anthropic happy path returns OpenAI-shaped response", async () => {
    const deps = buildDeps([
      { status: 200, body: buildAnthropicSuccessBody("hello world") },
    ]);
    const handler = buildHandler(deps);
    const res = await handler(
      makeRequest(
        {
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        },
        { auth: "test-secret" },
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-cache")).toBe("MISS");
    const body = (await res.json()) as GatewayChatResponse;
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0]?.message.content).toBe("hello world");
    expect(body.usage.prompt_tokens).toBe(10);
  });

  test("openai happy path returns response", async () => {
    const deps = buildDeps([
      { status: 200, body: buildOpenAISuccessBody("hi back") },
    ]);
    const handler = buildHandler(deps);
    const res = await handler(
      makeRequest(
        {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "yo" }],
        },
        { auth: "test-secret" },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as GatewayChatResponse;
    expect(body.choices[0]?.message.content).toBe("hi back");
  });

  test("cache HIT on second identical request", async () => {
    const deps = buildDeps([
      { status: 200, body: buildAnthropicSuccessBody("cached!") },
    ]);
    const handler = buildHandler(deps);
    const payload = {
      model: "claude-3-5-sonnet-latest",
      messages: [{ role: "user", content: "same" }],
    };
    const r1 = await handler(makeRequest(payload, { auth: "test-secret" }));
    expect(r1.headers.get("x-cache")).toBe("MISS");
    const r2 = await handler(makeRequest(payload, { auth: "test-secret" }));
    expect(r2.headers.get("x-cache")).toBe("HIT");
    expect(r2.status).toBe(200);
    const body = (await r2.json()) as GatewayChatResponse;
    expect(body.choices[0]?.message.content).toBe("cached!");
  });

  test("failover triggers on 5xx and second provider serves request", async () => {
    // First call (anthropic) fails 503, second call (openai failover) succeeds.
    const deps = buildDeps([
      { status: 503, body: { error: "anthropic down" } },
      { status: 200, body: buildOpenAISuccessBody("served by openai") },
    ]);
    const handler = buildHandler(deps);
    const res = await handler(
      makeRequest(
        {
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "ping" }],
        },
        { auth: "test-secret" },
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-failover")).toBe("openai");
    const body = (await res.json()) as GatewayChatResponse;
    expect(body.choices[0]?.message.content).toBe("served by openai");
  });

  test("4xx primary error is NOT failed over (surface it directly)", async () => {
    const deps = buildDeps([
      { status: 401, body: { error: { message: "invalid api key" } } },
    ]);
    const handler = buildHandler(deps);
    const res = await handler(
      makeRequest(
        {
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "ping" }],
        },
        { auth: "test-secret" },
      ),
    );
    expect(res.status).toBe(401);
  });

  test("both providers 5xx → returns secondary status", async () => {
    const deps = buildDeps([
      { status: 502, body: { error: "anthropic" } },
      { status: 504, body: { error: "openai" } },
    ]);
    const handler = buildHandler(deps);
    const res = await handler(
      makeRequest(
        {
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "ping" }],
        },
        { auth: "test-secret" },
      ),
    );
    expect(res.status).toBe(504);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("both providers failed");
  });

  test("invalid request shape (missing messages) → 400", async () => {
    const deps = buildDeps([]);
    const handler = buildHandler(deps);
    const res = await handler(
      makeRequest({ model: "claude-3-5-sonnet-latest" }, { auth: "test-secret" }),
    );
    expect(res.status).toBe(400);
  });
});
