// ── BYOK vs Managed-Key Test ──────────────────────────────────────────
// Verifies that:
//  - A BYOK customer's own provider key is forwarded to the upstream call.
//  - A managed-mode customer falls through to the gateway's pooled keys.
//  - BYOK without a customer key for the chosen provider 503s by default.
//  - BYOK with `managedFallback: true` falls through to managed.

import { describe, expect, test } from "bun:test";
import { LruCache } from "../src/cache";
import { buildHandler, type GatewayDeps } from "../src/index";
import { InMemoryApiKeyStore } from "../src/keys";
import type { GatewayChatResponse } from "../src/types";
import { resetForTesting as resetUsage } from "../src/usage";

interface CapturedRequest {
  url: string;
  init: RequestInit;
}

function spyFetch(plans: { status: number; body: unknown }[]): {
  fn: typeof fetch;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];
  let i = 0;
  const fn = (async (input: unknown, init?: unknown): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    captured.push({ url, init: (init as RequestInit) ?? {} });
    const plan = plans[i] ?? plans[plans.length - 1];
    if (!plan) {
      throw new Error("spyFetch: no plan available");
    }
    i += 1;
    return new Response(JSON.stringify(plan.body), {
      status: plan.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, captured };
}

function anthropicOk(text: string): unknown {
  return {
    id: "msg_x",
    model: "claude-3-5-sonnet-latest",
    content: [{ type: "text", text }],
    usage: { input_tokens: 4, output_tokens: 6 },
  };
}

describe("BYOK vs managed mode", () => {
  test("byok forwards customer-supplied provider key", async () => {
    resetUsage();
    const { fn: fakeFetch, captured } = spyFetch([{ status: 200, body: anthropicOk("byok!") }]);
    const keys = new InMemoryApiKeyStore([
      {
        token: "byok-token",
        customerId: "cust_byok",
        mode: "byok",
        providerKeys: { anthropic: "customer-anthropic-key" },
      },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      fetchImpl: fakeFetch,
      env: { ANTHROPIC_API_KEY: "MANAGED_POOL_KEY" },
    };
    const res = await buildHandler(deps)(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer byok-token", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-key-source")).toBe("byok");
    const headers = (captured[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers["x-api-key"]).toBe("customer-anthropic-key");
  });

  test("managed mode uses gateway-pooled key", async () => {
    resetUsage();
    const { fn: fakeFetch, captured } = spyFetch([{ status: 200, body: anthropicOk("managed!") }]);
    const keys = new InMemoryApiKeyStore([
      { token: "mgr-token", customerId: "cust_mgr", mode: "managed" },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      fetchImpl: fakeFetch,
      env: { ANTHROPIC_API_KEY: "MANAGED_POOL_KEY" },
    };
    const res = await buildHandler(deps)(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer mgr-token", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-key-source")).toBe("managed");
    const headers = (captured[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers["x-api-key"]).toBe("MANAGED_POOL_KEY");
  });

  test("byok with no customer key AND no managedFallback AND no fallback options → 503", async () => {
    resetUsage();
    const { fn: fakeFetch } = spyFetch([{ status: 200, body: anthropicOk("nope") }]);
    const keys = new InMemoryApiKeyStore([
      {
        token: "byok-no-keys",
        customerId: "cust_x",
        mode: "byok",
        providerKeys: {}, // none — and no managedFallback
        // Empty fallback chain so the gateway can't divert to a provider
        // the customer DOES have a key for. Only primary anthropic is tried.
        fallbackChain: ["anthropic"],
      },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      fetchImpl: fakeFetch,
      env: { ANTHROPIC_API_KEY: "MANAGED_POOL_KEY" },
    };
    const res = await buildHandler(deps)(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer byok-no-keys", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(503);
  });

  test("byok with managedFallback=true falls through to pooled key", async () => {
    resetUsage();
    const { fn: fakeFetch, captured } = spyFetch([{ status: 200, body: anthropicOk("fallback!") }]);
    const keys = new InMemoryApiKeyStore([
      {
        token: "byok-with-fallback",
        customerId: "cust_y",
        mode: "byok",
        providerKeys: {}, // none
        managedFallback: true,
      },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      fetchImpl: fakeFetch,
      env: { ANTHROPIC_API_KEY: "MANAGED_POOL_KEY" },
    };
    const res = await buildHandler(deps)(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer byok-with-fallback",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-key-source")).toBe("managed");
    const headers = (captured[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers["x-api-key"]).toBe("MANAGED_POOL_KEY");
  });

  test("unknown bearer token → 401", async () => {
    resetUsage();
    const { fn: fakeFetch } = spyFetch([]);
    const keys = new InMemoryApiKeyStore([
      { token: "real-token", customerId: "cust_z", mode: "managed" },
    ]);
    const deps: GatewayDeps = {
      cache: new LruCache<GatewayChatResponse>(10),
      keys,
      fetchImpl: fakeFetch,
      env: { ANTHROPIC_API_KEY: "MANAGED_POOL_KEY" },
    };
    const res = await buildHandler(deps)(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer wrong", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
