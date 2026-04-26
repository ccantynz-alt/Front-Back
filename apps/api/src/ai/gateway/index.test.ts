/**
 * AI Gateway v1 — auth, payload validation, happy-path, and cache.
 * Failover + cost-calculation cases live in `failover.test.ts` to keep
 * each file under the codeQuality file-length cap.
 *
 * Aligned with the dependency-injection style established in
 * `webhooks/gluecron-push.test.ts`: every dependency that touches the
 * outside world is overridable via `createAiGatewayApp({ deps })`.
 */

import { describe, expect, test } from "bun:test";
import {
  __test__,
  createAiGatewayApp,
  fallbackProvider,
  providerForModel,
  type ChatCompletionResponse,
} from "./index";
import {
  ANTHROPIC_MODEL,
  BEARER,
  OPENAI_MODEL,
  happy,
  makeRequest,
  recordingCaller,
  validBody,
} from "./test-helpers";

// ── Auth ────────────────────────────────────────────────────────────

describe("AI Gateway — auth", () => {
  test("401 when Authorization header is missing", async () => {
    const { caller } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(makeRequest(validBody()));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("unauthorized");
  });

  test("401 when Bearer token is wrong", async () => {
    const { caller } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(makeRequest(validBody(), { auth: "Bearer wrong_token" }));
    expect(res.status).toBe(401);
  });

  test("401 when the gateway secret is unset on the server", async () => {
    const { caller } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => undefined, callProvider: caller });
    const res = await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}` }));
    expect(res.status).toBe(401);
  });
});

// ── Payload validation ─────────────────────────────────────────────

describe("AI Gateway — payload validation", () => {
  test("400 when body is not JSON", async () => {
    const { caller } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(
      new Request("http://localhost/ai/gateway/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${BEARER}` },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 when messages is empty", async () => {
    const { caller } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(
      makeRequest(JSON.stringify({ model: ANTHROPIC_MODEL, messages: [] }), {
        auth: `Bearer ${BEARER}`,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 when model is missing", async () => {
    const { caller } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(
      makeRequest(JSON.stringify({ messages: [{ role: "user", content: "hi" }] }), {
        auth: `Bearer ${BEARER}`,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 when stream:true is requested (v1 unsupported)", async () => {
    const { caller } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    const res = await app.fetch(
      makeRequest(validBody({ stream: true }), { auth: `Bearer ${BEARER}` }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("v2");
  });
});

// ── Happy path ─────────────────────────────────────────────────────

describe("AI Gateway — happy path", () => {
  test("routes claude-* models to Anthropic and returns OpenAI-shaped JSON", async () => {
    const { caller, calls } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });

    const res = await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}` }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ChatCompletionResponse;
    expect(body.object).toBe("chat.completion");
    expect(body.stream).toBe(false);
    expect(body.choices[0]?.message.content).toBe("hello there");
    expect(body.usage.prompt_tokens).toBe(12);
    expect(body.usage.completion_tokens).toBe(7);
    expect(body.usage.total_tokens).toBe(19);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.provider).toBe("anthropic");
    expect(calls[0]?.model).toBe(ANTHROPIC_MODEL);

    expect(body.crontech.provider).toBe("anthropic");
    expect(body.crontech.cache_hit).toBe(false);
    expect(body.crontech.failover).toBe(false);
  });

  test("non-claude models route to OpenAI", async () => {
    const { caller, calls } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });
    await app.fetch(
      makeRequest(validBody({ model: OPENAI_MODEL }), { auth: `Bearer ${BEARER}` }),
    );
    expect(calls[0]?.provider).toBe("openai");
  });
});

// ── Cache ──────────────────────────────────────────────────────────

describe("AI Gateway — cache", () => {
  test("identical requests with x-cache-ttl share the same response without re-hitting the provider", async () => {
    const { caller, calls } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });

    const res1 = await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}`, ttl: 60 }));
    const res2 = await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}`, ttl: 60 }));

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const body1 = (await res1.json()) as ChatCompletionResponse;
    const body2 = (await res2.json()) as ChatCompletionResponse;

    expect(body1.crontech.cache_hit).toBe(false);
    expect(body2.crontech.cache_hit).toBe(true);
    expect(body2.choices[0]?.message.content).toBe(body1.choices[0]?.message.content);

    // Provider should only have been called for the first request.
    expect(calls).toHaveLength(1);
  });

  test("ttl=0 (default) bypasses the cache entirely", async () => {
    const { caller, calls } = recordingCaller(() => happy());
    const app = createAiGatewayApp({ getBearer: () => BEARER, callProvider: caller });

    await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}` }));
    await app.fetch(makeRequest(validBody(), { auth: `Bearer ${BEARER}` }));
    expect(calls).toHaveLength(2);
  });

  test("buildCacheKey is stable across whitespace-only differences", async () => {
    const a = await __test__.buildCacheKey("anthropic", ANTHROPIC_MODEL, [
      { role: "user", content: "hello" },
    ]);
    const b = await __test__.buildCacheKey("anthropic", ANTHROPIC_MODEL, [
      { role: "user", content: "  hello  " },
    ]);
    expect(a).toBe(b);
  });

  test("parseTtlHeader rejects bad input and caps at 24h", () => {
    expect(__test__.parseTtlHeader(undefined)).toBe(0);
    expect(__test__.parseTtlHeader("nope")).toBe(0);
    expect(__test__.parseTtlHeader("-5")).toBe(0);
    expect(__test__.parseTtlHeader("60")).toBe(60);
    expect(__test__.parseTtlHeader("999999")).toBe(86_400);
  });
});

// ── Pure helpers ───────────────────────────────────────────────────

describe("AI Gateway — provider routing helpers", () => {
  test("providerForModel routes claude-* to anthropic, everything else to openai", () => {
    expect(providerForModel("claude-sonnet-4-6")).toBe("anthropic");
    expect(providerForModel("claude-haiku-4-5-20251001")).toBe("anthropic");
    expect(providerForModel("gpt-4o")).toBe("openai");
    expect(providerForModel("o1-preview")).toBe("openai");
  });

  test("fallbackProvider crosses providers", () => {
    expect(fallbackProvider("anthropic")).toBe("openai");
    expect(fallbackProvider("openai")).toBe("anthropic");
  });
});
