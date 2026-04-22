#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Crontech — Vultr Bare Metal One-Shot Provisioning
# ──────────────────────────────────────────────────────────────────────────────
# Runs ON a freshly provisioned Vultr Bare Metal Ubuntu 22.04 / 24.04 box,
# NOT against the Vultr API. Takes the box from empty to fully-configured
# host for the entire Crontech stack:
#
#   - System packages: Bun, Caddy, Postgres 16, git, build-essential, ufw, rsync
#   - System users: `deploy` (app services) + `dns-server` (DNS only)
#   - Workspace layout: /opt/crontech, /opt/gluecron, /data/{postgres,repos}
#   - Postgres 16 cluster with `crontech` + `gluecron` databases and app roles
#   - systemd units for postgres, crontech-web, crontech-api, gluecron, dns-server
#   - /etc/caddy/Caddyfile rendered from infra/bare-metal/Caddyfile.template
#   - ufw firewall: allow 22, 53 (UDP+TCP), 80, 443; default-deny everything else
#
# Usage:
#   export DOMAIN="crontech.ai"
#   export DEPLOY_USER="deploy"
#   export POSTGRES_CRONTECH_PASSWORD="$(openssl rand -hex 32)"
#   export POSTGRES_GLUECRON_PASSWORD="$(openssl rand -hex 32)"
#   sudo -E bash scripts/bare-metal-setup.sh
#
# Idempotent: safe to re-run. Every step is either a check-then-create or an
# overwrite of a file whose content is deterministic from this script.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config (env-overridable) ──────────────────────────────────────────────────
DOMAIN="${DOMAIN:-crontech.ai}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DNS_USER="${DNS_USER:-dns-server}"
REPO_DIR="${REPO_DIR:-/opt/crontech}"
GLUECRON_DIR="${GLUECRON_DIR:-/opt/gluecron}"
PG_DATA_DIR="${PG_DATA_DIR:-/data/postgres/16/main}"
REPOS_DIR="${REPOS_DIR:-/data/repos}"
CADDY_LOG_DIR="${CADDY_LOG_DIR:-/var/log/caddy}"
PG_MAJOR="${PG_MAJOR:-16}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra/bare-metal"

# ── Colors ────────────────────────────────────────────────────────────────────
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
NC=$'\033[0m'

log()      { printf '%b\n' "${CYAN}[setup]${NC} $*"; }
log_ok()   { printf '%b\n' "${GREEN}[  OK ]${NC} $*"; }
log_warn() { printf '%b\n' "${YELLOW}[ WARN]${NC} $*"; }
log_err()  { printf '%b\n' "${RED}[FAIL ]${NC} $*" >&2; }

header() {
    printf '\n%b\n' "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    printf '%b\n'   "${BOLD}${BLUE}  $*${NC}"
    printf '%b\n\n' "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        log_err "This script must be run as root (use sudo -E)."
        exit 1
    fi
}

require_file() {
    if [ ! -f "$1" ]; then
        log_err "Expected file missing: $1"
        log_err "Did you clone the repo to ${REPO_ROOT}?"
        exit 1
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# 1. Preflight
# ══════════════════════════════════════════════════════════════════════════════
header "Step 1/9 — Preflight"

require_root
log_ok "Running as root"

require_file "${INFRA_DIR}/Caddyfile.template"
require_file "${INFRA_DIR}/postgres.service"
require_file "${INFRA_DIR}/crontech-web.service"
require_file "${INFRA_DIR}/crontech-api.service"
require_file "${INFRA_DIR}/gluecron.service"
require_file "${INFRA_DIR}/dns-server.service"
require_file "${INFRA_DIR}/postgres-init.sql"
log_ok "All infra/bare-metal/ templates present"

: "${POSTGRES_CRONTECH_PASSWORD:?POSTGRES_CRONTECH_PASSWORD must be set}"
: "${POSTGRES_GLUECRON_PASSWORD:?POSTGRES_GLUECRON_PASSWORD must be set}"
log_ok "Postgres passwords present in environment"

log "DOMAIN=${DOMAIN}"
log "DEPLOY_USER=${DEPLOY_USER}"
log "REPO_DIR=${REPO_DIR}"

# ══════════════════════════════════════════════════════════════════════════════
# 2. System packages
# ══════════════════════════════════════════════════════════════════════════════
header "Step 2/9 — System packages"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    ca-certificates curl gnupg lsb-release \
    git build-essential \
    ufw rsync jq openssl \
    debian-keyring debian-archive-keyring apt-transport-https
log_ok "Base packages installed"

# ── Postgres 16 (pgdg repo) ───────────────────────────────────────────────────
if ! dpkg -s "postgresql-${PG_MAJOR}" >/dev/null 2>&1; then
    install -d /usr/share/keyrings
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
    echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq
    apt-get install -y -qq "postgresql-${PG_MAJOR}" "postgresql-contrib-${PG_MAJOR}" "postgresql-${PG_MAJOR}-pgvector"
    # The distro unit will conflict with ours — disable it up-front.
    systemctl disable --now "postgresql@${PG_MAJOR}-main.service" 2>/dev/null || true
    systemctl disable --now postgresql.service 2>/dev/null || true
fi
log_ok "Postgres ${PG_MAJOR} installed"

# ── Caddy (cloudsmith repo) ───────────────────────────────────────────────────
if ! command -v caddy >/dev/null 2>&1; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
fi
log_ok "Caddy installed: $(caddy version | head -n 1)"

# ── Bun (global install to /usr/local/bin so systemd units see it) ────────────
BUN_BIN="/usr/local/bin/bun"
if [ ! -x "${BUN_BIN}" ]; then
    curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash
fi
log_ok "Bun installed: $(${BUN_BIN} --version)"

# ══════════════════════════════════════════════════════════════════════════════
# 3. Users & workspace layout
# ══════════════════════════════════════════════════════════════════════════════
header "Step 3/9 — Users & workspace"

if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
    adduser --disabled-password --gecos "Crontech Deploy" "${DEPLOY_USER}"
fi
log_ok "User ${DEPLOY_USER} ready"

if ! id "${DNS_USER}" >/dev/null 2>&1; then
    adduser --system --group --no-create-home --shell /usr/sbin/nologin "${DNS_USER}"
fi
log_ok "User ${DNS_USER} ready (unprivileged, nologin)"

install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${REPO_DIR}"
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${GLUECRON_DIR}"
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${REPOS_DIR}"
install -d -o postgres         -g postgres         "$(dirname "${PG_DATA_DIR}")"
install -d -o postgres         -g postgres         "${PG_DATA_DIR}"
install -d -o caddy            -g caddy            "${CADDY_LOG_DIR}"
log_ok "Workspace dirs created (/opt/crontech, /opt/gluecron, /data/repos, ${PG_DATA_DIR}, ${CADDY_LOG_DIR})"

# ══════════════════════════════════════════════════════════════════════════════
# 4. Firewall (ufw)
# ══════════════════════════════════════════════════════════════════════════════
header "Step 4/9 — Firewall (ufw)"

ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp          comment 'SSH'
ufw allow 53/udp          comment 'DNS UDP'
ufw allow 53/tcp          comment 'DNS TCP'
ufw allow 80/tcp          comment 'HTTP (ACME + redirect)'
ufw allow 443/tcp         comment 'HTTPS'
ufw allow 443/udp         comment 'HTTP/3 QUIC'
ufw --force enable
log_ok "ufw: default-deny + 22/53/80/443 allowed"

# ══════════════════════════════════════════════════════════════════════════════
# 5. Postgres 16 cluster
# ══════════════════════════════════════════════════════════════════════════════
header "Step 5/9 — Postgres ${PG_MAJOR}"

if [ ! -s "${PG_DATA_DIR}/PG_VERSION" ]; then
    # Write password to a temp file that postgres user can read.
    # (Bash process-substitution <(...) creates /dev/fd/N descriptors
    # owned by root; sudo -u postgres can't read them, which caused
    # `initdb: error: could not open file "/dev/fd/63"`.)
    PWFILE=$(mktemp)
    printf '%s' "${POSTGRES_CRONTECH_PASSWORD}" > "${PWFILE}"
    chmod 600 "${PWFILE}"
    chown postgres:postgres "${PWFILE}"

    sudo -u postgres "/usr/lib/postgresql/${PG_MAJOR}/bin/initdb" \
        --pgdata="${PG_DATA_DIR}" \
        --auth-host=scram-sha-256 \
        --auth-local=peer \
        --encoding=UTF8 \
        --locale=C.UTF-8 \
        --username=postgres \
        --pwfile="${PWFILE}" >/dev/null

    rm -f "${PWFILE}"
    log_ok "initdb complete at ${PG_DATA_DIR}"
else
    log_ok "Existing cluster at ${PG_DATA_DIR} — skipping initdb"
fi

# Postgres refuses to start if the data dir is anything more permissive
# than 0700 or 0750. `chown` in step 2 sometimes leaves it 0755 depending
# on the umask of the pg16 apt postinst. Force it here — idempotent.
chown -R postgres:postgres "${PG_DATA_DIR}"
chmod 0700 "${PG_DATA_DIR}"

# Lock down postgresql.conf: SCRAM-only, listen on localhost only.
sudo -u postgres tee "${PG_DATA_DIR}/postgresql.conf.d-crontech.conf" >/dev/null <<'CONF'
# Managed by scripts/bare-metal-setup.sh — do not edit by hand.
listen_addresses = 'localhost'
password_encryption = scram-sha-256
log_line_prefix = '%m [%p] %q%u@%d '
shared_preload_libraries = ''
CONF
# Ensure postgresql.conf includes our drop-in.
if ! grep -q "postgresql.conf.d-crontech.conf" "${PG_DATA_DIR}/postgresql.conf"; then
    echo "include 'postgresql.conf.d-crontech.conf'" | sudo -u postgres tee -a "${PG_DATA_DIR}/postgresql.conf" >/dev/null
fi

# Install our systemd unit (overrides the distro one).
install -m 0644 "${INFRA_DIR}/postgres.service" /etc/systemd/system/postgres.service
systemctl daemon-reload
systemctl enable postgres.service
systemctl restart postgres.service

# Wait for it to come up.
for _ in $(seq 1 30); do
    if sudo -u postgres psql -c 'SELECT 1' >/dev/null 2>&1; then
        break
    fi
    sleep 1
done
sudo -u postgres psql -c 'SELECT version()' >/dev/null
log_ok "Postgres online and reachable via UNIX socket"

# Render & run bootstrap SQL.
sudo -u postgres psql -v ON_ERROR_STOP=1 \
    -v "crontech_password=${POSTGRES_CRONTECH_PASSWORD}" \
    -v "gluecron_password=${POSTGRES_GLUECRON_PASSWORD}" \
    -f "${INFRA_DIR}/postgres-init.sql"
log_ok "Databases + roles provisioned (crontech, gluecron)"

# ══════════════════════════════════════════════════════════════════════════════
# 6. Caddy config
# ══════════════════════════════════════════════════════════════════════════════
header "Step 6/9 — Caddy"

install -d -m 0755 /etc/caddy
sed "s/__DOMAIN__/${DOMAIN}/g" "${INFRA_DIR}/Caddyfile.template" > /etc/caddy/Caddyfile
chmod 0644 /etc/caddy/Caddyfile

if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    log_ok "/etc/caddy/Caddyfile rendered and validated"
else
    log_warn "/etc/caddy/Caddyfile rendered but validation failed — inspect before starting caddy"
fi

systemctl enable caddy

# ══════════════════════════════════════════════════════════════════════════════
# 7. Systemd units (app + dns)
# ══════════════════════════════════════════════════════════════════════════════
header "Step 7/9 — Systemd units"

for unit in crontech-web.service crontech-api.service gluecron.service dns-server.service; do
    install -m 0644 "${INFRA_DIR}/${unit}" "/etc/systemd/system/${unit}"
    log_ok "Installed ${unit}"
done

# If the operator picked a non-default DEPLOY_USER, patch the unit files.
if [ "${DEPLOY_USER}" != "deploy" ]; then
    for unit in crontech-web.service crontech-api.service gluecron.service; do
        sed -i "s/^User=deploy$/User=${DEPLOY_USER}/; s/^Group=deploy$/Group=${DEPLOY_USER}/" \
            "/etc/systemd/system/${unit}"
    done
    log_ok "Patched units for DEPLOY_USER=${DEPLOY_USER}"
fi

systemctl daemon-reload
# Phase 1a cutover: only enable crontech-web + crontech-api for auto-start.
# gluecron and dns-server have known production-readiness gaps (Gluecron's
# runtime isn't deployed on this box yet; dns-server has no Postgres-backed
# ZoneStore shipped — would return REFUSED for every query). Enabling them
# would crash-loop on boot before code is rsynced. Operators enable them
# manually once their respective cutover blocks ship.
systemctl enable crontech-web.service crontech-api.service
log_ok "Enabled: crontech-web, crontech-api (start manually once code is rsynced)"
log_warn "NOT enabled: gluecron.service (Phase 2 — Gluecron cutover)"
log_warn "NOT enabled: dns-server.service (Phase 1b — requires ZoneStore ship + DNS-01 wildcard)"

# ══════════════════════════════════════════════════════════════════════════════
# 8. Sudoers for deploy user
# ══════════════════════════════════════════════════════════════════════════════
header "Step 8/9 — Sudoers"

cat > /etc/sudoers.d/crontech-deploy <<SUDOERS
${DEPLOY_USER} ALL=(ALL) NOPASSWD: \
    /bin/systemctl restart crontech-web, \
    /bin/systemctl restart crontech-api, \
    /bin/systemctl restart gluecron, \
    /bin/systemctl restart dns-server, \
    /bin/systemctl restart caddy, \
    /bin/systemctl reload caddy, \
    /bin/journalctl *
SUDOERS
chmod 0440 /etc/sudoers.d/crontech-deploy
visudo -cf /etc/sudoers.d/crontech-deploy >/dev/null
log_ok "Sudoers configured for ${DEPLOY_USER}"

# ══════════════════════════════════════════════════════════════════════════════
# 9. Summary
# ══════════════════════════════════════════════════════════════════════════════
header "Step 9/9 — Summary"

SERVER_IP="$(curl -sf --max-time 5 ifconfig.me 2>/dev/null || echo '<this-box-ip>')"

cat <<SUMMARY
${BOLD}${GREEN}Bare-metal provisioning complete.${NC}

Host layout:
  ${REPO_DIR}        — Crontech monorepo (rsync from old VPS during cutover)
  ${GLUECRON_DIR}    — Gluecron checkout
  ${REPOS_DIR}        — Gluecron bare git repos
  ${PG_DATA_DIR}  — Postgres 16 data

Services enabled for auto-start (Phase 1a):
  postgres.service         (port 5432, localhost only)
  crontech-web.service     (port 3000) — start after rsync
  crontech-api.service     (port 3001) — start after rsync
  caddy.service            (ports 80/443, vhosts for ${DOMAIN}, www, api, gluecron)

Services installed but NOT auto-enabled (Phase 1b / Phase 2):
  gluecron.service         (port 3002) — enable when Gluecron code is deployed
  dns-server.service       (port 53)   — enable after ZoneStore + DNS-01 ship

Firewall (ufw):
  allow 22 53/udp 53/tcp 80 443 443/udp — deny everything else.

Next actions (run via scripts/bare-metal-migrate.sh from the old VPS):
  1. rsync ${REPO_DIR} and ${GLUECRON_DIR} contents from old VPS
  2. pg_dump old Neon / existing Postgres -> psql import into local crontech/gluecron DBs
  3. systemctl start crontech-api crontech-web gluecron dns-server caddy
  4. Update DNS to point at ${SERVER_IP}
  5. Verify TLS, logins, DNS queries, cron jobs
SUMMARY
