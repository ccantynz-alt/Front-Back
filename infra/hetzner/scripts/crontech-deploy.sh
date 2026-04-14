#!/bin/bash
set -euo pipefail

# ── Crontech Monorepo Deploy (Hetzner, unattended) ───────────────────
# Invoked over SSH by .github/workflows/deploy.yml after the workflow
# has cloned/updated the repo at $APP_DIR. Does everything the deploy
# user can do without sudo — teardown old stack, build new containers
# with GIT_SHA baked in, hot-swap system Caddy via its admin API,
# verify /api/version reports the new SHA end-to-end.
#
# Why this script exists:
#   1. The website wasn't updating after PR merges because the deploy
#      pipeline targeted Cloudflare but DNS pointed at Hetzner. This
#      script is the new Hetzner-native path.
#   2. We need GIT_SHA propagated into the Docker build so /api/version
#      proves the NEW image is actually serving traffic.
#   3. Yesterday's setup.sh installed Caddy as a system service on 80/443
#      — we USE that Caddy (via its admin API on localhost:2019) rather
#      than fighting it for the ports. No sudo needed.
#
# Usage:
#   crontech-deploy.sh <git-repo-url> <git-sha> [branch]
#
# Required state on host:
#   - Deploy user in `docker` group (from setup.sh)
#   - /opt/crontech/.env with production secrets (NOT in git)
#   - System Caddy installed + running on 80/443 (from setup.sh)
#   - Repo already checked out at /opt/crontech/apps/crontech
#     (the workflow SSH step clones + resets before calling this)

if [ "$#" -lt 2 ]; then
    echo "Usage: crontech-deploy.sh <git-repo-url> <git-sha> [branch]" >&2
    exit 1
fi

REPO_URL="$1"
GIT_SHA="$2"
BRANCH="${3:-main}"

APP_DIR="/opt/crontech/apps/crontech"
ENV_FILE="/opt/crontech/.env"
CADDY_CONFIG="/opt/crontech/Caddyfile"
COMPOSE_FILE="infra/hetzner/docker-compose.crontech.yml"
CADDY_SRC="infra/hetzner/Caddyfile.crontech"

PUBLIC_API_VERSION_URL="https://api.crontech.ai/api/version"
PUBLIC_WEB_VERSION_URL="https://crontech.ai/api/version"

echo "=== Crontech Monorepo Deploy ==="
echo "  Repo:   $REPO_URL"
echo "  Branch: $BRANCH"
echo "  SHA:    $GIT_SHA"
echo "  Dir:    $APP_DIR"
echo ""

# ── 1. Preflight ────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "FAIL: $ENV_FILE not found. Populate secrets and retry." >&2
    exit 1
fi
if [ ! -d "$APP_DIR/.git" ]; then
    echo "FAIL: $APP_DIR missing. The workflow SSH step should clone it before calling this." >&2
    exit 1
fi

cd "$APP_DIR"
ACTUAL_SHA="$(git rev-parse HEAD)"
if [ "$ACTUAL_SHA" != "$GIT_SHA" ]; then
    echo "FAIL: checked-out SHA $ACTUAL_SHA != requested $GIT_SHA" >&2
    exit 1
fi

# ── 2. Tear down yesterday's bootstrap compose if it's running ──────
# setup.sh from yesterday placed a multi-app compose at /opt/crontech/
# docker-compose.yml that tries to bind 80/443 (via a second Caddy) and
# 25/587 (via emailed-mta). Its build contexts reference paths that
# don't exist in this monorepo layout, so it can't have fully started
# anyway — but `compose down` is safe and idempotent, and it frees any
# ports that are pinned by half-started containers.
if [ -f /opt/crontech/docker-compose.yml ]; then
    echo "[1/6] Tearing down legacy multi-app compose stack (if running)..."
    (cd /opt/crontech && docker compose down --remove-orphans 2>/dev/null || true)
else
    echo "[1/6] No legacy stack detected — skipping teardown."
fi

# ── 3. Build with GIT_SHA baked in ──────────────────────────────────
cd "$APP_DIR"
echo "[2/6] Building images with GIT_SHA=$GIT_SHA..."
export GIT_SHA
docker compose \
    -f "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" \
    build \
    --pull \
    --no-cache \
    --build-arg "GIT_SHA=$GIT_SHA" \
    crontech-web crontech-api

# ── 4. Roll containers ──────────────────────────────────────────────
echo "[3/6] Rolling containers..."
docker compose \
    -f "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" \
    up -d --remove-orphans

# ── 5. Wait for container healthcheck ───────────────────────────────
echo "[4/6] Waiting for containers to report 'healthy'..."
HEALTHY_ATTEMPTS=0
MAX_HEALTHY_ATTEMPTS=30   # 30 * 5s = 150s
while [ "$HEALTHY_ATTEMPTS" -lt "$MAX_HEALTHY_ATTEMPTS" ]; do
    WEB_STATUS="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --format json crontech-web 2>/dev/null | grep -o '"Health":"[^"]*"' | head -n1 | cut -d'"' -f4 || echo unknown)"
    API_STATUS="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --format json crontech-api 2>/dev/null | grep -o '"Health":"[^"]*"' | head -n1 | cut -d'"' -f4 || echo unknown)"
    echo "  web=$WEB_STATUS  api=$API_STATUS"
    if [ "$WEB_STATUS" = "healthy" ] && [ "$API_STATUS" = "healthy" ]; then
        break
    fi
    HEALTHY_ATTEMPTS=$((HEALTHY_ATTEMPTS + 1))
    sleep 5
done

if [ "$HEALTHY_ATTEMPTS" -ge "$MAX_HEALTHY_ATTEMPTS" ]; then
    echo "FAIL: containers did not reach 'healthy' within $((MAX_HEALTHY_ATTEMPTS * 5))s" >&2
    echo "--- crontech-web (last 80 lines) ---"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail 80 crontech-web || true
    echo "--- crontech-api (last 80 lines) ---"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail 80 crontech-api || true
    exit 1
fi

# ── 6. Hot-reload system Caddy with the repo's Caddyfile ────────────
# Yesterday's setup.sh installed Caddy as a systemd service reading
# /etc/caddy/Caddyfile — but that file is root-owned, so we can't write
# to it without sudo. Instead, we copy Caddyfile.crontech into an area
# the deploy user owns and tell the running Caddy to switch to it via
# its admin API on localhost:2019 (no sudo required).
#
# Caveat: if Caddy restarts via systemd, it reverts to /etc/caddy/Caddyfile
# (the stale config) until the next deploy reloads this one. The next
# merge-to-main automatically fixes that — acceptable for now.
echo "[5/6] Hot-reloading system Caddy..."
cp "$CADDY_SRC" "$CADDY_CONFIG"

if ! command -v caddy >/dev/null 2>&1; then
    echo "FAIL: system caddy not found in PATH. Did setup.sh run successfully?" >&2
    exit 1
fi

# `caddy reload` connects to the admin API (default localhost:2019) and
# swaps the running config atomically. If the admin API isn't reachable
# (e.g. Caddy not running), this fails fast with a clear error.
if ! caddy reload --config "$CADDY_CONFIG" --adapter caddyfile; then
    echo "FAIL: caddy reload failed. If system caddy isn't running, start it with:" >&2
    echo "  sudo systemctl start caddy" >&2
    exit 1
fi

# ── 7. End-to-end SHA smoke test (the cache-buster contract) ────────
echo "[6/6] Verifying /api/version reports $GIT_SHA..."

probe_sha() {
    local url="$1"
    local label="$2"
    local attempt=1
    local max_attempts=12   # 12 * 5s = 60s for TLS/caddy warm-up
    while [ "$attempt" -le "$max_attempts" ]; do
        # -k tolerates fresh-cert hiccups on first Caddy TLS rotation.
        local body
        body="$(curl -fsS -k --max-time 8 "$url" 2>/dev/null || echo '')"
        local reported_sha
        reported_sha="$(echo "$body" | grep -o '"sha":"[^"]*"' | head -n1 | cut -d'"' -f4 || echo '')"
        if [ "$reported_sha" = "$GIT_SHA" ]; then
            echo "  OK  $label -> $reported_sha"
            return 0
        fi
        echo "  ..  $label attempt $attempt/$max_attempts reported='$reported_sha' expected=$GIT_SHA"
        attempt=$((attempt + 1))
        sleep 5
    done
    echo "FAIL: $label never reported SHA $GIT_SHA" >&2
    return 1
}

probe_sha "$PUBLIC_API_VERSION_URL" "api.crontech.ai"
probe_sha "$PUBLIC_WEB_VERSION_URL" "crontech.ai"

echo ""
echo "SUCCESS: crontech.ai is live at $GIT_SHA"
echo ""
