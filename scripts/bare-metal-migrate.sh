#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Crontech — Bare Metal Cutover (run from the OLD VPS)
# ──────────────────────────────────────────────────────────────────────────────
# Moves Crontech from the current Vultr VPS (45.76.21.235) to a freshly
# provisioned Vultr Bare Metal box. The NEW box must already have been
# provisioned with scripts/bare-metal-setup.sh.
#
# High-level sequence:
#   1. Snapshot OLD-side state (`systemctl status`, git SHAs, disk usage)
#   2. Stop write traffic to OLD (optional: `systemctl stop crontech-api`)
#      so Postgres / local.db / repos are quiesced during rsync.
#   3. rsync /opt/crontech, /opt/gluecron, /data/repos, local.db to NEW
#   4. pg_dump upstream Postgres (Neon or local) -> stream into NEW Postgres
#   5. Verify: HTTP 200 on both apps via SSH port-forward to NEW, DB row counts
#   6. DNS swap (manual, via the operator) — script prints the exact commands
#   7. Re-verify against public hostnames
#
# DNS SWAP = instant rollback. Keep OLD VPS running for 24h post-cutover so
# reverting is one DNS update away.
#
# Usage:
#   export NEW_HOST="123.45.67.89"          # new Vultr Bare Metal public IP
#   export NEW_USER="deploy"                # matches setup script DEPLOY_USER
#   export OLD_REPO_DIR="/opt/crontech"
#   export OLD_GLUECRON_DIR="/opt/gluecron" # if present; leave empty to skip
#   export OLD_REPOS_DIR="/data/repos"      # if present; leave empty to skip
#   export POSTGRES_SOURCE_URL="postgres://user:pass@host:5432/db"
#         # where to pg_dump from. For fresh gluecron w/ no data yet, set
#         # POSTGRES_SOURCE_URL="" and the dump step is skipped.
#   export NEW_PG_CRONTECH_URL="postgres://crontech:<pw>@${NEW_HOST}:5432/crontech"
#         # only needed if you want the script to verify the target is reachable.
#   bash scripts/bare-metal-migrate.sh
#
# Safe to re-run. Each phase is independently verifiable.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config (env-overridable) ──────────────────────────────────────────────────
NEW_HOST="${NEW_HOST:?NEW_HOST must be the bare-metal public IP}"
NEW_USER="${NEW_USER:-deploy}"
SSH_OPTS="${SSH_OPTS:--o StrictHostKeyChecking=accept-new -o ConnectTimeout=10}"

OLD_REPO_DIR="${OLD_REPO_DIR:-/opt/crontech}"
OLD_GLUECRON_DIR="${OLD_GLUECRON_DIR:-/opt/gluecron}"
OLD_REPOS_DIR="${OLD_REPOS_DIR:-/data/repos}"
OLD_LOCALDB="${OLD_LOCALDB:-${OLD_REPO_DIR}/local.db}"

NEW_REPO_DIR="${NEW_REPO_DIR:-/opt/crontech}"
NEW_GLUECRON_DIR="${NEW_GLUECRON_DIR:-/opt/gluecron}"
NEW_REPOS_DIR="${NEW_REPOS_DIR:-/data/repos}"

POSTGRES_SOURCE_URL="${POSTGRES_SOURCE_URL:-}"
POSTGRES_TARGET_DB="${POSTGRES_TARGET_DB:-crontech}"

SNAPSHOT_DIR="${SNAPSHOT_DIR:-/tmp/crontech-cutover-$(date -u +%Y%m%dT%H%M%SZ)}"

# ── Colors ────────────────────────────────────────────────────────────────────
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
NC=$'\033[0m'

log()      { printf '%b\n' "${CYAN}[cutover]${NC} $*"; }
log_ok()   { printf '%b\n' "${GREEN}[   OK  ]${NC} $*"; }
log_warn() { printf '%b\n' "${YELLOW}[ WARN  ]${NC} $*"; }
log_err()  { printf '%b\n' "${RED}[FAIL   ]${NC} $*" >&2; }

header() {
    printf '\n%b\n' "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    printf '%b\n'   "${BOLD}${BLUE}  $*${NC}"
    printf '%b\n\n' "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

ssh_new() {
    # shellcheck disable=SC2086
    ssh ${SSH_OPTS} "${NEW_USER}@${NEW_HOST}" "$@"
}

rsync_to_new() {
    local src="$1"
    local dest="$2"
    local label="$3"
    if [ ! -e "${src}" ]; then
        log_warn "${label}: source ${src} does not exist — skipping"
        return 0
    fi
    log "rsync ${label}: ${src} -> ${NEW_HOST}:${dest}"
    # shellcheck disable=SC2086
    rsync -az --delete --numeric-ids --info=stats1 \
        -e "ssh ${SSH_OPTS}" \
        "${src}/" "${NEW_USER}@${NEW_HOST}:${dest}/"
    log_ok "${label} synced"
}

# ══════════════════════════════════════════════════════════════════════════════
# 1. Snapshot OLD state
# ══════════════════════════════════════════════════════════════════════════════
header "Phase 1/6 — Snapshot OLD state"

mkdir -p "${SNAPSHOT_DIR}"
{
    echo "# Cutover snapshot taken $(date -u +%FT%TZ) on $(hostname)"
    echo
    echo "## systemctl status (summary)"
    systemctl --no-pager --no-legend list-units --type=service --state=running || true
    echo
    echo "## disk usage"
    df -hT 2>/dev/null || true
    echo
    echo "## crontech git SHA"
    (cd "${OLD_REPO_DIR}" 2>/dev/null && git rev-parse HEAD) || echo "no repo"
    echo "## gluecron git SHA"
    (cd "${OLD_GLUECRON_DIR}" 2>/dev/null && git rev-parse HEAD) || echo "no repo"
    echo
    echo "## listening ports"
    ss -tunlp 2>/dev/null || true
} > "${SNAPSHOT_DIR}/old-state.txt"
log_ok "OLD state saved to ${SNAPSHOT_DIR}/old-state.txt"

# ══════════════════════════════════════════════════════════════════════════════
# 2. Quiesce OLD write traffic (optional but recommended)
# ══════════════════════════════════════════════════════════════════════════════
header "Phase 2/6 — Quiesce OLD writers"

if [ "${SKIP_QUIESCE:-0}" = "1" ]; then
    log_warn "SKIP_QUIESCE=1 set — leaving services running. rsync may capture a torn state."
else
    for unit in crontech-api crontech-web gluecron; do
        if systemctl is-active --quiet "${unit}.service" 2>/dev/null; then
            systemctl stop "${unit}.service"
            log_ok "Stopped ${unit}"
        fi
    done
fi

# ══════════════════════════════════════════════════════════════════════════════
# 3. rsync filesystems
# ══════════════════════════════════════════════════════════════════════════════
header "Phase 3/6 — rsync filesystems to NEW"

# Sanity-check NEW box layout was provisioned.
if ! ssh_new "test -d ${NEW_REPO_DIR} && test -d ${NEW_GLUECRON_DIR} && test -d ${NEW_REPOS_DIR}"; then
    log_err "NEW box is missing the expected workspace dirs. Did you run bare-metal-setup.sh there?"
    exit 1
fi
log_ok "NEW box layout confirmed"

rsync_to_new "${OLD_REPO_DIR}"     "${NEW_REPO_DIR}"     "crontech repo"
rsync_to_new "${OLD_GLUECRON_DIR}" "${NEW_GLUECRON_DIR}" "gluecron repo"
rsync_to_new "${OLD_REPOS_DIR}"    "${NEW_REPOS_DIR}"    "gluecron bare repos"

if [ -f "${OLD_LOCALDB}" ]; then
    # shellcheck disable=SC2086
    scp ${SSH_OPTS} "${OLD_LOCALDB}" "${NEW_USER}@${NEW_HOST}:${NEW_REPO_DIR}/local.db"
    log_ok "local.db copied"
fi

# Re-assert ownership on the NEW box (rsync as root on OLD + NEW_USER on NEW
# can leave weird combinations).
ssh_new "sudo chown -R ${NEW_USER}:${NEW_USER} ${NEW_REPO_DIR} ${NEW_GLUECRON_DIR} ${NEW_REPOS_DIR}"
log_ok "Ownership reset on NEW"

# ══════════════════════════════════════════════════════════════════════════════
# 4. Postgres dump + load
# ══════════════════════════════════════════════════════════════════════════════
header "Phase 4/6 — Postgres migration"

if [ -z "${POSTGRES_SOURCE_URL}" ]; then
    log_warn "POSTGRES_SOURCE_URL empty — skipping dump (green-field deploy)"
else
    if ! command -v pg_dump >/dev/null 2>&1; then
        log_err "pg_dump not installed on this box. apt-get install -y postgresql-client-16"
        exit 1
    fi
    DUMP_FILE="${SNAPSHOT_DIR}/crontech.dump"
    log "pg_dump ${POSTGRES_SOURCE_URL} -> ${DUMP_FILE}"
    pg_dump --no-owner --no-privileges --format=custom \
        --file="${DUMP_FILE}" \
        "${POSTGRES_SOURCE_URL}"
    log_ok "Dump complete ($(du -h "${DUMP_FILE}" | awk '{print $1}'))"

    log "Streaming dump to NEW and restoring into ${POSTGRES_TARGET_DB}"
    # shellcheck disable=SC2086
    scp ${SSH_OPTS} "${DUMP_FILE}" "${NEW_USER}@${NEW_HOST}:/tmp/crontech.dump"
    ssh_new "sudo -u postgres pg_restore --no-owner --no-privileges \
        --dbname=${POSTGRES_TARGET_DB} --clean --if-exists /tmp/crontech.dump"
    log_ok "pg_restore complete on NEW"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 5. Verify NEW (pre-DNS-swap)
# ══════════════════════════════════════════════════════════════════════════════
header "Phase 5/6 — Verify NEW before DNS swap"

ssh_new "sudo systemctl start postgres caddy crontech-api crontech-web gluecron dns-server"
sleep 5

# Hit each app via ssh-local curl on the NEW box itself, so we don't depend on
# DNS/TLS yet.
log "HTTP probes on NEW (loopback)"
ssh_new "curl -sf -o /dev/null -w 'web    %{http_code}\n' http://localhost:3000/ || true"
ssh_new "curl -sf -o /dev/null -w 'api    %{http_code}\n' http://localhost:3001/api/health || true"
ssh_new "curl -sf -o /dev/null -w 'glue   %{http_code}\n' http://localhost:3002/ || true"

log "DNS server probe (loopback)"
ssh_new "dig +time=2 +tries=1 @127.0.0.1 ${NEW_HOST}.crontech.ai +short || true"

log "Postgres sanity"
ssh_new "sudo -u postgres psql -d crontech -c 'SELECT now(), current_database();' || true"
ssh_new "sudo -u postgres psql -d gluecron -c 'SELECT now(), current_database();' || true"

log_ok "Verification passes printed above — inspect before proceeding"

# ══════════════════════════════════════════════════════════════════════════════
# 6. DNS swap (MANUAL) + post-swap checks
# ══════════════════════════════════════════════════════════════════════════════
header "Phase 6/6 — DNS swap (MANUAL)"

cat <<SWAP
${BOLD}The automated portion ends here.${NC} DNS swap is deliberately manual so you
can eyeball Phase 5 output first.

In Cloudflare DNS for crontech.ai, update these records to point at ${NEW_HOST}:
  A  @     ${NEW_HOST}    (proxied=off for direct-IP verification, flip on after)
  A  www   ${NEW_HOST}
  A  api   ${NEW_HOST}
  A  gluecron ${NEW_HOST}

Then verify from your laptop:
  dig +short crontech.ai
  curl -I https://crontech.ai
  curl -I https://api.crontech.ai/api/health
  curl -I https://gluecron.crontech.ai

${BOLD}Rollback:${NC} revert those A records to the old IP (45.76.21.235).
The old VPS is left running for 24h as a warm rollback target — do NOT
tear it down until Crontech has been green on bare metal for a full day.

Snapshot + dump files for this cutover live at:
  ${SNAPSHOT_DIR}
SWAP

log_ok "Cutover script finished. Now go flip DNS and verify."
