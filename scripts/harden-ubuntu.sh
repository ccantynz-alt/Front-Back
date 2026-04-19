#!/usr/bin/env bash
# harden-ubuntu.sh — production-grade baseline hardening for the Crontech
# bare-metal Vultr box (Ubuntu 22.04).
#
# Idempotent. Safe to re-run.
#
# What it does:
#   1. Installs ufw, fail2ban, unattended-upgrades
#   2. Configures ufw: default deny incoming / allow outgoing,
#      allow 22/tcp, 80/tcp, 443/tcp, 443/udp (HTTP/3 future), deny rest
#   3. Configures fail2ban sshd jail: 3 failed attempts -> 30 min ban
#   4. Enables unattended-upgrades for security patches only
#   5. IFF env I_HAVE_SSH_KEY=yes AND /root/.ssh/authorized_keys has >=1 key:
#        - Disables SSH password auth (PasswordAuthentication no)
#        - Sets PermitRootLogin prohibit-password
#        - Restarts sshd
#
# DANGEROUS: restarting sshd with no working key = lockout. The Vultr web
# console is your rollback (see docs/runbooks/security-and-backups.md).
#
# Usage:
#   sudo ./harden-ubuntu.sh                 # installs + ufw + fail2ban only
#   sudo I_HAVE_SSH_KEY=yes ./harden-ubuntu.sh   # also hardens sshd
#
set -euo pipefail

log() { echo ">>> $*"; }
warn() { echo ">>> WARN: $*" >&2; }
die() { echo ">>> FATAL: $*" >&2; exit 1; }

if [[ $EUID -ne 0 ]]; then
  die "must run as root (try: sudo $0)"
fi

export DEBIAN_FRONTEND=noninteractive

log "1/5 apt update + install ufw, fail2ban, unattended-upgrades"
apt-get update -y
apt-get install -y ufw fail2ban unattended-upgrades apt-listchanges

log "2/5 configuring ufw (deny incoming / allow outgoing + 22,80,443/tcp + 443/udp)"
# Reset to a known state only if ufw was never enabled; otherwise just enforce rules.
ufw --force default deny incoming
ufw --force default allow outgoing
ufw allow 22/tcp   comment 'ssh'
ufw allow 80/tcp   comment 'http'
ufw allow 443/tcp  comment 'https'
ufw allow 443/udp  comment 'http3-quic'
# Enable (idempotent: --force skips prompt, does nothing if already active)
yes | ufw --force enable
ufw status verbose | sed 's/^/    /'

log "3/5 configuring fail2ban sshd jail (maxretry=3, bantime=30m)"
install -d -m 0755 /etc/fail2ban/jail.d
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
# Managed by scripts/harden-ubuntu.sh — do not edit by hand.
[sshd]
enabled  = true
port     = ssh
filter   = sshd
backend  = systemd
maxretry = 3
findtime = 10m
bantime  = 30m
EOF
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
sleep 1
fail2ban-client status sshd 2>/dev/null | sed 's/^/    /' || warn "fail2ban sshd jail not yet reporting (may still be initialising)"

log "4/5 enabling unattended-upgrades (security patches only)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
// Managed by scripts/harden-ubuntu.sh — security patches only.
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

log "5/5 sshd hardening (requires I_HAVE_SSH_KEY=yes + authorized_keys present)"
if [[ "${I_HAVE_SSH_KEY:-no}" != "yes" ]]; then
  warn "I_HAVE_SSH_KEY != yes — SKIPPING sshd changes."
  warn "    Re-run with: sudo I_HAVE_SSH_KEY=yes $0"
  log  "done (ufw, fail2ban, unattended-upgrades configured; sshd left alone)"
  exit 0
fi

AUTH_KEYS=/root/.ssh/authorized_keys
if [[ ! -s "$AUTH_KEYS" ]]; then
  warn "$AUTH_KEYS missing or empty — ABORTING sshd changes to avoid lockout."
  warn "    Add your pubkey first: ssh-copy-id root@<host>"
  exit 1
fi
KEY_COUNT=$(grep -cE '^(ssh-(rsa|ed25519|ecdsa)|ecdsa-sha2|sk-(ssh-ed25519|ecdsa-sha2))' "$AUTH_KEYS" || true)
if [[ "${KEY_COUNT:-0}" -lt 1 ]]; then
  warn "$AUTH_KEYS has no recognizable public keys — ABORTING sshd changes."
  exit 1
fi
log "    found $KEY_COUNT key(s) in $AUTH_KEYS — proceeding"

SSHD=/etc/ssh/sshd_config
BACKUP="${SSHD}.bak.$(date +%Y%m%d_%H%M%S)"
cp -a "$SSHD" "$BACKUP"
log "    sshd_config backed up -> $BACKUP"

# Idempotent set-or-replace helper
set_sshd_option() {
  local key="$1" val="$2"
  if grep -qE "^[#[:space:]]*${key}[[:space:]]" "$SSHD"; then
    sed -i -E "s|^[#[:space:]]*${key}[[:space:]].*|${key} ${val}|" "$SSHD"
  else
    printf '\n%s %s\n' "$key" "$val" >> "$SSHD"
  fi
}

set_sshd_option PasswordAuthentication no
set_sshd_option PermitRootLogin prohibit-password
set_sshd_option ChallengeResponseAuthentication no
set_sshd_option KbdInteractiveAuthentication no
set_sshd_option UsePAM yes

# Clean up any drop-in that would re-enable password auth (Ubuntu 22.04 ships one).
for f in /etc/ssh/sshd_config.d/*.conf; do
  [[ -f "$f" ]] || continue
  if grep -qE '^[[:space:]]*PasswordAuthentication[[:space:]]+yes' "$f"; then
    log "    neutralising PasswordAuthentication yes in $f"
    sed -i -E 's|^([[:space:]]*PasswordAuthentication[[:space:]]+)yes|\1no|I' "$f"
  fi
done

log "    validating sshd config (sshd -t)"
if ! sshd -t; then
  warn "sshd config invalid — restoring backup $BACKUP"
  cp -a "$BACKUP" "$SSHD"
  die "sshd -t failed; aborted before restart"
fi

log "    restarting sshd — existing sessions survive, but NEW logins now require key auth"
systemctl restart ssh || systemctl restart sshd

log "done. If you get locked out: Vultr web console -> log in -> restore $BACKUP -> systemctl restart ssh"
