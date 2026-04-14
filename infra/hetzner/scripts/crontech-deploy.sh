#!/bin/bash
set -euo pipefail

# ── Crontech Monorepo Deploy ─────────────────────────────────────────
# Single-repo deploy for crontech.ai (web + api together). Called over
# SSH by .github/workflows/deploy.yml on every push to main. Replaces
# the old per-app deploy-app.sh for the crontech vertical.
#
# Why this script exists:
#   1. The old deploy-app.sh is per-app and uses /opt/crontech/docker-compose.yml,
#      but crontech.ai is a monorepo that ships web + api as one unit.
#   2. We need GIT_SHA propagated into the Docker build so /api/version
#      can confirm the *new* image is actually serving traffic — otherwise
#      caches or stale containers can make a "green" deploy lie about state.
#   3. We need a post-deploy smoke test that fails loudly if the container
#      came up but is still the old SHA.
#
# Usage:
#   crontech-deploy.sh <git-repo-url> <git-sha> [branch]
#
# Arguments:
#   git-repo-url — HTTPS clone URL (e.g. https://github.com/ccantynz-alt/crontech.git)
#   git-sha      — commit SHA to deploy (from ${{ github.sha }})
#   branch       — git ref (default: main)
#
# Required files on host:
#   /opt/crontech/.env — production secrets (NOT in git)
#
# Required binaries:
#   git, docker (with compose plugin), curl

if [ "$#" -lt 2 ]; then
    echo "Usage: crontech-deploy.sh <git-repo-url> <git-sha> [branch]" >&2
    exit 1
fi

REPO_URL="$1"
GIT_SHA="$2"
BRANCH="${3:-main}"

APP_DIR="/opt/crontech/apps/crontech"
ENV_FILE="/opt/crontech/.env"
COMPOSE_FILE="infra/hetzner/docker-compose.crontech.yml"

# Public probe URLs for post-deploy smoke. Use the in-container health
# first (localhost through the caddy network isn't addressable from here),
# then hit the public domain to verify Caddy + DNS are serving the new SHA.
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
    echo "FAIL: $ENV_FILE not found. Run setup.sh and populate secrets." >&2
    exit 1
fi

# ── 2. Sync source tree to the requested SHA ────────────────────────
echo "[1/5] Syncing repo to $GIT_SHA..."
if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR"
    git fetch --quiet origin "$BRANCH"
    git reset --quiet --hard "$GIT_SHA"
else
    mkdir -p "$(dirname "$APP_DIR")"
    rm -rf "$APP_DIR"
    git clone --quiet -b "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
    git reset --quiet --hard "$GIT_SHA"
fi

ACTUAL_SHA="$(git rev-parse HEAD)"
if [ "$ACTUAL_SHA" != "$GIT_SHA" ]; then
    echo "FAIL: checked-out SHA $ACTUAL_SHA != requested $GIT_SHA" >&2
    exit 1
fi

# ── 3. Build with GIT_SHA baked in ──────────────────────────────────
echo "[2/5] Building images with GIT_SHA=$GIT_SHA..."
export GIT_SHA
# --pull so we get base-image security updates on every deploy.
# --no-cache on the app layers guarantees the new SHA's source is included
# (caching can otherwise reuse a stale COPY layer if mtimes look unchanged).
docker compose \
    -f "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" \
    build \
    --pull \
    --no-cache \
    --build-arg "GIT_SHA=$GIT_SHA" \
    crontech-web crontech-api

# ── 4. Roll containers ──────────────────────────────────────────────
echo "[3/5] Rolling containers..."
docker compose \
    -f "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" \
    up -d --remove-orphans

# ── 5. Wait for health ──────────────────────────────────────────────
echo "[4/5] Waiting for containers to pass healthcheck..."
HEALTHY_ATTEMPTS=0
MAX_HEALTHY_ATTEMPTS=30   # 30 * 5s = 150s max wait
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

# ── 6. SHA smoke test (the cache-buster contract) ───────────────────
# If Caddy is still serving an old worker or the wrong image is up, the
# /api/version endpoints will return the wrong SHA. This is the real
# post-deploy check — "is the NEW build actually live?"
echo "[5/5] Verifying /api/version reports $GIT_SHA..."

probe_sha() {
    local url="$1"
    local label="$2"
    local attempt=1
    local max_attempts=12   # 12 * 5s = 60s for DNS/caddy warm-up
    while [ "$attempt" -le "$max_attempts" ]; do
        # -k tolerates any TLS hiccup during a fresh Caddy cert rotation;
        # the URL itself already enforces HTTPS via Caddy redirect.
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
