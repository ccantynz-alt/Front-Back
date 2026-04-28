# @back-to-the-future/managed-databases

Crontech's managed-databases control plane — Render-class "click and you
have a database" for Postgres + Redis, AI-native from the ground up.

## What this service does

This is the **control plane** for managed databases. It does not host
data itself; it orchestrates two driver-backed engines:

| `type`     | Backend                               | Provisioner             |
|------------|---------------------------------------|-------------------------|
| `postgres` | Neon (serverless Postgres)            | `NeonProvisioner`       |
| `redis`    | Self-hosted bare-metal Redis cluster  | `RedisLocalProvisioner` |

Both implementations satisfy the driver-agnostic `DbProvisioner`
interface, which means new backends (DragonflyDB, Aurora DSQL, KeyDB,
etc.) can be plugged in by adding one class.

## Capabilities

- **Provisioning in seconds.** `POST /databases` returns a ready record;
  the provisioner has already returned the connection string.
- **Branching like git.** Postgres only — `POST /databases/:id/branches`
  creates a copy-on-write branch via Neon's branching API. Redis returns
  `422 unsupported`.
- **Automatic backups.** Nightly snapshot per database (trigger by
  external scheduler hitting `/databases/:id/snapshots`). Manual
  snapshots via the same endpoint. Default retention is 7 days.
- **Restore.** `POST /snapshots/:id/restore` — Postgres restores by
  creating a new branch from the snapshot point; Redis restores by
  loading the RDB.
- **Credential rotation with grace period.** `POST
  /databases/:id/rotate-credentials` issues new credentials and keeps
  the previous ones valid for 60 seconds (configurable) so in-flight
  workloads finish cleanly.
- **Soft-delete + 7-day recovery window.** `DELETE /databases/:id` does
  not immediately destroy data — it marks `softDeletedAt` and waits 7
  days. `POST /databases/:id/recover` undoes it within the window.
  After expiry, `purgeIfExpired(dbId)` is the irreversible final step
  (called by an external janitor).
- **Per-tenant quotas.** Default 5 active databases per tenant
  (configurable). Soft-deleted databases do not count.
- **AI query suggestion v2 hook.** `registry.suggestQueries({ dbId,
  tenantId })` is reserved for the v2 AI suggestion stream — currently
  a stub that returns a placeholder line.

## Connection-string custody

This is the most important security property of the service.

- Connection strings are **never** stored in plaintext on disk.
- At rest they are AES-256-GCM ciphertext under a per-tenant DEK
  derived via HKDF-SHA-256 from a master KEK held in
  `MANAGED_DBS_MASTER_KEY` (32 bytes / 64 hex chars).
- The AAD is `tenantId:dbId`, so a ciphertext bound to tenant A's
  database cannot be replayed against tenant B — even if both DEKs
  came from the same KEK.
- `GET /databases/:id` **never** returns the connection string. It
  returns metadata only.
- The plaintext is exposed exclusively via `POST
  /databases/:id/connection-string`, which logs an audit entry
  `{ dbId, tenantId, requesterId, action: GET_CONNECTION_STRING,
   timestamp, result }` to stdout (Loki-friendly JSON).
- During the rotation grace period, the audited response also includes
  `previousConnectionString` so the requester can drain in-flight work.

## HTTP API

All `/databases` and `/snapshots` routes require a Bearer token from
`MANAGED_DBS_TOKEN`.

| Method | Path                                       | Description                        |
|--------|--------------------------------------------|------------------------------------|
| POST   | `/databases`                               | provision (`tenantId, type, name, region, sizeTier`) |
| GET    | `/databases/:id?tenantId=T`                | metadata only (no credentials)     |
| POST   | `/databases/:id/connection-string`         | plaintext credentials, audited     |
| POST   | `/databases/:id/snapshots`                 | manual snapshot                    |
| GET    | `/databases/:id/snapshots?tenantId=T`      | list snapshots                     |
| POST   | `/snapshots/:id/restore`                   | restore from snapshot              |
| POST   | `/databases/:id/branches`                  | create branch (Postgres only)      |
| POST   | `/databases/:id/rotate-credentials`        | rotate with grace period           |
| DELETE | `/databases/:id`                           | soft-delete                        |
| POST   | `/databases/:id/recover`                   | recover within 7-day window        |
| GET    | `/health`                                  | unauth — liveness                  |

Error codes:
- `400` — body validation failed
- `401` — missing / wrong bearer token
- `403` — tenant does not own the resource
- `404` — db / snapshot not found, or soft-deleted db credential fetch
- `422` — unsupported (e.g. Redis branch)
- `429` — per-tenant quota exceeded
- `500` — internal

## Environment variables

| Var                            | Required | Default                                | Notes |
|--------------------------------|----------|----------------------------------------|-------|
| `MANAGED_DBS_MASTER_KEY`       | yes      | —                                      | 64 hex chars / 32 bytes — KEK |
| `MANAGED_DBS_TOKEN`            | yes      | —                                      | static bearer for internal callers |
| `MANAGED_DBS_PORT`             | no       | `9120`                                 | bound to `127.0.0.1` only |
| `MANAGED_DBS_NEON_API_KEY`     | optional | —                                      | enables the `postgres` provisioner |
| `MANAGED_DBS_NEON_BASE_URL`    | optional | `https://console.neon.tech/api/v2`     | override for staging |
| `MANAGED_DBS_REDIS_HOST`       | optional | —                                      | enables the `redis` provisioner |
| `MANAGED_DBS_REDIS_PORT`       | optional | `6379`                                 | redis cluster head port |

If neither Neon nor Redis env is configured the service starts but
`POST /databases` will 422 for any type.

## Testing

```sh
bun test services/managed-databases
```

All provisioner-network paths are mocked via injected transports
(`NeonTransport` for Neon, `RedisCommand` for Redis), so CI never
touches the network.

## Doctrine

This service follows Crontech doctrine §0.4.1 (Clean Green Ecosystem):
strict TS, encrypted-at-rest secrets, audited credential access, no
plaintext on disk, exhaustive test coverage including the negative
paths (auth rejection, tenant mismatch, quota overflow, branching for
unsupported types, expired recovery window).
