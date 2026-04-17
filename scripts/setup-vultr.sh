#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Crontech — Vultr VPS One-Time Setup
# ──────────────────────────────────────────────────────────────────────────────
# Run this ONCE on a fresh Vultr Ubuntu VPS to set up:
#   - A 'crontech' system user
#   - systemd services for the web app and API
#   - Caddy reverse proxy with automatic HTTPS
#   - .env files from the production template
#
# Usage:
#   1. SSH into your Vultr VPS as root
#   2. Clone the repo:  git clone https://github.com/ccantynz-alt/Crontech.git /opt/Crontech
#   3. Run:             bash /opt/Crontech/scripts/setup-vultr.sh
#   4. Edit the .env files with your actual secrets (see output for paths)
#   5. Point DNS A records for crontech.ai and api.crontech.ai to this server
#   6. Start everything:  systemctl start crontech-web crontech-api caddy
#
# Prerequisites:
#   - Ubuntu 20.04+ (Vultr standard image)
#   - Root access
#   - Bun already installed (curl -fsSL https://bun.sh/install | bash)
#   - Repo cloned at /opt/Crontech
#
# Idempotent: safe to re-run. Existing configs are overwritten.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
readonly REPO_DIR="/opt/Crontech"
readonly SERVICE_USER="crontech"
readonly DOMAIN="crontech.ai"
readonly WEB_PORT=3000
readonly API_PORT=4000

# ── Colors ────────────────────────────────────────────────────────────────────
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly NC='\033[0m'

log()      { echo -e "${CYAN}[setup]${NC} $*"; }
log_ok()   { echo -e "${GREEN}[  OK ]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[ WARN]${NC} $*"; }
log_err()  { echo -e "${RED}[FAIL ]${NC} $*" >&2; }

header() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${BLUE}  $*${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── Preflight Checks ─────────────────────────────────────────────────────────
header "Step 1/6 — Preflight Checks"

if [ "$(id -u)" -ne 0 ]; then
  log_err "This script must be run as root."
  exit 1
fi
log_ok "Running as root"

if [ ! -d "${REPO_DIR}/.git" ]; then
  log_err "Repo not found at ${REPO_DIR}. Clone it first:"
  echo "  git clone https://github.com/ccantynz-alt/Crontech.git ${REPO_DIR}"
  exit 1
fi
log_ok "Repo found at ${REPO_DIR}"

if ! command -v bun &>/dev/null; then
  log_err "Bun is not installed. Install it first:"
  echo "  curl -fsSL https://bun.sh/install | bash"
  echo "  source ~/.bashrc"
  exit 1
fi
log_ok "Bun: $(bun --version)"

# Detect bun binary path (needed for systemd ExecStart)
BUN_PATH="$(which bun)"
log_ok "Bun path: ${BUN_PATH}"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: Create system user
# ══════════════════════════════════════════════════════════════════════════════
header "Step 2/6 — System User"

if id "${SERVICE_USER}" &>/dev/null; then
  log_ok "User '${SERVICE_USER}' already exists"
else
  useradd --system --no-create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
  log_ok "Created system user '${SERVICE_USER}'"
fi

# Ensure the crontech user can read the repo and write build artifacts
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${REPO_DIR}"
log_ok "Repo ownership set to ${SERVICE_USER}"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: Create .env files from template
# ══════════════════════════════════════════════════════════════════════════════
header "Step 3/6 — Environment Files"

ENV_TEMPLATE="${REPO_DIR}/.env.production.example"

create_env_file() {
  local target="$1"
  local label="$2"

  if [ -f "${target}" ]; then
    log_warn "${label} already exists — skipping (edit manually if needed)"
  else
    cp "${ENV_TEMPLATE}" "${target}"
    chown "${SERVICE_USER}:${SERVICE_USER}" "${target}"
    chmod 600 "${target}"
    log_ok "Created ${label} from template"
  fi
}

create_env_file "${REPO_DIR}/apps/web/.env" "apps/web/.env"
create_env_file "${REPO_DIR}/apps/api/.env" "apps/api/.env"

echo ""
echo -e "  ${YELLOW}IMPORTANT:${NC} Edit these files with your actual secrets:"
echo -e "    ${DIM}nano ${REPO_DIR}/apps/web/.env${NC}"
echo -e "    ${DIM}nano ${REPO_DIR}/apps/api/.env${NC}"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: Create systemd service files
# ══════════════════════════════════════════════════════════════════════════════
header "Step 4/6 — Systemd Services"

# ── crontech-web.service ─────────────────────────────────────────────────────
cat > /etc/systemd/system/crontech-web.service << EOF
[Unit]
Description=Crontech Web App (SolidStart/Vinxi on Bun)
After=network.target
Wants=crontech-api.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${REPO_DIR}/apps/web
ExecStart=${BUN_PATH} run start
Restart=always
RestartSec=5

# Environment
Environment=HOST=0.0.0.0
Environment=PORT=${WEB_PORT}
Environment=NODE_ENV=production
Environment=SERVER_PRESET=bun

# Load env file if it exists
EnvironmentFile=-${REPO_DIR}/apps/web/.env

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${REPO_DIR}
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=crontech-web

[Install]
WantedBy=multi-user.target
EOF

log_ok "Created crontech-web.service"

# ── crontech-api.service ─────────────────────────────────────────────────────
cat > /etc/systemd/system/crontech-api.service << EOF
[Unit]
Description=Crontech API (Hono on Bun)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${REPO_DIR}/apps/api
ExecStart=${BUN_PATH} run start
Restart=always
RestartSec=5

# Environment
Environment=HOST=0.0.0.0
Environment=PORT=${API_PORT}
Environment=NODE_ENV=production

# Load env file if it exists
EnvironmentFile=-${REPO_DIR}/apps/api/.env

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${REPO_DIR}
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=crontech-api

[Install]
WantedBy=multi-user.target
EOF

log_ok "Created crontech-api.service"

# Reload systemd to pick up new services
systemctl daemon-reload

# Enable services to start on boot
systemctl enable crontech-web
systemctl enable crontech-api
log_ok "Services enabled (will start on boot)"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: Install and configure Caddy
# ══════════════════════════════════════════════════════════════════════════════
header "Step 5/6 — Caddy Reverse Proxy"

if command -v caddy &>/dev/null; then
  log_ok "Caddy already installed: $(caddy version)"
else
  log "Installing Caddy..."

  # Install Caddy via official apt repo (recommended for Ubuntu)
  apt-get update -qq
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl

  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list

  apt-get update -qq
  apt-get install -y -qq caddy

  log_ok "Caddy installed: $(caddy version)"
fi

# ── Caddyfile ────────────────────────────────────────────────────────────────
# Caddy handles automatic HTTPS via Let's Encrypt / ZeroSSL with zero config.
# Just point DNS A records to this server's IP and Caddy does the rest.
cat > /etc/caddy/Caddyfile << EOF
# ──────────────────────────────────────────────────────────────────────────────
# Crontech — Caddy Reverse Proxy
# ──────────────────────────────────────────────────────────────────────────────
# Caddy automatically provisions and renews TLS certificates via ACME.
# Just point DNS A records for both domains to this server's IP.
#
# To test before DNS is ready, use:
#   curl -k https://localhost
# ──────────────────────────────────────────────────────────────────────────────

# Web app — crontech.ai
${DOMAIN} {
	reverse_proxy localhost:${WEB_PORT}

	# Compression
	encode gzip zstd

	# Security headers
	header {
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
		-Server
	}

	# Logging
	log {
		output file /var/log/caddy/crontech-web.log {
			roll_size 50MiB
			roll_keep 5
		}
	}
}

# API — api.crontech.ai
api.${DOMAIN} {
	reverse_proxy localhost:${API_PORT}

	# Compression
	encode gzip zstd

	# CORS is handled by Hono middleware, so Caddy just proxies.

	# Security headers
	header {
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
		-Server
	}

	# Logging
	log {
		output file /var/log/caddy/crontech-api.log {
			roll_size 50MiB
			roll_keep 5
		}
	}
}
EOF

# Create log directory
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy

# Enable Caddy to start on boot
systemctl enable caddy
log_ok "Caddy configured and enabled"

# Validate Caddyfile
if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>/dev/null; then
  log_ok "Caddyfile validated"
else
  log_warn "Caddyfile validation failed — this is normal if DNS is not yet configured"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6: Summary
# ══════════════════════════════════════════════════════════════════════════════
header "Step 6/6 — Setup Complete"

SERVER_IP=$(curl -sf --max-time 5 ifconfig.me 2>/dev/null || echo "<YOUR_SERVER_IP>")

echo ""
echo -e "  ${BOLD}${GREEN}Crontech Vultr VPS Setup Complete${NC}"
echo ""
echo -e "  ${BOLD}System User:${NC}   ${SERVICE_USER}"
echo -e "  ${BOLD}Repo:${NC}          ${REPO_DIR}"
echo -e "  ${BOLD}Bun:${NC}           ${BUN_PATH}"
echo ""
echo -e "  ${BOLD}Systemd Services:${NC}"
echo -e "    ${DIM}crontech-web.service${NC}  — SolidStart on port ${WEB_PORT}"
echo -e "    ${DIM}crontech-api.service${NC}  — Hono API on port ${API_PORT}"
echo -e "    ${DIM}caddy.service${NC}         — Reverse proxy with auto-HTTPS"
echo ""
echo -e "  ${BOLD}Environment Files:${NC}"
echo -e "    ${DIM}${REPO_DIR}/apps/web/.env${NC}"
echo -e "    ${DIM}${REPO_DIR}/apps/api/.env${NC}"
echo ""
echo -e "  ${BOLD}Caddy Config:${NC}"
echo -e "    ${DIM}/etc/caddy/Caddyfile${NC}"
echo ""
echo -e "  ${BOLD}Logs:${NC}"
echo -e "    ${DIM}journalctl -u crontech-web -f${NC}   (web app logs)"
echo -e "    ${DIM}journalctl -u crontech-api -f${NC}   (API logs)"
echo -e "    ${DIM}journalctl -u caddy -f${NC}          (Caddy logs)"
echo -e "    ${DIM}/var/log/caddy/*.log${NC}            (Caddy access logs)"
echo ""
echo -e "  ${YELLOW}${BOLD}Next Steps:${NC}"
echo ""
echo -e "  ${BOLD}1.${NC} Edit .env files with your real secrets:"
echo -e "     ${DIM}nano ${REPO_DIR}/apps/web/.env${NC}"
echo -e "     ${DIM}nano ${REPO_DIR}/apps/api/.env${NC}"
echo ""
echo -e "  ${BOLD}2.${NC} Install dependencies and build:"
echo -e "     ${DIM}cd ${REPO_DIR} && bun install${NC}"
echo -e "     ${DIM}cd apps/web && SERVER_PRESET=bun bun run build${NC}"
echo -e "     ${DIM}cd ../api && bun run build${NC}"
echo ""
echo -e "  ${BOLD}3.${NC} Point DNS A records to this server:"
echo -e "     ${DIM}${DOMAIN}       → ${SERVER_IP}${NC}"
echo -e "     ${DIM}api.${DOMAIN}   → ${SERVER_IP}${NC}"
echo ""
echo -e "  ${BOLD}4.${NC} Start all services:"
echo -e "     ${DIM}systemctl start crontech-api crontech-web caddy${NC}"
echo ""
echo -e "  ${BOLD}5.${NC} Set GitHub repo secrets for auto-deploy:"
echo -e "     ${DIM}VULTR_SSH_KEY    — private SSH key for this server${NC}"
echo -e "     ${DIM}VULTR_SERVER_IP  — ${SERVER_IP}${NC}"
echo ""
echo -e "  ${BOLD}Useful Commands:${NC}"
echo -e "    ${DIM}systemctl status crontech-web crontech-api caddy${NC}  (status)"
echo -e "    ${DIM}systemctl restart crontech-web${NC}                    (restart web)"
echo -e "    ${DIM}systemctl restart crontech-api${NC}                    (restart API)"
echo -e "    ${DIM}caddy reload --config /etc/caddy/Caddyfile${NC}       (reload Caddy)"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  Setup complete. Configure .env files, then start services.${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
