#!/usr/bin/env bash
# Crontech — non-destructive pgbackrest restore drill.
#
# Restores the most recent backup into a scratch directory, starts a
# throwaway Postgres on port 5499, runs row-count checks against a
# canonical list of tables, and exits non-zero on any failure. The live
# Postgres on 5432 is never touched.
#
# Used by .github/workflows/db-restore-test.yml nightly. Can also be run
# ad-hoc on any host that has pgbackrest + postgresql-16 installed and
# the same MinIO env vars exported.
#
# Required env:
#   MINIO_ENDPOINT
#   PGBACKREST_REPO1_S3_KEY
#   PGBACKREST_REPO1_S3_KEY_SECRET
#
# Optional env:
#   STANZA           (default: crontech)
#   RESTORE_PORT     (default: 5499)
#   PGBACKREST_BIN   (default: /usr/bin/pgbackrest)
#   PG_BIN_DIR       (default: /usr/lib/postgresql/16/bin)
#   EXPECTED_DB      (default: crontech)
#
# Audit ref: sub-track 8 risk #2 (silent backup corruption).
set -euo pipefail

STANZA="${STANZA:-crontech}"
RESTORE_PORT="${RESTORE_PORT:-5499}"
PGBACKREST_BIN="${PGBACKREST_BIN:-/usr/bin/pgbackrest}"
PG_BIN_DIR="${PG_BIN_DIR:-/usr/lib/postgresql/16/bin}"
EXPECTED_DB="${EXPECTED_DB:-crontech}"
RESTORE_DIR="/tmp/restore-$(date +%s)"

# Canonical tables to row-count. Any zero-row result fails the drill.
#
# TODO(operator): the current Crontech app schema lives in SQLite/Turso
# (packages/db/src/schema.ts), NOT Postgres — Postgres holds the AI/
# pgvector workload only. The names below match the audit's "audit
# named these" hint and are the safest defaults until the Postgres
# schema is finalised. Update this list once postgres-init.sql gains
# real CREATE TABLE statements (or migrations land), otherwise the
# verify will fail loudly the first nightly run, which is also fine —
# silence is the bug we are fighting.
TABLES_TO_VERIFY=(tenants users schedules runs)

log() { echo "[restore-verify $(date -Is)] $*"; }
fail() { log "FAIL: $*" >&2; cleanup; exit 1; }

cleanup() {
  if [[ -n "${PG_PID:-}" ]] && kill -0 "$PG_PID" 2>/dev/null; then
    log "stopping temporary postgres (pid $PG_PID)"
    "$PG_BIN_DIR/pg_ctl" -D "$RESTORE_DIR" -m fast stop || true
  fi
  if [[ -d "$RESTORE_DIR" ]]; then
    log "removing $RESTORE_DIR"
    rm -rf "$RESTORE_DIR"
  fi
}
trap cleanup EXIT

[[ -n "${MINIO_ENDPOINT:-}" ]] || fail "MINIO_ENDPOINT not set"
[[ -n "${PGBACKREST_REPO1_S3_KEY:-}" ]] || fail "PGBACKREST_REPO1_S3_KEY not set"
[[ -n "${PGBACKREST_REPO1_S3_KEY_SECRET:-}" ]] || fail "PGBACKREST_REPO1_S3_KEY_SECRET not set"

# ── 1. Restore ────────────────────────────────────────────────────────
log "restoring stanza=$STANZA into $RESTORE_DIR"
mkdir -p "$RESTORE_DIR"
chmod 0700 "$RESTORE_DIR"
"$PGBACKREST_BIN" \
  --stanza="$STANZA" \
  --pg1-path="$RESTORE_DIR" \
  --log-level-console=info \
  restore

# ── 2. Patch postgresql.conf for non-conflicting startup ─────────────
# The restored config still references the prod port + archive_command.
# We need it standalone: no archiving, no replication, custom port,
# unix-socket only.
cat >> "$RESTORE_DIR/postgresql.auto.conf" <<EOF
# Overrides applied by restore-verify.sh
port = $RESTORE_PORT
archive_mode = off
archive_command = ''
listen_addresses = ''
unix_socket_directories = '$RESTORE_DIR'
hot_standby = off
EOF

# pgbackrest restore writes recovery.signal so PG starts in recovery —
# it will replay WAL up to the consistent point and then stop applying.
# That is exactly what we want for verification: a consistent snapshot
# at the latest archived WAL. Promote so we can read.
echo "promote_trigger_file = '$RESTORE_DIR/promote.trigger'" \
  >> "$RESTORE_DIR/postgresql.auto.conf"

# ── 3. Start temp postgres ──────────────────────────────────────────
log "starting temporary postgres on port $RESTORE_PORT"
"$PG_BIN_DIR/pg_ctl" \
  -D "$RESTORE_DIR" \
  -l "$RESTORE_DIR/server.log" \
  -o "-c config_file=$RESTORE_DIR/postgresql.conf" \
  start
PG_PID=$(head -1 "$RESTORE_DIR/postmaster.pid")
log "postgres pid=$PG_PID"

# Touch the trigger so recovery exits and the DB becomes read-write
# (read-only via archive replay would also work, but promotion is the
# path-of-least-resistance for a one-shot drill).
touch "$RESTORE_DIR/promote.trigger"
sleep 5

# ── 4. Row-count probes ──────────────────────────────────────────────
PSQL="$PG_BIN_DIR/psql -h $RESTORE_DIR -p $RESTORE_PORT -d $EXPECTED_DB -X -A -t"
log "verifying row counts in DB '$EXPECTED_DB'"
fail_count=0
for tbl in "${TABLES_TO_VERIFY[@]}"; do
  if ! count="$($PSQL -c "SELECT count(*) FROM \"$tbl\";" 2>/dev/null)"; then
    log "  $tbl: MISSING (table not found in restored DB)"
    fail_count=$((fail_count + 1))
    continue
  fi
  count="${count//[[:space:]]/}"
  if [[ "$count" -le 0 ]]; then
    log "  $tbl: 0 rows (FAIL)"
    fail_count=$((fail_count + 1))
  else
    log "  $tbl: $count rows (ok)"
  fi
done

if [[ $fail_count -gt 0 ]]; then
  fail "$fail_count table(s) failed verification — backup may be corrupt or empty"
fi

log "restore-verify PASSED — backup is healthy"
