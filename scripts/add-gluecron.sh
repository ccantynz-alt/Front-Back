#!/usr/bin/env bash
# add-gluecron.sh - Idempotent bootstrap for the Gluecron service on a
# bare-metal Ubuntu 22.04 host (target: Vultr 45.76.171.37).
#
# Safe to re-run: every step checks for prior state before acting.
#
# Required env:
#   DATABASE_URL           - Postgres connection string for gluecron
# Optional env:
#   GLUECRON_REPO          - git URL (default: https://github.com/ccantynz-alt/Gluecron.com.git)
#   GLUECRON_BRANCH        - branch to deploy (default: main)
#   GLUECRON_DIR           - install dir (default: /opt/gluecron)
#   GIT_REPOS_PATH         - repo storage (default: /data/gluecron/repos)
#   PORT                   - listen port (default: 3002)
#   NODE_ENV               - default: production
#   GATETEST_URL           - upstream gatetest base URL (optional)
#   CRONTECH_DEPLOY_URL    - crontech deploy webhook URL (optional)

set -euo pipefail

log() { printf '\n>>> %s\n' "$*"; }
die() { printf '\n!!! %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. Preflight — auto-detect DATABASE_URL from server env files if not set
# ---------------------------------------------------------------------------
log "preflight: checking required env"

# Auto-load from the Crontech env files on the server if DATABASE_URL not set.
# Preference order: explicit env var > .env.production > .env
if [[ -z "${DATABASE_URL:-}" ]]; then
  CRONTECH_DIR="${CRONTECH_DIR:-/opt/crontech}"
  for envfile in "$CRONTECH_DIR/.env.production" "$CRONTECH_DIR/.env"; do
    if [[ -f "$envfile" ]]; then
      # Extract NEON_DATABASE_URL or DATABASE_URL from the file
      _val="$(grep -E '^(NEON_DATABASE_URL|DATABASE_URL)=' "$envfile" | grep -v '^#' | head -1 | cut -d= -f2- || true)"
      if [[ -n "$_val" ]]; then
        export DATABASE_URL="$_val"
        log "auto-detected DATABASE_URL from $envfile"
        break
      fi
    fi
  done
fi

: "${DATABASE_URL:?DATABASE_URL not found — set it explicitly or ensure NEON_DATABASE_URL is in /opt/crontech/.env}"

GLUECRON_REPO="${GLUECRON_REPO:-https://github.com/ccantynz-alt/Gluecron.com.git}"
GLUECRON_BRANCH="${GLUECRON_BRANCH:-main}"
GLUECRON_DIR="${GLUECRON_DIR:-/opt/gluecron}"
GIT_REPOS_PATH="${GIT_REPOS_PATH:-/data/gluecron/repos}"
PORT="${PORT:-3002}"
NODE_ENV="${NODE_ENV:-production}"
GATETEST_URL="${GATETEST_URL:-}"
CRONTECH_DEPLOY_URL="${CRONTECH_DEPLOY_URL:-}"

if [[ $EUID -ne 0 ]]; then
  die "must be run as root (try: sudo -E $0)"
fi

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------------------
# 1. System packages + bun
# ---------------------------------------------------------------------------
log "apt: installing git and postgresql-client"
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git unzip postgresql-client

# bun: prefer system-wide install at /usr/local so systemd PATH finds it
BUN_BIN="$(command -v bun || true)"
if [[ -z "$BUN_BIN" ]]; then
  log "bun: not found, installing to /usr/local"
  # Official installer drops into ~/.bun; symlink into /usr/local/bin.
  export BUN_INSTALL="/usr/local"
  curl -fsSL https://bun.sh/install | bash
  BUN_BIN="/usr/local/bin/bun"
fi
[[ -x "$BUN_BIN" ]] || die "bun install failed: $BUN_BIN not executable"
log "bun: $($BUN_BIN --version) at $BUN_BIN"

# ---------------------------------------------------------------------------
# 2. Source checkout
# ---------------------------------------------------------------------------
log "source: syncing $GLUECRON_REPO ($GLUECRON_BRANCH) into $GLUECRON_DIR"
mkdir -p "$(dirname "$GLUECRON_DIR")"
if [[ -d "$GLUECRON_DIR/.git" ]]; then
  git -C "$GLUECRON_DIR" remote set-url origin "$GLUECRON_REPO"
  git -C "$GLUECRON_DIR" fetch --prune origin "$GLUECRON_BRANCH"
  git -C "$GLUECRON_DIR" checkout "$GLUECRON_BRANCH"
  git -C "$GLUECRON_DIR" reset --hard "origin/$GLUECRON_BRANCH"
else
  git clone --branch "$GLUECRON_BRANCH" --single-branch "$GLUECRON_REPO" "$GLUECRON_DIR"
fi

# ---------------------------------------------------------------------------
# 3. Dependencies
# ---------------------------------------------------------------------------
log "bun install --production in $GLUECRON_DIR"
( cd "$GLUECRON_DIR" && "$BUN_BIN" install --production )

# ---------------------------------------------------------------------------
# 4. Data dir
# ---------------------------------------------------------------------------
log "data: ensuring $GIT_REPOS_PATH exists"
mkdir -p "$GIT_REPOS_PATH"

# ---------------------------------------------------------------------------
# 5. .env
# ---------------------------------------------------------------------------
log "env: writing $GLUECRON_DIR/.env"
ENV_FILE="$GLUECRON_DIR/.env"
umask 077
{
  printf 'DATABASE_URL=%s\n'        "$DATABASE_URL"
  printf 'PORT=%s\n'                "$PORT"
  printf 'NODE_ENV=%s\n'            "$NODE_ENV"
  printf 'GIT_REPOS_PATH=%s\n'      "$GIT_REPOS_PATH"
  printf 'GATETEST_URL=%s\n'        "$GATETEST_URL"
  printf 'CRONTECH_DEPLOY_URL=%s\n' "$CRONTECH_DEPLOY_URL"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"
umask 022

# ---------------------------------------------------------------------------
# 6. Database: createdb if missing, then migrate
# ---------------------------------------------------------------------------
log "db: ensuring 'gluecron' database exists"
# Probe with psql -lqt; fall back to creating via the same DATABASE_URL
# with the /gluecron path replaced by /postgres.
ADMIN_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')"
if psql "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname='gluecron'" | grep -q 1; then
  log "db: 'gluecron' already present"
else
  log "db: creating 'gluecron'"
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c 'CREATE DATABASE gluecron;'
fi

log "db: running migrations (bun run db:migrate)"
( cd "$GLUECRON_DIR" && "$BUN_BIN" run db:migrate )

# ---------------------------------------------------------------------------
# 7. systemd unit
# ---------------------------------------------------------------------------
log "systemd: writing /etc/systemd/system/gluecron.service"
cat > /etc/systemd/system/gluecron.service <<EOF
[Unit]
Description=Gluecron service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$GLUECRON_DIR
EnvironmentFile=$GLUECRON_DIR/.env
ExecStart=$BUN_BIN run src/index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# ---------------------------------------------------------------------------
# 8. Reload + (re)start
# ---------------------------------------------------------------------------
log "systemd: daemon-reload + enable + restart gluecron"
systemctl daemon-reload
systemctl enable gluecron
systemctl restart gluecron

# ---------------------------------------------------------------------------
# 9. Healthcheck
# ---------------------------------------------------------------------------
log "healthcheck: waiting up to 30s for http://localhost:$PORT"
deadline=$(( $(date +%s) + 30 ))
while (( $(date +%s) < deadline )); do
  if curl -fsS --max-time 3 "http://localhost:$PORT" >/dev/null 2>&1; then
    log "healthcheck: OK (200 from localhost:$PORT)"
    exit 0
  fi
  sleep 2
done

log "healthcheck: FAILED - dumping last 80 lines of journal"
journalctl -u gluecron -n 80 --no-pager || true
exit 1
