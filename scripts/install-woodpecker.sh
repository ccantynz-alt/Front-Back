#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Crontech — Bare-Metal Woodpecker CI Installer (binary, no Docker)
# ──────────────────────────────────────────────────────────────────────────────
# Ships a Woodpecker CI server + agent as native systemd services. Uses SQLite
# for initial bootstrap; migrate to Postgres later (see runbook). Binds the
# server to localhost:8000 so Caddy can front it at ci.crontech.ai.
#
# This script is idempotent. Re-run to upgrade binaries, refresh systemd
# units, or rewrite /etc/woodpecker/*.env from current environment values.
#
# Required env vars:
#   WOODPECKER_HOST                    e.g. ci.crontech.ai (no scheme — script adds https://)
#   WOODPECKER_GITHUB_CLIENT_ID        GitHub OAuth app client id
#   WOODPECKER_GITHUB_CLIENT_SECRET    GitHub OAuth app client secret
#
# Optional env vars:
#   WOODPECKER_AGENT_SECRET            shared server<->agent secret; generated if unset
#   WOODPECKER_VERSION                 default: 3.10.0 (current Woodpecker stable)
#   WOODPECKER_ADMIN                   default: craig — comma-separated admin usernames
#   WOODPECKER_DATA_DIR                default: /var/lib/woodpecker
#   WOODPECKER_CONFIG_DIR              default: /etc/woodpecker
#   WOODPECKER_SERVER_ADDR             default: 127.0.0.1:8000 (Caddy fronts this)
#   WOODPECKER_GRPC_ADDR               default: 127.0.0.1:9000 (loopback only)
#
# Usage:
#   sudo -E bash scripts/install-woodpecker.sh
#
# Prerequisites: Ubuntu 22.04+, curl, tar, systemd, openssl. Caddy expected
# but not required — see infra/caddy/woodpecker.Caddyfile for the front.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
WOODPECKER_VERSION="${WOODPECKER_VERSION:-3.10.0}"
WOODPECKER_ADMIN="${WOODPECKER_ADMIN:-craig}"
WOODPECKER_DATA_DIR="${WOODPECKER_DATA_DIR:-/var/lib/woodpecker}"
WOODPECKER_CONFIG_DIR="${WOODPECKER_CONFIG_DIR:-/etc/woodpecker}"
WOODPECKER_SERVER_ADDR="${WOODPECKER_SERVER_ADDR:-127.0.0.1:8000}"
WOODPECKER_GRPC_ADDR="${WOODPECKER_GRPC_ADDR:-127.0.0.1:9000}"

SERVER_BIN="/usr/local/bin/woodpecker-server"
AGENT_BIN="/usr/local/bin/woodpecker-agent"
SERVER_ENV_FILE="${WOODPECKER_CONFIG_DIR}/server.env"
AGENT_ENV_FILE="${WOODPECKER_CONFIG_DIR}/agent.env"
SERVER_UNIT="/etc/systemd/system/woodpecker-server.service"
AGENT_UNIT="/etc/systemd/system/woodpecker-agent.service"

# ── Logging ───────────────────────────────────────────────────────────────────
log()  { printf '\033[0;36m[woodpecker]\033[0m %s\n' "$*"; }
ok()   { printf '\033[0;32m[  OK ]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN ]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31m[FAIL ]\033[0m %s\n' "$*" >&2; exit 1; }

# ── Preflight ─────────────────────────────────────────────────────────────────
[[ $(id -u) -eq 0 ]] || die "Must run as root (try: sudo -E bash $0)"

: "${WOODPECKER_HOST:?WOODPECKER_HOST required (e.g. ci.crontech.ai)}"
: "${WOODPECKER_GITHUB_CLIENT_ID:?WOODPECKER_GITHUB_CLIENT_ID required}"
: "${WOODPECKER_GITHUB_CLIENT_SECRET:?WOODPECKER_GITHUB_CLIENT_SECRET required}"

for bin in curl tar openssl systemctl install; do
  command -v "$bin" >/dev/null 2>&1 || die "missing required tool: $bin"
done

# Normalise WOODPECKER_HOST — strip scheme if present, then add https://
WOODPECKER_HOST_URL="https://${WOODPECKER_HOST#http://}"
WOODPECKER_HOST_URL="${WOODPECKER_HOST_URL#https://}"
WOODPECKER_HOST_URL="https://${WOODPECKER_HOST_URL}"

# Generate agent secret if not supplied
if [[ -z "${WOODPECKER_AGENT_SECRET:-}" ]]; then
  if [[ -f "$SERVER_ENV_FILE" ]] && grep -q '^WOODPECKER_AGENT_SECRET=' "$SERVER_ENV_FILE"; then
    WOODPECKER_AGENT_SECRET="$(grep '^WOODPECKER_AGENT_SECRET=' "$SERVER_ENV_FILE" | head -n1 | cut -d= -f2-)"
    ok "Reusing existing WOODPECKER_AGENT_SECRET from ${SERVER_ENV_FILE}"
  else
    WOODPECKER_AGENT_SECRET="$(openssl rand -hex 32)"
    ok "Generated new WOODPECKER_AGENT_SECRET"
  fi
fi

# ── 1. System user ────────────────────────────────────────────────────────────
if id woodpecker >/dev/null 2>&1; then
  ok "user 'woodpecker' exists"
else
  useradd --system --home-dir "${WOODPECKER_DATA_DIR}" --shell /usr/sbin/nologin \
    --user-group --comment "Woodpecker CI" woodpecker
  ok "created system user 'woodpecker'"
fi

# ── 2. Directories ────────────────────────────────────────────────────────────
install -d -m 0750 -o woodpecker -g woodpecker "${WOODPECKER_DATA_DIR}"
install -d -m 0750 -o woodpecker -g woodpecker "${WOODPECKER_DATA_DIR}/server"
install -d -m 0750 -o woodpecker -g woodpecker "${WOODPECKER_DATA_DIR}/agent"
install -d -m 0750 -o woodpecker -g woodpecker "${WOODPECKER_DATA_DIR}/agent/tmp"
install -d -m 0750 -o root      -g woodpecker "${WOODPECKER_CONFIG_DIR}"
ok "data dir: ${WOODPECKER_DATA_DIR}, config dir: ${WOODPECKER_CONFIG_DIR}"

# ── 3. Detect arch ────────────────────────────────────────────────────────────
case "$(uname -m)" in
  x86_64|amd64)  ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac

# ── 4. Download binaries ──────────────────────────────────────────────────────
download_binary() {
  local name="$1" target="$2"
  local url="https://github.com/woodpecker-ci/woodpecker/releases/download/v${WOODPECKER_VERSION}/${name}_linux_${ARCH}.tar.gz"
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf '${tmpdir}'" RETURN

  if [[ -x "$target" ]]; then
    local current
    current="$("$target" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)"
    if [[ "$current" == "$WOODPECKER_VERSION" ]]; then
      ok "${name} already at ${WOODPECKER_VERSION}"
      return 0
    fi
    log "upgrading ${name}: ${current:-unknown} → ${WOODPECKER_VERSION}"
  else
    log "installing ${name} v${WOODPECKER_VERSION}"
  fi

  curl -fSL --retry 3 --retry-delay 2 -o "${tmpdir}/${name}.tar.gz" "$url" \
    || die "failed to download ${url}"
  tar -xzf "${tmpdir}/${name}.tar.gz" -C "${tmpdir}"

  # Woodpecker release tarballs extract a single binary named ${name}
  if [[ -f "${tmpdir}/${name}" ]]; then
    install -m 0755 "${tmpdir}/${name}" "$target"
  elif [[ -f "${tmpdir}/woodpecker" ]]; then
    install -m 0755 "${tmpdir}/woodpecker" "$target"
  else
    die "could not find binary inside ${name}.tar.gz"
  fi
  ok "installed ${target}"
}

download_binary "woodpecker-server" "$SERVER_BIN"
download_binary "woodpecker-agent"  "$AGENT_BIN"

# ── 5. Write env files (mode 600, owned by woodpecker) ───────────────────────
umask 077

cat > "$SERVER_ENV_FILE" <<EOF
# Crontech — Woodpecker CI server config
# Written by scripts/install-woodpecker.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Mode 600, owner woodpecker:woodpecker. DO NOT commit this file.

# ── Network ───────────────────────────────────────────────────────────────────
WOODPECKER_HOST=${WOODPECKER_HOST_URL}
WOODPECKER_SERVER_ADDR=${WOODPECKER_SERVER_ADDR}
WOODPECKER_GRPC_ADDR=${WOODPECKER_GRPC_ADDR}
WOODPECKER_GRPC_SECRET=${WOODPECKER_AGENT_SECRET}

# ── Source forge: GitHub (swap to Gluecron later — see runbook) ───────────────
WOODPECKER_GITHUB=true
WOODPECKER_GITHUB_CLIENT=${WOODPECKER_GITHUB_CLIENT_ID}
WOODPECKER_GITHUB_SECRET=${WOODPECKER_GITHUB_CLIENT_SECRET}

# ── Auth / admin ──────────────────────────────────────────────────────────────
WOODPECKER_OPEN=false
WOODPECKER_ADMIN=${WOODPECKER_ADMIN}

# ── Agent shared secret ───────────────────────────────────────────────────────
WOODPECKER_AGENT_SECRET=${WOODPECKER_AGENT_SECRET}

# ── Database: SQLite for bootstrap. Migrate to Postgres per runbook. ──────────
WOODPECKER_DATABASE_DRIVER=sqlite3
WOODPECKER_DATABASE_DATASOURCE=${WOODPECKER_DATA_DIR}/server/woodpecker.sqlite

# ── Logging ───────────────────────────────────────────────────────────────────
WOODPECKER_LOG_LEVEL=info
EOF
chown root:woodpecker "$SERVER_ENV_FILE"
chmod 0640 "$SERVER_ENV_FILE"

cat > "$AGENT_ENV_FILE" <<EOF
# Crontech — Woodpecker CI agent config
# Written by scripts/install-woodpecker.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Mode 640, owner root:woodpecker. DO NOT commit this file.

WOODPECKER_SERVER=${WOODPECKER_GRPC_ADDR}
WOODPECKER_GRPC_SECURE=false
WOODPECKER_AGENT_SECRET=${WOODPECKER_AGENT_SECRET}

# Local backend: runs build steps as shell commands (no Docker).
WOODPECKER_BACKEND=local
WOODPECKER_BACKEND_LOCAL_TEMP_DIR=${WOODPECKER_DATA_DIR}/agent/tmp

# Concurrency: two parallel workflows per agent. Bump on bigger hosts.
WOODPECKER_MAX_WORKFLOWS=2

WOODPECKER_LOG_LEVEL=info
EOF
chown root:woodpecker "$AGENT_ENV_FILE"
chmod 0640 "$AGENT_ENV_FILE"

umask 022
ok "wrote ${SERVER_ENV_FILE} and ${AGENT_ENV_FILE} (0640 root:woodpecker)"

# ── 6. Install systemd units ─────────────────────────────────────────────────
# We inline the units here so the script is self-contained. The same
# content lives at infra/systemd/woodpecker-{server,agent}.service for
# readers who want to inspect them without running the installer.

cat > "$SERVER_UNIT" <<EOF
[Unit]
Description=Woodpecker CI Server
Documentation=https://woodpecker-ci.org/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=woodpecker
Group=woodpecker
EnvironmentFile=${SERVER_ENV_FILE}
ExecStart=${SERVER_BIN}
Restart=on-failure
RestartSec=5
WorkingDirectory=${WOODPECKER_DATA_DIR}/server

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
ReadWritePaths=${WOODPECKER_DATA_DIR}

StandardOutput=journal
StandardError=journal
SyslogIdentifier=woodpecker-server

[Install]
WantedBy=multi-user.target
EOF

cat > "$AGENT_UNIT" <<EOF
[Unit]
Description=Woodpecker CI Agent (local backend)
Documentation=https://woodpecker-ci.org/
After=woodpecker-server.service network-online.target
Wants=network-online.target
Requires=woodpecker-server.service

[Service]
Type=simple
User=woodpecker
Group=woodpecker
EnvironmentFile=${AGENT_ENV_FILE}
ExecStart=${AGENT_BIN}
Restart=on-failure
RestartSec=5
WorkingDirectory=${WOODPECKER_DATA_DIR}/agent

# Hardening (agent needs to execute shell commands for local backend —
# we keep ProtectSystem=strict but allow writes to the tmp dir).
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${WOODPECKER_DATA_DIR}

StandardOutput=journal
StandardError=journal
SyslogIdentifier=woodpecker-agent

[Install]
WantedBy=multi-user.target
EOF

ok "wrote ${SERVER_UNIT} and ${AGENT_UNIT}"

# ── 7. Enable + (re)start services ───────────────────────────────────────────
systemctl daemon-reload
systemctl enable woodpecker-server.service woodpecker-agent.service >/dev/null

# Restart so the units pick up any env/unit changes on re-run.
systemctl restart woodpecker-server.service
sleep 2
systemctl restart woodpecker-agent.service
ok "woodpecker-server + woodpecker-agent enabled and (re)started"

# ── 8. Summary ────────────────────────────────────────────────────────────────
cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Woodpecker CI v${WOODPECKER_VERSION} installed (bare-metal, no Docker)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Host URL        ${WOODPECKER_HOST_URL}
  HTTP bind       ${WOODPECKER_SERVER_ADDR}     (Caddy terminates TLS)
  gRPC bind       ${WOODPECKER_GRPC_ADDR}       (loopback only)
  Data dir        ${WOODPECKER_DATA_DIR}
  Server env      ${SERVER_ENV_FILE}
  Agent env       ${AGENT_ENV_FILE}
  Database        SQLite at ${WOODPECKER_DATA_DIR}/server/woodpecker.sqlite

  Verify:
    systemctl status woodpecker-server woodpecker-agent
    curl -fsS http://${WOODPECKER_SERVER_ADDR}/healthz && echo OK
    journalctl -u woodpecker-server -n 50 --no-pager
    journalctl -u woodpecker-agent  -n 50 --no-pager

  Next: add the Caddy block (infra/caddy/woodpecker.Caddyfile) and point
        ${WOODPECKER_HOST#http*://} at this host in DNS. See the runbook
        at docs/runbooks/woodpecker-install.md.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
