# `@back-to-the-future/email-receive`

Crontech inbound email — MX-side SMTP server, MIME parser, and customer
webhook router. Sub-second happy-path delivery; 24-hour retry with
exponential backoff and dead-letter on exhaustion.

This service is one quadrant of Crontech's email annihilation suite:

- `services/email-send` — outbound SMTP
- `services/email-receive` — **inbound MX (this package)**
- `services/email-domain` — SPF/DKIM/DMARC verification
- `services/email-intelligence` — AI deliverability + spam intel

---

## Pipeline

```
SMTP RCPT → DATA → parse RFC 5322 → SPF check → DKIM verify
         → tenant resolve → route match → spam pre-filter
         → POST customer webhook (HMAC-signed) → log event
         → on 5xx: exp backoff retry up to 24h → dead-letter
```

Every stage is independently testable. The SMTP server, parser, route
matcher, webhook deliverer, event log, and spam pre-filter all run as
pure modules — no globals, no hidden state. Tests inject fakes for
`fetch`, `sleep`, and `now` so the entire pipeline can be exercised in
under 100ms.

## MX setup

Point your domain's MX record at the host running this service:

```dns
crontech.dev.    IN MX 10 mx.crontech.dev.
```

Then run the listener (defaults to port 2525 in dev — bind 25 in prod
behind a privileged-port shim or via Docker `--cap-add=NET_BIND_SERVICE`):

```bash
EMAIL_RECEIVE_SMTP_PORT=25 EMAIL_RECEIVE_HOSTNAME=mx.crontech.dev \
  bun run start
```

The listener supports `EHLO`, `HELO`, `MAIL FROM`, `RCPT TO`, `DATA`,
`RSET`, `NOOP`, `QUIT`, `HELP`, advertises `SIZE`, `8BITMIME`,
`PIPELINING`, and `STARTTLS` (TLS upgrade hookable; native TLS to be
added once the Bun TLS-upgrade API stabilises).

## Inbound route schema

Routes map a recipient pattern to a customer webhook. Patterns:

| Pattern | Matches |
|---|---|
| `support@acme.crontech.dev` | exact recipient |
| `*@acme.crontech.dev` | any local-part on this domain |
| `support@*.crontech.dev` | `support` on any subdomain |
| `*` | catch-all (lowest precedence) |

Specificity: exact > local-wildcard > domain-wildcard > catch-all.

### REST API

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/inbound/routes` | Create a route. Body: `{ pattern, webhookUrl, hmacSecret, enabled? }` |
| `GET` | `/v1/inbound/routes` | List routes for the authenticated tenant |
| `GET` | `/v1/inbound/routes/:id` | Fetch a specific route |
| `PATCH` | `/v1/inbound/routes/:id` | Update fields |
| `DELETE` | `/v1/inbound/routes/:id` | Remove |
| `GET` | `/v1/inbound/events?limit=100` | Recent inbound events for the tenant |

The host (apps/api) is responsible for authentication. This package
exposes `createRestApi({ registry, events, authenticate })` and the host
wires in its tenant-resolution logic.

## Webhook payload

Each accepted message produces one POST to the matched route's
`webhookUrl`:

```json
{
  "type": "inbound.email.received",
  "tenantId": "acme",
  "routeId": "inroute_…",
  "receivedAt": "2026-04-28T10:23:00.000Z",
  "envelope": {
    "mailFrom": "sender@example.com",
    "rcptTo": ["support@acme.crontech.dev"],
    "remoteAddress": "203.0.113.7",
    "tls": false
  },
  "authentication": { "spf": "pass", "dkim": "pass" },
  "message": {
    "messageId": "<…>",
    "from": { "address": "sender@example.com", "name": "Alice" },
    "to": [{ "address": "support@acme.crontech.dev" }],
    "cc": [],
    "subject": "Help with my order",
    "date": "2026-04-28T10:22:55.000Z",
    "references": [],
    "textBody": "…",
    "htmlBody": "…"
  },
  "attachments": [
    { "filename": "invoice.pdf", "contentType": "application/pdf",
      "disposition": "attachment", "size": 12345, "contentBase64": "…" }
  ]
}
```

### Signature verification

Every request carries:

- `X-Crontech-Timestamp` — unix seconds
- `X-Crontech-Signature` — HMAC-SHA256(secret, `${timestamp}.${rawBody}`)

Customers verify by recomputing the HMAC and comparing in constant time.
This package exports `verifySignature(secret, timestamp, body, provided)`
for use in customer SDKs.

### Retry policy

| Attempt | Backoff |
|---|---|
| 1 → 2 | ~1 s |
| 2 → 3 | ~2 s |
| … | doubling, jitter ±20% |
| max | 30 min between attempts |
| total | 24 h |
| max attempts | 12 |

`4xx` responses (other than `429`) are non-retryable and dead-letter
immediately. `5xx` and network errors retry until the budget is exhausted.

## Environment variables

| Var | Default | Description |
|---|---|---|
| `EMAIL_RECEIVE_SMTP_PORT` | `2525` | SMTP listen port |
| `EMAIL_RECEIVE_HOSTNAME` | `mx.crontech.dev` | Hostname for SMTP greeting |

## Roadmap

- [ ] Native TLS via Bun's TLS upgrade once the API stabilises
- [ ] Drizzle-backed `InboundRouteRegistry` and `InboundEventStore`
- [ ] AI attachment classifier hook (`classifyAttachments`) wired to
      `services/email-intelligence` for malware / invoice / contract
      detection in v2
- [ ] Per-tenant rate limiting at the SMTP layer
- [ ] Bayesian spam classifier ladder backed by tenant-private corpora

## Scripts

```bash
bun run start    # production listener
bun run dev      # hot-reload listener
bun run test     # bun test
bun run check    # tsc --noEmit
bun run lint     # biome check
```
