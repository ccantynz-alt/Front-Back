# @back-to-the-future/email-send

**BLK-030 — Crontech transactional email outbound service.**

Wave 7, Agent 1 of 4. Two ingress paths (REST + SMTP relay), per-tenant
priority queue, exponential-backoff retries, hard-bounce/complaint
suppression, HMAC-signed webhook delivery, DKIM signing via the
`email-domain` service. Designed to **annihilate Mailgun on cold-start
latency**: zero framework dependency in the hot path, native `Bun.serve`
request handler, in-process queue with v2 Turso persistence on the
roadmap.

---

## REST API

All endpoints (except `/health`) require `Authorization: Bearer $EMAIL_SEND_TOKEN`.

### `POST /v1/messages`

Body:

```jsonc
{
  "from": "sender@your-verified-domain.com",
  "to": ["recipient@example.com"],
  "cc": ["cc@example.com"],
  "bcc": ["bcc@example.com"],
  "subject": "Hello",
  "html": "<p>Hi</p>",
  "text": "Hi",
  "attachments": [
    { "filename": "a.txt", "contentBase64": "aGVsbG8=", "contentType": "text/plain" }
  ],
  "headers": { "X-Custom": "value" },
  "tags": ["welcome"],
  "scheduledAt": "2026-05-01T12:00:00.000Z",
  "priority": "high",                  // "low" | "normal" | "high"
  "tenantId": "tenant-a"
}
```

Responses:

| Status | Meaning |
|---|---|
| `202 Accepted` | Message queued (or `scheduled` if `scheduledAt` is in the future). |
| `403 Forbidden` | FROM domain not verified for this tenant by the `email-domain` service. |
| `422 Unprocessable Entity` | Zod validation failure (`issues[]` returned). |
| `400 Bad Request` | Invalid JSON. |
| `401 Unauthorized` | Missing or wrong bearer token. |

### `GET /v1/messages/:id`

Returns the message status, attempts, recipient list, and timestamps.

### `GET /v1/messages/:id/events`

Returns the full event log for a message:
`queued`, `sending`, `sent`, `delivered`, `bounced`, `complained`, `dropped`,
`opened`, `clicked`, `suppressed`.

### `GET /health`

Unauthenticated liveness check.

---

## SMTP Relay

Crontech accepts mail on:

- **Port 587** with `STARTTLS` (mandatory).
- **Port 465** with implicit TLS (`SMTPS`).

Authentication:

- `AUTH PLAIN` — single-step base64-encoded `\0username\0password`.
- `AUTH LOGIN` — multi-step prompted base64.

The session enforces:

1. `AUTH` must precede `MAIL FROM`.
2. `MAIL FROM` domain must belong to a tenant-verified domain (queried
   from `email-domain` at queue time).
3. Messages are queued with the same priority/retry semantics as REST.

`SmtpSession` is transport-agnostic. Production deploys wire it to a
TLS-terminated socket; tests drive it directly.

---

## Webhook Events

Customers configure a webhook URL + HMAC secret per tenant. Crontech
POSTs each subscribed event with:

```
POST <customer-url>
content-type: application/json
x-crontech-signature: sha256=<hmac-sha256-hex>
x-crontech-event: <event-type>

{ "tenantId": "...", "event": { "id": "...", "type": "delivered", ... } }
```

Verify the signature server-side with:
`hmac_sha256(customer_secret, raw_body)` — the digest is hex-encoded.

---

## Suppression List

Per tenant. Any address that:

- Hard-bounces (`5xx` SMTP response or no MX record)
- Complains (spam-marked)

…is added automatically. Future `POST /v1/messages` calls drop those
recipients at the gate (status `suppressed` if all recipients filtered).

---

## Send Pipeline

1. Validate FROM domain via `email-domain` service.
2. Filter recipients against suppression list.
3. Persist `StoredMessage` and emit `queued` event.
4. Worker `tick()` pops the highest-priority ready entry.
5. Build RFC-5322 MIME (multipart/alternative + multipart/mixed for attachments).
6. Apply DKIM-Signature header using key from `email-domain`.
7. Resolve recipient MX records.
8. Deliver via `SmtpDeliverer`.
9. Classify SMTP code: 2xx = delivered, 4xx = retry (exponential backoff
   1m → 5m → 30m → 2h → 12h), 5xx = hard-bounce + suppress.
10. Emit events; dispatch webhooks.

---

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `EMAIL_SEND_TOKEN` | yes | — | Bearer token for REST API. |
| `EMAIL_SEND_REST_PORT` | no | `8787` | REST listener port. |
| `EMAIL_SEND_HOSTNAME` | no | `crontech-email` | SMTP banner hostname. |
| `EMAIL_DOMAIN_SERVICE_URL` | no | `http://localhost:8788` | Base URL of `services/email-domain`. |

---

## Roadmap

- **v2:** Persist queue + store in Turso (currently in-memory).
- **v2:** Real RFC-6376 RSA signing in-process (currently stamps verified metadata).
- **v2:** AI-driven send-time optimisation via `services/email-intelligence`.
- **v2:** Native TCP SMTP listener with TLS termination.

## Scripts

```bash
bun run dev      # hot-reload entrypoint
bun run start    # one-shot serve
bun run check    # tsc --noEmit
bun run lint     # biome check .
bun test         # full suite
```
