#!/usr/bin/env bash
# Crontech — one-shot pgbackrest bootstrap for the primary.
#
# Idempotent: every step checks the prior state. Safe to re-run on a
# host that already has pgbackrest installed and a stanza created.
#
# Required env vars (export before running):
#   MINIO_ENDPOINT                  e.g. minio.crontech.internal:9000
#   PGBACKREST_REPO1_S3_KEY         MinIO access key
#   PGBACKREST_REPO1_S3_KEY_SECRET  MinIO secret key
#
# Optional:
#   PGBACKREST_BIN  path to pgbackrest binary (default: /usr/bin/pgbackrest)
#
# Usage:
#   sudo -E bash infra/bare-metal/scripts/pgbackrest-init.sh
#
# Audit ref: sub-track 8.
set -euo pipefail

PGBACKREST_BIN="${PGBACKREST_BIN:-/usr/bin/pgbackrest}"
STANZA="crontech"
CONF_SRC="$(dirname "$0")/../pgbackrest.conf"
CONF_DST="/etc/pgbackrest/pgbackrest.conf"
LOG_DIR="/var/log/pgbackrest"

log() { echo "[pgbackrest-init $(date -Is)] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "must run as root (sudo -E)"
[[ -n "${MINIO_ENDPOINT:-}" ]] || die "MINIO_ENDPOINT not set"
[[ -n "${PGBACKREST_REPO1_S3_KEY:-}" ]] || die "PGBACKREST_REPO1_S3_KEY not set"
[[ -n "${PGBACKREST_REPO1_S3_KEY_SECRET:-}" ]] || die "PGBACKREST_REPO1_S3_KEY_SECRET not set"

# ── 1. Install pgbackrest if missing ──────────────────────────────────
if ! command -v "$PGBACKREST_BIN" >/dev/null 2>&1; then
  log "installing pgbackrest via apt"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends pgbackrest
else
  log "pgbackrest already installed: $($PGBACKREST_BIN version)"
fi

# ── 2. Prepare directories ────────────────────────────────────────────
install -d -o postgres -g postgres -m 0750 "$LOG_DIR"
install -d -o postgres -g postgres -m 0750 /etc/pgbackrest

# ── 3. Install config ─────────────────────────────────────────────────
[[ -f "$CONF_SRC" ]] || die "missing $CONF_SRC (run from repo root)"
install -o postgres -g postgres -m 0640 "$CONF_SRC" "$CONF_DST"
log "installed $CONF_DST"

# ── 4. Create the stanza if absent ────────────────────────────────────
# `info` exits 0 if the stanza is reachable. Use that as the idempotency
# guard — stanza-create on an existing stanza is a no-op but noisy.
if sudo -u postgres "$PGBACKREST_BIN" --stanza="$STANZA" info >/dev/null 2>&1; then
  log "stanza '$STANZA' already exists — skipping stanza-create"
else
  log "creating stanza '$STANZA'"
  sudo -u postgres \
    MINIO_ENDPOINT="$MINIO_ENDPOINT" \
    PGBACKREST_REPO1_S3_KEY="$PGBACKREST_REPO1_S3_KEY" \
    PGBACKREST_REPO1_S3_KEY_SECRET="$PGBACKREST_REPO1_S3_KEY_SECRET" \
    "$PGBACKREST_BIN" --stanza="$STANZA" stanza-create
fi

# ── 5. Verify config + reachability ───────────────────────────────────
log "running pgbackrest check"
sudo -u postgres \
  MINIO_ENDPOINT="$MINIO_ENDPOINT" \
  PGBACKREST_REPO1_S3_KEY="$PGBACKREST_REPO1_S3_KEY" \
  PGBACKREST_REPO1_S3_KEY_SECRET="$PGBACKREST_REPO1_S3_KEY_SECRET" \
  "$PGBACKREST_BIN" --stanza="$STANZA" check

# ── 6. Take the bootstrap full backup if none exists ─────────────────
if sudo -u postgres "$PGBACKREST_BIN" --stanza="$STANZA" info \
     2>/dev/null | grep -q "full backup"; then
  log "full backup already present — skipping initial backup"
else
  log "running initial --type=full backup (this may take a while)"
  sudo -u postgres \
    MINIO_ENDPOINT="$MINIO_ENDPOINT" \
    PGBACKREST_REPO1_S3_KEY="$PGBACKREST_REPO1_S3_KEY" \
    PGBACKREST_REPO1_S3_KEY_SECRET="$PGBACKREST_REPO1_S3_KEY_SECRET" \
    "$PGBACKREST_BIN" --stanza="$STANZA" --type=full backup
fi

log "pgbackrest-init complete"
