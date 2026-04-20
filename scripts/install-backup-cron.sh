#!/usr/bin/env bash
# install-backup-cron.sh — installs a systemd timer that runs
# scripts/backup-postgres.sh daily at 03:00 UTC.
#
# Idempotent: re-running overwrites the unit files with the canonical
# versions and re-enables the timer.
#
# Fallback: if systemd is not available (e.g. inside a container), a
# /etc/cron.d entry is installed instead.
#
# Env:
#   BACKUP_SCRIPT   full path to backup-postgres.sh
#                   default: /opt/crontech/scripts/backup-postgres.sh
#   BACKUP_ENV_FILE optional path to an EnvironmentFile read by the unit,
#                   useful for BACKUP_UPLOAD_CMD and credentials.
#                   default: /etc/crontech/backup.env (created empty if absent)
#
set -euo pipefail

log() { echo ">>> $*"; }
die() { echo ">>> FATAL: $*" >&2; exit 1; }

if [[ $EUID -ne 0 ]]; then
  die "must run as root (try: sudo $0)"
fi

BACKUP_SCRIPT="${BACKUP_SCRIPT:-/opt/crontech/scripts/backup-postgres.sh}"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/crontech/backup.env}"

if [[ ! -x "$BACKUP_SCRIPT" ]]; then
  # Try to auto-locate relative to this repo checkout
  HERE="$(cd "$(dirname "$0")" && pwd)"
  if [[ -f "$HERE/backup-postgres.sh" ]]; then
    log "BACKUP_SCRIPT not found at $BACKUP_SCRIPT — installing repo copy to /opt/crontech/scripts/"
    install -d -m 0755 /opt/crontech/scripts
    install -m 0755 "$HERE/backup-postgres.sh" /opt/crontech/scripts/backup-postgres.sh
    BACKUP_SCRIPT=/opt/crontech/scripts/backup-postgres.sh
  else
    die "BACKUP_SCRIPT not executable: $BACKUP_SCRIPT (and no sibling backup-postgres.sh found)"
  fi
fi

install -d -m 0755 "$(dirname "$BACKUP_ENV_FILE")"
if [[ ! -f "$BACKUP_ENV_FILE" ]]; then
  cat > "$BACKUP_ENV_FILE" <<'EOF'
# Crontech Postgres backup environment.
# Uncomment + fill to enable off-box uploads. NEVER commit this file.
# BACKUP_UPLOAD_CMD='rclone rcat b2:crontech-backups/postgres/$(date +%Y%m%d_%H%M%S).sql.gz'
# PG_USER=postgres
EOF
  chmod 0600 "$BACKUP_ENV_FILE"
  log "created empty env file: $BACKUP_ENV_FILE"
fi

if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  log "installing systemd service + timer"

  SERVICE=/etc/systemd/system/crontech-backup.service
  TIMER=/etc/systemd/system/crontech-backup.timer

  cat > "$SERVICE" <<EOF
# Managed by scripts/install-backup-cron.sh — do not edit by hand.
[Unit]
Description=Crontech nightly Postgres backup
Documentation=https://github.com/ccantynz-alt/Crontech/blob/Main/docs/runbooks/security-and-backups.md
Wants=network-online.target
After=network-online.target postgresql.service

[Service]
Type=oneshot
EnvironmentFile=-${BACKUP_ENV_FILE}
ExecStart=${BACKUP_SCRIPT}
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
# Basic hardening — the script only needs to read PG + write backups dir.
ProtectSystem=full
ProtectHome=true
NoNewPrivileges=true
PrivateTmp=true
EOF

  cat > "$TIMER" <<'EOF'
# Managed by scripts/install-backup-cron.sh — do not edit by hand.
[Unit]
Description=Run Crontech Postgres backup daily at 03:00 UTC

[Timer]
OnCalendar=*-*-* 03:00:00 UTC
Persistent=true
RandomizedDelaySec=2m
Unit=crontech-backup.service

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now crontech-backup.timer
  log "timer status:"
  systemctl list-timers crontech-backup.timer --no-pager | sed 's/^/    /'
  log "done. Next run: $(systemctl show crontech-backup.timer -p NextElapseUSecRealtime --value)"
else
  log "systemd not detected — falling back to /etc/cron.d/crontech-backup"
  CRON=/etc/cron.d/crontech-backup
  cat > "$CRON" <<EOF
# Managed by scripts/install-backup-cron.sh — do not edit by hand.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# m h dom mon dow user command
0 3 * * * root . ${BACKUP_ENV_FILE} 2>/dev/null; ${BACKUP_SCRIPT} >> /var/log/crontech-backup.log 2>&1
EOF
  chmod 0644 "$CRON"
  log "cron installed: $CRON"
fi
