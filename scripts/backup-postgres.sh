#!/usr/bin/env bash
# backup-postgres.sh — nightly full cluster dump of Postgres for the Crontech
# bare-metal box. Idempotent, safe to run manually.
#
# Output:
#   /var/backups/postgres/YYYYMMDD_HHMMSS.sql.gz
#
# Retention:
#   - 14 most recent daily dumps
#   - 4 most recent weekly dumps (Sundays), kept in a sibling directory
#
# Off-box upload (optional):
#   If $BACKUP_UPLOAD_CMD is set, the gzipped dump is piped to it on stdin.
#   The command should read stdin and write to remote storage, e.g.:
#     export BACKUP_UPLOAD_CMD='rclone rcat b2:crontech-backups/postgres/$(date +%Y%m%d_%H%M%S).sql.gz'
#     export BACKUP_UPLOAD_CMD='aws s3 cp - s3://crontech-backups/postgres/latest.sql.gz'
#
# Logging:
#   /var/log/crontech-backup.log (append-only, one line per step)
#
set -euo pipefail

LOG_FILE="${LOG_FILE:-/var/log/crontech-backup.log}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
WEEKLY_DIR="${WEEKLY_DIR:-${BACKUP_DIR}/weekly}"
DAILY_RETENTION="${DAILY_RETENTION:-14}"
WEEKLY_RETENTION="${WEEKLY_RETENTION:-4}"
PG_USER="${PG_USER:-postgres}"

TS="$(date -u +%Y%m%d_%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/${TS}.sql.gz"

log() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) [backup-postgres] $*"
  echo "$line"
  # Best-effort log write; never fail the script on logging alone.
  echo "$line" >> "$LOG_FILE" 2>/dev/null || true
}

fail() {
  log "FAILED: $*"
  exit 1
}

# Ensure log dir + backup dirs exist
install -d -m 0750 "$BACKUP_DIR" "$WEEKLY_DIR"
install -d -m 0755 "$(dirname "$LOG_FILE")"
: > /dev/null 2>&1  # no-op
touch "$LOG_FILE" 2>/dev/null || true
chmod 0640 "$LOG_FILE" 2>/dev/null || true

log "start ts=${TS} host=$(hostname) out=${DUMP_FILE}"

command -v pg_dumpall >/dev/null 2>&1 || fail "pg_dumpall not found in PATH"
command -v gzip       >/dev/null 2>&1 || fail "gzip not found in PATH"

# Run pg_dumpall as the postgres system user when available; otherwise current user.
run_dump() {
  if id -u "$PG_USER" >/dev/null 2>&1 && [[ "$(id -un)" != "$PG_USER" ]]; then
    sudo -u "$PG_USER" pg_dumpall -c
  else
    pg_dumpall -c
  fi
}

# Write dump to tmp then atomic-rename, so a partial file is never the "latest".
TMP_FILE="${DUMP_FILE}.partial"
trap 'rm -f "$TMP_FILE"' EXIT

# We need two consumers of the dump stream when BACKUP_UPLOAD_CMD is set:
# one writes locally, the other pipes to the upload command.
if [[ -n "${BACKUP_UPLOAD_CMD:-}" ]]; then
  log "dump -> local (${TMP_FILE}) + upload via BACKUP_UPLOAD_CMD"
  # tee the gzipped stream to both local file and the upload command
  set -o pipefail
  if ! run_dump | gzip -9 | tee "$TMP_FILE" | bash -c "$BACKUP_UPLOAD_CMD"; then
    fail "pg_dumpall | gzip | tee | upload failed"
  fi
  log "upload ok"
else
  log "dump -> local (${TMP_FILE}) [no BACKUP_UPLOAD_CMD set]"
  if ! run_dump | gzip -9 > "$TMP_FILE"; then
    fail "pg_dumpall | gzip failed"
  fi
fi

# Sanity check: gzip file must be non-empty and valid.
if [[ ! -s "$TMP_FILE" ]]; then
  fail "dump file empty: $TMP_FILE"
fi
if ! gzip -t "$TMP_FILE" 2>/dev/null; then
  fail "dump file failed gzip integrity check: $TMP_FILE"
fi

mv -f "$TMP_FILE" "$DUMP_FILE"
trap - EXIT
chmod 0640 "$DUMP_FILE"
SIZE="$(stat -c %s "$DUMP_FILE" 2>/dev/null || wc -c <"$DUMP_FILE")"
log "dump ok path=${DUMP_FILE} size=${SIZE}"

# Weekly snapshot: on Sunday, hardlink today's dump into the weekly dir.
if [[ "$(date -u +%u)" == "7" ]]; then
  WEEKLY_FILE="${WEEKLY_DIR}/${TS}.sql.gz"
  ln -f "$DUMP_FILE" "$WEEKLY_FILE" 2>/dev/null || cp -a "$DUMP_FILE" "$WEEKLY_FILE"
  log "weekly snapshot -> ${WEEKLY_FILE}"
fi

# Retention: keep newest N in each directory, delete the rest.
prune() {
  local dir="$1" keep="$2"
  local count
  # List files newest-first, skip the first $keep, delete the rest.
  count=$(ls -1t "$dir"/*.sql.gz 2>/dev/null | wc -l || echo 0)
  if [[ "$count" -gt "$keep" ]]; then
    ls -1t "$dir"/*.sql.gz | tail -n +$((keep + 1)) | while read -r f; do
      rm -f -- "$f" && log "pruned $f"
    done
  fi
}

prune "$BACKUP_DIR" "$DAILY_RETENTION"
prune "$WEEKLY_DIR" "$WEEKLY_RETENTION"

log "done ts=${TS}"
