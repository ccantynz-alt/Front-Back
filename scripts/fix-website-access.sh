#!/usr/bin/env bash
# === CRONTECH/GLUECRON OUTAGE FIX — 2026-04-19 ===
#
# Pulls the patched Caddyfile (drops broken HTTP/3, adds gluecron.com
# apex block) from branch claude/fix-website-access-6FKJN and reloads
# Caddy in place. No downtime. Idempotent — safe to run twice.
#
# One-line invocation (paste into vSerial):
#   curl -fsSL https://raw.githubusercontent.com/ccantynz-alt/Crontech/claude/fix-website-access-6FKJN/scripts/fix-website-access.sh | bash
#
set -euo pipefail

echo "================================================================"
echo " Crontech/Gluecron outage fix"
echo " Branch: claude/fix-website-access-6FKJN"
echo " Date:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "================================================================"

# 1. Find the crontech repo on the box (try common paths)
REPO=""
for p in /opt/crontech /root/crontech /srv/crontech /home/crontech/crontech /var/lib/crontech; do
  if [ -d "$p/.git" ]; then REPO="$p"; break; fi
done
if [ -z "$REPO" ]; then
  echo ""
  echo "ERROR: cannot find crontech repo. Searched:"
  echo "  /opt/crontech /root/crontech /srv/crontech"
  echo "  /home/crontech/crontech /var/lib/crontech"
  echo ""
  echo "Find it manually with:  find / -maxdepth 4 -name docker-compose.production.yml 2>/dev/null"
  echo "Then re-run this script after exporting REPO_PATH=/that/path"
  exit 1
fi
echo ""
echo ">>> Repo found: $REPO"
cd "$REPO"

# 2. Fetch and check out the fix branch
echo ">>> Fetching fix branch..."
git fetch origin claude/fix-website-access-6FKJN
git checkout claude/fix-website-access-6FKJN
git pull --ff-only origin claude/fix-website-access-6FKJN
echo ">>> On commit: $(git rev-parse --short HEAD) ($(git log -1 --pretty=%s))"

# 3. Reload Caddy (try docker compose, docker-compose, then systemd)
echo ""
echo ">>> Reloading Caddy with new config..."
RELOADED=0
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  if docker compose -f docker-compose.production.yml ps caddy 2>/dev/null | grep -q caddy; then
    docker compose -f docker-compose.production.yml exec -T caddy \
      caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile && RELOADED=1
  fi
fi
if [ "$RELOADED" -eq 0 ] && command -v docker-compose >/dev/null 2>&1; then
  if docker-compose -f docker-compose.production.yml ps caddy 2>/dev/null | grep -q caddy; then
    docker-compose -f docker-compose.production.yml exec -T caddy \
      caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile && RELOADED=1
  fi
fi
if [ "$RELOADED" -eq 0 ] && systemctl is-active --quiet caddy 2>/dev/null; then
  systemctl reload caddy && RELOADED=1
fi
if [ "$RELOADED" -eq 0 ]; then
  echo "ERROR: could not reload Caddy. Is it running? Try one of:"
  echo "  docker compose -f docker-compose.production.yml ps"
  echo "  systemctl status caddy"
  exit 1
fi
echo ">>> Caddy reloaded."

# 4. Local smoke tests (bypass DNS, hit Caddy directly)
echo ""
echo ">>> Smoke test crontech.ai (over HTTP/2 to localhost):"
curl -sS -o /dev/null -w "  status=%{http_code}  proto=%{http_version}  time=%{time_total}s\n" \
  --http2 -k -H "Host: crontech.ai" \
  --resolve crontech.ai:443:127.0.0.1 https://crontech.ai/ || true

echo ""
echo ">>> Smoke test gluecron.com (Caddy block exists; will be public-reachable after Cloudflare DNS):"
curl -sS -o /dev/null -w "  status=%{http_code}  proto=%{http_version}  time=%{time_total}s\n" \
  --http2 -k -H "Host: gluecron.com" \
  --resolve gluecron.com:443:127.0.0.1 https://gluecron.com/ || true

# 5. Final instructions
echo ""
echo "================================================================"
echo " DONE."
echo "================================================================"
echo ""
echo " 1. Open https://crontech.ai in Chrome (incognito tab to skip"
echo "    cached QUIC alt-svc). Should load — no more ERR_QUIC error."
echo ""
echo " 2. For gluecron.com to be reachable from the public internet,"
echo "    add this DNS record in Cloudflare (gluecron.com zone):"
echo "      Type: A"
echo "      Name: gluecron.com  (or @)"
echo "      Content: 45.76.171.37"
echo "      Proxy: DNS only (grey cloud)"
echo "      TTL: Auto"
echo "    Plus the same for 'www'."
echo ""
echo " 3. Once DNS propagates (1-5 min), open https://gluecron.com"
echo "    Caddy will auto-issue a Let's Encrypt cert on first hit."
echo ""
