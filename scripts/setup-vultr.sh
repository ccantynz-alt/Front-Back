#!/usr/bin/env bash
# setup-vultr.sh — first-time setup on a fresh Vultr server
# Run as root: bash setup-vultr.sh
set -euo pipefail

echo "==> Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export PATH="/root/.bun/bin:$PATH"

echo "==> Installing Caddy..."
apt-get update -qq
apt-get install -y caddy

echo "==> Cloning Crontech..."
mkdir -p /opt/crontech
git clone https://github.com/ccantynz-alt/Crontech /opt/crontech
cd /opt/crontech

echo "==> Installing dependencies..."
bun install

echo "==> Building API..."
cd apps/api && bun run build && cd ../..

echo "==> Building Web..."
cd apps/web && bun run build && cd ../..

echo "==> Installing systemd services..."
cp infra/systemd/crontech-api.service /etc/systemd/system/
cp infra/systemd/crontech-web.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable crontech-api crontech-web

echo "==> Installing Caddy config..."
mkdir -p /var/log/caddy
cp infra/caddy/Caddyfile /etc/caddy/Caddyfile
systemctl enable caddy

echo ""
echo "=============================================="
echo " SETUP COMPLETE"
echo "=============================================="
echo ""
echo " Next steps:"
echo "  1. Create /opt/crontech/.env with your env vars"
echo "     (see .env.example for the full list)"
echo "  2. Point crontech.ai DNS A record to this server IP"
echo "  3. Run:"
echo "       systemctl start crontech-api"
echo "       systemctl start crontech-web"
echo "       systemctl restart caddy"
echo ""
echo " Check logs with: journalctl -u crontech-api -f"
echo "                  journalctl -u crontech-web -f"
