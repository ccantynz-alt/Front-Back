# @back-to-the-future/email-domain

Per-tenant SPF / DKIM / DMARC management for the Crontech mail stack. Sister
service to `services/email-send` (outbound) and `services/email-receive`
(inbound). This service owns:

- **Domain registry** — every customer-owned sender domain, its DNS records,
  its current DKIM key, and a grace-window of retired DKIM keys.
- **DKIM key custody** — 2048-bit RSA keypairs generated server-side,
  stored encrypted at rest. The private key never leaves this service.
- **DKIM signing** — outbound senders POST `/sign` with headers + body and
  receive a fully-formed `DKIM-Signature:` line.
- **SPF / DKIM / DMARC verification** — for `services/email-receive/` to
  authenticate inbound messages.
- **DMARC aggregate reports** — ingest the `rua=` mailbox feed, parse the
  RFC 7489 XML (raw or gzipped), and store per-tenant statistics.

---

## Domain lifecycle

```
   POST /domains          ──▶  status = pending     (DNS records returned)
   POST /domains/:id/verify ─▶  reads DNS, transitions to verified or failed
   POST /domains/:id/rotate-dkim ─▶ new key, status = pending
```

A new domain returns three DNS TXT records the tenant must publish:

| Record | Host | Purpose |
|---|---|---|
| `v=spf1 mx include:_spf.crontech.email ~all` | `<domain>` | SPF |
| `v=DKIM1; k=rsa; p=<base64 DER>` | `<selector>._domainkey.<domain>` | DKIM |
| `v=DMARC1; p=quarantine; adkim=r; aspf=r;` | `_dmarc.<domain>` | DMARC |

`POST /domains/:id/verify` queries DNS via the configured resolver. If all
three records are published with the expected values, the domain transitions
to `verified` and is eligible for outbound signing.

## Signing API

```
POST /sign
{
  "tenantId": "t_xxx",
  "domainId": "d_xxx",
  "headers": { "From": "...", "To": "...", "Subject": "...", "Date": "..." },
  "body":    "<message body>",
  "signedHeaders": ["from", "to", "subject", "date"]   // optional
}
→ 200 { "dkimSignature": "DKIM-Signature: v=1; a=rsa-sha256; ..." }
```

Signature uses **relaxed/relaxed** canonicalisation and **rsa-sha256**.
Default signed headers are `from:to:subject:date`. The signing key is the
domain's currently active DKIM key — to rotate, call
`POST /domains/:id/rotate-dkim`.

The endpoint enforces tenant ownership: a `tenantId` mismatch on the request
returns `403`. The encrypted blob's AAD is `${tenantId}:${domainId}`, so a
cross-tenant decryption attempt also fails at the GCM layer even if the row
were leaked.

## Key rotation

`POST /domains/:id/rotate-dkim`:

1. Generates a fresh 2048-bit RSA keypair with a new selector.
2. Marks the previous active key as **retired** with a 30-day purge timestamp.
3. Returns the new DKIM TXT record to publish.
4. Resets the domain to `pending` until verification confirms the new record
   is live.

During the grace window, both the active and retired public keys remain
discoverable via `lookupPublicKey()` — recipients that cached the old key
can still verify in-flight messages signed just before rotation. After the
grace window expires, retired keys are purged on the next rotation.

The default grace is 30 days (`DEFAULT_DKIM_GRACE_MS`). Configure via the
`dkimGraceMs` option to `DomainRegistry`.

## DMARC aggregate report ingestion

```
POST /dmarc-reports?tenantId=<id>
Body: <xml>            # or gzip(<xml>)  — auto-detected by the 0x1f8b magic.
→ 202 { received: true, records: <n> }

GET  /dmarc-reports?tenantId=<id>
→ 200 { reports: [ { orgName, reportId, dateRangeBegin, dateRangeEnd, records: [...] } ] }
```

Report records expose `sourceIp`, `count`, `disposition`, `dkim`, `spf`, and
`headerFrom` — sufficient to drive a "who is sending mail as me?" dashboard.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `EMAIL_DOMAIN_MASTER_KEK` | YES | 32-byte AES-256 key, base64. Generate with `openssl rand -base64 32`. |
| `PORT` | NO | Listen port. Defaults to `8081`. |

The master KEK protects every per-domain DKIM private key. Rotate it by
re-encrypting all stored ciphertexts; this service does not yet ship a CLI
for that — see Wave 8 for online KEK rotation tooling.

## Programmatic API

```ts
import {
  DomainRegistry,
  SystemDnsResolver,
  loadMasterKek,
  verifyMessage,
} from "@back-to-the-future/email-domain";

const registry = new DomainRegistry({
  kek: loadMasterKek(),
  resolver: new SystemDnsResolver(),
});

await registry.addDomain({ tenantId: "t1", domain: "acme.com" });
```

Tests use `StaticDnsResolver` to inject fixtures.

## Architecture notes

- **AES-256-GCM** with a 12-byte random nonce per record. AAD =
  `${tenantId}:${domainId}` enforces tenant binding even at the cipher
  layer.
- **DKIM canonicalisation** is hand-rolled per RFC 6376 §3.4. Body hash uses
  SHA-256.
- **SPF** evaluator handles `a`, `mx`, `ip4`, `ip6`, `include`, `redirect`,
  `all`. Lookup limit per RFC 7208 §4.6.4.
- **DMARC** alignment: `aspf` / `adkim` strict + relaxed. Organisational
  domain is currently approximated as the last two labels — a future
  upgrade will pull the Public Suffix List for ICANN-perfect alignment.
- **DMARC reports** are parsed without a heavyweight XML dependency so this
  module remains edge-deployable.
