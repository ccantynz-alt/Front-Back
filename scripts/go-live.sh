#!/usr/bin/env bash
# scripts/go-live.sh — Crontech Empire "one paste goes live" master script.
#
# BARE-METAL. The stack is systemd, NOT docker:
#   - Caddy is the apt package (systemctl restart caddy; admin API off)
#   - crontech-web / crontech-api are systemd services running from /opt/crontech
#   - Postgres is local systemd
#   - Build is bun install + bun run build; libsql native binary must be added
#
# Idempotent. Each phase short-circuits if already done. Run as root on the box.
# Usage:
#   sudo -E bash scripts/go-live.sh              # full run
#   sudo -E bash scripts/go-live.sh --dry-run    # show what each phase would do
#
# Env vars (all optional — phases auto-skip if unset):
#   CF_API_TOKEN         — Cloudflare token for DNS (Phase 6)
#   GLUECRON_TOKEN       — Gitea/Gluecron API token for mirroring (Phase 7)
#   HEALTH_CHECK_TOKEN   — optional bearer for /api/healthz/empire (Phase 8)
#
set -euo pipefail

# ---------- config ----------
REPO_DIR="${REPO_DIR:-/opt/crontech}"
REPO_URL="${REPO_URL:-https://github.com/ccantynz-alt/Crontech.git}"
REPO_BRANCH="${REPO_BRANCH:-Main}"
CADDY_SRC="${CADDY_SRC:-$REPO_DIR/infra/caddy/Caddyfile}"
CADDY_DST="${CADDY_DST:-/etc/caddy/Caddyfile}"
CADDY_LOG_DIR="${CADDY_LOG_DIR:-/var/log/caddy}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"
API_URL="${API_URL:-http://127.0.0.1:3001}"
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

# Phase status tracking: ok / fail / skip / yellow
declare -A PHASE_STATUS
PHASE_ORDER=(SANITY OUTAGE_FIX CADDY SERVICES GLUECRON DNS MIRROR HEALTH)
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
  sed -E 's/(token|TOKEN|secret|SECRET|password|PASSWORD|key|KEY)=[^ ]+/\1=***REDACTED***/g'
}
have_script() { [[ -x "$1" ]] || [[ -f "$1" ]]; }
svc_active()  { systemctl is-active --quiet "$1"; }
http_code()   { curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$1" || echo 000; }

# ---------- PHASE 1: SANITY ----------
phase_sanity() {
  banner 1 SANITY
  if [[ "$DRY_RUN" -eq 0 && "$(id -u)" -ne 0 ]]; then
    err "must run as root (use sudo -E)"
    return 1
  fi
  ok "running as root (or dry-run)"

  local missing_bins=()
  for b in bun git caddy systemctl curl; do
    if ! command -v "$b" >/dev/null 2>&1; then missing_bins+=("$b"); fi
  done
  if (( ${#missing_bins[@]} > 0 )); then
    err "missing required binaries: ${missing_bins[*]}"
    info "install: apt install -y caddy git curl; curl -fsSL https://bun.sh/install | bash"
    return 1
  fi
  ok "required binaries present: bun git caddy systemctl curl"

  if [[ ! -d "$REPO_DIR/.git" ]]; then
    warn "$REPO_DIR not a git repo — cloning"
    run mkdir -p "$(dirname "$REPO_DIR")"
    run git clone "$REPO_URL" "$REPO_DIR"
  else
    ok "$REPO_DIR present"
  fi

  if svc_active postgresql; then
    ok "postgresql systemd unit active"
  else
    err "postgresql not active — start it: systemctl start postgresql"
    return 1
  fi

  local optional=(CF_API_TOKEN GLUECRON_TOKEN HEALTH_CHECK_TOKEN)
  local unset_vars=()
  for v in "${optional[@]}"; do
    [[ -z "${!v:-}" ]] && unset_vars+=("$v")
  done
  if (( ${#unset_vars[@]} > 0 )); then
    warn "optional env unset (dependent phases will skip): ${unset_vars[*]}"
  else
    ok "all optional env vars set"
  fi
  return 0
}

# ---------- PHASE 2: OUTAGE FIX (build + libsql + caddy log dir) ----------
phase_outage_fix() {
  banner 2 OUTAGE_FIX
  if [[ "$DRY_RUN" -eq 0 ]]; then cd "$REPO_DIR"; fi
  run git fetch --all --prune
  run git checkout "$REPO_BRANCH"
  run git pull --ff-only origin "$REPO_BRANCH"
  ok "repo on $REPO_BRANCH, up to date"

  info "installing deps: bun install"
  run bash -c "cd '$REPO_DIR' && bun install"

  info "building: bun run build (produces dist/; without this vinxi is missing)"
  run bash -c "cd '$REPO_DIR' && bun run build"

  if [[ -d "$REPO_DIR/apps/api" ]]; then
    info "adding libsql linux native binary (apps/api)"
    run bash -c "cd '$REPO_DIR/apps/api' && bun add @libsql/linux-x64-gnu"
  else
    warn "$REPO_DIR/apps/api not present — skipping libsql native add"
  fi

  if [[ ! -d "$CADDY_LOG_DIR" ]]; then
    info "creating $CADDY_LOG_DIR"
    run mkdir -p "$CADDY_LOG_DIR"
  fi
  info "chown $CADDY_LOG_DIR to caddy:caddy (else caddy fails to start)"
  run chown -R caddy:caddy "$CADDY_LOG_DIR"
  ok "build + libsql + caddy log dir ready"
  return 0
}

# ---------- PHASE 3: CADDY ----------
phase_caddy() {
  banner 3 CADDY
  if [[ ! -f "$CADDY_SRC" ]]; then
    err "Caddyfile source missing: $CADDY_SRC"
    return 1
  fi
  info "installing Caddyfile: $CADDY_SRC -> $CADDY_DST"
  run install -m 0644 "$CADDY_SRC" "$CADDY_DST"

  if [[ "$DRY_RUN" -eq 0 ]]; then
    if caddy validate --config "$CADDY_DST" >/dev/null 2>&1; then
      ok "caddy validate passed"
    else
      warn "caddy validate reported issues (continuing)"
    fi
  fi

  info "systemctl restart caddy (NOT reload — admin API is off on this box)"
  run systemctl restart caddy

  if [[ "$DRY_RUN" -eq 0 ]]; then
    sleep 1
    if svc_active caddy; then
      ok "caddy is active (running)"
    else
      err "caddy failed to start — journalctl -u caddy -n 50"
      return 1
    fi
  fi
  return 0
}

# ---------- PHASE 4: SERVICES (crontech-web + crontech-api) ----------
phase_services() {
  banner 4 SERVICES
  info "systemctl restart crontech-web crontech-api"
  run systemctl restart crontech-web crontech-api

  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] would verify both services active and curl $WEB_URL / $API_URL"
    return 0
  fi

  sleep 2
  local failed=0
  for svc in crontech-web crontech-api; do
    if svc_active "$svc"; then
      ok "$svc is active"
    else
      err "$svc NOT active — journalctl -u $svc -n 100"
      failed=1
    fi
  done

  local wc ac
  wc="$(http_code "$WEB_URL")"
  ac="$(http_code "$API_URL")"
  if [[ "$wc" =~ ^(200|301|302|307|308|404)$ ]]; then
    ok "web  $WEB_URL -> HTTP $wc"
  else
    err "web  $WEB_URL -> HTTP $wc"; failed=1
  fi
  if [[ "$ac" =~ ^(200|301|302|401|403|404)$ ]]; then
    ok "api  $API_URL -> HTTP $ac"
  else
    err "api  $API_URL -> HTTP $ac"; failed=1
  fi
  return $failed
}

# ---------- PHASE 5: GLUECRON (optional, skip if fix script absent) ----------
phase_gluecron() {
  banner 5 GLUECRON
  local s="$REPO_DIR/scripts/fix-gluecron-service.sh"
  if ! have_script "$s"; then
    warn "fix-gluecron-service.sh not present (PR #143 not merged yet) — skipping"
    PHASE_STATUS[GLUECRON]="skip"; return 0
  fi
  info "running $s"
  run bash "$s"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    if svc_active gluecron; then
      ok "gluecron is active"
    else
      warn "gluecron not active after fix — journalctl -u gluecron -n 50"
      return 2
    fi
  fi
  return 0
}

# ---------- PHASE 6: DNS (optional) ----------
phase_dns() {
  banner 6 DNS
  if [[ -z "${CF_API_TOKEN:-}" ]]; then
    warn "CF_API_TOKEN unset — skipping DNS phase"
    PHASE_STATUS[DNS]="skip"; return 0
  fi
  local s="$REPO_DIR/scripts/add-dns-gluecron.sh"
  if ! have_script "$s"; then
    warn "script $s not found — skipping DNS phase"
    PHASE_STATUS[DNS]="skip"; return 0
  fi
  run bash "$s"
  ok "DNS script ran"
  return 0
}

# ---------- PHASE 7: MIRROR (optional) ----------
phase_mirror() {
  banner 7 MIRROR
  if [[ -z "${GLUECRON_TOKEN:-}" ]]; then
    warn "GLUECRON_TOKEN unset — skipping MIRROR phase"
    PHASE_STATUS[MIRROR]="skip"; return 0
  fi
  local mirror="$REPO_DIR/scripts/mirror-to-gluecron.sh"
  local verify="$REPO_DIR/scripts/verify-gluecron-mirror.sh"
  if ! have_script "$mirror"; then
    warn "script $mirror not found — skipping MIRROR phase"
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
    fi
  done
  return $failed
}

# ---------- PHASE 8: HEALTH REPORT ----------
phase_health() {
  banner 8 HEALTH
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] would print status table + GET $HEALTH_URL"
    return 0
  fi

  echo
  printf "  %-12s %-10s %s\n" "COMPONENT" "STATUS" "DETAIL"
  printf "  %-12s %-10s %s\n" "---------" "------" "------"

  local worst="green"
  _row() {
    local name="$1" status="$2" detail="$3"
    local color="$C_GRN"
    case "$status" in
      active|green|OK) color="$C_GRN" ;;
      degraded|yellow) color="$C_YLW"; [[ "$worst" == "green" ]] && worst="yellow" ;;
      *)               color="$C_RED"; worst="red" ;;
    esac
    printf "  %-12s ${color}%-10s${C_RST} %s\n" "$name" "$status" "$detail"
  }

  local wc ac
  wc="$(http_code "$WEB_URL")"
  ac="$(http_code "$API_URL")"
  if svc_active crontech-web && [[ "$wc" =~ ^(200|301|302|307|308|404)$ ]]; then
    _row web active "HTTP $wc"
  else
    _row web down "HTTP $wc / unit=$(systemctl is-active crontech-web 2>/dev/null || echo ?)"
  fi
  if svc_active crontech-api && [[ "$ac" =~ ^(200|301|302|401|403|404)$ ]]; then
    _row api active "HTTP $ac"
  else
    _row api down "HTTP $ac / unit=$(systemctl is-active crontech-api 2>/dev/null || echo ?)"
  fi
  if svc_active caddy; then
    _row caddy active "systemd"
  else
    _row caddy down "systemctl status caddy"
  fi
  if systemctl list-unit-files gluecron.service >/dev/null 2>&1; then
    if svc_active gluecron; then
      _row gluecron active "systemd"
    else
      _row gluecron degraded "unit present, not active"
    fi
  else
    _row gluecron degraded "unit not installed (PR #143)"
  fi
  if svc_active postgresql; then
    _row postgres active "systemd"
  else
    _row postgres down "systemctl status postgresql"
  fi

  local cert_status="green" cert_detail="not checked"
  if command -v openssl >/dev/null 2>&1; then
    local cert_dir="/var/lib/caddy/.local/share/caddy/certificates"
    if [[ -d "$cert_dir" ]]; then
      local n
      n="$(find "$cert_dir" -name '*.crt' 2>/dev/null | wc -l)"
      if (( n > 0 )); then cert_detail="$n cert(s) on disk"; else cert_status="degraded"; cert_detail="no certs issued yet"; fi
    else
      cert_status="degraded"; cert_detail="caddy cert dir missing"
    fi
  fi
  _row certs "$cert_status" "$cert_detail"

  if [[ -n "${HEALTH_CHECK_TOKEN:-}" ]]; then
    echo
    info "healthz body:"
    curl -sk --max-time 10 -H "Authorization: Bearer ${HEALTH_CHECK_TOKEN}" "$HEALTH_URL" | redact || true
    echo
  fi

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
    [[ "${PHASE_STATUS[$key]}" == "pending" ]] && PHASE_STATUS[$key]="ok"
  else
    local rc=$?
    if [[ "${PHASE_STATUS[$key]}" == "pending" ]]; then
      if (( rc == 2 )); then PHASE_STATUS[$key]="yellow"
      else PHASE_STATUS[$key]="fail"; fi
    fi
    err "PHASE $key FAILED (rc=$rc) — continuing"
  fi
}

main() {
  echo "${C_BLD}Crontech go-live (bare-metal) — $(date -u +%FT%TZ)${C_RST}"
  [[ "$DRY_RUN" -eq 1 ]] && warn "DRY-RUN MODE"

  run_phase SANITY     phase_sanity
  run_phase OUTAGE_FIX phase_outage_fix
  run_phase CADDY      phase_caddy
  run_phase SERVICES   phase_services
  run_phase GLUECRON   phase_gluecron
  run_phase DNS        phase_dns
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
