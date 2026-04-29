# Bare-metal infra

This directory holds the systemd units, configs, and helper scripts that
make a fresh Vultr (or any Ubuntu 22.04+/24.04) box run the Crontech
stack. The canonical bootstrap entry point is
`scripts/bare-metal-setup.sh` at the repo root.

## Backups & restore drill

> Audit reference: sub-track 2 (single-box, no HA) and sub-track 8
> ("backups are aspirational"). Added 2026-04-27 in the wake of the 47h
> systemd outage.

### Layout

| File | Purpose |
| --- | --- |
| `postgres-replica.conf` | Append-to-postgresql.conf delta enabling `wal_level=replica`, archiving, and hot-standby. Apply on primary AND replica. |
| `pg_hba.replica.conf` | Single-line ACL granting the `replicator` role streaming access from the standby IP. |
| `pgbackrest.conf` | pgbackrest stanza `crontech`, repo backed by MinIO via S3 protocol, retention 4 full + 14 diff. |
| `scripts/pgbackrest-init.sh` | Idempotent one-shot bootstrap on the primary: install pgbackrest, install conf, `stanza-create`, take initial full backup. |
| `scripts/restore-verify.sh` | Non-destructive drill: restores the latest backup into `/tmp/restore-$(date +%s)`, starts a throwaway Postgres on port 5499, runs row-count probes. Used by the nightly CI workflow. |

The repo on MinIO lives in bucket `crontech-backups`:

```
crontech-backups/
  archive/crontech/...    # WAL segments via archive-push
  backup/crontech/...     # full + diff base backups
```

### One-time primary bootstrap

```bash
export MINIO_ENDPOINT=minio.crontech.internal:9000
export PGBACKREST_REPO1_S3_KEY=<minio-access-key>
export PGBACKREST_REPO1_S3_KEY_SECRET=<minio-secret>

sudo -E bash infra/bare-metal/scripts/pgbackrest-init.sh

# Then wire archiving into Postgres:
sudo cat infra/bare-metal/postgres-replica.conf \
     >> /etc/postgresql/16/main/postgresql.conf
sudo systemctl restart postgres

# Sanity:
sudo -u postgres pgbackrest --stanza=crontech check
sudo -u postgres pgbackrest --stanza=crontech info
```

### Promoting a second Vultr box to a streaming replica

1. Provision the new box with the same `bare-metal-setup.sh` flow up to
   the Postgres step. Stop short of `postgres-init.sql`.
2. On the **primary**, create a replication role:
   ```sql
   CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '<long-pw>';
   ```
3. Append the relevant line from `pg_hba.replica.conf` to
   `/etc/postgresql/16/main/pg_hba.conf` on the primary, replacing
   `<replica_ip>` with the standby's address. `SELECT pg_reload_conf();`.
4. On the **replica**, base-back-up:
   ```bash
   sudo systemctl stop postgres
   sudo -u postgres rm -rf /data/postgres/16/main
   sudo -u postgres pg_basebackup \
        -h <primary_ip> -U replicator -D /data/postgres/16/main \
        -X stream -P -R -W
   sudo cat infra/bare-metal/postgres-replica.conf \
        >> /data/postgres/16/main/postgresql.conf
   sudo systemctl start postgres
   ```
5. Verify on the primary:
   ```sql
   SELECT client_addr, state, sync_state FROM pg_stat_replication;
   ```

### Nightly restore drill (CI)

`.github/workflows/db-restore-test.yml` runs `restore-verify.sh` against
the live MinIO repo every night at 04:00 UTC and on `workflow_dispatch`.
It catches silent backup corruption — a passing pgbackrest archive-push
does not guarantee the resulting backup can actually be restored.

Required GitHub Actions secrets (set in repo Settings → Secrets):

- `MINIO_ENDPOINT_TEST` — MinIO host:port reachable from the runner.
- `MINIO_ACCESS_KEY_TEST` — read-only key scoped to `crontech-backups`.
- `MINIO_SECRET_KEY_TEST` — corresponding secret.

Until those secrets are configured the workflow will fail at the env-
var validation step in `restore-verify.sh`. That is intentional — the
job's job is to fail loudly when backups are not actually verifiable.

### Manual restore drill

```bash
export MINIO_ENDPOINT=...
export PGBACKREST_REPO1_S3_KEY=...
export PGBACKREST_REPO1_S3_KEY_SECRET=...
sudo -E bash infra/bare-metal/scripts/restore-verify.sh
```

### Failure modes the drill catches

- WAL gap (archive-push silently failing).
- Truncated base backup (network error during upload).
- Permissions drift on the MinIO bucket.
- Schema drift the operator forgot to back up (the row-count probe
  reports `MISSING` for any expected table not found in the restore).

### Rollback

Reverting this PR removes the new files; nothing in the live system is
touched until an operator manually appends `postgres-replica.conf` to
`postgresql.conf`. `archive_mode` defaults to `off`, so `pgbackrest`
archive-push is never invoked by Postgres on its own.
