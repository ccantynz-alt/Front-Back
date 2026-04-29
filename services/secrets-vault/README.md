# @back-to-the-future/secrets-vault

Encrypted per-tenant, per-deployment secrets vault for the Crontech
git-push deploy pipeline. Other Crontech services (notably
`deploy-orchestrator`) call this service to inject env vars into
running bundles.

> Crontech's secrets handling is more secure than the public
> alternatives: AES-256-GCM at rest, per-tenant DEKs derived from a
> master KEK via HKDF, AAD-bound ciphertexts that cannot be replayed
> across tenants or keys, and an immutable audit log of every read,
> write, list, delete, and bundle call — with **no plaintext values
> ever logged**.

---

## 1. Encryption Model

| Layer | Algorithm | Notes |
|---|---|---|
| **Master KEK** | 32-byte secret | Loaded from `SECRETS_VAULT_MASTER_KEY` (64 hex chars). Never hardcoded. Never logged. |
| **Per-tenant DEK** | HKDF-SHA-256 | `IKM = KEK`, `salt = "crontech-secrets-vault-v1"`, `info = tenantId`, `L = 32`. Deterministic. Memoised in-process. |
| **Cipher** | AES-256-GCM | Random 12-byte nonce per encryption, 16-byte auth tag. |
| **AAD** | `${tenantId}:${secretKey}` | Binds ciphertext to a specific tenant + key. Cross-tenant or cross-key decryption fails. |
| **Wire format** | `base64(nonce(12) || tag(16) || ct)` | Single string. Self-contained. |

### Why HKDF-derived DEKs?

A single master KEK plus HKDF means we never persist per-tenant keys.
Compromising the running process discloses the KEK; compromising
storage discloses only ciphertexts. The DEK derivation is
deterministic so tests, replicas, and recoveries can all rebuild the
same keys without coordination.

### Why AAD?

Without AAD, an attacker with read access to two tenants' encrypted
blobs could swap ciphertexts and trick the vault into decrypting
tenant A's secret under tenant B's identity. AAD =
`${tenantId}:${secretKey}` cryptographically refuses that swap — the
GCM auth tag fails to verify.

---

## 2. KEK Provisioning

The master KEK is the root of trust. Provision once per environment.

```bash
# Generate a fresh 32-byte key (production)
openssl rand -hex 32

# Set in the vault host environment
export SECRETS_VAULT_MASTER_KEY=<64-hex-char output>
export SECRETS_VAULT_INTERNAL_TOKEN=<long random string>
export SECRETS_VAULT_PORT=9100   # optional; defaults to 9100
```

Rotation: today, rotation requires re-encrypting every blob. The
v1 store does not implement rotation; v2 (Turso-backed) will support
rolling rotation by tagging each ciphertext with the KEK generation
that produced its DEK.

**Storage of the KEK itself** belongs in a sealed secret manager
(AWS KMS, HashiCorp Vault, Cloudflare Secrets, or 1Password Connect)
— never in `.env`, never in git, never in logs. The vault process
loads it from env at boot and holds it only in memory.

---

## 3. HTTP API

All endpoints (except `/health`) require a bearer token in the
`Authorization` header:

```
Authorization: Bearer ${SECRETS_VAULT_INTERNAL_TOKEN}
```

Tokens are compared with constant-time equality. Mismatched or
missing tokens get a 401 and an `AUTH_REJECT` audit entry.

The vault is bound to `127.0.0.1` only. It is **never** reachable
from the public internet — only co-located Crontech services can
call it.

### Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/health` | – | `{ status: "ok", service, timestamp }` |
| `PUT` | `/tenants/:tenantId/secrets/:key` | `{ value: string }` | `{ tenantId, key, createdAt, updatedAt }` |
| `GET` | `/tenants/:tenantId/secrets/:key` | – | `{ tenantId, key, value }` (404 if missing) |
| `GET` | `/tenants/:tenantId/secrets` | – | `{ tenantId, keys: string[] }` (no values) |
| `DELETE` | `/tenants/:tenantId/secrets/:key` | – | `{ tenantId, key, removed: boolean }` |
| `POST` | `/tenants/:tenantId/secrets/bundle` | `{ keys: string[] }` | `{ tenantId, env: { [key]: value } }` |

`tenantId` allows `[A-Za-z0-9_\-:.]{1,128}`.
`key` allows `[A-Za-z0-9_\-.]{1,256}`.
Values are capped at 64 KiB.

### Bundle endpoint contract (integration with deploy-orchestrator)

This is the integration point with Agent 3's `deploy-orchestrator`.
When the orchestrator is about to start a bundle for tenant `t1`
needing env keys `["DATABASE_URL", "API_KEY"]`, it calls:

```http
POST /tenants/t1/secrets/bundle
Authorization: Bearer ${SECRETS_VAULT_INTERNAL_TOKEN}
Content-Type: application/json
X-Crontech-Requester: deploy-orchestrator

{ "keys": ["DATABASE_URL", "API_KEY"] }
```

Response (200):

```json
{
  "tenantId": "t1",
  "env": {
    "DATABASE_URL": "postgres://prod...",
    "API_KEY": "sk-..."
  }
}
```

Behaviour:

- Missing keys are **silently omitted** from `env` — the orchestrator
  decides whether a missing env var is fatal (it usually is, but the
  vault does not assume).
- The full bundle call is one audit entry with `action = "BUNDLE"`.
  Per-key decrypt failures (e.g. tampered ciphertext) generate an
  additional `error` entry and abort the call with 500.
- The orchestrator should call this endpoint **once per deploy**,
  cache the response in process memory only, and pass the env into
  the bundle process via standard `Bun.spawn({ env })`. The vault
  response must never be logged or persisted by the caller.

`X-Crontech-Requester` is recorded in the audit log so we know which
internal caller fetched a given bundle.

---

## 4. Audit Log Schema

Every call writes one JSON line to stdout. Sample:

```json
{"component":"secrets-vault","tenantId":"t1","key":"DATABASE_URL","action":"BUNDLE","requesterId":"deploy-orchestrator","timestamp":"2026-04-28T03:56:54.786Z","result":"ok"}
```

| Field | Type | Notes |
|---|---|---|
| `component` | `"secrets-vault"` | Constant. Used by log scrapers to filter. |
| `tenantId` | `string` | Always present. |
| `key` | `string \| null` | `null` for `LIST` and `BUNDLE` (which span many keys). |
| `action` | `"PUT" \| "GET" \| "DELETE" \| "LIST" \| "BUNDLE" \| "AUTH_REJECT" \| "RATE_LIMIT"` | |
| `requesterId` | `string` | From `X-Crontech-Requester` header, or `"internal"` if unset. |
| `timestamp` | RFC 3339 string | UTC. |
| `result` | `"ok" \| "error"` | |
| `error` | `string?` | Only present when `result = "error"`. |

**Plaintext secret values are never written to the audit log.**
Tests assert this directly (see `store.test.ts → never leaks values`
and `store.test.ts → audit log records BUNDLE action without
leaking values`).

In production, stdout is shipped to Loki via the LGTM stack and the
component=secrets-vault filter feeds the security dashboard.

---

## 5. Rate-Limit Policy

Default: **600 requests per 60-second sliding window per tenant**.
Buckets are keyed by tenantId — one tenant cannot starve another.
Exceeding the limit returns 429 and writes a `RATE_LIMIT` audit
entry. The clock is injectable for deterministic tests.

Buckets are in-process. When v2 ships with multiple replicas, the
bucket store moves to a Cloudflare Durable Object so the limit is
enforced globally rather than per-replica.

---

## 6. Storage

- **v1 (current):** in-memory `Map<"${tenantId} ${key}", record>`.
  Suitable for single-replica edge worker. Wiped on restart, so v1
  is intended for short-lived per-deploy injection — not as the
  primary store.
- **v2 (planned):** Turso table with the schema below. Public API
  unchanged.

```sql
-- v2 Turso schema (planned)
CREATE TABLE IF NOT EXISTS vault_secrets (
  tenant_id   TEXT NOT NULL,
  secret_key  TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,             -- base64(nonce || tag || ct)
  kek_gen     INTEGER NOT NULL DEFAULT 1,-- generation tag for rotation
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (tenant_id, secret_key)
);
CREATE INDEX IF NOT EXISTS vault_secrets_tenant_idx
  ON vault_secrets(tenant_id);
```

---

## 7. Configuration

| Env var | Required | Description |
|---|---|---|
| `SECRETS_VAULT_MASTER_KEY` | YES | 64-char hex (32 bytes). Master KEK. |
| `SECRETS_VAULT_INTERNAL_TOKEN` | YES | Bearer token internal callers must present. |
| `SECRETS_VAULT_PORT` | no | Defaults to `9100`. |

---

## 8. Tests

```bash
bun test          # 41 tests across crypto, store, rate-limit, server
bunx tsc --noEmit # strict type-check
bunx biome check . # lint + format
```

Test coverage:

- Crypto: round-trip, AAD enforcement (cross-tenant, cross-key),
  tampered ciphertext, deterministic DEK derivation, constant-time
  comparison.
- Store: put/get isolation, list never returns values, delete,
  bundle subset, bundle never leaks values to audit log, audit
  schema shape.
- Rate limiter: window enforcement, sliding reset, per-tenant
  isolation (clock mocked).
- Server: bearer auth, validation, all endpoints, rate-limit trip
  and recovery, /health open.
