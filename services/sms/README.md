# @back-to-the-future/sms

Crontech SMS — carrier-agnostic SMS dispatch with native A2P 10DLC compliance,
MMS support, sub-second carrier handoff, and a fraud-scoring extension hook.
Designed to annihilate Twilio at its own game while staying interoperable with
Twilio, MessageBird, and Bandwidth as upstream carriers when needed.

## Architecture

```
   ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
   │  REST API    │────▶│  Dispatch      │────▶│  Carrier     │
   │  (Bun/Fetch) │     │  Pipeline      │     │  Adapter     │
   └──────┬───────┘     └────────┬───────┘     └──────────────┘
          │                      │                     │
          ▼                      ▼                     │
   ┌──────────────┐     ┌────────────────┐             │
   │  Bearer auth │     │ Number+A2P     │             │
   │  (SMS_TOKEN) │     │ enforcement    │             │
   └──────────────┘     └────────────────┘             │
                                                       ▼
                                          ┌────────────────────┐
   ┌──────────────┐                       │  Inbound webhook   │
   │ Suppression  │◀──────────────────────│  HMAC-validated    │
   │ (STOP auto)  │                       │  → forward         │
   └──────────────┘                       └────────────────────┘
```

Every outbound SMS flows through one gate (`DispatchPipeline`) so each guard —
registration, A2P 10DLC, suppression, per-number rate-limit, carrier dispatch —
is enforced exactly once.

## REST API

All endpoints are JSON. Authentication is `Authorization: Bearer $SMS_TOKEN`
on outbound endpoints. The inbound webhook is authenticated by carrier HMAC
signature, not bearer.

### `POST /v1/messages`

Send an SMS or MMS.

```json
{
  "from": "+15551234567",
  "to": "+15555550000",
  "body": "Hello from Crontech",
  "mediaUrls": ["https://cdn.example.com/img.png"],
  "tenantId": "tenant-acme",
  "statusWebhook": "https://acme.example.com/sms-status"
}
```

Returns `202 Accepted` with `{ messageId, status: "queued" }`. The pipeline
synchronously transitions the record to `sending` once the carrier has
accepted the handoff.

Status codes:

| Code | Meaning |
|------|---------|
| 202  | Queued |
| 400  | Validation / capability / A2P / empty body |
| 401  | Missing bearer |
| 403  | Bad bearer or tenant mismatch |
| 409  | Recipient is suppressed |
| 429  | Per-number rate-limit |
| 502  | Carrier rejected the send |

### `GET /v1/messages/:id`

Returns the current `MessageRecord` including the full `events` array of
delivery transitions:

```
queued → sending → sent → delivered | undelivered | failed
```

### `POST /v1/inbound?carrier=<name>`

Carrier webhook endpoint. The carrier adapter validates the signature
(`X-Crontech-SMS-Signature` or carrier-native header) before parsing.
Inbound bodies matching `STOP` / `UNSUBSCRIBE` / `CANCEL` / `END` /
`QUIT` / `OPTOUT` / `STOPALL` / `REVOKE` automatically suppress the
sender for that tenant. The handler then forwards the inbound message
to the customer's configured webhook for the destination number.

## Carrier model

`Carrier` (in `src/types.ts`) is the pluggable interface:

```ts
interface Carrier {
  readonly name: string;
  send(input: CarrierSendInput): Promise<CarrierSendResult>;
  verifyInboundSignature(rawBody: string, signature: string): boolean;
  parseInbound(rawBody: string): InboundMessage;
}
```

v1 ships with `MockCarrier` (deterministic, in-memory) plus thin
subclasses `TwilioCarrier`, `MessageBirdCarrier`, `BandwidthCarrier` that
satisfy the same contract using mock semantics so the entire pipeline is
exercised end-to-end without network calls.

### v2 production integration plan

| Carrier | Outbound API | Inbound signature scheme |
|---------|--------------|--------------------------|
| Twilio | `POST https://api.twilio.com/2010-04-01/Accounts/{Sid}/Messages.json` | `X-Twilio-Signature` HMAC-SHA1 over the URL + sorted form params |
| MessageBird | `POST https://rest.messagebird.com/messages` (Bearer access key) | `MessageBird-Signature-jwt` JWT body signing |
| Bandwidth | `POST https://messaging.bandwidth.com/api/v2/users/{accountId}/messages` | `X-Callback-Signature` HMAC-SHA256 of raw body |

Each v2 adapter overrides `send()` with a real `fetch` and overrides
`verifyInboundSignature()` / `parseInbound()` with the carrier-specific
parsing. The pipeline contract never changes.

## A2P 10DLC compliance

US carriers silently filter long-code SMS that is not sent through a
registered brand + campaign pair. We model the same gate at the platform
level so non-compliant sends fail fast with a clear error rather than
silently disappearing.

### Flow

1. **Register a brand** via `A2pRegistry.registerBrand({ brandId, tenantId, legalName, ein, vertical })`.
   EIN is required.
2. **Approve a campaign** under that brand via `A2pRegistry.approveCampaign({ campaignId, brandId, tenantId, useCase, sampleMessages })`.
   At least one sample message is required.
3. **Link the campaign to the long-code number** via
   `NumberRegistry.attachA2p(numberId, brandId, campaignId)`. Only
   `long-code` numbers can be linked — short codes and toll-free
   bypass A2P 10DLC and use carrier-level approval flows.
4. **Sends are validated** in `DispatchPipeline.send()`. Long-code
   messages without a linked campaign return an `a2p_violation` error
   and are never handed to the carrier.

## Per-number rate limits

Carriers enforce strict per-second caps on long-code SMS. We pre-throttle
in-process so we never spend carrier budget on guaranteed rejections.

| Number type | Default cap |
|-------------|-------------|
| `long-code` | 1 msg/sec |
| `toll-free` | 3 msg/sec |
| `short-code` | 30 msg/sec |

The limiter is a sliding 1-second window per E.164. Tests inject a fake
clock for deterministic behaviour.

## Suppression list

Per-tenant, per-recipient. `SuppressionList.add(tenantId, e164, reason)`
flags a number; subsequent sends to that number for that tenant are
rejected with `suppressed_recipient`. STOP keywords on inbound traffic
auto-suppress.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMS_TOKEN` | Yes | — | Bearer token for outbound REST endpoints |
| `SMS_REST_PORT` | No | `8790` | TCP port for the REST listener |
| `SMS_HOSTNAME` | No | `crontech-sms` | Service hostname used in logs |
| `SMS_TWILIO_INBOUND_SECRET` | No (dev) | `twilio-dev-secret` | HMAC secret for inbound Twilio webhooks |
| `SMS_MESSAGEBIRD_INBOUND_SECRET` | No (dev) | `messagebird-dev-secret` | HMAC secret for inbound MessageBird webhooks |
| `SMS_BANDWIDTH_INBOUND_SECRET` | No (dev) | `bandwidth-dev-secret` | HMAC secret for inbound Bandwidth webhooks |

## Run

```bash
SMS_TOKEN=dev-token bun run start
```

## Test

```bash
bun test                # unit + integration suite
bunx tsc --noEmit       # type-check
bunx biome check .      # lint + format
```

## AI fraud-scoring hook

Future v2: `DispatchPipeline.send()` invokes an optional async
`scoreFraud(req): Promise<{ score: number; reasons: string[] }>` callback
before carrier handoff. Scores above the configured threshold short-circuit
to `failed` with reason `fraud_blocked`. The hook surface is reserved in
`DispatchPipelineDeps` and will land in BLK-031.5.
