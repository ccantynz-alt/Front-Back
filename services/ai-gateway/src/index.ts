// ── AI Gateway v1 (BLK-021) ───────────────────────────────────────────
// Production-deployable LLM proxy. v1 ships:
//   - 5 upstream providers: anthropic, openai, google, groq, mistral
//   - 1 virtual provider: webgpu (records client-side inference for billing)
//   - BYOK + managed-key dual mode, per-customer API keys
//   - Exact-match LRU cache + semantic similarity cache
//   - Per-key token-bucket rate limiting
//   - Configurable fallback chain (5xx / network → next provider)
//   - SSE streaming pass-through (`stream: true`)
//   - OpenTelemetry-compatible spans on every request
//   - Two auth surfaces:
//       * `AI_GATEWAY_SECRET` for control-plane (admin / health probes)
//       * Per-customer API keys for data-plane (chat completions)

import {
  defaultCache,
  hashRequest,
  LruCache,
  SemanticCache,
} from "./cache";
import { dispatch } from "./dispatch";
import { defaultEmbedder, type Embedder } from "./embeddings";
import { InMemoryApiKeyStore, type ApiKeyStore } from "./keys";
import { buildFallbackChain, resolveProvider, shouldFailover } from "./router";
import { RateLimiter } from "./ratelimit";
import { encodeSseChunk, STREAM_DONE_LINE } from "./streaming";
import {
  defaultSpanSink,
  type GatewaySpan,
  type SpanSink,
  nowMs,
} from "./telemetry";
import {
  callWebGPU,
  webgpuRecordSchema,
  type WebGPURecord,
} from "./providers/webgpu";
import {
  type GatewayApiKey,
  type GatewayChatResponse,
  normaliseInbound,
  openaiInboundRequestSchema,
  type ProviderName,
} from "./types";
import { estimateCostMicrodollars, record as recordUsage } from "./usage";

export interface GatewayDeps {
  /** Exact-match response cache. */
  cache: LruCache<GatewayChatResponse>;
  /** Optional semantic cache (vector similarity). Off when undefined. */
  semanticCache?: SemanticCache<GatewayChatResponse>;
  /** Per-key token-bucket rate limiter. */
  rateLimiter?: RateLimiter;
  /** Per-customer API key store. */
  keys?: ApiKeyStore;
  /** OTel-compatible span sink. */
  spans?: SpanSink;
  /** Embedder used by the semantic cache. Defaults to hashed bag-of-words. */
  embedder?: Embedder;
  /** Underlying fetch impl (injected for tests). */
  fetchImpl: typeof fetch;
  env: {
    AI_GATEWAY_SECRET?: string | undefined;
    ANTHROPIC_API_KEY?: string | undefined;
    OPENAI_API_KEY?: string | undefined;
    GOOGLE_API_KEY?: string | undefined;
    GROQ_API_KEY?: string | undefined;
    MISTRAL_API_KEY?: string | undefined;
  };
}

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

interface AuthResult {
  ok: true;
  /** True when the caller used the control-plane secret. */
  controlPlane: boolean;
  /** Customer key when `controlPlane === false`. */
  apiKey?: GatewayApiKey | undefined;
}

function authenticate(req: Request, deps: GatewayDeps): AuthResult | Response {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return errorResponse(401, "missing bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  if (token.length === 0) {
    return errorResponse(401, "empty bearer token");
  }

  // Control-plane secret takes priority — admin endpoints use it.
  const secret = deps.env.AI_GATEWAY_SECRET;
  if (secret && token === secret) {
    return { ok: true, controlPlane: true };
  }

  // Data-plane: lookup against the per-customer key store.
  const key = deps.keys?.lookup(token);
  if (key) {
    return { ok: true, controlPlane: false, apiKey: key };
  }

  // Fallback for v0-style deployments: if the gateway has a secret
  // configured but no key store, treat the secret as the only valid
  // token. This keeps the health/check tests + existing callers working.
  if (secret && !deps.keys) {
    return errorResponse(401, "invalid bearer token");
  }

  if (!secret && !deps.keys) {
    return errorResponse(503, "gateway not configured: no auth source available");
  }

  return errorResponse(401, "invalid bearer token");
}

function pickProviderApiKey(
  provider: ProviderName,
  apiKey: GatewayApiKey | undefined,
  env: GatewayDeps["env"],
): { apiKey?: string; source: "byok" | "managed" } | undefined {
  if (provider === "webgpu") {
    // Virtual provider; no upstream key needed.
    return { source: "managed" };
  }
  // BYOK path: try the customer's key first.
  if (apiKey?.mode === "byok") {
    const customerKey = apiKey.providerKeys?.[provider];
    if (customerKey) {
      return { apiKey: customerKey, source: "byok" };
    }
    if (apiKey.managedFallback !== true) {
      return undefined;
    }
    // fall through to managed
  }

  const managed = managedEnvKeyFor(provider, env);
  if (managed) {
    return { apiKey: managed, source: "managed" };
  }
  return undefined;
}

function managedEnvKeyFor(
  provider: Exclude<ProviderName, "webgpu">,
  env: GatewayDeps["env"],
): string | undefined {
  switch (provider) {
    case "anthropic":
      return env.ANTHROPIC_API_KEY;
    case "openai":
      return env.OPENAI_API_KEY;
    case "google":
      return env.GOOGLE_API_KEY;
    case "groq":
      return env.GROQ_API_KEY;
    case "mistral":
      return env.MISTRAL_API_KEY;
    default: {
      const _exhaustive: never = provider;
      void _exhaustive;
      return undefined;
    }
  }
}

interface AttemptResult {
  provider: ProviderName;
  status: number;
  ok: boolean;
  response?: GatewayChatResponse;
  errorBody?: string;
  keySource?: "byok" | "managed";
}

async function attemptProvider(
  provider: Exclude<ProviderName, "webgpu">,
  normalised: ReturnType<typeof normaliseInbound>,
  apiKey: GatewayApiKey | undefined,
  deps: GatewayDeps,
): Promise<AttemptResult> {
  const keyChoice = pickProviderApiKey(provider, apiKey, deps.env);
  if (!keyChoice || !keyChoice.apiKey) {
    return {
      provider,
      ok: false,
      status: 503,
      errorBody: `no api key available for provider=${provider}`,
    };
  }
  const result = await dispatch(provider, normalised, {
    apiKey: keyChoice.apiKey,
    fetchImpl: deps.fetchImpl,
  });
  if (result.ok) {
    return {
      provider,
      ok: true,
      status: result.status,
      response: result.response,
      keySource: keyChoice.source,
    };
  }
  return {
    provider,
    ok: false,
    status: result.status,
    errorBody: result.errorBody,
    keySource: keyChoice.source,
  };
}

/**
 * Build the request handler. Exported as a factory so tests can inject
 * a fake fetch and a fresh cache instance per case.
 */
export function buildHandler(deps: GatewayDeps): (req: Request) => Promise<Response> {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return jsonResponse(
        { status: "ok", service: "ai-gateway", version: "1.0.0" },
        200,
      );
    }

    if (req.method === "POST" && url.pathname === "/v1/webgpu/record") {
      return handleWebGPURecord(req, deps);
    }

    if (url.pathname !== "/v1/chat/completions") {
      return errorResponse(404, `route not found: ${url.pathname}`);
    }

    if (req.method !== "POST") {
      return errorResponse(405, "method not allowed");
    }

    return handleChatCompletions(req, deps);
  };
}

async function handleChatCompletions(req: Request, deps: GatewayDeps): Promise<Response> {
  const sink = deps.spans ?? defaultSpanSink;
  const span: GatewaySpan = {
    name: "ai-gateway.chat.completions",
    startMs: nowMs(),
    durationMs: 0,
    status: "ok",
    attributes: {},
  };

  const finalize = (response: Response, attrs: Partial<GatewaySpan["attributes"]>): Response => {
    span.attributes = { ...span.attributes, ...attrs, httpStatus: response.status };
    span.durationMs = nowMs() - span.startMs;
    span.status = response.status >= 400 ? "error" : "ok";
    sink.emit(span);
    return response;
  };

  const auth = authenticate(req, deps);
  if (auth instanceof Response) {
    return finalize(auth, { error: "auth-failed" });
  }
  if (auth.apiKey?.customerId !== undefined) {
    span.attributes.customerId = auth.apiKey.customerId;
  }
  if (auth.apiKey?.mode !== undefined) {
    span.attributes.keyMode = auth.apiKey.mode;
  }

  // Rate-limit on the data-plane only — control-plane callers are trusted.
  if (!auth.controlPlane && auth.apiKey && deps.rateLimiter) {
    const decision = deps.rateLimiter.consume(auth.apiKey.token, {
      ...(auth.apiKey.burst !== undefined && { burst: auth.apiKey.burst }),
      ...(auth.apiKey.rps !== undefined && { rps: auth.apiKey.rps }),
    });
    if (!decision.allowed) {
      const retry = Math.ceil(decision.retryAfterSec).toString();
      return finalize(
        new Response(
          JSON.stringify({ ok: false, error: "rate limit exceeded" }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": retry,
              "x-ratelimit-remaining": "0",
            },
          },
        ),
        { error: "rate-limited" },
      );
    }
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return finalize(errorResponse(400, "invalid JSON body"), { error: "bad-json" });
  }

  const parsed = openaiInboundRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return finalize(
      errorResponse(400, `invalid request shape: ${parsed.error.message}`),
      { error: "bad-shape" },
    );
  }

  const normalised = normaliseInbound(parsed.data);
  span.attributes.model = normalised.model;
  span.attributes.streaming = parsed.data.stream === true;

  // Streaming: short-circuit straight into a streaming response.
  if (parsed.data.stream === true) {
    return finalize(
      await runStreaming(normalised, auth.apiKey, deps, span),
      {},
    );
  }

  // Cache lookup: exact match first.
  const cacheKey = await hashRequest(normalised.model, normalised.messages);
  const cached = deps.cache.get(cacheKey);
  if (cached !== undefined) {
    return finalize(jsonResponse(cached, 200, { "x-cache": "HIT" }), {
      cacheHit: "exact",
      promptTokens: cached.usage.prompt_tokens,
      completionTokens: cached.usage.completion_tokens,
    });
  }

  // Semantic cache lookup (only for non-deterministic prompts — we treat
  // the absence of `temperature: 0` as "potentially semantic").
  if (deps.semanticCache && (normalised.temperature === undefined || normalised.temperature > 0)) {
    const semHit = await deps.semanticCache.lookup(normalised.model, normalised.messages);
    if (semHit) {
      return finalize(
        jsonResponse(semHit.value, 200, {
          "x-cache": "SEMANTIC",
          "x-cache-similarity": semHit.similarity.toFixed(4),
        }),
        {
          cacheHit: "semantic",
          promptTokens: semHit.value.usage.prompt_tokens,
          completionTokens: semHit.value.usage.completion_tokens,
        },
      );
    }
  }

  span.attributes.cacheHit = "miss";

  // Fallback chain.
  const primary = resolveProvider(normalised.model);
  const chain = buildFallbackChain(primary, auth.apiKey?.fallbackChain);

  let lastResult: AttemptResult | undefined;
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];
    if (!provider || provider === "webgpu") {
      continue;
    }
    const attempt = await attemptProvider(provider, normalised, auth.apiKey, deps);
    lastResult = attempt;
    if (attempt.ok && attempt.response) {
      const fallbackUsed = i > 0;
      deps.cache.set(cacheKey, attempt.response);
      if (deps.semanticCache && (normalised.temperature === undefined || normalised.temperature > 0)) {
        await deps.semanticCache.set(
          normalised.model,
          normalised.messages,
          attempt.response,
        );
      }
      recordUsageFromResponse(provider, attempt.response, auth.apiKey, "miss");

      const headers: Record<string, string> = { "x-cache": "MISS" };
      if (fallbackUsed) {
        headers["x-failover"] = provider;
      }
      if (attempt.keySource) {
        headers["x-key-source"] = attempt.keySource;
      }
      return finalize(jsonResponse(attempt.response, 200, headers), {
        provider,
        fallbackUsed,
        ...(fallbackUsed ? { fallbackProvider: provider } : {}),
        promptTokens: attempt.response.usage.prompt_tokens,
        completionTokens: attempt.response.usage.completion_tokens,
      });
    }
    // 4xx errors are NOT retried — surface them directly to the caller.
    if (!shouldFailover(attempt.status)) {
      return finalize(
        errorResponse(
          attempt.status,
          `provider error from ${provider}: ${attempt.errorBody ?? "unknown"}`,
        ),
        { provider, error: attempt.errorBody ?? "unknown" },
      );
    }
  }

  const finalProvider = lastResult?.provider ?? primary;
  const finalStatus = lastResult?.status ?? 503;
  return finalize(
    errorResponse(
      finalStatus,
      `all providers failed (chain=${chain.join("→")} last=${finalProvider} status=${finalStatus})`,
    ),
    {
      provider: finalProvider,
      fallbackUsed: chain.length > 1,
      error: lastResult?.errorBody ?? "all-providers-failed",
    },
  );
}

async function runStreaming(
  normalised: ReturnType<typeof normaliseInbound>,
  apiKey: GatewayApiKey | undefined,
  deps: GatewayDeps,
  span: GatewaySpan,
): Promise<Response> {
  // For v1 streaming we ALWAYS go straight to the primary provider —
  // streaming through a fallback chain would mean buffering, which we
  // explicitly do NOT do. If streaming fails, the caller retries without
  // `stream: true`.
  const primary = resolveProvider(normalised.model);
  if (primary === "webgpu") {
    return errorResponse(400, "streaming not supported for webgpu virtual provider");
  }

  const keyChoice = pickProviderApiKey(primary, apiKey, deps.env);
  if (!keyChoice || !keyChoice.apiKey) {
    return errorResponse(503, `no api key available for provider=${primary}`);
  }

  // Build the upstream streaming request. Each provider has its own SSE
  // shape; we proxy bytes for OpenAI-compatible providers (openai/groq/
  // mistral) and re-frame for non-OpenAI shapes (anthropic/google).
  const provider = primary;
  span.attributes.provider = provider;

  const fetchImpl = deps.fetchImpl;

  if (provider === "openai" || provider === "groq" || provider === "mistral") {
    const endpoint =
      provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : provider === "groq"
          ? "https://api.groq.com/openai/v1/chat/completions"
          : "https://api.mistral.ai/v1/chat/completions";
    const body = {
      model: normalised.model.replace(/^(openai|groq|mistral)\//, ""),
      messages: normalised.messages,
      stream: true,
      ...(normalised.maxTokens !== undefined && { max_tokens: normalised.maxTokens }),
      ...(normalised.temperature !== undefined && { temperature: normalised.temperature }),
    };
    let res: Response;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${keyChoice.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(502, `upstream stream error: ${msg}`);
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      return errorResponse(res.status || 502, text || "upstream stream rejected");
    }
    // Pure pass-through: hand the upstream body straight to the caller.
    return new Response(res.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-content-type-options": "nosniff",
        "x-key-source": keyChoice.source,
      },
    });
  }

  // Anthropic + Google: use non-streaming under the hood and emit a
  // single chunk + DONE. This still satisfies the caller's `stream: true`
  // contract — they get text/event-stream framing — without us having
  // to ship a full Anthropic event-stream parser in v1.
  const result = await dispatch(provider, normalised, {
    apiKey: keyChoice.apiKey,
    fetchImpl,
  });
  if (!result.ok) {
    return errorResponse(result.status, `provider error from ${provider}: ${result.errorBody}`);
  }
  const text = result.response.choices[0]?.message.content ?? "";
  const id = result.response.id;
  const model = result.response.model;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const chunk = {
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: { content: text },
            finish_reason: null,
          },
        ],
      };
      controller.enqueue(encoder.encode(encodeSseChunk(chunk)));
      const last = {
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: { content: "" },
            finish_reason: "stop",
          },
        ],
      };
      controller.enqueue(encoder.encode(encodeSseChunk(last)));
      controller.enqueue(encoder.encode(STREAM_DONE_LINE));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-content-type-options": "nosniff",
      "x-key-source": keyChoice.source,
    },
  });
}

async function handleWebGPURecord(req: Request, deps: GatewayDeps): Promise<Response> {
  const sink = deps.spans ?? defaultSpanSink;
  const span: GatewaySpan = {
    name: "ai-gateway.webgpu.record",
    startMs: nowMs(),
    durationMs: 0,
    status: "ok",
    attributes: { provider: "webgpu" },
  };
  const finalize = (response: Response, attrs: Partial<GatewaySpan["attributes"]>): Response => {
    span.attributes = { ...span.attributes, ...attrs, httpStatus: response.status };
    span.durationMs = nowMs() - span.startMs;
    span.status = response.status >= 400 ? "error" : "ok";
    sink.emit(span);
    return response;
  };

  const auth = authenticate(req, deps);
  if (auth instanceof Response) {
    return finalize(auth, { error: "auth-failed" });
  }
  if (auth.apiKey?.customerId !== undefined) {
    span.attributes.customerId = auth.apiKey.customerId;
  }
  if (auth.apiKey?.mode !== undefined) {
    span.attributes.keyMode = auth.apiKey.mode;
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return finalize(errorResponse(400, "invalid JSON body"), { error: "bad-json" });
  }
  const parsed = webgpuRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return finalize(
      errorResponse(400, `invalid webgpu record shape: ${parsed.error.message}`),
      { error: "bad-shape" },
    );
  }
  const rec: WebGPURecord = parsed.data;
  const result = callWebGPU(rec);
  if (!result.ok) {
    // callWebGPU is currently total — but keep the branch so the
    // dispatcher contract is honoured if it ever becomes fallible.
    return finalize(errorResponse(500, "webgpu synthesis failed"), {
      error: "webgpu-synthesis-failed",
    });
  }
  recordUsageFromResponse("webgpu", result.response, auth.apiKey, "miss");
  return finalize(jsonResponse(result.response, 200, { "x-provider": "webgpu" }), {
    model: rec.model,
    promptTokens: rec.inputTokens,
    completionTokens: rec.outputTokens,
  });
}

function recordUsageFromResponse(
  provider: ProviderName,
  response: GatewayChatResponse,
  apiKey: GatewayApiKey | undefined,
  cache: "exact" | "semantic" | "miss",
): void {
  const inputTokens = response.usage.prompt_tokens;
  const outputTokens = response.usage.completion_tokens;
  recordUsage({
    provider,
    model: response.model,
    inputTokens,
    outputTokens,
    costMicrodollars: estimateCostMicrodollars(inputTokens, outputTokens, provider),
    ts: Date.now(),
    cache,
    ...(apiKey?.customerId !== undefined && { customerId: apiKey.customerId }),
  });
}

// ── Server bootstrap (only when run directly, not when imported) ──────

const isEntrypoint = import.meta.main;
if (isEntrypoint) {
  const port = Number(process.env["AI_GATEWAY_PORT"] ?? "9092");
  const handler = buildHandler({
    cache: defaultCache as LruCache<GatewayChatResponse>,
    semanticCache: new SemanticCache<GatewayChatResponse>({
      capacity: 500,
      threshold: 0.92,
      embedder: defaultEmbedder,
    }),
    rateLimiter: new RateLimiter({ defaultBurst: 60, defaultRps: 10 }),
    keys: new InMemoryApiKeyStore(),
    spans: defaultSpanSink,
    fetchImpl: fetch,
    env: {
      AI_GATEWAY_SECRET: process.env["AI_GATEWAY_SECRET"],
      ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
      OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
      GOOGLE_API_KEY: process.env["GOOGLE_API_KEY"],
      GROQ_API_KEY: process.env["GROQ_API_KEY"],
      MISTRAL_API_KEY: process.env["MISTRAL_API_KEY"],
    },
  });

  Bun.serve({
    fetch: handler,
    port,
    hostname: "127.0.0.1",
  });

  console.log(`[ai-gateway] v1.0.0 listening on http://127.0.0.1:${port}`);
  console.log(
    "[ai-gateway] providers: anthropic, openai, google, groq, mistral, webgpu",
  );
}
