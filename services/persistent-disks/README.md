# persistent-disks

Crontech's persistent-disk control plane. A tenant-aware service that manages
the **lifecycle** of attached block / NFS volumes: create, attach, detach,
resize, snapshot, restore, delete. The actual filesystem work is delegated to
a swappable `DiskDriver` — the control plane is pure orchestration.

## Why this exists

Render-class platforms (Render, Heroku, Fly) all expose persistent disks as a
first-class primitive: pick a size, attach it to a worker, snapshot it before
risky deploys, online-resize it when the app outgrows it. Crontech needs the
same primitive — and we ship it instantly, snapshot in seconds, and resize
online with zero downtime.

This service is **internal infrastructure**. It runs on `127.0.0.1` (or a
private overlay) and is called by the worker-runtime, the cron-scheduler, and
any other service that needs durable storage.

## Volume model

```ts
interface Volume {
  volumeId: string;           // server-generated
  tenantId: string;           // owner
  name: string;               // user-facing label, ≤100 chars
  sizeBytes: number;          // logical size (grow-only)
  fs: "ext4" | "nfs";         // matches driver
  status:                     // state machine
    | "creating"
    | "available"
    | "attached"
    | "deleting";
  attachedTo: { workerId, mountPath } | null;
  createdAt: string;          // ISO-8601
  updatedAt: string;          // ISO-8601
}
```

State transitions:

```
creating ─▶ available ─▶ attached ─▶ available ─▶ deleting ─▶ removed
   │
   └─▶ (driver failure, registry rolls back)
```

Hard rules:

- **Resize is grow-only.** Shrinking ext4/NFS reliably is a footgun. Future
  opt-in, not v1.
- **Delete is blocked while attached.** Detach first.
- **Snapshots can be taken while attached** (online snapshot via reflink/cp).

## Driver interface

```ts
interface DiskDriver {
  readonly name: string;
  readonly defaultFs: "ext4" | "nfs";
  create({ volumeId, sizeBytes, fs }): Promise<BackendVolumeHandle>;
  resize({ volumeId, newSizeBytes }): Promise<BackendVolumeHandle>;
  destroy({ volumeId }): Promise<void>;
  snapshot({ volume }): Promise<SnapshotPayload>;
  restore({ snapshot, targetVolumeId, sizeBytes }): Promise<BackendVolumeHandle>;
}
```

Two implementations ship in v1:

- **`LocalLoopbackDriver`** — sparse-file loopback ext4 via `fallocate` +
  `mkfs.ext4` + `mount -o loop`. For dev, tests, and single-host deploys.
  Shell calls go through an injectable `Shell` port so tests stay
  deterministic.
- **`NfsDriver`** — allocates a per-volume directory under an NFS export. The
  filesystem is the export's filesystem; we just record metadata. The runtime
  bind-mounts the directory into worker namespaces.

Both honour the same shape, both are tested against the same registry
contract.

## Snapshot semantics

- **Immutable** — once created, never modified.
- **Tenant-scoped** — restoring into a target volume requires matching tenant.
- **SHA-256 fingerprinted** — every snapshot records a backend-supplied
  digest of its blob. Tests inject a deterministic hasher; production uses
  `Bun.CryptoHasher`.
- **Optional TTL** — `ttlMs` on create produces an `expiresAt`. Cleanup of
  expired snapshots is the caller's responsibility (a future janitor will pick
  it up).
- **Two restore modes:**
  - `POST /snapshots/:id/restore` with no `targetVolumeId` → provisions a new
    volume sized to the snapshot, name defaults to `restore-of-<src>`.
  - With `targetVolumeId` → overwrites an *available* volume of the same
    tenant, must be ≥ snapshot size.

## Quota policy

- Default per-tenant quota: **100 GiB** (overridable via
  `DISKS_DEFAULT_QUOTA_BYTES` or `setQuota()`).
- Quota is enforced **at create-time** and **at resize-grow-time** — measured
  as `sum(volume.sizeBytes)` across non-deleting volumes for the tenant.
- Quota exceeded → HTTP **422** with `code: "quota_exceeded"`.

## HTTP API

All routes require `Authorization: Bearer $DISKS_CONTROL_TOKEN`. `/health` is
unauthenticated.

| Method | Path                              | Purpose                                |
| ------ | --------------------------------- | -------------------------------------- |
| GET    | `/health`                         | Liveness                               |
| POST   | `/volumes`                        | Create `{ tenantId, name, sizeBytes, fs }` |
| GET    | `/volumes`                        | List (filter via `?tenantId=`)         |
| GET    | `/volumes/:id`                    | Read                                   |
| POST   | `/volumes/:id/attach`             | `{ workerId, mountPath }`              |
| POST   | `/volumes/:id/detach`             | (no body)                              |
| POST   | `/volumes/:id/resize`             | `{ newSizeBytes }` — must be ≥ current |
| DELETE | `/volumes/:id`                    | Detached only                          |
| POST   | `/volumes/:id/snapshots`          | `{ ttlMs? }`                           |
| GET    | `/snapshots`                      | List (filter via `?volumeId=`)         |
| GET    | `/snapshots/:id`                  | Read                                   |
| POST   | `/snapshots/:id/restore`          | `{ targetVolumeId?, newVolumeName? }`  |

## Environment variables

| Var                          | Default                       | Notes                                |
| ---------------------------- | ----------------------------- | ------------------------------------ |
| `DISKS_HOST`                 | `127.0.0.1`                   | Bind address                         |
| `DISKS_PORT`                 | `9300`                        | Bind port                            |
| `DISKS_CONTROL_TOKEN`        | *(required)*                  | Bearer token for all non-health calls |
| `DISKS_DRIVER`               | `local-loopback`              | `local-loopback` \| `nfs`            |
| `DISKS_LOOPBACK_ROOT`        | `/var/lib/crontech/disks`     | Loopback driver root dir             |
| `DISKS_NFS_EXPORT_ROOT`      | *(required for nfs)*          | NFS export root                      |
| `DISKS_DEFAULT_QUOTA_BYTES`  | `107374182400` (100 GiB)      | Per-tenant default quota             |

## Error model

All errors return JSON `{ error, code }` with these statuses:

- `400` — validation / shrink-resize / invalid input
- `401` — bad/missing bearer token
- `403` — cross-tenant restore
- `404` — volume/snapshot not found
- `409` — illegal state transition (e.g. delete while attached)
- `422` — quota exceeded
- `500` — driver / unexpected failure

## Running

```sh
# Start the service
bun run start

# Tests
bun test

# Type-check
bun run check

# Lint
bun run lint
```
