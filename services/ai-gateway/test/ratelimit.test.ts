// ── Rate Limiter Tests ────────────────────────────────────────────────

import { describe, expect, test } from "bun:test";
import { LruCache } from "../src/cache";
import { buildHandler, type GatewayDeps } from "../src/index";
import { InMemoryApiKeyStore } from "../src/keys";
import { RateLimiter } from "../src/ratelimit";
import type { GatewayChatResponse } from "../src/types";
import { resetForTesting as resetUsage } from "../src/usage";

function fakeFetch(): typeof fetch {
  return (async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        id: "x",
        model: "claude-3-5-sonnet-latest",
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

function makeReq(token: string): Request {
  return new Request("http://x/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      messages: [{ role: "user", content: "hi" }],
    }),
  });
}

describe("RateLimiter unit", () => {
  test("token bucket allows up to burst then rejects", () => {
    let now = 0;
    const rl = new RateLimiter({ defaultBurst: 3, defaultRps: 0, now: () => now });
    expect(rl.consume("k").allowed).toBe(true);
    expect(rl.consume("k").allowed).toBe(true);
    expect(rl.consume("k").allowed).toBe(true);
    const denied = rl.consume("k");
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  test("bucket refills at rps over time", () => {
    let now = 0;
    const rl = new RateLimiter({ defaultBurst: 1, defaultRps: 2, now: () => now });
    expect(rl.consume("k").allowed).toBe(true);
    expect(rl.consume("k").allowed).toBe(false);
    now = 1000; // +1s, +2 tokens but capped at 1
    expect(rl.consume("k").allowed).toBe(true);
  });

  test("per-key buckets are isolated", () => {
    const rl = new RateLimiter({ defaultBurst: 1, defaultRps: 0 });
    expect(rl.consume("a").allowed).toBe(true);
    expect(rl.consume("b").allowed).toBe(true);
    expect(rl.consume("a").allowed).toBe(false);
  });

  test("per-key cfg overrides default", () => {
    const rl = new RateLimiter({ defaultBurst: 1, defaultRps: 0 });
    expect(rl.consume("k", { burst: 3, rps: 0 }).allowed).toBe(true);
    expect(rl.consume("k", { burst: 3, rps: 0 }).allowed).toBe(true);
    expect(rl.consume("k", { burst: 3, rps: 0 }).allowed).toBe(true);
    expect(rl.consume("k", { burst: 3, rps: 0 }).allowed).toBe(false);
  });
});

describe("rate limiter wired into handler", () => {
  test("over-budget request returns 429 with retry-after", async () => {
    resetUsage();
    const keys = new InMemoryApiKeyStore([
      { token: "rl-tok", customerId: "cust_rl", mode: "managed", burst: 2, rps: 0 },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      rateLimiter: new RateLimiter({ defaultBurst: 100, defaultRps: 100 }),
      fetchImpl: fakeFetch(),
      env: { ANTHROPIC_API_KEY: "K" },
    };
    const handler = buildHandler(deps);

    const r1 = await handler(makeReq("rl-tok"));
    expect(r1.status).toBe(200);
    const r2 = await handler(makeReq("rl-tok"));
    expect(r2.status).toBe(200);
    // Bucket is now empty and rps:0 — third request must trip the limit.
    // Vary the message so cache doesn't short-circuit; need to do it before consume.
    const r3 = await handler(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer rl-tok",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "different" }],
        }),
      }),
    );
    expect(r3.status).toBe(429);
    expect(r3.headers.get("retry-after")).not.toBeNull();
  });
});
