#!/bin/bash
set -euo pipefail

# Deploy a single app to the Crontech platform
# Usage: deploy-app.sh <app-name> <git-repo-url> [branch]
#
# Called by GitHub Actions via SSH, or manually:
#   /opt/crontech/scripts/deploy-app.sh zoobicon https://github.com/crontech/zoobicon.git main

if [ "$#" -lt 2 ]; then
    echo "Usage: deploy-app.sh <app-name> <git-repo-url> [branch]"
    echo "  app-name:  crontech | zoobicon | emailed | gatetest | marcoreid"
    echo "  git-repo:  HTTPS clone URL"
    echo "  branch:    git branch (default: main)"
    exit 1
fi

APP_NAME="$1"
REPO_URL="$2"
BRANCH="${3:-main}"
APP_DIR="/opt/crontech/apps/$APP_NAME"
COMPOSE_DIR="/opt/crontech"

echo "=== Deploying $APP_NAME ==="
echo "  Repo:   $REPO_URL"
echo "  Branch: $BRANCH"
echo "  Dir:    $APP_DIR"
echo ""

# 1. Pull latest code
echo "[1/4] Fetching latest code..."
if [ -d "$APP_DIR/.git" ]; then
    cd "$APP_DIR"
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
else
    # Fresh clone -- preserve any existing Dockerfile
    DOCKERFILE_BAK=""
    if [ -f "$APP_DIR/Dockerfile" ]; then
        DOCKERFILE_BAK=$(mktemp)
        cp "$APP_DIR/Dockerfile" "$DOCKERFILE_BAK"
    fi

    rm -rf "$APP_DIR"
    git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"

    # Restore Dockerfile template if the repo doesn't have one
    if [ -n "$DOCKERFILE_BAK" ] && [ ! -f "$APP_DIR/Dockerfile" ]; then
        cp "$DOCKERFILE_BAK" "$APP_DIR/Dockerfile"
    fi
    [ -n "$DOCKERFILE_BAK" ] && rm -f "$DOCKERFILE_BAK"
fi

# 2. Build the container
echo "[2/4] Building container..."
cd "$COMPOSE_DIR"
docker compose build --no-cache "$APP_NAME"

# 3. Restart the container
echo "[3/4] Restarting container..."
docker compose up -d "$APP_NAME"

# 4. Health check
echo "[4/4] Running health check..."
sleep 5

if docker compose ps "$APP_NAME" | grep -q "Up"; then
    echo ""
    echo "SUCCESS: $APP_NAME deployed and running"
    echo ""
else
    echo ""
    echo "FAILED: $APP_NAME did not start correctly"
    echo ""
    echo "--- Last 50 log lines ---"
    docker compose logs --tail 50 "$APP_NAME"
    exit 1
fi
