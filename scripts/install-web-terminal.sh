#!/usr/bin/env bash
# install-web-terminal.sh
# Install ttyd (web terminal) behind systemd, bound to 127.0.0.1:7681.
# Caddy terminates TLS + basic-auth in front (see infra/caddy/terminal.Caddyfile).
#
# Idempotent: safe to re-run. Generates basic-auth creds only if missing.
#
# Usage:
#   sudo TTYD_USER=craig bash scripts/install-web-terminal.sh
#   (TTYD_USER defaults to 'craig'; falls back to 'deploy' if craig missing)

set -euo pipefail

log() { printf '>>> %s\n' "$*" >&2; }
die() { printf '!!! %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "must run as root (sudo)"

TTYD_USER="${TTYD_USER:-craig}"
if ! id -u "$TTYD_USER" >/dev/null 2>&1; then
  log "user '$TTYD_USER' not found, trying 'deploy'"
  TTYD_USER="deploy"
  id -u "$TTYD_USER" >/dev/null 2>&1 || die "neither 'craig' nor 'deploy' exist; create user or set TTYD_USER"
fi
log "ttyd will run as user: $TTYD_USER"

# --- install ttyd ---------------------------------------------------------
if command -v ttyd >/dev/null 2>&1; then
  log "ttyd already installed: $(ttyd --version 2>&1 | head -1)"
else
  log "installing ttyd via apt"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  if apt-get install -y ttyd; then
    log "ttyd installed via apt"
  else
    log "apt install failed, falling back to GitHub release binary"
    ARCH="$(uname -m)"
    case "$ARCH" in
      x86_64)  TTYD_ARCH="x86_64" ;;
      aarch64) TTYD_ARCH="aarch64" ;;
      armv7l)  TTYD_ARCH="armhf" ;;
      *) die "unsupported arch: $ARCH" ;;
    esac
    TTYD_URL="https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.${TTYD_ARCH}"
    log "downloading $TTYD_URL"
    curl -fsSL "$TTYD_URL" -o /usr/local/bin/ttyd
    chmod +x /usr/local/bin/ttyd
    log "ttyd installed to /usr/local/bin/ttyd"
  fi
fi

TTYD_BIN="$(command -v ttyd)"
log "ttyd binary: $TTYD_BIN"

# --- systemd unit ---------------------------------------------------------
UNIT=/etc/systemd/system/ttyd.service
log "writing $UNIT"
cat >"$UNIT" <<EOF
[Unit]
Description=ttyd web terminal (localhost only; Caddy fronts TLS + basic-auth)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${TTYD_USER}
# -p 7681  listen port
# -W       writable (required for a real shell)
# -a 127.0.0.1  bind loopback only; Caddy is the only public entry
ExecStart=${TTYD_BIN} -p 7681 -W -a 127.0.0.1 bash
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
chmod 644 "$UNIT"

log "systemctl daemon-reload"
systemctl daemon-reload
log "enabling + (re)starting ttyd"
systemctl enable ttyd.service >/dev/null
systemctl restart ttyd.service
sleep 1
systemctl is-active --quiet ttyd.service || die "ttyd failed to start; run: journalctl -u ttyd -n 50"
log "ttyd is active on 127.0.0.1:7681"

# --- basic-auth credentials for Caddy ------------------------------------
install -d -m 755 /etc/caddy
AUTH_FILE=/etc/caddy/terminal-auth
if [[ -s "$AUTH_FILE" ]]; then
  log "existing basic-auth file at $AUTH_FILE (leaving intact; delete to regenerate)"
  GENERATED_PW=""
else
  log "generating new basic-auth password"
  GENERATED_PW="$(openssl rand -hex 16)"
  umask 077
  {
    echo "# terminal.crontech.ai basic-auth credentials"
    echo "# generated $(date -u +%FT%TZ)"
    echo "USERNAME=admin"
    echo "PASSWORD=${GENERATED_PW}"
    echo "# hash for Caddyfile (paste output of 'caddy hash-password --plaintext \"${GENERATED_PW}\"'):"
    echo "HASH=<run: caddy hash-password --plaintext '${GENERATED_PW}'>"
  } >"$AUTH_FILE"
  chmod 600 "$AUTH_FILE"
fi

log "DONE. ttyd: $(systemctl is-active ttyd)  bound: 127.0.0.1:7681"
if [[ -n "$GENERATED_PW" ]]; then
  cat <<BANNER

========================================================================
  WEB TERMINAL BASIC-AUTH CREDENTIALS (shown ONCE)
------------------------------------------------------------------------
  URL:      https://terminal.crontech.ai
  User:     admin
  Password: ${GENERATED_PW}

  Next:
    1. caddy hash-password --plaintext '${GENERATED_PW}'
    2. Put hash in Caddyfile (see infra/caddy/terminal.Caddyfile)
    3. systemctl reload caddy

  Saved (local copy, mode 600): ${AUTH_FILE}
========================================================================

BANNER
fi
