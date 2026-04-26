/**
 * Crontech AI Gateway — v1 scaffold.
 *
 * Closes the "AI Gateway" cell in `docs/CLOUDFLARE_PARITY_AUDIT.md` (§5
 * AI table). Prior: ❌. New: 🟢 working but unsurfaced.
 *
 * Why this is REST (not tRPC). CLAUDE.md §6.4 mandates tRPC, but third-
 * party SDKs (`openai`, `langchain`, `instructor`, `LiteLLM`, …) already
 * speak the OpenAI Chat Completions wire format. Forcing them onto tRPC
 * would mean every customer reimplements their client. The internal-
 * caller type-safety stays at the call sites that wrap this gateway.
 *
 * Wire contract:
 *   POST /ai/gateway/v1/chat/completions
 *   Authorization: Bearer ${AI_GATEWAY_BEARER}
 *   x-cache-ttl: <seconds, optional, default 0>
 *   Body: { model, messages: [{role, content}], temperature?, max_tokens? }
 *
 * Doctrine notes:
 *   - §6.3 Zod-at-every-boundary: see `./schemas.ts`.
 *   - §6.5 streaming — v1 returns non-streamed; `stream:true` 400s with a
 *     v2 migration message. TODO(v2): SSE + mid-stream failover.
 *   - §0.7 hard gate: no new third-party service — Anthropic + OpenAI
 *     are already in the stack via BLK-002 / BLK-020.
 *   - In-memory cache for v1 (`./cache.ts`).
 *   - Failover: single retry on 5xx / timeout. No backoff, no breaker.
 */

import { SpanStatusCode } from "@opentelemetry/api";
import { Hono } from "hono";
import { tracer } from "../../telemetry";
import { timingSafeEqual } from "../../webhooks/gluecron-push";
import { GatewayCache, buildCacheKey, parseTtlHeader } from "./cache";
import {
  __readEnv,
  clampClientErrorStatus,
  defaultProviderCaller,
  extractBearer,
  fallbackProvider,
  GatewayUpstreamError,
  isFailoverable,
  providerForModel,
  type ProviderCaller,
} from "./providers";
import { runProviderAttempt, type AttemptCtx } from "./runner";
import {
  ChatCompletionRequestSchema,
  type ChatCompletionResponse,
} from "./schemas";

// ── Re-exports for the public module surface ────────────────────────

export {
  PROVIDERS,
  type Provider,
  providerForModel,
  fallbackProvider,
  defaultProviderCaller,
  GatewayUpstreamError,
  type ProviderCallInput,
  type ProviderCallResult,
  type ProviderCaller,
} from "./providers";
export {
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  type ChatMessage,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
} from "./schemas";

// ── App factory ─────────────────────────────────────────────────────

export interface AiGatewayDeps {
  /** Bearer token override — falls back to `AI_GATEWAY_BEARER` env var. */
  getBearer?: () => string | undefined;
  /** Provider caller seam — tests inject a fake to avoid real HTTP. */
  callProvider?: ProviderCaller;
  /** Cache override — defaults to a fresh in-memory map. */
  cache?: GatewayCache;
  /** Clock override — tests use a deterministic clock. */
  now?: () => number;
}

export function createAiGatewayApp(deps: AiGatewayDeps = {}): Hono {
  const getBearer = deps.getBearer ?? (() => __readEnv("AI_GATEWAY_BEARER"));
  const callProvider = deps.callProvider ?? defaultProviderCaller;
  const cache = deps.cache ?? new GatewayCache();
  const now = deps.now ?? (() => Date.now());

  const app = new Hono();

  app.post("/ai/gateway/v1/chat/completions", async (c) => {
    // 1. Auth
    const expected = getBearer();
    const provided = extractBearer(c.req.header("Authorization"));
    if (!expected || !provided || !timingSafeEqual(provided, expected)) {
      return c.json({ error: { type: "unauthorized", message: "invalid bearer" } }, 401);
    }

    // 2. Payload validation
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(
        { error: { type: "invalid_request", message: "body is not valid JSON" } },
        400,
      );
    }
    const parsed = ChatCompletionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            type: "invalid_request",
            message: "payload failed schema validation",
            issues: parsed.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
    const body = parsed.data;
    if (body.stream === true) {
      return c.json(
        {
          error: {
            type: "invalid_request",
            message: "stream:true is not supported in gateway v1; planned for v2",
          },
        },
        400,
      );
    }

    // 3. Cache lookup
    const ttlSeconds = parseTtlHeader(c.req.header("x-cache-ttl"));
    const primary = providerForModel(body.model);
    const cacheKey = await buildCacheKey(primary, body.model, body.messages);
    const cached = ttlSeconds > 0 ? cache.get(cacheKey) : undefined;
    if (cached) {
      const hit: ChatCompletionResponse = {
        ...cached,
        crontech: { ...cached.crontech, cache_hit: true, failover: false, latency_ms: 0 },
      };
      return c.json(hit, 200);
    }

    // 4. Provider call (with failover)
    const start = now();
    return await tracer.startActiveSpan("ai.gateway.request", async (span) => {
      span.setAttribute("provider", primary);
      span.setAttribute("model", body.model);
      span.setAttribute("cache_hit", false);

      const ctx: AttemptCtx = {
        span,
        body,
        callProvider,
        cache,
        cacheKey,
        ttlSeconds,
        now,
        start,
      };

      try {
        const ok = await runProviderAttempt(ctx, primary, false);
        return c.json(ok, 200);
      } catch (err) {
        const fallback = fallbackProvider(primary);
        if (fallback && isFailoverable(err)) {
          try {
            const ok = await runProviderAttempt(ctx, fallback, true);
            return c.json(ok, 200);
          } catch (err2) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err2 instanceof Error ? err2.message : "fallback failed",
            });
            return c.json(
              {
                error: {
                  type: "upstream_error",
                  message: "all configured providers failed",
                  primary,
                  fallback,
                },
              },
              502,
            );
          }
        }
        const status =
          err instanceof GatewayUpstreamError ? clampClientErrorStatus(err.status) : 500;
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : "provider failed",
        });
        return c.json(
          {
            error: {
              type: "upstream_error",
              message: err instanceof Error ? err.message : "provider failed",
              provider: primary,
            },
          },
          status,
        );
      } finally {
        span.end();
      }
    });
  });

  return app;
}

/** Default-wired app for mounting on the main Hono tree. */
export const aiGatewayApp = createAiGatewayApp();

// ── Test-only re-exports ────────────────────────────────────────────

export const __test__ = {
  buildCacheKey,
  parseTtlHeader,
  GatewayCache,
};
