# Crontech AI Gateway (BLK-021)

Production-deployable LLM proxy. The control plane that fronts every
upstream provider, hides keys behind per-customer tokens, slashes cost
with two-layer caching, and turns any flaky provider 5xx into a
silent fallback to the next vendor in the chain.

This is what Cloudflare AI Gateway, OpenRouter, and Vercel AI's
middleware would look like if they had a year of head-start and were
designed for the AI-native generation. It is the LLM proxy of record
for Crontech's three-tier compute model — see `CLAUDE.md` §4.1.

---

## Endpoints

| Method | Path                       | Purpose                                            |
|--------|----------------------------|----------------------------------------------------|
| GET    | `/health`                  | Liveness probe. Returns `{ status: "ok", ... }`.   |
| POST   | `/v1/chat/completions`     | OpenAI-compatible chat. Cached, rate-limited, falls back. |
| POST   | `/v1/webgpu/record`        | Records a client-side WebGPU inference for billing. |

---

## Supported providers

| Provider    | Model prefixes                                                              |
|-------------|----------------------------------------------------------------------------|
| `anthropic` | `claude-*`, `anthropic/*`, `claude.*`, `claude/*`                          |
| `openai`    | `gpt-*`, `o1-*`, `o3-*`, `o4-*`, `openai/*`                                |
| `google`    | `gemini-*`, `google/*`, `gemini/*`                                         |
| `groq`      | `groq/*`, `llama3-groq*`, `llama-3.1-*`, `llama-3.3-*`, `mixtral-*`        |
| `mistral`   | `mistral/*`, `mistral-*`, `open-mistral*`, `open-mixtral*`, `codestral-*`  |
| `webgpu`    | `webgpu/*`, `local/*`  *(virtual — passthrough billing for client-side)*   |

Unknown model identifiers route to `anthropic` by default (Claude is
the platform's primary model per `CLAUDE.md` §3).

### Adding a new provider

1. Create `src/providers/<name>.ts` exporting a `call<Name>` adapter that
   matches the `(req, opts) => Promise<ProviderInvocationResult>`
   contract (see `src/providers/anthropic.ts` for the reference shape).
2. Add the literal name to `PROVIDER_NAMES` in `src/types.ts` so the
   usage ledger summary, span attributes, and Zod schemas pick it up.
3. Add a `case` to the `dispatch` switch in `src/dispatch.ts`.
4. Add prefix rules to `PROVIDER_PREFIX_RULES` in `src/router.ts`.
5. Add an `<NAME>_API_KEY` slot to `GatewayDeps.env` and to the bootstrap
   block at the bottom of `src/index.ts`.
6. Write a routing test in `test/routing.test.ts` and a happy-path test
   in `test/byok-and-managed.test.ts`. **No real API calls in tests.**

That's the entire onboarding cost. The handler, cache, rate limiter,
fallback walker, and span emitter all work transparently.

---

## Auth model

There are **two** authentication surfaces. They share the same `Bearer`
header — the gateway picks the right path based on which token wins.

### Control-plane: `AI_GATEWAY_SECRET`

Used by Crontech-internal callers (orchestrator, admin tooling, health
checks). When the bearer token equals `AI_GATEWAY_SECRET`, the gateway:

- Skips the per-key rate limiter.
- Treats the request as `mode: managed` for env-key resolution.
- Spans are emitted without a `customerId`.

This is the systemd-injected secret on the Vultr deployment box —
see `HANDOFF.md` §4.

### Data-plane: per-customer API keys

Customers present a token they got from the orchestrator (or the
sign-up flow). The gateway looks the token up in its `ApiKeyStore`
and uses the matching `GatewayApiKey` record for:

- Customer ID attribution (usage ledger + telemetry).
- Per-key token-bucket rate limit (`burst` + `rps`).
- BYOK provider key resolution.
- Custom fallback chain (`fallbackChain`).

The `InMemoryApiKeyStore` is used for tests and single-node dev. In
production the orchestrator writes records to Turso, and we drop a
`TursoApiKeyStore` adapter behind the same interface.

---

## BYOK vs Managed

Every customer chooses one of two billing models:

### `mode: "managed"`

Crontech's pooled provider keys serve the request. We bill the
customer at our markup. **This is the default.**

```ts
{
  token: "ck_live_...",
  customerId: "cust_acme",
  mode: "managed",
}
```

### `mode: "byok"` (Bring Your Own Key)

The customer's own provider keys serve the request. Crontech only
charges for the gateway service (cache hits, fallback, observability).

```ts
{
  token: "ck_live_...",
  customerId: "cust_acme",
  mode: "byok",
  providerKeys: {
    anthropic: "sk-ant-...",
    openai:    "sk-...",
  },
  managedFallback: false, // true → fall through to pooled keys when a customer key is missing
}
```

When a BYOK request hits a provider for which the customer has no
key AND `managedFallback === false`, the gateway returns `503` rather
than silently using a pooled key. This is intentional — the customer
explicitly opted out of managed billing, and we honour that even at
the cost of an extra 5xx on misconfiguration.

The response includes `x-key-source: byok` or `x-key-source: managed`
so callers can audit which path served them.

---

## Caching

Two layers, consulted in order. Both are in-process — production
deployments swap the `LruCache` for a Redis adapter behind the same
`get/set/has` interface.

### Layer 1: exact-match LRU

Keyed on `sha256(model || JSON.stringify(messages))`. Hit returns
immediately with `x-cache: HIT`. 1000 entry capacity by default.

### Layer 2: semantic similarity

Embeds the prompt with the local `HashedBagOfWordsEmbedder` (no API
call, no GPU required) and looks for the closest stored entry by
cosine similarity. If similarity ≥ threshold (default `0.92`), the
cached response is returned with `x-cache: SEMANTIC` and
`x-cache-similarity: <score>`.

In production the embedder is hot-swapped for Transformers.js
`all-MiniLM-L6-v2` (384-dim, also runs in-process or on WebGPU) — the
`Embedder` interface in `src/embeddings.ts` makes the swap a one-liner.

The semantic cache is consulted **only when** `temperature` is unset
or `> 0` — deterministic prompts (`temperature: 0`) bypass it because
exact-match coverage is good enough.

---

## Rate limiting

Token-bucket per API key. `consume()` is a single in-memory map
operation; production deployments back it with the
`@back-to-the-future/queue` Durable Object adapter for cross-edge
consistency, but the API surface is identical.

Limits are pulled from the customer's `GatewayApiKey` record:

```ts
{
  burst: 60,   // max bucket capacity (allows short bursts)
  rps:   10,   // refill rate, tokens per second
}
```

When the bucket is empty the gateway returns `429` with
`retry-after: <seconds>` and `x-ratelimit-remaining: 0`.

---

## Fallback chain

Every API key can configure an explicit ordered list of providers to
try after the primary fails. Default: opposite-vendor single hop
(anthropic ↔ openai), preserving v0 behaviour for unmigrated keys.

```ts
{
  fallbackChain: ["openai", "groq", "mistral"],
}
```

The walker:

- Attempts each provider in order.
- 5xx or network/timeout (`status === 0`) → next entry.
- 4xx → surfaced directly. Never retried.
- Successful response is cached + returned with `x-failover: <provider>`
  if the served provider was not the primary.

---

## Streaming

Set `stream: true` on the request body to get an OpenAI-shaped
`text/event-stream` back. The gateway never buffers — bytes from the
upstream stream go straight to the caller for OpenAI / Groq / Mistral.

For Anthropic and Google, where the wire format differs, the gateway
issues a non-streaming upstream call and re-frames the response as a
single SSE chunk + `data: [DONE]\n\n`. The caller's OpenAI SDK with
`stream: true` Just Works regardless.

Streaming bypasses the fallback chain by design — you can't fail over
mid-stream without buffering, and buffering defeats the purpose.

---

## WebGPU passthrough

`POST /v1/webgpu/record` lets the client report a WebGPU/WebLLM
inference it ran locally on the user's GPU. The gateway stores the
record on the usage ledger so the customer can be billed for the
service even though the platform paid $0 for the inference itself.

This is the cost-flywheel from `CLAUDE.md` §3 — the moat that
Cloudflare and Vercel can't replicate because they don't ship a
client-side runtime.

```jsonc
POST /v1/webgpu/record
Authorization: Bearer ck_live_...
Content-Type: application/json

{
  "model": "webgpu/llama-3.2-1b",
  "messages": [{"role": "user", "content": "..."}],
  "output": "...",
  "inputTokens": 12,
  "outputTokens": 47,
  "latencyMs": 18.4,
  "device": "Apple M3 Max"
}
```

The response is a synthesised OpenAI-shaped `chat.completion` so the
client never has to special-case WebGPU vs remote.

---

## Observability

Every request emits one `GatewaySpan` to the configured `SpanSink`.
Span shape:

```ts
{
  name: "ai-gateway.chat.completions",
  startMs: 1700000000000,
  durationMs: 187,
  status: "ok",
  attributes: {
    customerId: "cust_acme",
    keyMode: "managed",
    provider: "anthropic",
    model: "claude-3-5-sonnet-latest",
    cacheHit: "miss",      // "exact" | "semantic" | "miss"
    fallbackUsed: false,
    promptTokens: 142,
    completionTokens: 88,
    httpStatus: 200,
  }
}
```

The `NoopSpanSink` is the default — production wires the
`InMemorySpanSink` to the OTel collector running in the edge worker
layer (`CLAUDE.md` §3 Observability).

---

## Environment variables

| Variable                | Purpose                                         |
|-------------------------|-------------------------------------------------|
| `AI_GATEWAY_PORT`       | Listening port. Default `9092`.                 |
| `AI_GATEWAY_SECRET`     | Control-plane bearer secret. **Required.**      |
| `AI_GATEWAY_API_KEYS`   | Comma list `token:customerId:mode` for v1 dev.  |
| `ANTHROPIC_API_KEY`     | Pooled key for managed-mode Anthropic calls.    |
| `OPENAI_API_KEY`        | Pooled key for managed-mode OpenAI calls.       |
| `GOOGLE_API_KEY`        | Pooled key for managed-mode Gemini calls.       |
| `GROQ_API_KEY`          | Pooled key for managed-mode Groq calls.         |
| `MISTRAL_API_KEY`       | Pooled key for managed-mode Mistral calls.      |

The systemd unit on the Vultr box is `crontech-ai-gateway` and pulls
`AI_GATEWAY_SECRET` from the host environment per `HANDOFF.md` §4.

---

## Local development

```bash
# Install
bun install

# Run the gateway (port 9092)
AI_GATEWAY_SECRET=dev-secret \
  ANTHROPIC_API_KEY=sk-ant-... \
  bun run dev

# Run tests
bun run test

# Type check
bun run check

# Lint
bunx biome check .
```

---

## Status

**v1 production-deployable.** Streaming, semantic cache, rate
limiting, multi-step fallback, BYOK + managed dual mode, OpenTelemetry
spans. 5 upstream providers + WebGPU passthrough. Stack-ready for the
Vultr systemd deployment. v2 lifts persistence to Turso (key store +
ledger) and swaps the embedder for Transformers.js MiniLM.
