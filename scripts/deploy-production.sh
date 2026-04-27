#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Crontech — Full Production Deploy (Fresh VPS)
# ──────────────────────────────────────────────────────────────────────────────
# One-command deploy script that takes a fresh VPS from zero to running
# Crontech production stack.
#
# Usage:
#   chmod +x scripts/deploy-production.sh
#   ./scripts/deploy-production.sh
#
# Prerequisites:
#   - Docker + docker compose installed
#   - Git installed
#   - .env.production file present at the repo root
#
# Idempotent: safe to re-run. Skips steps that are already complete.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly REPO_URL="https://github.com/ccantynz-alt/Crontech.git"
readonly COMPOSE_FILE="docker-compose.production.yml"
readonly DEPLOY_DIR="${DEPLOY_DIR:-${REPO_ROOT}}"
readonly HEALTH_TIMEOUT=120         # seconds to wait for health checks
readonly HEALTH_INTERVAL=3          # seconds between health check attempts
readonly FIRST_RUN_MARKER=".crontech-initialized"

# ── Colors & Symbols ─────────────────────────────────────────────────────────
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly NC='\033[0m'  # No Color

readonly CHECK="${GREEN}✔${NC}"
readonly CROSS="${RED}✘${NC}"
readonly ARROW="${CYAN}▸${NC}"
readonly WARN="${YELLOW}⚠${NC}"

# ── Logging ───────────────────────────────────────────────────────────────────
log()      { echo -e "${ARROW} $*"; }
log_ok()   { echo -e "${CHECK} $*"; }
log_err()  { echo -e "${CROSS} $*" >&2; }
log_warn() { echo -e "${WARN} $*"; }
log_bold() { echo -e "${BOLD}$*${NC}"; }

header() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${BLUE}  $*${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── Error Handling ────────────────────────────────────────────────────────────
cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo ""
    log_err "${RED}${BOLD}Deploy failed with exit code ${exit_code}${NC}"
    echo ""
    log_err "Troubleshooting:"
    log_err "  1. Check the logs:  docker compose -f ${COMPOSE_FILE} logs"
    log_err "  2. Check status:    docker compose -f ${COMPOSE_FILE} ps"
    log_err "  3. Verify .env:     cat .env.production"
    log_err "  4. Re-run:          ./scripts/deploy-production.sh"
    echo ""
  fi
}
trap cleanup EXIT

# ── Elapsed Timer ─────────────────────────────────────────────────────────────
DEPLOY_START=$(date +%s)
elapsed() {
  local now
  now=$(date +%s)
  local diff=$(( now - DEPLOY_START ))
  printf "%dm %ds" $(( diff / 60 )) $(( diff % 60 ))
}

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: PREREQUISITES
# ══════════════════════════════════════════════════════════════════════════════
header "Step 1/7 — Checking Prerequisites"

# Docker
if command -v docker &>/dev/null; then
  docker_version=$(docker --version | head -1)
  log_ok "Docker: ${DIM}${docker_version}${NC}"
else
  log_err "Docker is not installed."
  echo ""
  echo "  Install Docker (download and run installer script):"
  echo "    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sh /tmp/get-docker.sh"
  echo "    sudo usermod -aG docker \$USER"
  echo "    newgrp docker"
  echo ""
  exit 1
fi

# Docker Compose (v2 plugin or standalone)
if docker compose version &>/dev/null; then
  compose_version=$(docker compose version --short 2>/dev/null || docker compose version)
  log_ok "Docker Compose: ${DIM}${compose_version}${NC}"
else
  log_err "Docker Compose is not installed."
  echo ""
  echo "  Install Docker Compose plugin:"
  echo "    sudo apt-get update"
  echo "    sudo apt-get install docker-compose-plugin"
  echo ""
  exit 1
fi

# Git
if command -v git &>/dev/null; then
  git_version=$(git --version)
  log_ok "Git: ${DIM}${git_version}${NC}"
else
  log_err "Git is not installed."
  echo ""
  echo "  Install Git:"
  echo "    sudo apt-get update && sudo apt-get install -y git"
  echo ""
  exit 1
fi

# .env.production
if [ -f "${DEPLOY_DIR}/.env.production" ]; then
  env_vars=$(grep -c -v '^\s*#\|^\s*$' "${DEPLOY_DIR}/.env.production" 2>/dev/null || echo "0")
  log_ok ".env.production: ${DIM}${env_vars} variables configured${NC}"
else
  log_err ".env.production not found at ${DEPLOY_DIR}/.env.production"
  echo ""
  echo -e "  Create ${BOLD}.env.production${NC} with at least these variables:"
  echo ""
  echo "    # Database"
  echo "    DATABASE_URL=file:/data/crontech.db"
  echo "    TURSO_DATABASE_URL=libsql://your-db.turso.io"
  echo "    TURSO_AUTH_TOKEN=<your-turso-auth-token>"
  echo ""
  echo "    # Auth  (generate with: openssl rand -base64 48)"
  echo "    SESSION_SECRET=<generate-a-random-64-char-string>"
  echo "    JWT_SECRET=<generate-a-random-64-char-string>"
  echo "    WEBAUTHN_RP_ID=crontech.ai"
  echo "    WEBAUTHN_RP_NAME=Crontech"
  echo "    WEBAUTHN_ORIGIN=https://crontech.ai"
  echo ""
  echo "    # Google OAuth"
  echo "    GOOGLE_CLIENT_ID=<your-google-client-id>"
  echo "    GOOGLE_CLIENT_SECRET=<your-google-client-secret>"
  echo ""
  echo "    # AI"
  echo "    OPENAI_API_KEY=sk-..."
  echo ""
  echo "    # Domain"
  echo "    DOMAIN=crontech.ai"
  echo "    API_URL=https://api.crontech.ai"
  echo "    WEB_URL=https://crontech.ai"
  echo ""
  echo "  See docs/ENV_TEMPLATE.md for the full list."
  echo ""
  exit 1
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: CLONE / PULL REPO
# ══════════════════════════════════════════════════════════════════════════════
header "Step 2/7 — Repository"

if [ -d "${DEPLOY_DIR}/.git" ]; then
  log "Repository already cloned. Pulling latest..."
  cd "${DEPLOY_DIR}"
  git fetch origin
  current_branch=$(git branch --show-current)
  git pull origin "${current_branch}" --ff-only 2>/dev/null || {
    log_warn "Fast-forward pull failed. Using reset to match remote."
    git reset --hard "origin/${current_branch}"
  }
  latest_sha=$(git rev-parse --short HEAD)
  log_ok "Repository updated to ${DIM}${latest_sha}${NC} on ${DIM}${current_branch}${NC}"
else
  log "Cloning repository..."
  git clone "${REPO_URL}" "${DEPLOY_DIR}"
  cd "${DEPLOY_DIR}"
  latest_sha=$(git rev-parse --short HEAD)
  log_ok "Repository cloned at ${DIM}${latest_sha}${NC}"
fi

cd "${DEPLOY_DIR}"
GIT_SHA=$(git rev-parse --short HEAD)

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: BUILD & START SERVICES
# ══════════════════════════════════════════════════════════════════════════════
header "Step 3/7 — Building Containers"

log "Building production images (GIT_SHA=${GIT_SHA})..."
docker compose -f "${COMPOSE_FILE}" build \
  --build-arg GIT_SHA="${GIT_SHA}" \
  2>&1 | while IFS= read -r line; do
    echo -e "  ${DIM}${line}${NC}"
  done

log_ok "Images built successfully"

header "Step 4/7 — Starting Services"

log "Starting all services..."
docker compose -f "${COMPOSE_FILE}" --env-file .env.production up -d

# Wait a moment for containers to initialize
sleep 3

# Show container status
running=$(docker compose -f "${COMPOSE_FILE}" ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || docker compose -f "${COMPOSE_FILE}" ps)
log_ok "Containers started:"
echo ""
echo "${running}" | while IFS= read -r line; do
  echo -e "  ${line}"
done
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: DATABASE MIGRATIONS
# ══════════════════════════════════════════════════════════════════════════════
header "Step 5/7 — Database Migrations"

log "Running database migrations..."
docker compose -f "${COMPOSE_FILE}" exec -T api \
  bun run packages/db/src/migrate.ts 2>&1 | while IFS= read -r line; do
    echo -e "  ${DIM}${line}${NC}"
  done

log_ok "Migrations complete"

# ── Seed Admin (First Run Only) ──────────────────────────────────────────────
if [ ! -f "${DEPLOY_DIR}/${FIRST_RUN_MARKER}" ]; then
  log "First run detected. Seeding admin user..."
  echo ""
  echo -e "  ${YELLOW}NOTE:${NC} The admin seed requires a registered user."
  echo -e "  After registering your first account, promote it with:"
  echo ""
  echo -e "    docker compose -f ${COMPOSE_FILE} exec api \\"
  echo -e "      bun run scripts/seed-admin.ts ${BOLD}your-email@example.com${NC}"
  echo ""

  # Mark as initialized so we skip this on re-run
  touch "${DEPLOY_DIR}/${FIRST_RUN_MARKER}"
  log_ok "First-run marker set (${DIM}${FIRST_RUN_MARKER}${NC})"
else
  log_ok "Not first run — skipping admin seed prompt"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6: HEALTH CHECKS
# ══════════════════════════════════════════════════════════════════════════════
header "Step 6/7 — Health Checks"

wait_for_health() {
  local name="$1"
  local url="$2"
  local timeout="$3"
  local start elapsed_secs

  start=$(date +%s)
  log "Waiting for ${BOLD}${name}${NC} at ${DIM}${url}${NC} (timeout: ${timeout}s)..."

  while true; do
    elapsed_secs=$(( $(date +%s) - start ))

    if [ $elapsed_secs -ge "$timeout" ]; then
      log_err "${name} did not become healthy within ${timeout}s"
      log_err "Check logs: docker compose -f ${COMPOSE_FILE} logs ${name,,}"
      return 1
    fi

    # Use docker's internal networking via exec, or curl from host
    if curl -sf --max-time 5 "${url}" >/dev/null 2>&1; then
      log_ok "${name} is healthy ${DIM}(${elapsed_secs}s)${NC}"
      return 0
    fi

    # Show a progress dot every interval
    printf "  ${DIM}.${NC}"
    sleep "${HEALTH_INTERVAL}"
  done
}

# API health check
api_healthy=true
wait_for_health "API" "http://localhost:3001/api/health" "${HEALTH_TIMEOUT}" || api_healthy=false

# Web health check
web_healthy=true
wait_for_health "Web" "http://localhost:3000/" "${HEALTH_TIMEOUT}" || web_healthy=false

echo ""
if [ "$api_healthy" = true ] && [ "$web_healthy" = true ]; then
  log_ok "${GREEN}${BOLD}All health checks passed${NC}"
else
  log_warn "Some health checks failed — check logs above"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 7: SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
header "Step 7/7 — Deploy Summary"

echo ""
echo -e "  ${BOLD}${GREEN}Crontech Production Deploy Complete${NC}"
echo -e "  ${DIM}Elapsed: $(elapsed)${NC}"
echo ""
echo -e "  ${BOLD}Commit:${NC}    ${GIT_SHA}"
echo -e "  ${BOLD}Compose:${NC}   ${COMPOSE_FILE}"
echo ""
echo -e "  ${BOLD}Services:${NC}"

# Container status with color coding
docker compose -f "${COMPOSE_FILE}" ps --format "{{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | while IFS=$'\t' read -r name status ports; do
  if echo "${status}" | grep -qi "up\|healthy"; then
    echo -e "    ${CHECK} ${name}  ${DIM}${status}${NC}"
  else
    echo -e "    ${CROSS} ${name}  ${RED}${status}${NC}"
  fi
  if [ -n "${ports}" ]; then
    echo -e "      ${DIM}Ports: ${ports}${NC}"
  fi
done

echo ""
echo -e "  ${BOLD}URLs (after DNS setup):${NC}"
echo -e "    ${CYAN}https://crontech.ai${NC}        ${DIM}(Web App)${NC}"
echo -e "    ${CYAN}https://api.crontech.ai${NC}    ${DIM}(API)${NC}"
echo ""
echo -e "  ${BOLD}Local Access (immediate):${NC}"
echo -e "    ${CYAN}http://localhost:3000${NC}       ${DIM}(Web App)${NC}"
echo -e "    ${CYAN}http://localhost:3001${NC}       ${DIM}(API)${NC}"
echo -e "    ${CYAN}http://localhost:6333${NC}       ${DIM}(Qdrant)${NC}"

echo ""
echo -e "  ${BOLD}Next Steps:${NC}"
echo -e "    1. ${ARROW} Configure DNS A records:"
echo -e "         ${DIM}crontech.ai      → $(curl -sf ifconfig.me 2>/dev/null || echo '<YOUR_SERVER_IP>')${NC}"
echo -e "         ${DIM}api.crontech.ai  → $(curl -sf ifconfig.me 2>/dev/null || echo '<YOUR_SERVER_IP>')${NC}"
echo ""
echo -e "    2. ${ARROW} Set up a reverse proxy (nginx/caddy) for TLS:"
echo -e "         ${DIM}Port 3000 → crontech.ai (HTTPS)${NC}"
echo -e "         ${DIM}Port 3001 → api.crontech.ai (HTTPS)${NC}"
echo ""
echo -e "    3. ${ARROW} Register your first account, then promote to admin:"
echo -e "         ${DIM}docker compose -f ${COMPOSE_FILE} exec api \\${NC}"
echo -e "         ${DIM}  bun run scripts/seed-admin.ts your-email@example.com${NC}"
echo ""
echo -e "    4. ${ARROW} For updates, run:"
echo -e "         ${DIM}./scripts/deploy-update.sh${NC}"
echo ""
echo -e "  ${BOLD}Useful Commands:${NC}"
echo -e "    ${DIM}docker compose -f ${COMPOSE_FILE} logs -f          ${NC}${DIM}# Stream all logs${NC}"
echo -e "    ${DIM}docker compose -f ${COMPOSE_FILE} logs -f api      ${NC}${DIM}# Stream API logs${NC}"
echo -e "    ${DIM}docker compose -f ${COMPOSE_FILE} ps               ${NC}${DIM}# Container status${NC}"
echo -e "    ${DIM}docker compose -f ${COMPOSE_FILE} down             ${NC}${DIM}# Stop everything${NC}"
echo -e "    ${DIM}docker compose -f ${COMPOSE_FILE} restart api      ${NC}${DIM}# Restart a service${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  Deploy complete. Crontech is live.${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
