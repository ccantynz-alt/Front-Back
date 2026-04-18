#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Crontech — Gitea Self-Hosted Git Server Setup
# ──────────────────────────────────────────────────────────────────────────────
# Replaces GitHub with a self-hosted Gitea instance on the Vultr VPS.
# No Docker — runs as a native binary under systemd. SQLite backend.
#
# Usage:
#   1. SSH into the Vultr VPS as root
#   2. Run:  bash /opt/crontech/scripts/setup-gitea.sh
#   3. Point DNS A record for git.crontech.ai to this server
#   4. Access https://git.crontech.ai and log in as the admin user
#   5. Run setup-woodpecker.sh next for CI/CD
#
# Prerequisites:
#   - Ubuntu 20.04+ (Vultr standard image)
#   - Root access
#   - Caddy already installed (via setup-vultr.sh)
#   - Git installed
#
# Idempotent: safe to re-run. Existing configs are overwritten.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
readonly GITEA_VERSION="1.22.6"
readonly GITEA_USER="gitea"
readonly GITEA_PORT=3002
readonly GITEA_DIR="/var/lib/gitea"
readonly GITEA_CONFIG="/etc/gitea"
readonly GITEA_BINARY="/usr/local/bin/gitea"
readonly DOMAIN="crontech.ai"
readonly GIT_DOMAIN="git.${DOMAIN}"
readonly ADMIN_USER="craig"
readonly ADMIN_EMAIL="craig@crontech.ai"
readonly REPO_DIR="/opt/crontech"

# ── Colors ────────────────────────────────────────────────────────────────────
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly NC='\033[0m'

log()      { echo -e "${CYAN}[gitea]${NC} $*"; }
log_ok()   { echo -e "${GREEN}[  OK ]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[ WARN]${NC} $*"; }
log_err()  { echo -e "${RED}[FAIL ]${NC} $*" >&2; }

header() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${BLUE}  $*${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: Preflight Checks
# ══════════════════════════════════════════════════════════════════════════════
header "Step 1/7 — Preflight Checks"

if [ "$(id -u)" -ne 0 ]; then
  log_err "This script must be run as root."
  exit 1
fi
log_ok "Running as root"

if ! command -v caddy &>/dev/null; then
  log_err "Caddy is not installed. Run setup-vultr.sh first."
  exit 1
fi
log_ok "Caddy: $(caddy version)"

if ! command -v git &>/dev/null; then
  log "Installing git..."
  apt-get update -qq && apt-get install -y -qq git
fi
log_ok "Git: $(git --version)"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: Create Gitea system user and directories
# ══════════════════════════════════════════════════════════════════════════════
header "Step 2/7 — System User & Directories"

if id "${GITEA_USER}" &>/dev/null; then
  log_ok "User '${GITEA_USER}' already exists"
else
  adduser --system --shell /bin/bash --gecos "Gitea" --group \
    --disabled-password --home /home/${GITEA_USER} ${GITEA_USER}
  log_ok "Created system user '${GITEA_USER}'"
fi

# Create Gitea directories
mkdir -p "${GITEA_DIR}"/{custom,data,log}
mkdir -p "${GITEA_CONFIG}"
chown -R ${GITEA_USER}:${GITEA_USER} "${GITEA_DIR}"
chown -R root:${GITEA_USER} "${GITEA_CONFIG}"
chmod 770 "${GITEA_CONFIG}"
log_ok "Directories created: ${GITEA_DIR}, ${GITEA_CONFIG}"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: Install Gitea binary
# ══════════════════════════════════════════════════════════════════════════════
header "Step 3/7 — Install Gitea Binary"

ARCH=$(uname -m)
case "${ARCH}" in
  x86_64)  GITEA_ARCH="amd64" ;;
  aarch64) GITEA_ARCH="arm64" ;;
  *)       log_err "Unsupported architecture: ${ARCH}"; exit 1 ;;
esac

if [ -f "${GITEA_BINARY}" ]; then
  CURRENT_VERSION=$("${GITEA_BINARY}" --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' || echo "unknown")
  if [ "${CURRENT_VERSION}" = "${GITEA_VERSION}" ]; then
    log_ok "Gitea ${GITEA_VERSION} already installed"
  else
    log "Upgrading Gitea from ${CURRENT_VERSION} to ${GITEA_VERSION}..."
    systemctl stop gitea 2>/dev/null || true
    DOWNLOAD_GITEA=true
  fi
else
  DOWNLOAD_GITEA=true
fi

if [ "${DOWNLOAD_GITEA:-false}" = "true" ] || [ ! -f "${GITEA_BINARY}" ]; then
  GITEA_URL="https://dl.gitea.com/gitea/${GITEA_VERSION}/gitea-${GITEA_VERSION}-linux-${GITEA_ARCH}"
  log "Downloading Gitea ${GITEA_VERSION} for ${GITEA_ARCH}..."
  curl -fsSL "${GITEA_URL}" -o "${GITEA_BINARY}"
  chmod +x "${GITEA_BINARY}"
  log_ok "Gitea ${GITEA_VERSION} installed at ${GITEA_BINARY}"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: Configure Gitea
# ══════════════════════════════════════════════════════════════════════════════
header "Step 4/7 — Configure Gitea"

# Generate internal secret and LFS JWT secret if not already set
INTERNAL_TOKEN=$("${GITEA_BINARY}" generate secret INTERNAL_TOKEN 2>/dev/null || openssl rand -hex 32)
LFS_JWT_SECRET=$("${GITEA_BINARY}" generate secret LFS_JWT_SECRET 2>/dev/null || openssl rand -hex 32)
SECRET_KEY=$("${GITEA_BINARY}" generate secret SECRET_KEY 2>/dev/null || openssl rand -hex 32)

cat > "${GITEA_CONFIG}/app.ini" << EOF
; Crontech — Gitea Configuration
; Self-hosted git server — no external dependencies

APP_NAME = Crontech Git
RUN_USER = ${GITEA_USER}
RUN_MODE = prod
WORK_PATH = ${GITEA_DIR}

[server]
SSH_DOMAIN       = ${GIT_DOMAIN}
DOMAIN           = ${GIT_DOMAIN}
HTTP_PORT        = ${GITEA_PORT}
ROOT_URL         = https://${GIT_DOMAIN}/
DISABLE_SSH      = false
SSH_PORT         = 22
LFS_START_SERVER = true
LFS_JWT_SECRET   = ${LFS_JWT_SECRET}
OFFLINE_MODE     = false
START_SSH_SERVER  = false

[database]
DB_TYPE  = sqlite3
PATH     = ${GITEA_DIR}/data/gitea.db
LOG_SQL  = false

[repository]
ROOT = ${GITEA_DIR}/data/gitea-repositories
DEFAULT_BRANCH = main

[lfs]
PATH = ${GITEA_DIR}/data/lfs

[security]
SECRET_KEY         = ${SECRET_KEY}
INTERNAL_TOKEN     = ${INTERNAL_TOKEN}
INSTALL_LOCK       = true
PASSWORD_COMPLEXITY = lower,upper,digit

[service]
DISABLE_REGISTRATION       = true
REQUIRE_SIGNIN_VIEW        = false
REGISTER_EMAIL_CONFIRM     = false
ENABLE_NOTIFY_MAIL         = false
DEFAULT_KEEP_EMAIL_PRIVATE = true

[mailer]
ENABLED = false

[log]
MODE      = console
LEVEL     = info
ROOT_PATH = ${GITEA_DIR}/log

[session]
PROVIDER = file

[picture]
DISABLE_GRAVATAR        = true
ENABLE_FEDERATED_AVATAR = false

[openid]
ENABLE_OPENID_SIGNIN = false
ENABLE_OPENID_SIGNUP = false

[oauth2]
ENABLE = true

[webhook]
ALLOWED_HOST_LIST = *

[actions]
ENABLED = false
EOF

chown root:${GITEA_USER} "${GITEA_CONFIG}/app.ini"
chmod 660 "${GITEA_CONFIG}/app.ini"
log_ok "Gitea configuration written to ${GITEA_CONFIG}/app.ini"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: Create systemd service
# ══════════════════════════════════════════════════════════════════════════════
header "Step 5/7 — Systemd Service"

cat > /etc/systemd/system/gitea.service << EOF
[Unit]
Description=Gitea (Self-Hosted Git Server)
After=network.target

[Service]
Type=simple
User=${GITEA_USER}
Group=${GITEA_USER}
WorkingDirectory=${GITEA_DIR}
ExecStart=${GITEA_BINARY} web --config ${GITEA_CONFIG}/app.ini
Restart=always
RestartSec=5
Environment=USER=${GITEA_USER}
Environment=HOME=/home/${GITEA_USER}
Environment=GITEA_WORK_DIR=${GITEA_DIR}

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${GITEA_DIR} ${GITEA_CONFIG} /home/${GITEA_USER}

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gitea

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gitea
log_ok "Created and enabled gitea.service"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6: Configure Caddy reverse proxy
# ══════════════════════════════════════════════════════════════════════════════
header "Step 6/7 — Caddy Reverse Proxy"

# Append Gitea block to Caddyfile if not already present
CADDYFILE="/etc/caddy/Caddyfile"
if grep -q "${GIT_DOMAIN}" "${CADDYFILE}" 2>/dev/null; then
  log_warn "Caddy block for ${GIT_DOMAIN} already exists — overwriting"
  # Remove the existing block (from domain line to next empty line or EOF)
  # Safer: just rewrite the entire block by using sed to remove it first
  sed -i "/^${GIT_DOMAIN//./\\.} {/,/^}/d" "${CADDYFILE}"
fi

cat >> "${CADDYFILE}" << EOF

# Git server — git.crontech.ai
${GIT_DOMAIN} {
	reverse_proxy localhost:${GITEA_PORT}
	encode gzip zstd

	header {
		X-Content-Type-Options "nosniff"
		X-Frame-Options "SAMEORIGIN"
		Referrer-Policy "strict-origin-when-cross-origin"
		Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
		-Server
	}

	log {
		output file /var/log/caddy/gitea.log {
			roll_size 50MiB
			roll_keep 5
		}
	}
}
EOF

log_ok "Caddy block added for ${GIT_DOMAIN}"

# Validate Caddyfile
if caddy validate --config "${CADDYFILE}" --adapter caddyfile 2>/dev/null; then
  log_ok "Caddyfile validated"
else
  log_warn "Caddyfile validation failed — this is normal if DNS is not yet configured"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 7: SSH passthrough, admin user, and start
# ══════════════════════════════════════════════════════════════════════════════
header "Step 7/7 — SSH Passthrough & Admin User"

# SSH passthrough: allow git@git.crontech.ai SSH operations
# Gitea uses the system SSH server. The gitea user needs a shell and SSH access.
# Ensure the gitea user has a proper home directory for SSH keys
GITEA_HOME="/home/${GITEA_USER}"
mkdir -p "${GITEA_HOME}/.ssh"
chmod 700 "${GITEA_HOME}/.ssh"
touch "${GITEA_HOME}/.ssh/authorized_keys"
chmod 600 "${GITEA_HOME}/.ssh/authorized_keys"
chown -R ${GITEA_USER}:${GITEA_USER} "${GITEA_HOME}/.ssh"
log_ok "SSH directory ready at ${GITEA_HOME}/.ssh"

# Configure SSH to use Gitea's authorized_keys command
# This lets Gitea manage SSH keys through its web UI
SSHD_CONFIG="/etc/ssh/sshd_config"
if ! grep -q "Gitea SSH passthrough" "${SSHD_CONFIG}" 2>/dev/null; then
  cat >> "${SSHD_CONFIG}" << 'SSHEOF'

# ── Gitea SSH passthrough ────────────────────────────────────────────────────
Match User gitea
  AuthorizedKeysCommandUser gitea
  AuthorizedKeysCommand /usr/local/bin/gitea keys -e git -u %u -t %t -k %k
  AllowAgentForwarding no
  AllowTcpForwarding no
  PermitTTY no
SSHEOF
  log_ok "SSH passthrough configured in ${SSHD_CONFIG}"
  systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
  log_ok "SSH daemon restarted"
else
  log_ok "SSH passthrough already configured"
fi

# Start Gitea so we can create the admin user
systemctl start gitea
sleep 3

# Create admin user (idempotent — skips if user already exists)
if "${GITEA_BINARY}" admin user list --config "${GITEA_CONFIG}/app.ini" 2>/dev/null | grep -q "${ADMIN_USER}"; then
  log_ok "Admin user '${ADMIN_USER}' already exists"
else
  ADMIN_PASS=$(openssl rand -base64 24)
  "${GITEA_BINARY}" admin user create \
    --config "${GITEA_CONFIG}/app.ini" \
    --username "${ADMIN_USER}" \
    --password "${ADMIN_PASS}" \
    --email "${ADMIN_EMAIL}" \
    --admin \
    --must-change-password=false 2>/dev/null || true
  log_ok "Created admin user '${ADMIN_USER}'"
  echo ""
  echo -e "  ${YELLOW}${BOLD}SAVE THIS — Admin credentials:${NC}"
  echo -e "    ${BOLD}Username:${NC} ${ADMIN_USER}"
  echo -e "    ${BOLD}Password:${NC} ${ADMIN_PASS}"
  echo -e "    ${BOLD}URL:${NC}      https://${GIT_DOMAIN}"
  echo -e "  ${YELLOW}Change this password immediately after first login.${NC}"
  echo ""
fi

# Update sudoers for deploy user to include gitea restart
SUDOERS_FILE="/etc/sudoers.d/crontech-deploy"
if [ -f "${SUDOERS_FILE}" ]; then
  if ! grep -q "gitea" "${SUDOERS_FILE}" 2>/dev/null; then
    # Rewrite sudoers to include gitea service
    cat > "${SUDOERS_FILE}" << SUDOERS
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart crontech-api, /bin/systemctl restart crontech-web, /bin/systemctl restart caddy, /bin/systemctl reload caddy, /bin/systemctl restart gitea, /bin/journalctl *
SUDOERS
    chmod 440 "${SUDOERS_FILE}"
    log_ok "Updated sudoers to include gitea restart"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
header "Gitea Setup Complete"

SERVER_IP=$(curl -sf --max-time 5 ifconfig.me 2>/dev/null || echo "<YOUR_SERVER_IP>")

echo ""
echo -e "  ${BOLD}${GREEN}Gitea Self-Hosted Git Server — Ready${NC}"
echo ""
echo -e "  ${BOLD}Service:${NC}       gitea.service (port ${GITEA_PORT})"
echo -e "  ${BOLD}Binary:${NC}        ${GITEA_BINARY}"
echo -e "  ${BOLD}Config:${NC}        ${GITEA_CONFIG}/app.ini"
echo -e "  ${BOLD}Data:${NC}          ${GITEA_DIR}/data"
echo -e "  ${BOLD}Repos:${NC}         ${GITEA_DIR}/data/gitea-repositories"
echo -e "  ${BOLD}Database:${NC}      ${GITEA_DIR}/data/gitea.db (SQLite)"
echo -e "  ${BOLD}Admin user:${NC}    ${ADMIN_USER}"
echo ""
echo -e "  ${BOLD}URLs (after DNS):${NC}"
echo -e "    ${DIM}https://${GIT_DOMAIN}${NC}                — Web UI"
echo -e "    ${DIM}ssh://git@${GIT_DOMAIN}/org/repo.git${NC} — SSH clone"
echo ""
echo -e "  ${YELLOW}${BOLD}Next Steps:${NC}"
echo ""
echo -e "  ${BOLD}1.${NC} Point DNS A record to this server:"
echo -e "     ${DIM}${GIT_DOMAIN} → ${SERVER_IP}${NC}"
echo ""
echo -e "  ${BOLD}2.${NC} Reload Caddy to pick up the new block:"
echo -e "     ${DIM}systemctl reload caddy${NC}"
echo ""
echo -e "  ${BOLD}3.${NC} Create the 'crontech' organization in Gitea:"
echo -e "     ${DIM}Log in → New Organization → 'crontech'${NC}"
echo ""
echo -e "  ${BOLD}4.${NC} Run the migration script to push the repo:"
echo -e "     ${DIM}bash ${REPO_DIR}/scripts/migrate-to-gitea.sh${NC}"
echo ""
echo -e "  ${BOLD}5.${NC} Set up Woodpecker CI:"
echo -e "     ${DIM}bash ${REPO_DIR}/scripts/setup-woodpecker.sh${NC}"
echo ""
echo -e "  ${BOLD}Useful Commands:${NC}"
echo -e "    ${DIM}systemctl status gitea${NC}              (status)"
echo -e "    ${DIM}journalctl -u gitea -f${NC}              (logs)"
echo -e "    ${DIM}gitea admin user list --config ${GITEA_CONFIG}/app.ini${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  Gitea is running. Configure DNS, then set up Woodpecker CI.${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
