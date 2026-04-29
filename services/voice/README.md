# @back-to-the-future/voice — Voice / SIP Control Plane

Crontech's carrier-agnostic voice orchestration service. The service is the
**control plane**: it owns the call-flow logic, the call state machine, the
recording lifecycle, and the per-tenant quota. Real SIP/RTP media handling
is delegated to a SIP-trunk provider (Twilio Elastic SIP, Bandwidth,
Telnyx) via the `CarrierClient` interface — every method on that interface
is mocked in tests.

This service is the BLK-032 voice annihilation layer of the comms stack.

---

## Capabilities

- **CrontechML** — TwiML-equivalent declarative call-flow language. JSON
  documents describing what the call should do, walked verb-by-verb by the
  executor.
- **Webhook-driven flow continuation** — customers host an HTTP endpoint
  that returns the next CrontechML doc; we POST current call state and
  they reply with instructions.
- **REST API** — originate calls, query state, hangup, transfer, play,
  inbound webhook entry point.
- **Recording lifecycle** — `record` verb with optional on-the-fly
  transcription; storage URL persisted on the call record.
- **AI agent connection** — `connect_ai_agent` verb opens a bidirectional
  audio stream toward `services/comms-intelligence` for sub-300ms turn
  taking.
- **Per-tenant call quota** — sliding-window counter; default 60 calls /
  60 seconds.
- **Bearer auth** — every endpoint requires `Authorization: Bearer
  $VOICE_TOKEN`.

---

## CrontechML grammar

CrontechML is a JSON document. Top-level shape:

```jsonc
{
  "version": "1",
  "verbs": [ /* 1..50 verbs in order */ ]
}
```

### Verbs

| Verb | Purpose | Notable fields |
|------|---------|----------------|
| `say` | Synthesise speech | `text`, `voice` (`male`\|`female`\|`neural`), `language` |
| `play` | Play an audio asset | `audioUrl`, optional `loop` (1..10) |
| `gather` | Collect DTMF digits | `numDigits`, `timeoutSec`, `finishOnKey`, optional `prompt` |
| `record` | Record the leg | `maxLengthSec`, `playBeep`, `transcribe` |
| `dial` | Bridge to another number | `to`, optional `callerId`, `timeoutSec`, `record` |
| `redirect` | Hand off to another flow URL | `url` |
| `hangup` | Terminate the call | — |
| `pause` | Wait | `seconds` (1..60) |
| `enqueue` | Park into a queue | `queueName`, optional `waitUrl` |
| `connect_ai_agent` | Stream audio to an AI agent | `agentId`, `streamUrl`, `systemPrompt` |

Schemas live in `src/flow/schema.ts` and are enforced by Zod at parse time.

### Webhook continuation

After the executor finishes the verbs in a document, if the call is still
active and `flowUrl` is set on the record, the executor POSTs:

```json
{
  "callId": "call_abc",
  "state": "in-progress",
  "digits": "1234",
  "events": [/* last 10 events */]
}
```

The customer must respond with another CrontechML document. The executor
caps continuation depth to 32 hops as a safety bound.

---

## REST API

All endpoints accept and return JSON. Auth is `Bearer $VOICE_TOKEN`.

### `POST /v1/calls`

Originate an outbound call.

```json
{
  "from": "+15550001111",
  "to": "+15550002222",
  "flowUrl": "https://customer.example/initial-flow",
  "statusWebhook": "https://customer.example/events",
  "tenantId": "tenantA"
}
```

Response: `{ "id": "call_abc", "state": "completed" }`

### `GET /v1/calls/:id`

Returns the full `CallRecord`, including state, recording URL,
transcription text, and recent events.

### `POST /v1/calls/:id/hangup`

Hangs up the leg via the carrier. Idempotent.

### `POST /v1/calls/:id/transfer`

```json
{ "to": "+15558888888" }
```

### `POST /v1/calls/:id/play`

```json
{ "audioUrl": "https://cdn.example/audio.mp3" }
```

### `POST /v1/inbound`

Carrier webhook for inbound calls. The service consults the configured
inbound flow resolver and runs the tenant's CrontechML document.

```json
{
  "carrierCallId": "twilio-CAxxxx",
  "from": "+15559990000",
  "to": "+15550000000"
}
```

---

## Carrier interface contract

`src/carrier/types.ts` defines `CarrierClient`. Implementations must
provide:

- `originateCall({ callId, from, to, answerUrl, timeoutSec? })`
- `hangup(callId)`
- `transfer(callId, to)`
- `playAudio(callId, audioUrl)`
- `gatherDigits(callId, { numDigits?, timeoutSec?, finishOnKey? })`
- `record(callId, { maxLengthSec?, playBeep? })`
- `say(callId, text, { voice?, language? })`

`MockCarrier` (`src/carrier/mock.ts`) is the in-memory implementation used
in tests and dev. It records every call so tests can assert against the
exact carrier-call sequence and exposes `failMode` for resilience tests.

Real carriers (Twilio Elastic SIP, Bandwidth, Telnyx) ship as their own
adapter modules implementing the same interface — none of the call-flow
logic changes.

---

## Call state machine

```
queued → dialing → ringing → answered → in-progress → completed
                  ↘         ↘         ↘
                   failed | busy | no-answer (terminal)
```

Transitions are enforced by `canTransition` in `src/store/store.ts`. The
executor only advances states it is allowed to advance.

---

## AI agent stream

The `connect_ai_agent` verb opens a stream via `AiAgentDispatcher.open`.
The dispatcher resolves to the comms-intelligence service. The contract
(`src/ai-stream/types.ts`):

- 8kHz mono, 16-bit PCM, 20ms frames (320 bytes each).
- `send(frame)` for carrier→agent, async iterator `receive()` for
  agent→carrier.
- Half-duplex barge-in is handled on the agent side.

`MockAiAgentDispatcher` is used in tests; the real implementation lives in
`services/comms-intelligence` (Agent 4).

---

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | HTTP listen port | `8080` |
| `VOICE_TOKEN` | Bearer token for the REST API | `dev-token` |

---

## Quality gates

```bash
cd services/voice
bun test            # Bun test runner
bunx tsc --noEmit   # type check (strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess)
bunx biome check .  # lint + format
```

All three must pass before merge. CI enforces all three.
