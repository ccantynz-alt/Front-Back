# `@back-to-the-future/comms-intelligence`

> The 110% moat over Twilio. Comms intelligence is the AI-native layer
> sitting on top of `services/sms`, `services/voice`, and
> `services/verify`. Twilio's voice AI is bolted on; ours is **native**.

---

## Why this service exists

`services/sms`, `services/voice`, and `services/verify` (Wave 8 agents 1-3)
provide the raw plumbing: outbound SMS, programmable voice, OTP delivery.
Comms-intelligence is the brain that wraps them.

Four moat-extending modules ship in v1:

1. **AI voice agent** — bidirectional audio over WebSocket.
   Sub-300ms turn-taking target, conversation memory, RAG.
2. **Fraud scorer** — heuristic + LLM hybrid. Every Verify attempt scored.
3. **Conversational memory** — per-`conversationId` rolling window plus
   pluggable RAG over a per-tenant knowledge base.
4. **Sentiment + intent classifier** — heuristic-first with LLM fall-through.

---

## HTTP API

All endpoints (except `/health`) require `Authorization: Bearer
$COMMS_INTELLIGENCE_TOKEN`.

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET`  | `/health` | – | `{ status, service, version, modules[] }` |
| `POST` | `/score-fraud` | `FraudInput` | `{ score, signals[], decision, reasoning }` |
| `POST` | `/classify` | `{ text }` | `{ sentiment, intent, confidence, source }` |
| `POST` | `/memory/:conversationId/append` | `{ role, content, metadata? }` | `{ ok, message }` |
| `GET`  | `/memory/:conversationId/recent?limit=` | – | `{ ok, messages[] }` |
| `POST` | `/memory/:conversationId/rag` | `{ query, topK? }` | `{ ok, matches[], conversationId, query }` |

`x-tenant-id` header may be sent on `/memory/.../rag` to scope the
vector search to a specific tenant.

### Fraud-scorer input

```ts
interface FraudInput {
  identifier: string;            // phone number, email, etc.
  channel: "sms" | "voice" | "email" | "whatsapp";
  ipAddress?: string;
  userAgent?: string;
  countryCode?: string;          // ISO-3166-1 alpha-2
  recentAttempts?: Array<{
    at: string;                  // ISO timestamp
    outcome: "success" | "failure" | "expired" | "blocked";
    ipAddress?: string;
  }>;
}
```

### Fraud signals

`VELOCITY_HIGH`, `VELOCITY_EXTREME`, `REPEATED_FAILURE`,
`DISPOSABLE_NUMBER_RANGE`, `KNOWN_BAD_IP`, `BURNER_USER_AGENT`,
`GEO_ANOMALY`, `PREMIUM_RATE_PREFIX`, `MISSING_METADATA`, `LLM_FLAGGED`.

### Decision thresholds

| Score | Decision |
|-------|----------|
| `>= 70` | `block` |
| `35–69` | `challenge` |
| `< 35`  | `allow` |

---

## WebSocket: `/voice-agent`

Bidirectional audio stream. The transport (typically `services/voice`) opens
a WS connection, then the protocol is JSON-encoded:

### Inbound (caller → comms-intelligence)

```ts
type VoiceAgentInbound =
  | { type: "start"; conversationId: string; sampleRate?: number }
  | { type: "audio"; chunk: string /* base64 PCM */ }
  | { type: "end-of-turn" }
  | { type: "stop" };
```

### Outbound (comms-intelligence → caller)

```ts
type VoiceAgentOutbound =
  | { type: "ready"; conversationId: string }
  | { type: "transcript-partial"; text: string }
  | { type: "transcript-final"; text: string }
  | { type: "agent-thinking" }
  | { type: "agent-text"; text: string }
  | { type: "agent-audio"; chunk: string /* base64 PCM */ }
  | { type: "turn-complete"; turnLatencyMs: number }
  | { type: "error"; message: string };
```

A turn = audio frames buffered → `end-of-turn` → STT → LLM → TTS → reply.
The session reports `turnLatencyMs` so callers can monitor the sub-300ms
target end-to-end.

---

## Pluggable backends

All four backends are interface-typed so the service can be unit-tested
without external infra and swapped to any provider in production:

| Interface | Default impl | Test impl |
|-----------|--------------|-----------|
| `LlmClient` | `HttpAiGatewayClient` (calls `services/ai-gateway`) | `StubLlmClient` |
| `VectorSearch` | (Qdrant client — caller-injected) | `StubVectorSearch` |
| `SttClient` | (caller-injected — Deepgram-class) | `StubSttClient` |
| `TtsClient` | (caller-injected — ElevenLabs-class) | `StubTtsClient` |

The default `Bun.serve` bootstrap wires up `HttpAiGatewayClient` only;
SST/TTS/vector clients must be supplied by the embedding application.

---

## Environment variables

| Var | Required | Purpose |
|-----|----------|---------|
| `COMMS_INTELLIGENCE_TOKEN` | yes | Bearer token for all non-`/health` endpoints |
| `COMMS_INTELLIGENCE_PORT` | no (default `9095`) | HTTP/WS bind port |
| `AI_GATEWAY_URL` | for LLM features | Base URL of `services/ai-gateway` |
| `AI_GATEWAY_TOKEN` | for LLM features | Bearer token for ai-gateway |

---

## Scripts

```bash
bun run start    # production server
bun run dev      # hot-reload dev
bun run test     # bun test (71 tests)
bun run check    # tsc --noEmit
bun run lint     # biome check .
```
