#!/usr/bin/env bash
#
# Phase 0 Bootstrap — Crontech Hetzner box provisioning
#
# Purpose: Idempotent bootstrap of a fresh Hetzner AX41/AX102 box with
#          the full Crontech substrate stack (Caddy, Postgres, Redis,
#          MinIO, Ollama, Bun, Docker, observability).
#
# Usage:   ./phase-0.sh <HETZNER_IP> <SSH_USER>
# Or CI:   CI=true ./phase-0.sh <HETZNER_IP> <SSH_USER> --yes-i-understand
#
# Preconditions:
#   - Hetzner box provisioned and SSH-accessible
#   - SSH key installed for SSH_USER on the target
#   - DNS authority transferred off Vercel per COMPETITOR-FREE-STACK.md §3
#   - No production data on the target (bootstrap is destructive on first run)
#
# Reference: docs/strategy/MIGRATION-PLAN.md §3 Week 0
#            infra/bootstrap/README.md
#
# Safety: pauses before every destructive step unless CI=true AND
#         --yes-i-understand is passed.
#
# Secrets: NEVER commit. Use age-encrypted files. This script does not
#          write any secrets to disk on the target box. It uses environment
#          variables or prompts the operator.

set -euo pipefail

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <HETZNER_IP> <SSH_USER> [--yes-i-understand]" >&2
  exit 1
fi

HETZNER_IP="$1"
SSH_USER="$2"
SAFETY_FLAG="${3:-}"

if [[ "${CI:-}" == "true" && "$SAFETY_FLAG" != "--yes-i-understand" ]]; then
  echo "ERROR: CI mode requires --yes-i-understand flag. Refusing to run non-interactively without explicit acknowledgement." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  echo "[phase-0 $(date -u +%H:%M:%SZ)] $*"
}

warn() {
  echo "[phase-0 WARN] $*" >&2
}

confirm() {
  local prompt="$1"
  if [[ "${CI:-}" == "true" ]]; then
    log "CI mode: auto-confirming '$prompt'"
    return 0
  fi
  read -r -p "$prompt [y/N]: " response
  if [[ "$response" != "y" && "$response" != "Y" ]]; then
    log "Aborted by operator."
    exit 1
  fi
}

remote() {
  # shellcheck disable=SC2029
  ssh -o StrictHostKeyChecking=accept-new "${SSH_USER}@${HETZNER_IP}" "$@"
}

remote_sudo() {
  remote "sudo bash -c '$*'"
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

log "Phase 0 bootstrap starting"
log "Target: ${SSH_USER}@${HETZNER_IP}"
log "Reference doctrine: docs/strategy/MIGRATION-PLAN.md §3 Week 0"

log "Checking SSH connectivity..."
if ! remote "echo 'SSH OK'"; then
  echo "ERROR: cannot SSH to ${SSH_USER}@${HETZNER_IP}" >&2
  exit 1
fi

log "Checking target OS..."
OS_INFO="$(remote 'cat /etc/os-release | head -5')"
echo "$OS_INFO"
if ! echo "$OS_INFO" | grep -qiE 'ubuntu|debian'; then
  warn "Target is not Ubuntu or Debian. This script is tuned for those. Proceed with caution."
  confirm "Continue anyway?"
fi

# ---------------------------------------------------------------------------
# Step 1 — Base system
# ---------------------------------------------------------------------------

log "Step 1/15 — Base system update and essentials"
confirm "About to apt update && upgrade on the target. Proceed?"

remote_sudo "apt-get update && apt-get upgrade -y"
remote_sudo "apt-get install -y curl wget git ufw fail2ban htop vim tmux jq rsync gnupg ca-certificates lsb-release unattended-upgrades"
remote_sudo "timedatectl set-timezone UTC"
remote_sudo "hostnamectl set-hostname crontech-phase0"

# ---------------------------------------------------------------------------
# Step 2 — Firewall
# ---------------------------------------------------------------------------

log "Step 2/15 — UFW firewall"
confirm "About to enable UFW firewall. Proceed?"

remote_sudo "ufw default deny incoming"
remote_sudo "ufw default allow outgoing"
remote_sudo "ufw allow 22/tcp"
remote_sudo "ufw allow 80/tcp"
remote_sudo "ufw allow 443/tcp"
remote_sudo "ufw --force enable"

# ---------------------------------------------------------------------------
# Step 3 — Unattended security upgrades
# ---------------------------------------------------------------------------

log "Step 3/15 — Unattended security upgrades"
remote_sudo "dpkg-reconfigure -f noninteractive unattended-upgrades"

# ---------------------------------------------------------------------------
# Step 4 — Caddy (reverse proxy + TLS)
# ---------------------------------------------------------------------------

log "Step 4/15 — Caddy reverse proxy + auto-TLS"
remote_sudo "apt-get install -y debian-keyring debian-archive-keyring apt-transport-https"
remote_sudo "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"
remote_sudo "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list"
remote_sudo "apt-get update && apt-get install -y caddy"
remote_sudo "systemctl enable caddy"

# ---------------------------------------------------------------------------
# Step 5 — Postgres 17 + pgvector
# ---------------------------------------------------------------------------

log "Step 5/15 — Postgres 17 + pgvector"
confirm "Install Postgres 17 with pgvector. Proceed?"

remote_sudo "install -d /usr/share/postgresql-common/pgdg"
remote_sudo "curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc"
remote_sudo "sh -c 'echo \"deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt \$(lsb_release -cs)-pgdg main\" > /etc/apt/sources.list.d/pgdg.list'"
remote_sudo "apt-get update && apt-get install -y postgresql-17 postgresql-17-pgvector"
remote_sudo "systemctl enable postgresql"
remote_sudo "systemctl start postgresql"

# ---------------------------------------------------------------------------
# Step 6 — Redis 8
# ---------------------------------------------------------------------------

log "Step 6/15 — Redis 8"
remote_sudo "apt-get install -y redis-server"
remote_sudo "systemctl enable redis-server"
remote_sudo "systemctl start redis-server"

# ---------------------------------------------------------------------------
# Step 7 — MinIO
# ---------------------------------------------------------------------------

log "Step 7/15 — MinIO object storage"
remote_sudo "useradd -r minio-user -s /sbin/nologin || true"
remote_sudo "mkdir -p /opt/minio /var/lib/minio"
remote_sudo "wget -q -O /opt/minio/minio https://dl.min.io/server/minio/release/linux-amd64/minio"
remote_sudo "chmod +x /opt/minio/minio"
remote_sudo "chown -R minio-user:minio-user /opt/minio /var/lib/minio"

cat <<'UNIT' | remote_sudo "tee /etc/systemd/system/minio.service > /dev/null"
[Unit]
Description=MinIO Object Storage
After=network.target

[Service]
User=minio-user
Group=minio-user
EnvironmentFile=-/etc/default/minio
ExecStart=/opt/minio/minio server /var/lib/minio --console-address :9001
Restart=always
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT

remote_sudo "systemctl daemon-reload && systemctl enable minio"

log "MinIO installed. Set credentials in /etc/default/minio before starting:"
log "  MINIO_ROOT_USER=<age-encrypted>"
log "  MINIO_ROOT_PASSWORD=<age-encrypted>"
log "Then: systemctl start minio"

# ---------------------------------------------------------------------------
# Step 8 — Ollama (local LLM inference)
# ---------------------------------------------------------------------------

log "Step 8/15 — Ollama"
remote_sudo "curl -fsSL https://ollama.com/install.sh | sh"
remote_sudo "systemctl enable ollama"
remote_sudo "systemctl start ollama"

# ---------------------------------------------------------------------------
# Step 9 — Bun runtime
# ---------------------------------------------------------------------------

log "Step 9/15 — Bun runtime"
remote "curl -fsSL https://bun.sh/install | bash"

# ---------------------------------------------------------------------------
# Step 10 — Docker (for polyglot runtime host)
# ---------------------------------------------------------------------------

log "Step 10/15 — Docker"
remote_sudo "install -m 0755 -d /etc/apt/keyrings"
remote_sudo "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg"
remote_sudo "chmod a+r /etc/apt/keyrings/docker.gpg"
remote_sudo 'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null'
remote_sudo "apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"
remote_sudo "systemctl enable docker"
remote_sudo "systemctl start docker"

# ---------------------------------------------------------------------------
# Step 11 — age (for secrets encryption)
# ---------------------------------------------------------------------------

log "Step 11/15 — age secrets encryption"
remote_sudo "apt-get install -y age"

# ---------------------------------------------------------------------------
# Step 12 — Observability: Grafana LGTM stack via Docker
# ---------------------------------------------------------------------------

log "Step 12/15 — Grafana LGTM observability stack"
remote_sudo "mkdir -p /opt/lgtm && chown -R ${SSH_USER}:${SSH_USER} /opt/lgtm"

log "LGTM stack will be deployed via docker compose from /opt/lgtm."
log "Compose file should be committed to the repo at infra/lgtm/docker-compose.yml"
log "and copied onto the box as part of the post-bootstrap deploy step."

# ---------------------------------------------------------------------------
# Step 13 — Backups (borgbackup)
# ---------------------------------------------------------------------------

log "Step 13/15 — borgbackup"
remote_sudo "apt-get install -y borgbackup"
log "Borgbackup installed. Configure the nightly cron and target storage box before any production workload lands."
log "Backup target: a second Hetzner storage box, NOT the same physical machine."

# ---------------------------------------------------------------------------
# Step 14 — Deploy pipeline skeleton
# ---------------------------------------------------------------------------

log "Step 14/15 — Deploy pipeline placeholder"
remote_sudo "mkdir -p /opt/crontech/apps /opt/crontech/releases /opt/crontech/shared"
remote_sudo "chown -R ${SSH_USER}:${SSH_USER} /opt/crontech"

log "Deploy pipeline directories created. The actual deploy script lives in"
log ".github/workflows/deploy-self-host.yml (not yet committed) and rsyncs"
log "built artifacts to /opt/crontech/releases/<timestamp>, then symlinks"
log "the current release and reloads Caddy."

# ---------------------------------------------------------------------------
# Step 15 — Final verification
# ---------------------------------------------------------------------------

log "Step 15/15 — Verification"
remote "systemctl --no-pager status caddy postgresql redis-server docker ollama | head -60 || true"

log ""
log "========================================"
log "Phase 0 bootstrap complete (base layer)"
log "========================================"
log ""
log "Next manual steps (do NOT automate yet):"
log "  1. Set MinIO credentials in /etc/default/minio (age-decrypted at boot)"
log "  2. Deploy Grafana LGTM docker compose from infra/lgtm/"
log "  3. Configure Caddy site files for your first domain"
log "  4. Commit deploy-self-host.yml workflow to trigger deploys from git push"
log "  5. Deploy a throwaway test app and verify git push -> live in <5 minutes"
log "  6. Verify TLS auto-renewing via Caddy"
log "  7. Verify rollback command works (<60s)"
log "  8. Verify health check automation"
log ""
log "Exit criteria (per MIGRATION-PLAN.md §3 Week 0):"
log "  [ ] Throwaway app deploys from git push in <5 minutes"
log "  [ ] TLS valid and auto-renewing"
log "  [ ] Logs visible in Grafana without SSH"
log "  [ ] Rollback works in <60 seconds"
log "  [ ] Health check automated"
log ""
log "DO NOT proceed to Week 1 (MarcoReid.com migration) until all"
log "exit criteria are met. Rushing Phase 0 will break every downstream week."
