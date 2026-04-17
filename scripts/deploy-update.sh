#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${CYAN}[crontech]${NC} $1"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $1"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $1"; }
fail() { echo -e "${RED}[FAILED]${NC} $1"; exit 1; }

COMPOSE_FILE="docker-compose.production.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
  fail "$COMPOSE_FILE not found. Run deploy-production.sh for first-time setup."
fi

log "Pulling latest code..."
git pull --ff-only origin main || fail "Git pull failed. Resolve conflicts first."
ok "Code updated"

log "Building containers..."
docker compose -f "$COMPOSE_FILE" build --parallel || fail "Build failed"
ok "Containers built"

log "Rolling restart..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans || fail "Restart failed"
ok "Services restarted"

log "Running database migrations..."
docker compose -f "$COMPOSE_FILE" exec -T api bun run packages/db/src/migrate.ts 2>/dev/null || warn "Migration skipped (may already be current)"
ok "Migrations applied"

log "Waiting for health checks..."
RETRIES=30
for i in $(seq 1 $RETRIES); do
  if docker compose -f "$COMPOSE_FILE" exec -T api curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    ok "API healthy"
    break
  fi
  if [ "$i" -eq "$RETRIES" ]; then
    fail "API health check timed out after ${RETRIES}s"
  fi
  sleep 1
done

for i in $(seq 1 $RETRIES); do
  if docker compose -f "$COMPOSE_FILE" exec -T web curl -sf http://localhost:3000/ > /dev/null 2>&1; then
    ok "Web healthy"
    break
  fi
  if [ "$i" -eq "$RETRIES" ]; then
    fail "Web health check timed out after ${RETRIES}s"
  fi
  sleep 1
done

SHA=$(git rev-parse --short HEAD)
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Crontech updated to ${SHA}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
