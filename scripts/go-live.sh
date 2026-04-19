#!/usr/bin/env bash
# scripts/go-live.sh — Crontech Empire "one paste goes live" master script.
#
# Idempotent. Each phase short-circuits if already done. Run as root on Vultr box.
# Usage:
#   sudo bash scripts/go-live.sh              # full run
#   sudo bash scripts/go-live.sh --dry-run    # show what each phase would do
#
# Required env vars (set before running, script reports missing ones):
#   DATABASE_URL         — Postgres URL for gluecron (Phase 4)
#   CF_API_TOKEN         — Cloudflare token for DNS (Phase 3)
#   GLUECRON_TOKEN       — Gitea/Gluecron API token for mirroring (Phase 5)
#   HEALTH_CHECK_TOKEN   — optional bearer for /api/healthz/empire (Phase 6)
#
set -euo pipefail

# ---------- config ----------
REPO_DIR="${REPO_DIR:-/opt/crontech}"
REPO_URL="${REPO_URL:-https://github.com/ccantynz-alt/Crontech.git}"
REPO_BRANCH="${REPO_BRANCH:-Main}"
CRONTECH_URL="${CRONTECH_URL:-http://127.0.0.1}"
GLUECRON_LOCAL_URL="${GLUECRON_LOCAL_URL:-http://127.0.0.1:3002}"
GLUECRON_PUBLIC_URL="${GLUECRON_PUBLIC_URL:-https://gluecron.com}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1/api/healthz/empire}"
MIRROR_REPOS=("crontech" "gluecron.com" "gatetest")

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# ---------- colors ----------
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'
  C_BLU=$'\033[34m'; C_BLD=$'\033[1m'; C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YLW=""; C_BLU=""; C_BLD=""; C_RST=""
fi

# Phase status tracking: ok / fail / skip
declare -A PHASE_STATUS
PHASE_ORDER=(SANITY OUTAGE_FIX DNS GLUECRON MIRROR HEALTH)
for p in "${PHASE_ORDER[@]}"; do PHASE_STATUS[$p]="pending"; done

banner() {
  local n="$1" name="$2"
  echo
  echo "${C_BLD}${C_BLU}=== PHASE ${n}: ${name} ===${C_RST}"
}
ok()   { echo "${C_GRN}[OK]${C_RST}   $*"; }
warn() { echo "${C_YLW}[WARN]${C_RST} $*"; }
err()  { echo "${C_RED}[ERR]${C_RST}  $*" >&2; }
info() { echo "       $*"; }
run()  {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "${C_YLW}[dry-run]${C_RST} $*"
    return 0
  fi
  "$@"
}
redact() {
  # Redact token-looking substrings from stdin (for log hygiene).
  sed -E 's/(token|TOKEN|secret|SECRET|password|PASSWORD|key|KEY)=[^ ]+/\1=***REDACTED***/g'
}
have_script() { [[ -x "$1" ]] || [[ -f "$1" ]]; }

# ---------- PHASE 1: SANITY ----------
phase_sanity() {
  banner 1 SANITY
  if [[ "$DRY_RUN" -eq 0 && "$(id -u)" -ne 0 ]]; then
    err "must run as root (use sudo)"
    return 1
  fi
  ok "running as root (or dry-run)"

  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    if [[ "${ID:-}" != "ubuntu" ]]; then
      warn "OS is ${ID:-unknown}, expected ubuntu — continuing"
    else
      local major="${VERSION_ID%%.*}"
      if [[ "${major:-0}" -lt 22 ]]; then
        err "Ubuntu ${VERSION_ID} < 22.04"
        return 1
      fi
      ok "Ubuntu ${VERSION_ID} detected"
    fi
  else
    warn "/etc/os-release missing — cannot verify OS"
  fi

  if [[ ! -d "$REPO_DIR/.git" ]]; then
    warn "$REPO_DIR not a git repo — cloning"
    run mkdir -p "$(dirname "$REPO_DIR")"
    run git clone "$REPO_URL" "$REPO_DIR"
  else
    ok "$REPO_DIR exists"
  fi

  local required=(DATABASE_URL CF_API_TOKEN GLUECRON_TOKEN HEALTH_CHECK_TOKEN)
  local missing=()
  for v in "${required[@]}"; do
    if [[ -z "${!v:-}" ]]; then
      missing+=("$v")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    warn "missing env vars (dependent phases will skip): ${missing[*]}"
  else
    ok "all env vars set"
  fi
  return 0
}

# ---------- PHASE 2: OUTAGE FIX ----------
phase_outage_fix() {
  banner 2 OUTAGE_FIX
  run cd "$REPO_DIR"
  if [[ "$DRY_RUN" -eq 0 ]]; then cd "$REPO_DIR"; fi
  run git fetch --all --prune
  run git checkout "$REPO_BRANCH"
  run git pull --ff-only origin "$REPO_BRANCH"
  ok "repo on $REPO_BRANCH, up to date"

  local fix="$REPO_DIR/scripts/fix-website-access.sh"
  if have_script "$fix"; then
    run bash "$fix"
    ok "fix-website-access.sh ran"
  else
    warn "script $fix not found, skipping fix step"
  fi

  if [[ "$DRY_RUN" -eq 0 ]]; then
    local code
    code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$CRONTECH_URL" || echo 000)"
    if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
      ok "crontech.ai local smoke test: HTTP $code"
    else
      err "crontech.ai local smoke test failed: HTTP $code"
      return 1
    fi
  else
    info "[dry-run] would curl $CRONTECH_URL"
  fi
  return 0
}

# ---------- PHASE 3: DNS (optional) ----------
phase_dns() {
  banner 3 DNS
  if [[ -z "${CF_API_TOKEN:-}" ]]; then
    warn "CF_API_TOKEN unset — skipping DNS phase"
    PHASE_STATUS[DNS]="skip"; return 0
  fi
  local s="$REPO_DIR/scripts/add-dns-gluecron.sh"
  if ! have_script "$s"; then
    warn "script $s not found, skipping phase DNS"
    PHASE_STATUS[DNS]="skip"; return 0
  fi
  run bash "$s"
  ok "DNS script ran"
  return 0
}

# ---------- PHASE 4: GLUECRON BOOTSTRAP (optional) ----------
phase_gluecron() {
  banner 4 GLUECRON
  if [[ -z "${DATABASE_URL:-}" ]]; then
    warn "DATABASE_URL unset — skipping GLUECRON phase"
    PHASE_STATUS[GLUECRON]="skip"; return 0
  fi
  local s="$REPO_DIR/scripts/add-gluecron.sh"
  if ! have_script "$s"; then
    warn "script $s not found, skipping phase GLUECRON"
    PHASE_STATUS[GLUECRON]="skip"; return 0
  fi
  run bash "$s"

  if [[ "$DRY_RUN" -eq 0 ]]; then
    info "waiting up to 60s for $GLUECRON_LOCAL_URL ..."
    local i=0 code=000
    while (( i < 60 )); do
      code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 "$GLUECRON_LOCAL_URL" || echo 000)"
      [[ "$code" =~ ^(200|301|302|401|403)$ ]] && break
      sleep 1; i=$((i+1))
    done
    if [[ "$code" =~ ^(200|301|302|401|403)$ ]]; then
      ok "gluecron up locally (HTTP $code after ${i}s)"
    else
      err "gluecron did not respond on $GLUECRON_LOCAL_URL (last HTTP $code)"
      return 1
    fi
    if [[ -n "${CF_API_TOKEN:-}" ]]; then
      local pub
      pub="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$GLUECRON_PUBLIC_URL" || echo 000)"
      if [[ "$pub" =~ ^(200|301|302|401|403)$ ]]; then
        ok "gluecron.com public smoke test: HTTP $pub"
      else
        warn "gluecron.com public smoke test: HTTP $pub (DNS may still propagate)"
      fi
    fi
  else
    info "[dry-run] would poll $GLUECRON_LOCAL_URL for 60s"
  fi
  return 0
}

# ---------- PHASE 5: MIRROR REPOS ----------
phase_mirror() {
  banner 5 MIRROR
  if [[ -z "${GLUECRON_TOKEN:-}" ]]; then
    warn "GLUECRON_TOKEN unset — skipping MIRROR phase"
    PHASE_STATUS[MIRROR]="skip"; return 0
  fi
  local mirror="$REPO_DIR/scripts/mirror-to-gluecron.sh"
  local verify="$REPO_DIR/scripts/verify-gluecron-mirror.sh"
  if ! have_script "$mirror"; then
    warn "script $mirror not found, skipping phase MIRROR"
    PHASE_STATUS[MIRROR]="skip"; return 0
  fi
  local failed=0
  for r in "${MIRROR_REPOS[@]}"; do
    info "mirroring crontech/$r ..."
    if run env TARGET_REPO="crontech/$r" bash "$mirror"; then
      ok "mirror crontech/$r"
    else
      err "mirror crontech/$r failed"; failed=1
    fi
    if have_script "$verify"; then
      if run env TARGET_REPO="crontech/$r" bash "$verify"; then
        ok "verify crontech/$r"
      else
        err "verify crontech/$r failed"; failed=1
      fi
    else
      warn "verify script missing — skipping verify for $r"
    fi
  done
  return $failed
}

# ---------- PHASE 6: HEALTH REPORT ----------
phase_health() {
  banner 6 HEALTH
  local out="" code=000 hdr=()
  if [[ -n "${HEALTH_CHECK_TOKEN:-}" ]]; then
    hdr=(-H "Authorization: Bearer ${HEALTH_CHECK_TOKEN}")
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] would GET $HEALTH_URL"
    return 0
  fi
  out="$(curl -sk --max-time 15 "${hdr[@]}" -w '\n__CODE__%{http_code}' "$HEALTH_URL" || true)"
  code="$(printf '%s' "$out" | awk -F'__CODE__' 'NF>1{print $2}' | tail -n1)"
  local body; body="$(printf '%s' "$out" | sed 's/__CODE__.*$//')"
  echo "$body" | redact
  local worst="green"
  if [[ "$code" != "200" ]]; then
    err "healthz returned HTTP $code"
    worst="red"
  fi
  # crude parse: count red/yellow markers in JSON body
  local reds yellows
  reds=$(printf '%s' "$body" | grep -oEi '"status"[[:space:]]*:[[:space:]]*"(red|down|fail)"' | wc -l || true)
  yellows=$(printf '%s' "$body" | grep -oEi '"status"[[:space:]]*:[[:space:]]*"(yellow|degraded|warn)"' | wc -l || true)
  if (( reds > 0 )); then worst="red"
  elif (( yellows > 0 )) && [[ "$worst" != "red" ]]; then worst="yellow"; fi
  echo
  info "Public URLs to verify manually:"
  info "  https://crontech.ai"
  info "  https://gluecron.com"
  info "  $HEALTH_URL"
  case "$worst" in
    green)  ok "empire is GREEN"; return 0 ;;
    yellow) warn "empire is YELLOW"; return 2 ;;
    red)    err "empire is RED"; return 1 ;;
  esac
}

# ---------- runner ----------
run_phase() {
  local key="$1" fn="$2"
  if "$fn"; then
    # honor any skip already set inside the phase
    [[ "${PHASE_STATUS[$key]}" == "pending" ]] && PHASE_STATUS[$key]="ok"
  else
    local rc=$?
    if [[ "${PHASE_STATUS[$key]}" == "pending" ]]; then
      if (( rc == 2 )); then
        PHASE_STATUS[$key]="yellow"
      else
        PHASE_STATUS[$key]="fail"
      fi
    fi
    err "PHASE $key FAILED (rc=$rc) — continuing"
  fi
}

main() {
  echo "${C_BLD}Crontech go-live — $(date -u +%FT%TZ)${C_RST}"
  [[ "$DRY_RUN" -eq 1 ]] && warn "DRY-RUN MODE"

  run_phase SANITY     phase_sanity
  run_phase OUTAGE_FIX phase_outage_fix
  run_phase DNS        phase_dns
  run_phase GLUECRON   phase_gluecron
  run_phase MIRROR     phase_mirror
  run_phase HEALTH     phase_health

  echo
  echo "${C_BLD}=== SUMMARY ===${C_RST}"
  local any_fail=0 any_yellow=0
  for p in "${PHASE_ORDER[@]}"; do
    local s="${PHASE_STATUS[$p]}"
    case "$s" in
      ok)     printf "  %-12s ${C_GRN}%s${C_RST}\n" "$p" "OK" ;;
      skip)   printf "  %-12s ${C_YLW}%s${C_RST}\n" "$p" "SKIP" ;;
      yellow) printf "  %-12s ${C_YLW}%s${C_RST}\n" "$p" "YELLOW"; any_yellow=1 ;;
      fail)   printf "  %-12s ${C_RED}%s${C_RST}\n" "$p" "FAIL";   any_fail=1 ;;
      *)      printf "  %-12s %s\n" "$p" "$s" ;;
    esac
  done
  echo
  if (( any_fail )); then err "one or more phases failed"; exit 1; fi
  if (( any_yellow )); then warn "empire came up YELLOW"; exit 2; fi
  ok "empire is LIVE"
  exit 0
}

main "$@"
