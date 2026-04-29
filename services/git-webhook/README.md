# `@back-to-the-future/git-webhook`

**Stage 1 of BLK-009 (git-push deploy pipeline).** Receives GitHub push
webhooks, validates them with constant-time HMAC-SHA256, deduplicates
deliveries, filters by branch / event type, and emits `BuildRequested`
messages for the build-runner.

This service is provider-neutral by design: the same surface accepts
GitHub today and is structured to add GitLab / Gitea / Bitbucket without
rewriting the receiver pipeline. Vercel's git integration is locked to
GitHub + GitLab + Bitbucket and runs through a single tenant; we run
per-tenant from day one.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/webhooks/github/:tenantId` | Receive a signed GitHub webhook |
| `GET`  | `/health` | Liveness probe — returns `{ status, service, version, timestamp }` |

The tenant is identified by the URL path segment so the same receiver
hostname can fan out to thousands of tenants without per-tenant DNS.

## Webhook signature scheme

GitHub computes
`X-Hub-Signature-256 = "sha256=" + hex(HMAC_SHA256(secret, raw_body))`.
We re-compute the same value over the **raw bytes of the request body**
and compare with `crypto.timingSafeEqual`. Any of the following yield
401:

- Missing or empty `X-Hub-Signature-256`
- Header that does not begin with `sha256=` (legacy `sha1=` is refused)
- Length mismatch between supplied and computed signatures
- Mismatching bytes after constant-time compare

## Required GitHub headers

| Header | Purpose |
| --- | --- |
| `X-GitHub-Event` | Event type — only `push` triggers a build, `ping` returns 200 `pong`, everything else returns 202 `ignored` |
| `X-GitHub-Delivery` | Per-attempt UUID — used as the idempotency key |
| `X-Hub-Signature-256` | HMAC signature, see above |

## Optional Crontech headers

| Header | Purpose |
| --- | --- |
| `X-Crontech-Webhook-Time` | ISO-8601 instant the webhook was sent. Falls back to standard `Date` header. Deliveries older than `replayWindowMs` (default 5m) return 408. |
| `X-Crontech-Replay` | When `1`, bypasses the replay window. Operator-initiated re-delivery only. |

## Per-tenant secret model

v1 ships with an in-memory store seeded from the `WEBHOOK_TENANTS_JSON`
env var. The contract is:

```jsonc
[
  {
    "tenantId": "tenant-alpha",
    "repo": "owner/name",
    "secret": "min-8-char-shared-secret",
    "branchEnvironments": { "main": "production", "*": "preview" },
    "defaultEnvironment": "preview"
  }
]
```

Resolution order for a push to branch `B`:

1. Exact match in `branchEnvironments` → use that env.
2. Wildcard `*` entry → use its value (or `defaultEnvironment` when the
   value is the literal `*`).
3. No match → drop the push with 202 `branch_not_routed`.

v2 path: a Turso table `tenant_webhook_secrets(tenant_id, repo,
secret_ciphertext, branch_environments_json, default_environment)` with
secrets envelope-encrypted by the secrets-vault service. The
`TenantConfigStore` interface is the swap point — the receiver code does
not change.

## `BuildRequested` schema (the contract Agent 3 consumes)

```ts
{
  deliveryId: string;        // GitHub delivery UUID — idempotency key
  tenantId:   string;        // Crontech-internal tenant id
  repo:       string;        // "owner/name"
  ref:        string;        // "refs/heads/main"
  sha:        string;        // head commit SHA (hex 7–40)
  branch:     string;        // "main"  (ref minus refs/heads/)
  pusher:     { name: string; email?: string };
  timestamp:  string;        // ISO-8601 UTC instant we received it
  environment: string;       // resolved deploy env
}
```

The schema is exported as `BuildRequestedSchema` from
`@back-to-the-future/git-webhook/schemas` and is the canonical Zod
definition. **Agent 3 (orchestrator) MUST consume this contract via one
of the supplied transports — never by reaching into the HTTP body
shape.**

### Transport options

| Transport | Use case |
| --- | --- |
| `InProcessTransport` | Embedded build-runner in the same Bun process — register a listener with `transport.subscribe(fn)`. Used in tests. |
| `HttpFanoutTransport` | POSTs JSON `BuildRequested` to one or more subscriber URLs, optionally signed with `X-Crontech-Signature: sha256=<hex>` using `OUTBOUND_SIGNING_SECRET`. |

To consume from another service over HTTP, expose a `POST /...`
endpoint, validate the optional `X-Crontech-Signature` header the same
way GitHub signatures are validated, and parse the body with
`BuildRequestedSchema`.

## Idempotency

The `X-GitHub-Delivery` UUID is recorded in an in-memory ring (TTL 1h
v1, Turso row v2). A repeat delivery returns 200 `{ status: "duplicate"
}` without re-publishing. GitHub's retry policy stays well inside this
window.

## Replay protection

Deliveries older than `replayWindowMs` (default 5 minutes) are rejected
with 408. An attacker who steals a single signed delivery cannot replay
it later. Operator-initiated replay sets `X-Crontech-Replay: 1`.

## Environment variables

| Var | Required | Description |
| --- | --- | --- |
| `PORT` | no | Listen port (default 8787) |
| `WEBHOOK_TENANTS_JSON` | yes (prod) | JSON array of `TenantWebhookConfig` |
| `BUILD_SUBSCRIBERS` | no | Comma-separated list of HTTP subscriber URLs for fan-out. Empty = in-process only. |
| `OUTBOUND_SIGNING_SECRET` | no | Shared secret used to sign outbound `BuildRequested` POSTs |

## Tests

```bash
bun test services/git-webhook
```

Coverage includes:

- Health endpoint shape
- Good and bad HMAC signatures (missing, wrong, wrong algorithm, length
  mismatch, known-fixture)
- Branch routing — main → production, staging → preview, unmatched →
  drop, tag refs → drop, branch deletes → drop
- Idempotency — same `X-GitHub-Delivery` twice does not re-publish
- Replay protection — old delivery rejected, recent accepted, replay
  override accepted
- Event filter — `push` enqueues, `ping` returns pong, other events
  ignored
- Header / payload validation — missing GitHub headers 400, unknown
  tenant 404, malformed JSON 400, missing required push fields 400
- BuildRequested schema parses cleanly with all required fields
- Dedup store TTL eviction
