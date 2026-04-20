#!/usr/bin/env bash
#
# add-dns-gluecron.sh
#
# One-shot Cloudflare DNS automation for gluecron.com.
# Creates or updates the apex (gluecron.com) and www (www.gluecron.com) A records
# pointing at TARGET_IP. DNS only (grey cloud, proxied=false), TTL=Auto.
#
# Usage:
#   export CF_API_TOKEN=...   # Zone:DNS:Edit scoped token
#   export TARGET_IP=45.76.171.37  # optional, defaults to 45.76.171.37
#   bash scripts/add-dns-gluecron.sh
#
# Idempotent: re-running is safe. Never deletes records.

set -euo pipefail

# ----------------------------------------------------------------------------
# Config
# ----------------------------------------------------------------------------
ZONE_NAME="gluecron.com"
TARGET_IP="${TARGET_IP:-45.76.171.37}"
RECORDS=("gluecron.com" "www.gluecron.com")
CF_API="https://api.cloudflare.com/client/v4"

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
RED=$'\033[0;31m'
GRN=$'\033[0;32m'
YLW=$'\033[0;33m'
BLU=$'\033[0;34m'
BLD=$'\033[1m'
RST=$'\033[0m'

log()  { printf "%s[*]%s %s\n" "$BLU" "$RST" "$*"; }
ok()   { printf "%s[+]%s %s\n" "$GRN" "$RST" "$*"; }
warn() { printf "%s[!]%s %s\n" "$YLW" "$RST" "$*" >&2; }
die()  { printf "%s[x]%s %s\n" "$RED" "$RST" "$*" >&2; exit 1; }

# Redact the token anywhere it appears in stderr/stdout passed through here.
redact() {
  if [[ -n "${CF_API_TOKEN:-}" ]]; then
    sed "s|${CF_API_TOKEN}|***REDACTED***|g"
  else
    cat
  fi
}

# ----------------------------------------------------------------------------
# Preflight
# ----------------------------------------------------------------------------
if [[ -z "${CF_API_TOKEN:-}" ]]; then
  die "CF_API_TOKEN is not set. Export a Cloudflare API token with Zone:DNS:Edit scoped to ${ZONE_NAME}."
fi

# Ensure curl is available.
if ! command -v curl >/dev/null 2>&1; then
  die "curl is required but not installed. Install with: sudo apt-get install -y curl"
fi

# Ensure jq is available, try to install via apt-get if missing (Debian/Ubuntu).
if ! command -v jq >/dev/null 2>&1; then
  warn "jq not found. Attempting to install..."
  if command -v apt-get >/dev/null 2>&1; then
    if [[ $EUID -eq 0 ]]; then
      apt-get update -y && apt-get install -y jq
    else
      sudo apt-get update -y && sudo apt-get install -y jq
    fi
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y jq
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y jq
  elif command -v apk >/dev/null 2>&1; then
    sudo apk add --no-cache jq
  elif command -v brew >/dev/null 2>&1; then
    brew install jq
  else
    die "jq is required but not installed and no known package manager detected. Install jq manually and re-run."
  fi
  command -v jq >/dev/null 2>&1 || die "jq install failed. Install jq manually and re-run."
fi

# Basic IPv4 sanity check on TARGET_IP.
if ! [[ "$TARGET_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  die "TARGET_IP '$TARGET_IP' is not a valid IPv4 address."
fi

# ----------------------------------------------------------------------------
# CF API wrapper
# ----------------------------------------------------------------------------
cf() {
  # cf <METHOD> <PATH> [DATA_JSON]
  local method="$1"; shift
  local path="$1"; shift
  local data="${1:-}"
  local url="${CF_API}${path}"
  local -a args=(
    -sS
    --fail-with-body
    -X "$method"
    -H "Authorization: Bearer ${CF_API_TOKEN}"
    -H "Content-Type: application/json"
  )
  if [[ -n "$data" ]]; then
    args+=(--data "$data")
  fi
  curl "${args[@]}" "$url" 2> >(redact >&2)
}

# ----------------------------------------------------------------------------
# Step 1: verify token
# ----------------------------------------------------------------------------
log "Verifying Cloudflare API token..."
TOKEN_RESP="$(cf GET "/user/tokens/verify" || true)"
if [[ -z "$TOKEN_RESP" ]] || [[ "$(jq -r '.success // false' <<<"$TOKEN_RESP")" != "true" ]]; then
  echo "$TOKEN_RESP" | redact >&2 || true
  die "CF API token verification failed. Create a token at https://dash.cloudflare.com/profile/api-tokens with template 'Edit zone DNS' scoped to ${ZONE_NAME}."
fi
ok "Token valid."

# ----------------------------------------------------------------------------
# Step 2: find the zone
# ----------------------------------------------------------------------------
log "Looking up zone id for ${ZONE_NAME}..."
ZONE_RESP="$(cf GET "/zones?name=${ZONE_NAME}")"
ZONE_COUNT="$(jq -r '.result | length' <<<"$ZONE_RESP")"
if [[ "$ZONE_COUNT" == "0" ]]; then
  warn "Zone ${ZONE_NAME} not found on this Cloudflare account."
  cat >&2 <<EOF

  Next steps (must be done once, manually):

    1. Add ${ZONE_NAME} to Cloudflare:
       https://dash.cloudflare.com/?to=/:account/add-site
    2. Copy the two Cloudflare nameservers shown after adding the zone.
    3. At the domain registrar for ${ZONE_NAME}, replace the NS records
       with the two Cloudflare nameservers from step 2.
    4. Wait for the zone to become "Active" in Cloudflare, then re-run
       this script.

EOF
  die "Aborting: add the zone to Cloudflare first, then re-run."
fi
ZONE_ID="$(jq -r '.result[0].id' <<<"$ZONE_RESP")"
ZONE_STATUS="$(jq -r '.result[0].status' <<<"$ZONE_RESP")"
ok "Zone ${ZONE_NAME} -> ${ZONE_ID} (status: ${ZONE_STATUS})"
if [[ "$ZONE_STATUS" != "active" ]]; then
  warn "Zone is not yet 'active' (currently '${ZONE_STATUS}'). Records can still be created; they will serve once NS delegation completes."
fi

# ----------------------------------------------------------------------------
# Step 3: upsert each record
# ----------------------------------------------------------------------------
upsert_record() {
  local name="$1"
  log "Processing A record: ${name} -> ${TARGET_IP}"

  local existing_resp
  existing_resp="$(cf GET "/zones/${ZONE_ID}/dns_records?type=A&name=${name}")"
  local count
  count="$(jq -r '.result | length' <<<"$existing_resp")"

  local payload
  payload="$(jq -n \
    --arg type "A" \
    --arg name "$name" \
    --arg content "$TARGET_IP" \
    --argjson ttl 1 \
    --argjson proxied false \
    '{type:$type, name:$name, content:$content, ttl:$ttl, proxied:$proxied}')"

  if [[ "$count" == "0" ]]; then
    log "  no existing A record, creating..."
    local create_resp
    create_resp="$(cf POST "/zones/${ZONE_ID}/dns_records" "$payload")"
    if [[ "$(jq -r '.success' <<<"$create_resp")" != "true" ]]; then
      echo "$create_resp" | redact >&2
      die "Failed to create A record for ${name}."
    fi
    ok "  created: $(jq -r '.result.id' <<<"$create_resp")"
  else
    local rec_id current_ip current_proxied
    rec_id="$(jq -r '.result[0].id' <<<"$existing_resp")"
    current_ip="$(jq -r '.result[0].content' <<<"$existing_resp")"
    current_proxied="$(jq -r '.result[0].proxied' <<<"$existing_resp")"
    if [[ "$current_ip" == "$TARGET_IP" && "$current_proxied" == "false" ]]; then
      ok "  already set (${current_ip}, proxied=false) -> skipping"
      return 0
    fi
    log "  existing record differs (content=${current_ip}, proxied=${current_proxied}); patching..."
    local patch_resp
    patch_resp="$(cf PATCH "/zones/${ZONE_ID}/dns_records/${rec_id}" "$payload")"
    if [[ "$(jq -r '.success' <<<"$patch_resp")" != "true" ]]; then
      echo "$patch_resp" | redact >&2
      die "Failed to update A record for ${name}."
    fi
    ok "  updated: ${rec_id}"
  fi
}

for r in "${RECORDS[@]}"; do
  upsert_record "$r"
done

# ----------------------------------------------------------------------------
# Step 4: verify
# ----------------------------------------------------------------------------
log "Verifying records by re-reading from Cloudflare..."
declare -a SUMMARY=()
ALL_OK=1
for name in "${RECORDS[@]}"; do
  verify_resp="$(cf GET "/zones/${ZONE_ID}/dns_records?type=A&name=${name}")"
  vcount="$(jq -r '.result | length' <<<"$verify_resp")"
  if [[ "$vcount" == "0" ]]; then
    warn "verify: ${name} -> not found"
    ALL_OK=0
    SUMMARY+=("${name} MISSING")
    continue
  fi
  vip="$(jq -r '.result[0].content' <<<"$verify_resp")"
  vprox="$(jq -r '.result[0].proxied' <<<"$verify_resp")"
  vttl="$(jq -r '.result[0].ttl' <<<"$verify_resp")"
  if [[ "$vip" == "$TARGET_IP" && "$vprox" == "false" ]]; then
    ok "verify: ${name} -> ${vip} (proxied=${vprox}, ttl=${vttl})"
    SUMMARY+=("${name} -> ${vip} (DNS only)")
  else
    warn "verify: ${name} -> ${vip} (proxied=${vprox}) — MISMATCH, expected ${TARGET_IP} proxied=false"
    ALL_OK=0
    SUMMARY+=("${name} MISMATCH (${vip}, proxied=${vprox})")
  fi
done

# ----------------------------------------------------------------------------
# Banner
# ----------------------------------------------------------------------------
echo
if [[ "$ALL_OK" == "1" ]]; then
  printf "%s================================================================%s\n" "$GRN" "$RST"
  printf "%s  SUCCESS: gluecron.com DNS records are set.%s\n" "${BLD}${GRN}" "$RST"
  printf "%s================================================================%s\n" "$GRN" "$RST"
  for line in "${SUMMARY[@]}"; do
    printf "  %s\n" "$line"
  done
  echo
  printf "  Propagation: 1-5 minutes typically (Cloudflare Auto TTL).\n"
  printf "  Check with:  dig +short gluecron.com @1.1.1.1\n"
  printf "               dig +short www.gluecron.com @1.1.1.1\n"
  echo
  exit 0
else
  printf "%s================================================================%s\n" "$RED" "$RST"
  printf "%s  PARTIAL: some records did not verify. See above.%s\n" "${BLD}${RED}" "$RST"
  printf "%s================================================================%s\n" "$RED" "$RST"
  for line in "${SUMMARY[@]}"; do
    printf "  %s\n" "$line"
  done
  echo
  exit 2
fi
