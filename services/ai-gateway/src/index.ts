// ── AI Gateway v0 (BLK-021) ───────────────────────────────────────────
// Self-hosted LLM proxy that fans out across providers (Anthropic / OpenAI
// in v0; Google / Mistral / WebGPU tiers land in v1). Provides:
//   - OpenAI-compatible POST /v1/chat/completions
//   - Bearer-token auth via AI_GATEWAY_SECRET
//   - In-memory exact-match response cache (LRU 1000)
//   - Single-hop failover (Anthropic ↔ OpenAI on 5xx)
//   - In-memory usage ledger
//   - Streaming is NOT in v0 — explicitly rejected with 400.

import {
  defaultCache,
  hashRequest,
  type LruCache,
} from "./cache";
import { callAnthropic } from "./providers/anthropic";
import { callOpenAI } from "./providers/openai";
import { failoverProvider, resolveProvider, shouldFailover, type ProviderName } from "./router";
import {
  type GatewayChatResponse,
  normaliseInbound,
  openaiInboundRequestSchema,
} from "./types";
import { estimateCostMicrodollars, record as recordUsage } from "./usage";

export interface GatewayDeps {
  cache: LruCache<GatewayChatResponse>;
  fetchImpl: typeof fetch;
  env: {
    AI_GATEWAY_SECRET?: string | undefined;
    ANTHROPIC_API_KEY?: string | undefined;
    OPENAI_API_KEY?: string | undefined;
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

function checkAuth(req: Request, secret: string | undefined): true | Response {
  if (!secret) {
    // Fail closed: if the gateway has no secret configured, refuse traffic.
    return errorResponse(503, "gateway not configured: AI_GATEWAY_SECRET unset");
  }
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return errorResponse(401, "missing bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  if (token !== secret) {
    return errorResponse(401, "invalid bearer token");
  }
  return true;
}

async function invokeProvider(
  provider: ProviderName,
  reqBody: ReturnType<typeof normaliseInbound>,
  deps: GatewayDeps,
) {
  if (provider === "anthropic") {
    const apiKey = deps.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        ok: false as const,
        status: 503,
        errorBody: "ANTHROPIC_API_KEY not configured",
      };
    }
    return callAnthropic(reqBody, { apiKey, fetchImpl: deps.fetchImpl });
  }
  const apiKey = deps.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false as const,
      status: 503,
      errorBody: "OPENAI_API_KEY not configured",
    };
  }
  return callOpenAI(reqBody, { apiKey, fetchImpl: deps.fetchImpl });
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
        { status: "ok", service: "ai-gateway", version: "0.0.1" },
        200,
      );
    }

    if (url.pathname !== "/v1/chat/completions") {
      return errorResponse(404, `route not found: ${url.pathname}`);
    }

    if (req.method !== "POST") {
      return errorResponse(405, "method not allowed");
    }

    const auth = checkAuth(req, deps.env.AI_GATEWAY_SECRET);
    if (auth !== true) {
      return auth;
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return errorResponse(400, "invalid JSON body");
    }

    const parsed = openaiInboundRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(400, `invalid request shape: ${parsed.error.message}`);
    }

    if (parsed.data.stream === true) {
      return errorResponse(400, "streaming not supported in gateway v0");
    }

    const normalised = normaliseInbound(parsed.data);

    // Cache lookup (exact match on model + messages).
    const cacheKey = await hashRequest(normalised.model, normalised.messages);
    const cached = deps.cache.get(cacheKey);
    if (cached !== undefined) {
      return jsonResponse(cached, 200, { "x-cache": "HIT" });
    }

    const primary = resolveProvider(normalised.model);
    const primaryResult = await invokeProvider(primary, normalised, deps);

    if (primaryResult.ok) {
      deps.cache.set(cacheKey, primaryResult.response);
      recordUsageFromResponse(primary, primaryResult.response);
      return jsonResponse(primaryResult.response, 200, { "x-cache": "MISS" });
    }

    // Failover path: only on 5xx, only one retry, only on the opposite vendor.
    if (shouldFailover(primaryResult.status)) {
      const secondary = failoverProvider(primary);
      const secondaryResult = await invokeProvider(secondary, normalised, deps);
      if (secondaryResult.ok) {
        deps.cache.set(cacheKey, secondaryResult.response);
        recordUsageFromResponse(secondary, secondaryResult.response);
        return jsonResponse(secondaryResult.response, 200, {
          "x-cache": "MISS",
          "x-failover": secondary,
        });
      }
      return errorResponse(
        secondaryResult.status,
        `both providers failed (primary=${primary} ${primaryResult.status}, secondary=${secondary} ${secondaryResult.status})`,
      );
    }

    return errorResponse(
      primaryResult.status,
      `provider error from ${primary}: ${primaryResult.errorBody ?? "unknown"}`,
    );
  };
}

function recordUsageFromResponse(
  provider: ProviderName,
  response: GatewayChatResponse,
): void {
  const inputTokens = response.usage.prompt_tokens;
  const outputTokens = response.usage.completion_tokens;
  recordUsage({
    provider,
    model: response.model,
    inputTokens,
    outputTokens,
    costMicrodollars: estimateCostMicrodollars(inputTokens, outputTokens),
    ts: Date.now(),
  });
}

// ── Server bootstrap (only when run directly, not when imported) ──────

const isEntrypoint = import.meta.main;
if (isEntrypoint) {
  const port = Number(process.env["AI_GATEWAY_PORT"] ?? "9092");
  const handler = buildHandler({
    cache: defaultCache as LruCache<GatewayChatResponse>,
    fetchImpl: fetch,
    env: {
      AI_GATEWAY_SECRET: process.env["AI_GATEWAY_SECRET"],
      ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
      OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
    },
  });

  Bun.serve({
    fetch: handler,
    port,
    hostname: "127.0.0.1",
  });

  console.log(`[ai-gateway] listening on http://127.0.0.1:${port}`);
  console.log("[ai-gateway] v0 — OpenAI-compatible proxy with cache + failover");
}
