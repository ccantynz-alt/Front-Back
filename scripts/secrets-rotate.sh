#!/usr/bin/env bash
# secrets-rotate.sh — rotate a single secret in /opt/crontech/.env.production.
#
# Backs up the current env file, generates a new value via openssl,
# rewrites the key in place, restarts affected services, and appends an
# audit entry (who / when / which key — NEVER the value) to
# /var/log/crontech-secrets-rotation.log.
#
# Usage:
#   sudo bash scripts/secrets-rotate.sh JWT_SECRET
set -euo pipefail

TARGET="/opt/crontech/.env.production"
LOG="/var/log/crontech-secrets-rotation.log"
SERVICES=(crontech-api crontech-web)

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <SECRET_NAME>" >&2
  exit 2
fi
KEY="$1"
if [[ ! "$KEY" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
  echo "ERROR: '$KEY' is not a valid env var name." >&2
  exit 2
fi
if [[ ! -f "$TARGET" ]]; then
  echo "ERROR: $TARGET not found. Run secrets-init.sh first." >&2
  exit 1
fi
if ! grep -qE "^${KEY}=" "$TARGET"; then
  echo "ERROR: key '$KEY' not present in $TARGET." >&2
  exit 1
fi

# Pick length based on key name. Passwords -> hex 24, everything else -> hex 32.
if [[ "$KEY" == *PASSWORD* ]]; then
  NEW_VALUE="$(openssl rand -hex 24)"
else
  NEW_VALUE="$(openssl rand -hex 32)"
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="${TARGET}.bak-${TS}"
cp -p "$TARGET" "$BACKUP"
chmod 600 "$BACKUP"

umask 077
TMP="$(mktemp "${TARGET}.tmp.XXXXXX")"
trap 'rm -f "$TMP"; unset NEW_VALUE' EXIT

# Rewrite only the matching key; leave everything else byte-identical.
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^${KEY}= ]]; then
    printf '%s=%s\n' "$KEY" "$NEW_VALUE" >>"$TMP"
  else
    printf '%s\n' "$line" >>"$TMP"
  fi
done <"$TARGET"

# Preserve original ownership / perms.
OWNER="$(stat -c '%u:%g' "$TARGET" 2>/dev/null || echo '')"
mv "$TMP" "$TARGET"
trap - EXIT
unset NEW_VALUE
chmod 600 "$TARGET"
[[ -n "$OWNER" ]] && chown "$OWNER" "$TARGET" || true

# Restart affected services. systemctl first, docker compose fallback.
RESTART_STATUS="restarted"
for svc in "${SERVICES[@]}"; do
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${svc}\.service"; then
    systemctl restart "$svc" || RESTART_STATUS="restart-failed:${svc}"
  elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -qx "$svc"; then
    docker restart "$svc" >/dev/null || RESTART_STATUS="restart-failed:${svc}"
  else
    RESTART_STATUS="restart-skipped:${svc}-not-found"
  fi
done

# Append audit line. Never log the value.
ACTOR="${SUDO_USER:-${USER:-unknown}}"
mkdir -p "$(dirname "$LOG")"
touch "$LOG" && chmod 640 "$LOG" || true
printf '%s\tactor=%s\tkey=%s\tbackup=%s\tservices=%s\tstatus=%s\n' \
  "$TS" "$ACTOR" "$KEY" "$BACKUP" "${SERVICES[*]}" "$RESTART_STATUS" >>"$LOG"

echo "OK: rotated $KEY. backup=$BACKUP services=$RESTART_STATUS log=$LOG"
