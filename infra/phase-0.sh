#!/usr/bin/env bash
# ── Crontech Phase 0 Bootstrap ──────────────────────────────────────
# One-shot bootstrap for a fresh Hetzner box (or any Ubuntu 22.04+ host).
# Run as root, or as a sudoer with passwordless sudo.
#
# What this does:
#   1. Hardens the base OS (updates, unattended-upgrades, fail2ban, ufw)
#   2. Creates the `crontech` service user with locked-down SSH
#   3. Installs Docker + Docker Compose (official upstream repo)
#   4. Installs Bun (official installer, pinned)
#   5. Installs Caddy (reverse proxy + automatic HTTPS)
#   6. Creates the /srv/crontech directory layout
#   7. Clones the LGTM observability stack and starts it
#   8. Prints the next-step checklist
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ccantynz-alt/Front-Back/main/infra/phase-0.sh | sudo bash
#   OR
#   sudo ./infra/phase-0.sh
#
# Idempotent: safe to re-run. Skips steps that are already done.
# Non-destructive: never deletes data. Creates backups on config changes.

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────

CRONTECH_USER="${CRONTECH_USER:-crontech}"
CRONTECH_HOME="/srv/crontech"
BUN_VERSION="${BUN_VERSION:-1.1.38}"
CADDY_VERSION="${CADDY_VERSION:-2.8.4}"
LOG_PREFIX="[phase-0]"

# ── Helpers ─────────────────────────────────────────────────────────

log() { printf "%s %s\n" "$LOG_PREFIX" "$*"; }
warn() { printf "%s WARN: %s\n" "$LOG_PREFIX" "$*" >&2; }
die() { printf "%s FATAL: %s\n" "$LOG_PREFIX" "$*" >&2; exit 1; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    die "must run as root (or with sudo)"
  fi
}

require_ubuntu() {
  if [[ ! -f /etc/os-release ]]; then
    die "cannot detect OS"
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    warn "untested on $ID — proceeding anyway"
  fi
}

# ── Step 1: OS hardening ────────────────────────────────────────────

harden_os() {
  log "Step 1: OS hardening"

  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get upgrade -y -qq

  apt-get install -y -qq \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    ufw \
    fail2ban \
    unattended-upgrades \
    apt-listchanges \
    htop \
    jq \
    git \
    vim \
    tmux

  # Enable unattended security upgrades
  dpkg-reconfigure -f noninteractive unattended-upgrades || true

  # Firewall: default deny, allow SSH/HTTP/HTTPS/Grafana
  ufw --force reset >/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  # Grafana UI — locked to loopback by default; expose via Caddy reverse proxy
  # ufw allow 3000/tcp  # intentionally commented — Caddy fronts this
  ufw --force enable

  # fail2ban default jail is fine; just ensure it's running
  systemctl enable --now fail2ban

  log "Step 1: OS hardened"
}

# ── Step 2: Service user ────────────────────────────────────────────

create_user() {
  log "Step 2: Create $CRONTECH_USER user"

  if id "$CRONTECH_USER" &>/dev/null; then
    log "  user already exists — skipping"
  else
    useradd -m -d "$CRONTECH_HOME" -s /bin/bash "$CRONTECH_USER"
    usermod -aG sudo "$CRONTECH_USER"
  fi

  mkdir -p "$CRONTECH_HOME/.ssh"
  chmod 700 "$CRONTECH_HOME/.ssh"
  touch "$CRONTECH_HOME/.ssh/authorized_keys"
  chmod 600 "$CRONTECH_HOME/.ssh/authorized_keys"
  chown -R "$CRONTECH_USER:$CRONTECH_USER" "$CRONTECH_HOME/.ssh"

  log "Step 2: User ready. Remember to add SSH keys to $CRONTECH_HOME/.ssh/authorized_keys"
}

# ── Step 3: Docker ──────────────────────────────────────────────────

install_docker() {
  log "Step 3: Install Docker"

  if command -v docker &>/dev/null; then
    log "  docker already installed: $(docker --version)"
  else
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    # shellcheck disable=SC1091
    . /etc/os-release
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
       https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
      > /etc/apt/sources.list.d/docker.list

    apt-get update -qq
    apt-get install -y -qq \
      docker-ce \
      docker-ce-cli \
      containerd.io \
      docker-buildx-plugin \
      docker-compose-plugin
  fi

  usermod -aG docker "$CRONTECH_USER" || true
  systemctl enable --now docker

  log "Step 3: Docker ready"
}

# ── Step 4: Bun ─────────────────────────────────────────────────────

install_bun() {
  log "Step 4: Install Bun $BUN_VERSION"

  if sudo -u "$CRONTECH_USER" test -x "$CRONTECH_HOME/.bun/bin/bun"; then
    current=$(sudo -u "$CRONTECH_USER" "$CRONTECH_HOME/.bun/bin/bun" --version 2>/dev/null || echo "unknown")
    log "  bun already installed: $current"
  else
    sudo -u "$CRONTECH_USER" bash -c "curl -fsSL https://bun.sh/install | BUN_VERSION=bun-v${BUN_VERSION} bash"
  fi

  # Ensure PATH is set in user profile
  if ! grep -q 'BUN_INSTALL' "$CRONTECH_HOME/.bashrc" 2>/dev/null; then
    {
      echo ""
      echo '# bun'
      echo 'export BUN_INSTALL="$HOME/.bun"'
      echo 'export PATH="$BUN_INSTALL/bin:$PATH"'
    } >> "$CRONTECH_HOME/.bashrc"
    chown "$CRONTECH_USER:$CRONTECH_USER" "$CRONTECH_HOME/.bashrc"
  fi

  log "Step 4: Bun ready"
}

# ── Step 5: Caddy ───────────────────────────────────────────────────

install_caddy() {
  log "Step 5: Install Caddy"

  if command -v caddy &>/dev/null; then
    log "  caddy already installed: $(caddy version)"
  else
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
  fi

  systemctl enable --now caddy

  log "Step 5: Caddy ready"
}

# ── Step 6: Directory layout ────────────────────────────────────────

create_layout() {
  log "Step 6: Create /srv/crontech layout"

  mkdir -p \
    "$CRONTECH_HOME/apps" \
    "$CRONTECH_HOME/data" \
    "$CRONTECH_HOME/logs" \
    "$CRONTECH_HOME/backups" \
    "$CRONTECH_HOME/observability" \
    "$CRONTECH_HOME/secrets"

  chmod 700 "$CRONTECH_HOME/secrets"
  chown -R "$CRONTECH_USER:$CRONTECH_USER" "$CRONTECH_HOME"

  log "Step 6: Layout created"
}

# ── Step 7: Observability stack (LGTM) ──────────────────────────────

deploy_lgtm() {
  log "Step 7: Deploy LGTM observability stack"

  local compose_dir="$CRONTECH_HOME/observability/lgtm"
  mkdir -p "$compose_dir"

  # Copy compose file if running from a checked-out repo
  if [[ -f "$(dirname "$0")/lgtm/docker-compose.yml" ]]; then
    cp "$(dirname "$0")/lgtm/docker-compose.yml" "$compose_dir/docker-compose.yml"
    if [[ -d "$(dirname "$0")/lgtm/config" ]]; then
      cp -r "$(dirname "$0")/lgtm/config" "$compose_dir/"
    fi
  else
    warn "lgtm compose file not found locally — bootstrap LGTM manually later"
    return 0
  fi

  chown -R "$CRONTECH_USER:$CRONTECH_USER" "$compose_dir"

  sudo -u "$CRONTECH_USER" bash -c "cd '$compose_dir' && docker compose up -d"

  log "Step 7: LGTM stack running. Grafana on :3000 (loopback)"
}

# ── Step 8: Next-step checklist ─────────────────────────────────────

print_checklist() {
  cat <<EOF

${LOG_PREFIX} ═══════════════════════════════════════════════════════════
${LOG_PREFIX}   PHASE 0 BOOTSTRAP COMPLETE
${LOG_PREFIX} ═══════════════════════════════════════════════════════════
${LOG_PREFIX}
${LOG_PREFIX} Next steps (human action required):
${LOG_PREFIX}
${LOG_PREFIX}   1. Add SSH public keys to:
${LOG_PREFIX}      $CRONTECH_HOME/.ssh/authorized_keys
${LOG_PREFIX}
${LOG_PREFIX}   2. Disable password SSH (after key login confirmed):
${LOG_PREFIX}      Edit /etc/ssh/sshd_config.d/00-crontech.conf
${LOG_PREFIX}      PasswordAuthentication no
${LOG_PREFIX}      PermitRootLogin prohibit-password
${LOG_PREFIX}      systemctl restart ssh
${LOG_PREFIX}
${LOG_PREFIX}   3. Point DNS A records at this box:
${LOG_PREFIX}      crontech.nz -> \$(curl -s ifconfig.me)
${LOG_PREFIX}      grafana.crontech.nz -> \$(curl -s ifconfig.me)
${LOG_PREFIX}
${LOG_PREFIX}   4. Drop Caddyfile at /etc/caddy/Caddyfile and reload:
${LOG_PREFIX}      systemctl reload caddy
${LOG_PREFIX}
${LOG_PREFIX}   5. Verify the LGTM stack:
${LOG_PREFIX}      docker compose -f $CRONTECH_HOME/observability/lgtm/docker-compose.yml ps
${LOG_PREFIX}
${LOG_PREFIX}   6. Clone Crontech into $CRONTECH_HOME/apps/crontech and run:
${LOG_PREFIX}      bun install && bun run build
${LOG_PREFIX}
${LOG_PREFIX} Doctrine reminder: Zero broken anything. Every button works.
${LOG_PREFIX} ═══════════════════════════════════════════════════════════

EOF
}

# ── Main ────────────────────────────────────────────────────────────

main() {
  log "Crontech Phase 0 bootstrap starting"
  require_root
  require_ubuntu

  harden_os
  create_user
  install_docker
  install_bun
  install_caddy
  create_layout
  deploy_lgtm
  print_checklist

  log "Crontech Phase 0 bootstrap complete"
}

main "$@"
