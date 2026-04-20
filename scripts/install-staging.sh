#!/usr/bin/env bash
# install-staging.sh — idempotent installer for the Crontech staging
# environment on the same bare-metal Vultr box as production.
#
# What it does:
#   1. Writes crontech-web-staging.service   (port 3010)
#   2. Writes crontech-api-staging.service   (port 3011)
#   3. Creates postgres db `crontech_staging` + user (if missing)
#   4. Generates /opt/crontech/.env.staging from .env.production.example
#      with freshly-generated secrets (openssl rand -hex 32)
#   5. systemctl daemon-reload + enable + start both units
#
# Must be run as root (uses systemctl, /etc/systemd, sudo -u postgres).
# Safe to re-run — skips work that's already done.

set -euo pipefail

APP_DIR="/opt/crontech"
ENV_FILE="${APP_DIR}/.env.staging"
ENV_EXAMPLE="${APP_DIR}/.env.production.example"
DB_NAME="crontech_staging"
DB_USER="crontech_staging"
WEB_UNIT="/etc/systemd/system/crontech-web-staging.service"
API_UNIT="/etc/systemd/system/crontech-api-staging.service"

log() { echo ">>> $*"; }

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: must be run as root (try: sudo $0)" >&2
  exit 1
fi

[[ -d "$APP_DIR" ]] || { echo "ERROR: $APP_DIR missing — deploy prod first" >&2; exit 1; }

log "Writing $WEB_UNIT"
cat > "$WEB_UNIT" <<'EOF'
[Unit]
Description=Crontech Web STAGING (SolidStart on Bun)
Documentation=https://staging.crontech.ai
After=network.target crontech-api-staging.service
Wants=crontech-api-staging.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/crontech
ExecStart=/usr/local/bin/bun run --cwd apps/web start
Restart=always
RestartSec=5
Environment=HOST=0.0.0.0
Environment=PORT=3010
Environment=NODE_ENV=production
EnvironmentFile=-/opt/crontech/.env.staging
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/crontech
StandardOutput=journal
StandardError=journal
SyslogIdentifier=crontech-web-staging

[Install]
WantedBy=multi-user.target
EOF

log "Writing $API_UNIT"
cat > "$API_UNIT" <<'EOF'
[Unit]
Description=Crontech API STAGING (Hono on Bun)
Documentation=https://staging-api.crontech.ai
After=network.target postgres.service
Wants=postgres.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/crontech
ExecStart=/usr/local/bin/bun run --cwd apps/api start
Restart=always
RestartSec=5
Environment=HOST=0.0.0.0
Environment=API_PORT=3011
Environment=NODE_ENV=production
EnvironmentFile=-/opt/crontech/.env.staging
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/crontech
StandardOutput=journal
StandardError=journal
SyslogIdentifier=crontech-api-staging

[Install]
WantedBy=multi-user.target
EOF

log "Ensuring postgres db/user ${DB_NAME} exists"
DB_PASS="$(sudo -u postgres psql -tAc "SELECT 'exists' FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null || true)"
if [[ "$DB_PASS" != "exists" ]]; then
  GEN_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE USER ${DB_USER} WITH PASSWORD '${GEN_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
  log "Created postgres user ${DB_USER} (password saved below)"
  DB_URL="postgresql://${DB_USER}:${GEN_PASS}@127.0.0.1:5432/${DB_NAME}"
else
  log "Postgres user ${DB_USER} already exists — skipping create"
  DB_URL=""
fi

if [[ ! -f "$ENV_FILE" ]]; then
  [[ -f "$ENV_EXAMPLE" ]] || { echo "ERROR: $ENV_EXAMPLE missing" >&2; exit 1; }
  log "Generating $ENV_FILE from $ENV_EXAMPLE"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  SESSION_SECRET="$(openssl rand -hex 32)"
  JWT_SECRET="$(openssl rand -hex 32)"
  ENCRYPTION_KEY="$(openssl rand -hex 32)"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" "$ENV_FILE"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$ENV_FILE"
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY}|" "$ENV_FILE"
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" "$ENV_FILE"
  if [[ -n "$DB_URL" ]]; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DB_URL}|" "$ENV_FILE"
  fi
  chown deploy:deploy "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  log "$ENV_FILE already exists — leaving untouched"
fi

log "systemctl daemon-reload"
systemctl daemon-reload

for unit in crontech-api-staging crontech-web-staging; do
  log "enable + (re)start ${unit}"
  systemctl enable "${unit}" >/dev/null
  systemctl restart "${unit}"
done

log "Done. Check: systemctl status crontech-web-staging crontech-api-staging"
