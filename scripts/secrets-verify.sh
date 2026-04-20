#!/usr/bin/env bash
# secrets-verify.sh — sanity-check /opt/crontech/.env.production.
#
# Confirms each required key exists, is non-empty, and does not hold a
# placeholder (CHANGE_ME / CHANGE_ME_STRONG_PASSWORD). Prints a ✓/✗
# status table but NEVER the values. Exit 0 = all good, 1 = any issue.
# Suitable as a pre-deploy CI gate.
#
# Usage:
#   bash scripts/secrets-verify.sh [path-to-env]
set -euo pipefail

TARGET="${1:-/opt/crontech/.env.production}"
REQUIRED=(
  CRONTECH_DOMAIN
  ACME_EMAIL
  TURSO_DATABASE_URL
  TURSO_AUTH_TOKEN
  DATABASE_URL
  POSTGRES_USER
  POSTGRES_PASSWORD
  SESSION_SECRET
  JWT_SECRET
  EMAIL_FROM
)

if [[ ! -f "$TARGET" ]]; then
  echo "ERROR: $TARGET not found." >&2
  exit 1
fi

# Check file mode is 600.
MODE="$(stat -c '%a' "$TARGET" 2>/dev/null || echo '???')"
printf '%-28s %s\n' "FILE" "$TARGET"
printf '%-28s %s\n' "MODE" "$MODE"
printf '%s\n' "----------------------------------------"

fail=0
get_value() {
  # Prints the raw value for a key, or empty string if missing.
  local k="$1"
  awk -F= -v k="$k" '$1==k { sub(/^[^=]*=/,""); print; exit }' "$TARGET"
}

for key in "${REQUIRED[@]}"; do
  raw="$(get_value "$key" || true)"
  # Strip inline comment + surrounding whitespace for classification only.
  val="${raw%%#*}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ -z "$raw" ]] && ! grep -qE "^${key}=" "$TARGET"; then
    status="MISSING"; mark="x"; fail=1
  elif [[ -z "$val" ]]; then
    status="EMPTY"; mark="x"; fail=1
  elif [[ "$val" == "CHANGE_ME" || "$val" == "CHANGE_ME_STRONG_PASSWORD" || "$val" == *CHANGE_ME* ]]; then
    status="PLACEHOLDER"; mark="x"; fail=1
  else
    status="ok"; mark="v"
  fi
  printf '[%s] %-28s %s\n' "$mark" "$key" "$status"
done

if [[ "$MODE" != "600" ]]; then
  printf '[x] %-28s mode=%s (expected 600)\n' "FILE_PERMISSIONS" "$MODE"
  fail=1
fi

if [[ $fail -eq 0 ]]; then
  echo "ALL GOOD"
  exit 0
fi
echo "ISSUES FOUND — see above."
exit 1
