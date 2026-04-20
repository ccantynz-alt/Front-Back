#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Crontech — Woodpecker CI Setup (Self-Hosted)
# ──────────────────────────────────────────────────────────────────────────────
# Replaces GitHub Actions with self-hosted Woodpecker CI on the Vultr VPS.
# No Docker — runs as native binaries under systemd. Authenticates via Gitea
# OAuth2. Pipelines defined in .woodpecker.yml in the repo root.
#
# Usage:
#   1. SSH into the Vultr VPS as root
#   2. Ensure Gitea is already running (setup-gitea.sh)
#   3. Run:  bash /opt/crontech/scripts/setup-woodpecker.sh
#   4. Point DNS A record for ci.crontech.ai to this server
#   5. Access https://ci.crontech.ai and log in via Gitea OAuth
#
# Prerequisites:
#   - Ubuntu 20.04+ (Vultr standard image)
#   - Root access
#   - Gitea running on port 3002 (via setup-gitea.sh)
#   - Caddy installed (via setup-vultr.sh)
#
# Idempotent: safe to re-run. Existing configs are overwritten.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
readonly WOODPECKER_VERSION="2.8.3"
readonly WOODPECKER_PORT=3003
readonly DOMAIN="crontech.ai"
readonly CI_DOMAIN="ci.${DOMAIN}"
readonly GIT_DOMAIN="git.${DOMAIN}"
readonly GITEA_PORT=3002
readonly WOODPECKER_DIR="/var/lib/woodpecker"
readonly WOODPECKER_CONFIG="/etc/woodpecker"
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

log()      { echo -e "${CYAN}[woodpecker]${NC} $*"; }
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

# Verify Gitea is running
if curl -sf http://localhost:${GITEA_PORT}/api/v1/version &>/dev/null; then
  log_ok "Gitea is running on port ${GITEA_PORT}"
else
  log_err "Gitea is not running on port ${GITEA_PORT}. Run setup-gitea.sh first."
  exit 1
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: Create Woodpecker system user and directories
# ══════════════════════════════════════════════════════════════════════════════
header "Step 2/7 — System User & Directories"

if id "woodpecker" &>/dev/null; then
  log_ok "User 'woodpecker' already exists"
else
  adduser --system --shell /bin/false --gecos "Woodpecker CI" --group \
    --disabled-password --home /home/woodpecker woodpecker
  log_ok "Created system user 'woodpecker'"
fi

mkdir -p "${WOODPECKER_DIR}"/{server,agent}
mkdir -p "${WOODPECKER_CONFIG}"
chown -R woodpecker:woodpecker "${WOODPECKER_DIR}"
chown -R root:woodpecker "${WOODPECKER_CONFIG}"
chmod 770 "${WOODPECKER_CONFIG}"
log_ok "Directories created: ${WOODPECKER_DIR}, ${WOODPECKER_CONFIG}"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: Install Woodpecker binaries
# ══════════════════════════════════════════════════════════════════════════════
header "Step 3/7 — Install Woodpecker Binaries"

ARCH=$(uname -m)
case "${ARCH}" in
  x86_64)  WP_ARCH="amd64" ;;
  aarch64) WP_ARCH="arm64" ;;
  *)       log_err "Unsupported architecture: ${ARCH}"; exit 1 ;;
esac

WP_SERVER_BIN="/usr/local/bin/woodpecker-server"
WP_AGENT_BIN="/usr/local/bin/woodpecker-agent"

# Download server
WP_SERVER_URL="https://github.com/woodpecker-ci/woodpecker/releases/download/v${WOODPECKER_VERSION}/woodpecker-server_linux_${WP_ARCH}.tar.gz"
if [ -f "${WP_SERVER_BIN}" ]; then
  CURRENT_VERSION=$("${WP_SERVER_BIN}" --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' || echo "unknown")
  if [ "${CURRENT_VERSION}" = "${WOODPECKER_VERSION}" ]; then
    log_ok "Woodpecker server ${WOODPECKER_VERSION} already installed"
  else
    log "Upgrading Woodpecker server from ${CURRENT_VERSION} to ${WOODPECKER_VERSION}..."
    systemctl stop woodpecker-server 2>/dev/null || true
    curl -fsSL "${WP_SERVER_URL}" | tar -xz -C /usr/local/bin/ woodpecker-server
    chmod +x "${WP_SERVER_BIN}"
    log_ok "Woodpecker server upgraded to ${WOODPECKER_VERSION}"
  fi
else
  log "Downloading Woodpecker server ${WOODPECKER_VERSION}..."
  curl -fsSL "${WP_SERVER_URL}" | tar -xz -C /usr/local/bin/ woodpecker-server
  chmod +x "${WP_SERVER_BIN}"
  log_ok "Woodpecker server installed at ${WP_SERVER_BIN}"
fi

# Download agent
WP_AGENT_URL="https://github.com/woodpecker-ci/woodpecker/releases/download/v${WOODPECKER_VERSION}/woodpecker-agent_linux_${WP_ARCH}.tar.gz"
if [ -f "${WP_AGENT_BIN}" ]; then
  CURRENT_VERSION=$("${WP_AGENT_BIN}" --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' || echo "unknown")
  if [ "${CURRENT_VERSION}" = "${WOODPECKER_VERSION}" ]; then
    log_ok "Woodpecker agent ${WOODPECKER_VERSION} already installed"
  else
    log "Upgrading Woodpecker agent from ${CURRENT_VERSION} to ${WOODPECKER_VERSION}..."
    systemctl stop woodpecker-agent 2>/dev/null || true
    curl -fsSL "${WP_AGENT_URL}" | tar -xz -C /usr/local/bin/ woodpecker-agent
    chmod +x "${WP_AGENT_BIN}"
    log_ok "Woodpecker agent upgraded to ${WOODPECKER_VERSION}"
  fi
else
  log "Downloading Woodpecker agent ${WOODPECKER_VERSION}..."
  curl -fsSL "${WP_AGENT_URL}" | tar -xz -C /usr/local/bin/ woodpecker-agent
  chmod +x "${WP_AGENT_BIN}"
  log_ok "Woodpecker agent installed at ${WP_AGENT_BIN}"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: Register Gitea OAuth2 application for Woodpecker
# ══════════════════════════════════════════════════════════════════════════════
header "Step 4/7 — Gitea OAuth2 Application"

echo ""
echo -e "  ${YELLOW}${BOLD}MANUAL STEP REQUIRED:${NC}"
echo ""
echo -e "  Create an OAuth2 application in Gitea for Woodpecker CI."
echo ""
echo -e "  ${BOLD}1.${NC} Go to: ${DIM}https://${GIT_DOMAIN}/-/admin/applications${NC}"
echo -e "     (or: Site Administration → Applications)"
echo ""
echo -e "  ${BOLD}2.${NC} Click '${BOLD}Create a new OAuth2 Application${NC}'"
echo ""
echo -e "  ${BOLD}3.${NC} Fill in:"
echo -e "     ${BOLD}Application Name:${NC}  Woodpecker CI"
echo -e "     ${BOLD}Redirect URI:${NC}      https://${CI_DOMAIN}/authorize"
echo ""
echo -e "  ${BOLD}4.${NC} Copy the ${BOLD}Client ID${NC} and ${BOLD}Client Secret${NC}"
echo ""
echo -e "  ${BOLD}5.${NC} Enter them below (or edit ${WOODPECKER_CONFIG}/server.conf later)."
echo ""

# Check if config already exists with OAuth values set
if [ -f "${WOODPECKER_CONFIG}/server.conf" ] && grep -qP 'WOODPECKER_GITEA_CLIENT=\S+' "${WOODPECKER_CONFIG}/server.conf" 2>/dev/null; then
  log_ok "OAuth2 credentials already configured in ${WOODPECKER_CONFIG}/server.conf"
  GITEA_CLIENT=$(grep 'WOODPECKER_GITEA_CLIENT=' "${WOODPECKER_CONFIG}/server.conf" | cut -d= -f2)
  GITEA_SECRET=$(grep 'WOODPECKER_GITEA_SECRET=' "${WOODPECKER_CONFIG}/server.conf" | cut -d= -f2)
else
  # Try to read from environment or prompt
  if [ -n "${WOODPECKER_GITEA_CLIENT:-}" ] && [ -n "${WOODPECKER_GITEA_SECRET:-}" ]; then
    GITEA_CLIENT="${WOODPECKER_GITEA_CLIENT}"
    GITEA_SECRET="${WOODPECKER_GITEA_SECRET}"
    log_ok "Using OAuth2 credentials from environment variables"
  else
    echo -e "  ${DIM}(You can skip this now and edit ${WOODPECKER_CONFIG}/server.conf later)${NC}"
    echo ""
    read -rp "  Gitea OAuth2 Client ID [leave blank to set later]: " GITEA_CLIENT
    read -rp "  Gitea OAuth2 Client Secret [leave blank to set later]: " GITEA_SECRET
    echo ""
    if [ -z "${GITEA_CLIENT}" ] || [ -z "${GITEA_SECRET}" ]; then
      GITEA_CLIENT="<REPLACE_WITH_GITEA_CLIENT_ID>"
      GITEA_SECRET="<REPLACE_WITH_GITEA_CLIENT_SECRET>"
      log_warn "OAuth2 credentials not set — edit ${WOODPECKER_CONFIG}/server.conf before starting"
    else
      log_ok "OAuth2 credentials recorded"
    fi
  fi
fi

# Generate agent secret for server<->agent communication
AGENT_SECRET=$(openssl rand -hex 32)

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: Write configuration files
# ══════════════════════════════════════════════════════════════════════════════
header "Step 5/7 — Configuration"

# Server config
cat > "${WOODPECKER_CONFIG}/server.conf" << EOF
# Crontech — Woodpecker CI Server Configuration
# Authenticates via Gitea OAuth2. SQLite database. No Docker.

# Server
WOODPECKER_HOST=https://${CI_DOMAIN}
WOODPECKER_SERVER_ADDR=:${WOODPECKER_PORT}
WOODPECKER_OPEN=false
WOODPECKER_ADMIN=craig

# Gitea integration
WOODPECKER_GITEA=true
WOODPECKER_GITEA_URL=https://${GIT_DOMAIN}
WOODPECKER_GITEA_CLIENT=${GITEA_CLIENT}
WOODPECKER_GITEA_SECRET=${GITEA_SECRET}
WOODPECKER_GITEA_SKIP_VERIFY=false

# Agent communication
WOODPECKER_AGENT_SECRET=${AGENT_SECRET}

# Database (SQLite — same pattern as Gitea, no external DB)
WOODPECKER_DATABASE_DRIVER=sqlite3
WOODPECKER_DATABASE_DATASOURCE=${WOODPECKER_DIR}/server/woodpecker.db

# Logging
WOODPECKER_LOG_LEVEL=info

# Pipeline defaults
WOODPECKER_DEFAULT_CLONE_IMAGE=
WOODPECKER_BACKEND_LOCAL_TEMP_DIR=${WOODPECKER_DIR}/agent/tmp
EOF

chown root:woodpecker "${WOODPECKER_CONFIG}/server.conf"
chmod 640 "${WOODPECKER_CONFIG}/server.conf"
log_ok "Server config written to ${WOODPECKER_CONFIG}/server.conf"

# Agent config
cat > "${WOODPECKER_CONFIG}/agent.conf" << EOF
# Crontech — Woodpecker CI Agent Configuration
# Runs pipelines locally (no Docker). Communicates with server via gRPC.

WOODPECKER_SERVER=localhost:${WOODPECKER_PORT}
WOODPECKER_AGENT_SECRET=${AGENT_SECRET}
WOODPECKER_BACKEND_LOCAL_TEMP_DIR=${WOODPECKER_DIR}/agent/tmp
WOODPECKER_MAX_WORKFLOWS=2
WOODPECKER_BACKEND=local

# gRPC connection (same machine, no TLS needed)
WOODPECKER_GRPC_SECURE=false
EOF

chown root:woodpecker "${WOODPECKER_CONFIG}/agent.conf"
chmod 640 "${WOODPECKER_CONFIG}/agent.conf"
log_ok "Agent config written to ${WOODPECKER_CONFIG}/agent.conf"

# Create tmp directory for local pipeline execution
mkdir -p "${WOODPECKER_DIR}/agent/tmp"
chown -R woodpecker:woodpecker "${WOODPECKER_DIR}"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6: Create systemd services
# ══════════════════════════════════════════════════════════════════════════════
header "Step 6/7 — Systemd Services"

# Detect bun binary path (agent needs it to run pipelines)
BUN_PATH=$(which bun 2>/dev/null || echo "/home/deploy/.bun/bin/bun")

# ── woodpecker-server.service ────────────────────────────────────────────────
cat > /etc/systemd/system/woodpecker-server.service << EOF
[Unit]
Description=Woodpecker CI Server
After=network.target gitea.service
Requires=gitea.service

[Service]
Type=simple
User=woodpecker
Group=woodpecker
WorkingDirectory=${WOODPECKER_DIR}/server
ExecStart=${WP_SERVER_BIN}
Restart=always
RestartSec=5
EnvironmentFile=${WOODPECKER_CONFIG}/server.conf

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${WOODPECKER_DIR}

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=woodpecker-server

[Install]
WantedBy=multi-user.target
EOF

log_ok "Created woodpecker-server.service"

# ── woodpecker-agent.service ─────────────────────────────────────────────────
cat > /etc/systemd/system/woodpecker-agent.service << EOF
[Unit]
Description=Woodpecker CI Agent (Local Backend)
After=woodpecker-server.service
Requires=woodpecker-server.service

[Service]
Type=simple
# Agent runs as deploy user so it has access to bun, the repo, and
# can execute build commands with the same permissions as manual deploys
User=deploy
Group=deploy
WorkingDirectory=${WOODPECKER_DIR}/agent
ExecStart=${WP_AGENT_BIN}
Restart=always
RestartSec=5
EnvironmentFile=${WOODPECKER_CONFIG}/agent.conf

# Give the agent access to bun and system tools
Environment=PATH=${BUN_PATH%/*}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=/home/deploy

# Hardening (less restrictive — agent needs to execute builds)
NoNewPrivileges=true
PrivateTmp=true
ReadWritePaths=${WOODPECKER_DIR} ${REPO_DIR} /tmp

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=woodpecker-agent

[Install]
WantedBy=multi-user.target
EOF

log_ok "Created woodpecker-agent.service"

# Give deploy user read access to agent config
usermod -aG woodpecker deploy 2>/dev/null || true

systemctl daemon-reload
systemctl enable woodpecker-server
systemctl enable woodpecker-agent
log_ok "Services enabled (will start on boot)"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 7: Configure Caddy reverse proxy
# ══════════════════════════════════════════════════════════════════════════════
header "Step 7/7 — Caddy Reverse Proxy"

CADDYFILE="/etc/caddy/Caddyfile"
if grep -q "${CI_DOMAIN}" "${CADDYFILE}" 2>/dev/null; then
  log_warn "Caddy block for ${CI_DOMAIN} already exists — overwriting"
  sed -i "/^${CI_DOMAIN//./\\.} {/,/^}/d" "${CADDYFILE}"
fi

cat >> "${CADDYFILE}" << EOF

# CI server — ci.crontech.ai
${CI_DOMAIN} {
	reverse_proxy localhost:${WOODPECKER_PORT}
	encode gzip zstd

	header {
		X-Content-Type-Options "nosniff"
		X-Frame-Options "SAMEORIGIN"
		Referrer-Policy "strict-origin-when-cross-origin"
		Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
		-Server
	}

	log {
		output file /var/log/caddy/woodpecker.log {
			roll_size 50MiB
			roll_keep 5
		}
	}
}
EOF

log_ok "Caddy block added for ${CI_DOMAIN}"

if caddy validate --config "${CADDYFILE}" --adapter caddyfile 2>/dev/null; then
  log_ok "Caddyfile validated"
else
  log_warn "Caddyfile validation failed — this is normal if DNS is not yet configured"
fi

# Update sudoers for deploy user
SUDOERS_FILE="/etc/sudoers.d/crontech-deploy"
if [ -f "${SUDOERS_FILE}" ]; then
  if ! grep -q "woodpecker" "${SUDOERS_FILE}" 2>/dev/null; then
    cat > "${SUDOERS_FILE}" << SUDOERS
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart crontech-api, /bin/systemctl restart crontech-web, /bin/systemctl restart caddy, /bin/systemctl reload caddy, /bin/systemctl restart gitea, /bin/systemctl restart woodpecker-server, /bin/systemctl restart woodpecker-agent, /bin/journalctl *
SUDOERS
    chmod 440 "${SUDOERS_FILE}"
    log_ok "Updated sudoers to include woodpecker services"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# Start services (if OAuth is configured)
# ══════════════════════════════════════════════════════════════════════════════
if echo "${GITEA_CLIENT}" | grep -q "REPLACE"; then
  log_warn "OAuth2 not configured — services NOT started"
  echo -e "  ${YELLOW}Edit ${WOODPECKER_CONFIG}/server.conf with your Gitea OAuth2 credentials,${NC}"
  echo -e "  ${YELLOW}then run: systemctl start woodpecker-server woodpecker-agent${NC}"
else
  systemctl start woodpecker-server
  sleep 2
  systemctl start woodpecker-agent
  log_ok "Woodpecker server and agent started"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
header "Woodpecker CI Setup Complete"

SERVER_IP=$(curl -sf --max-time 5 ifconfig.me 2>/dev/null || echo "<YOUR_SERVER_IP>")

echo ""
echo -e "  ${BOLD}${GREEN}Woodpecker CI — Self-Hosted — Ready${NC}"
echo ""
echo -e "  ${BOLD}Server:${NC}        woodpecker-server.service (port ${WOODPECKER_PORT})"
echo -e "  ${BOLD}Agent:${NC}         woodpecker-agent.service (local backend, no Docker)"
echo -e "  ${BOLD}Config:${NC}        ${WOODPECKER_CONFIG}/server.conf"
echo -e "  ${BOLD}Agent Config:${NC}  ${WOODPECKER_CONFIG}/agent.conf"
echo -e "  ${BOLD}Database:${NC}      ${WOODPECKER_DIR}/server/woodpecker.db (SQLite)"
echo -e "  ${BOLD}Pipelines:${NC}     .woodpecker.yml in repo root"
echo ""
echo -e "  ${BOLD}URLs (after DNS):${NC}"
echo -e "    ${DIM}https://${CI_DOMAIN}${NC}  — CI Dashboard"
echo ""
echo -e "  ${YELLOW}${BOLD}Next Steps:${NC}"
echo ""
echo -e "  ${BOLD}1.${NC} Point DNS A record to this server:"
echo -e "     ${DIM}${CI_DOMAIN} → ${SERVER_IP}${NC}"
echo ""
echo -e "  ${BOLD}2.${NC} Reload Caddy:"
echo -e "     ${DIM}systemctl reload caddy${NC}"
echo ""
if echo "${GITEA_CLIENT}" | grep -q "REPLACE"; then
  echo -e "  ${BOLD}3.${NC} Set Gitea OAuth2 credentials in ${WOODPECKER_CONFIG}/server.conf:"
  echo -e "     ${DIM}WOODPECKER_GITEA_CLIENT=<your-client-id>${NC}"
  echo -e "     ${DIM}WOODPECKER_GITEA_SECRET=<your-client-secret>${NC}"
  echo ""
  echo -e "  ${BOLD}4.${NC} Start Woodpecker:"
  echo -e "     ${DIM}systemctl start woodpecker-server woodpecker-agent${NC}"
  echo ""
  echo -e "  ${BOLD}5.${NC} Log in to https://${CI_DOMAIN} via Gitea OAuth and activate the repo."
else
  echo -e "  ${BOLD}3.${NC} Log in to https://${CI_DOMAIN} via Gitea OAuth and activate the repo."
fi
echo ""
echo -e "  ${BOLD}Useful Commands:${NC}"
echo -e "    ${DIM}systemctl status woodpecker-server woodpecker-agent${NC}   (status)"
echo -e "    ${DIM}journalctl -u woodpecker-server -f${NC}                    (server logs)"
echo -e "    ${DIM}journalctl -u woodpecker-agent -f${NC}                     (agent logs)"
echo ""
echo -e "  ${BOLD}Architecture:${NC}"
echo -e "    ${DIM}Gitea (port ${GITEA_PORT}) → webhook on push → Woodpecker server (port ${WOODPECKER_PORT})${NC}"
echo -e "    ${DIM}Woodpecker server → assigns pipeline → local agent → runs build steps${NC}"
echo -e "    ${DIM}Agent runs as 'deploy' user — same perms as manual deploy${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  Woodpecker CI is configured. GitHub Actions: no longer needed.${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
