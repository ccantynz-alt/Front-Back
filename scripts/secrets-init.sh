#!/usr/bin/env bash
# secrets-init.sh — bootstrap /opt/crontech/.env.production from the template.
#
# Replaces CHANGE_ME / CHANGE_ME_STRONG_PASSWORD placeholders with freshly
# generated secrets. Never prints secret values to stdout. Idempotent —
# refuses to overwrite an existing .env.production unless --force is given.
#
# Usage:
#   bash scripts/secrets-init.sh [--force]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${REPO_ROOT}/.env.production.example"
TARGET="/opt/crontech/.env.production"
OWNER="deploy:deploy"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [[ ! -f "$TEMPLATE" ]]; then
  echo "ERROR: template not found at $TEMPLATE" >&2
  exit 1
fi

if [[ -e "$TARGET" && $FORCE -ne 1 ]]; then
  echo "ERROR: $TARGET already exists. Pass --force to overwrite (previous file will be backed up)." >&2
  exit 1
fi

if [[ -e "$TARGET" && $FORCE -eq 1 ]]; then
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$TARGET" "${TARGET}.bak-${ts}"
  chmod 600 "${TARGET}.bak-${ts}" || true
fi

mkdir -p "$(dirname "$TARGET")"
umask 077
TMP="$(mktemp "${TARGET}.tmp.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

# Rewrite each line. Preserve comments, blanks, and existing real values.
# Only swap placeholders. Passwords get hex-24, everything else hex-32.
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    raw_val="${BASH_REMATCH[2]}"
    # Strip inline comment + trailing whitespace for comparison only.
    val="${raw_val%%#*}"
    val="${val%"${val##*[![:space:]]}"}"
    if [[ "$val" == "CHANGE_ME_STRONG_PASSWORD" ]]; then
      new="$(openssl rand -hex 24)"
      printf '%s=%s\n' "$key" "$new" >>"$TMP"
    elif [[ "$val" == "CHANGE_ME" ]]; then
      new="$(openssl rand -hex 32)"
      printf '%s=%s\n' "$key" "$new" >>"$TMP"
    else
      printf '%s\n' "$line" >>"$TMP"
    fi
  else
    printf '%s\n' "$line" >>"$TMP"
  fi
done <"$TEMPLATE"

mv "$TMP" "$TARGET"
trap - EXIT
chmod 600 "$TARGET"
if id -u deploy >/dev/null 2>&1; then
  chown "$OWNER" "$TARGET"
else
  echo "WARN: user 'deploy' not found; leaving ownership as $(id -un):$(id -gn)." >&2
fi

echo "OK: wrote $TARGET (mode 600). Run scripts/secrets-verify.sh to confirm."
