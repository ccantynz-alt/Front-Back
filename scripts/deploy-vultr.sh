#!/usr/bin/env bash
# deploy-vultr.sh — run on the Vultr server to deploy/update Crontech
# Usage: bash /opt/crontech/scripts/deploy-vultr.sh
set -euo pipefail

REPO_DIR="/opt/crontech"
BUN="/root/.bun/bin/bun"

echo "==> Pulling latest code..."
cd "$REPO_DIR"
git fetch origin
git checkout main
git pull origin main

echo "==> Installing dependencies..."
$BUN install

echo "==> Building API..."
cd "$REPO_DIR/apps/api"
$BUN run build

echo "==> Building Web..."
cd "$REPO_DIR/apps/web"
$BUN run build

echo "==> Restarting services..."
systemctl restart crontech-api
systemctl restart crontech-web

echo "==> Done! Checking status..."
systemctl status crontech-api --no-pager -l
systemctl status crontech-web --no-pager -l

echo ""
echo "Crontech is live at https://crontech.ai"
