#!/usr/bin/env bash
# scripts/empire-health.sh — curl wrapper for GET /api/healthz/empire
#
# Fetches the empire-wide health probe, pretty-prints each component with
# red/green colour codes, and exits non-zero when anything is unhealthy.
# Designed to be dropped into a crontab for alerting; stderr carries any
# diagnostic noise and stdout stays clean for log scrapers.
#
# Env:
#   EMPIRE_HEALTH_URL    Full URL to the endpoint
#                        (default: https://api.crontech.ai/api/healthz/empire)
#   HEALTH_CHECK_TOKEN   Bearer token (required)
#   EMPIRE_HEALTH_TIMEOUT curl --max-time in seconds (default: 20)
#
# Exit codes:
#   0  — all components ok
#   1  — usage error (missing token, bad curl)
#   2  — endpoint responded but something is unhealthy (ok=false)
#   3  — HTTP non-2xx from the endpoint (includes 503)

set -euo pipefail

URL="${EMPIRE_HEALTH_URL:-https://api.crontech.ai/api/healthz/empire}"
TIMEOUT="${EMPIRE_HEALTH_TIMEOUT:-20}"

# ── Colours (only when stdout is a TTY) ─────────────────────────────
if [ -t 1 ]; then
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[1;33m'
  CYAN=$'\033[0;36m'
  BOLD=$'\033[1m'
  NC=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; CYAN=""; BOLD=""; NC=""
fi

die() { echo "empire-health: $*" >&2; exit 1; }

# ── Pre-flight ─────────────────────────────────────────────────────
if [ -z "${HEALTH_CHECK_TOKEN:-}" ]; then
  die "HEALTH_CHECK_TOKEN is not set"
fi

command -v curl >/dev/null 2>&1 || die "curl not installed"
# jq is optional — we degrade to raw JSON if it isn't present.
HAS_JQ=0
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=1
fi

# ── Fetch ──────────────────────────────────────────────────────────
#
# We deliberately separate the HTTP status (last line) from the body so we
# can branch on 503 vs 200 without re-parsing JSON. Token is passed via
# `@-` to curl's -H so it never appears in the process list.
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

HTTP_STATUS=$(curl \
  --silent \
  --show-error \
  --max-time "$TIMEOUT" \
  --output "$TMP" \
  --write-out "%{http_code}" \
  --header "Authorization: Bearer ${HEALTH_CHECK_TOKEN}" \
  --header "Accept: application/json" \
  "$URL" \
) || die "curl failed for $URL"

BODY=$(cat "$TMP")

# ── Render ─────────────────────────────────────────────────────────
render_component() {
  # $1 = component name
  # $2 = ok boolean (true/false)
  # $3 = detail string (latency / url / days_left / pct / error)
  local name="$1" ok="$2" detail="$3" label
  if [ "$ok" = "true" ]; then
    label="${GREEN}[  OK  ]${NC}"
  else
    label="${RED}[ FAIL ]${NC}"
  fi
  printf "  %b %-18s %s\n" "$label" "$name" "$detail"
}

echo "${BOLD}Crontech empire health${NC}  ${CYAN}${URL}${NC}"
echo

if [ "$HTTP_STATUS" = "401" ]; then
  echo "${RED}401 Unauthorized${NC} — check HEALTH_CHECK_TOKEN." >&2
  exit 3
fi

if [ "$HAS_JQ" -eq 0 ]; then
  # Fallback: raw dump + status-code based exit code.
  echo "$BODY"
  case "$HTTP_STATUS" in
    200) exit 0 ;;
    503) exit 2 ;;
    *)   exit 3 ;;
  esac
fi

OK_TOP=$(echo "$BODY" | jq -r '.ok // false')
TS=$(echo "$BODY" | jq -r '.timestamp // "-"')

echo "  timestamp: $TS"
echo "  overall:   $([ "$OK_TOP" = "true" ] \
  && echo "${GREEN}ok${NC}" \
  || echo "${RED}FAIL${NC}") (HTTP $HTTP_STATUS)"
echo

# Component-specific detail formatters. Each pulls the fields relevant to
# that component so the operator can eyeball latency / expiry / disk %
# without scrolling a raw JSON blob.
pg_detail=$(echo "$BODY" | jq -r '
  .components.postgres as $c
  | if $c.ok then "latency \($c.latency_ms)ms" else "error \($c.error // "down")" end
')
gc_detail=$(echo "$BODY" | jq -r '
  .components.gluecron as $c
  | "\($c.url // "-") — " + (if $c.ok then "\($c.latency_ms)ms" else "error \($c.error // "down")" end)
')
gt_detail=$(echo "$BODY" | jq -r '
  .components.gatetest as $c
  | "\($c.url // "-") — " + (if $c.ok then "\($c.latency_ms)ms" else "error \($c.error // "down")" end)
')
cc_detail=$(echo "$BODY" | jq -r '
  .components.caddy_cert as $c
  | if $c.ok then
      "expires \($c.expires // "?"), \($c.days_left // "?") days left" +
      (if $c.warn then " (warn)" else "" end)
    else
      "error \($c.error // "unknown")"
    end
')
df_detail=$(echo "$BODY" | jq -r '
  .components.disk_free_pct as $c
  | if $c.ok then
      "\($c.value // "?")% free" +
      (if $c.warn then " (warn)" else "" end)
    else
      "error \($c.error // "unknown")"
    end
')

render_component "postgres"      "$(echo "$BODY" | jq -r '.components.postgres.ok')"      "$pg_detail"
render_component "gluecron"      "$(echo "$BODY" | jq -r '.components.gluecron.ok')"      "$gc_detail"
render_component "gatetest"      "$(echo "$BODY" | jq -r '.components.gatetest.ok')"      "$gt_detail"
render_component "caddy_cert"    "$(echo "$BODY" | jq -r '.components.caddy_cert.ok')"    "$cc_detail"
render_component "disk_free_pct" "$(echo "$BODY" | jq -r '.components.disk_free_pct.ok')" "$df_detail"

echo

# ── Warnings ───────────────────────────────────────────────────────
CERT_WARN=$(echo "$BODY" | jq -r '.components.caddy_cert.warn // false')
DISK_WARN=$(echo "$BODY" | jq -r '.components.disk_free_pct.warn // false')
if [ "$CERT_WARN" = "true" ]; then
  echo "${YELLOW}WARN${NC}: Caddy cert expires soon — renew before the window closes."
fi
if [ "$DISK_WARN" = "true" ]; then
  echo "${YELLOW}WARN${NC}: disk free % is below the 15% warn threshold."
fi

# ── Exit ───────────────────────────────────────────────────────────
# 503 from the endpoint means a CRITICAL component is down — exit 2 so
# cron mailers can distinguish "unhealthy" from "couldn't even reach the
# server" (which returns 3 above).
case "$HTTP_STATUS" in
  200)
    if [ "$OK_TOP" = "true" ]; then exit 0; else exit 2; fi
    ;;
  503)
    exit 2
    ;;
  *)
    exit 3
    ;;
esac
