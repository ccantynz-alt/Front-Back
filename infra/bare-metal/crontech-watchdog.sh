#!/bin/bash
# crontech-watchdog.sh — Auto-healing health monitor
#
# Runs via systemd timer every 2 minutes (see crontech-watchdog.timer).
# Checks each service and HTTP endpoint; restarts if unhealthy.
# Logs to /var/log/crontech-watchdog.log (rotated by logrotate).
#
# Install:
#   cp infra/bare-metal/crontech-watchdog.sh /opt/crontech/scripts/watchdog.sh
#   chmod +x /opt/crontech/scripts/watchdog.sh
#   cp infra/bare-metal/crontech-watchdog.service /etc/systemd/system/
#   cp infra/bare-metal/crontech-watchdog.timer   /etc/systemd/system/
#   systemctl daemon-reload
#   systemctl enable --now crontech-watchdog.timer

set -euo pipefail

LOG="/var/log/crontech-watchdog.log"
MAX_LOG_BYTES=5242880  # 5 MB — rotate inline so we don't need logrotate config
SERVICES=("crontech-api" "crontech-web" "crontech-deploy-agent")
API_HEALTH="http://localhost:3001/health"
WEB_HEALTH="http://localhost:3000/"

# ── Logging ──────────────────────────────────────────────────────────
ts() { date '+%Y-%m-%dT%H:%M:%S'; }
log() { echo "[$(ts())] $*" >> "$LOG"; }

# Rotate log if over 5 MB
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt "$MAX_LOG_BYTES" ]; then
  mv "$LOG" "${LOG}.1" && touch "$LOG"
fi

log "=== watchdog tick ==="

# ── Service checks ───────────────────────────────────────────────────
for SVC in "${SERVICES[@]}"; do
  if ! systemctl is-active --quiet "$SVC" 2>/dev/null; then
    log "WARN: $SVC is not active — restarting"
    if systemctl restart "$SVC" 2>/dev/null; then
      log "OK: $SVC restarted successfully"
    else
      log "ERROR: $SVC failed to restart"
    fi
  else
    log "OK: $SVC active"
  fi
done

# Give services a moment to come up before HTTP checks
sleep 3

# ── HTTP health checks ───────────────────────────────────────────────

# API health
API_STATUS=$(curl -sf --max-time 5 "$API_HEALTH" 2>/dev/null | grep -o '"status":"ok"' || echo "fail")
if [ "$API_STATUS" != '"status":"ok"' ]; then
  log "WARN: API health check failed ($API_HEALTH) — restarting crontech-api"
  systemctl restart crontech-api 2>/dev/null && log "OK: crontech-api restarted" || log "ERROR: crontech-api restart failed"
else
  log "OK: API health $API_HEALTH"
fi

# Web health (just check it returns 200)
WEB_STATUS=$(curl -sf --max-time 5 -o /dev/null -w "%{http_code}" "$WEB_HEALTH" 2>/dev/null || echo "000")
if [ "$WEB_STATUS" != "200" ]; then
  log "WARN: Web health check failed (HTTP $WEB_STATUS at $WEB_HEALTH) — restarting crontech-web"
  systemctl restart crontech-web 2>/dev/null && log "OK: crontech-web restarted" || log "ERROR: crontech-web restart failed"
else
  log "OK: Web health HTTP $WEB_STATUS"
fi

# ── Caddy check ──────────────────────────────────────────────────────
if ! systemctl is-active --quiet caddy; then
  log "WARN: caddy is not active — restarting"
  systemctl restart caddy && log "OK: caddy restarted" || log "ERROR: caddy restart failed"
else
  log "OK: caddy active"
fi

log "=== watchdog tick complete ==="
