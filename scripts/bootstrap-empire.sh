#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# bootstrap-empire.sh
#
# What this does:
#   Thin sequencer that calls the existing per-service installer scripts in
#   scripts/ one after another. Each child script is already idempotent; this
#   wrapper only tracks success/failure and prints a summary table at the end.
#
# Prereqs:
#   - /opt/crontech exists and is a git checkout of this repo on Main
#   - Main is current (git pull before running)
#   - scripts/ directory in this repo is present with the installers listed below
#   - Run as root (uses sudo internally via child scripts; easier: run as root)
#
# How to run:
#   sudo bash scripts/bootstrap-empire.sh
#
# Recommendation:
#   Run `scripts/go-live.sh` FIRST for initial bring-up (installs/deploys
#   crontech-web and crontech-api). THEN run this wrapper to layer on the
#   nice-to-have services (web terminal, observability, CI, hardening, backups).
#
# What this does NOT do:
#   - Install postgres, bun, or caddy (those are the box's baseline)
#   - Initial deploy of crontech-web / crontech-api (covered by go-live.sh)
#
# Env vars respected (inherited by child scripts):
#   CF_API_TOKEN, GRAFANA_ADMIN_PASSWORD, I_HAVE_SSH_KEY, BACKUP_UPLOAD_CMD
# -----------------------------------------------------------------------------
set -uo pipefail  # NOT -e — we want to continue on per-script failure

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="/var/log"
mkdir -p "$LOG_DIR" 2>/dev/null || true

PHASES=(
  "Fix gluecron service:scripts/fix-gluecron-service.sh"
  "Install web terminal:scripts/install-web-terminal-full.sh"
  "Install observability:scripts/install-observability.sh"
  "Install Woodpecker CI:scripts/install-woodpecker.sh"
  "Install auto-deploy hook:scripts/install-auto-deploy.sh"
  "Harden Ubuntu:scripts/harden-ubuntu.sh"
  "Install backup cron:scripts/install-backup-cron.sh"
)

declare -a NAMES=() STATUSES=() LOGS=()
OVERALL_RC=0

for phase in "${PHASES[@]}"; do
  name="${phase%%:*}"
  rel="${phase#*:}"
  script="$REPO_ROOT/$rel"
  log="$LOG_DIR/crontech-bootstrap-${TS}-$(echo "$name" | tr ' /' '__').log"

  echo
  echo "=============================================================="
  echo "PHASE: $name"
  echo "SCRIPT: $rel"
  echo "LOG: $log"
  echo "=============================================================="

  if [ ! -f "$script" ]; then
    echo "SKIP: $rel not found" | tee "$log"
    NAMES+=("$name"); STATUSES+=("SKIP"); LOGS+=("$log")
    continue
  fi

  if bash "$script" 2>&1 | tee "$log"; then
    rc=${PIPESTATUS[0]}
  else
    rc=${PIPESTATUS[0]}
  fi

  if [ "$rc" -eq 0 ]; then
    NAMES+=("$name"); STATUSES+=("OK"); LOGS+=("$log")
  else
    NAMES+=("$name"); STATUSES+=("FAIL(rc=$rc)"); LOGS+=("$log")
    OVERALL_RC=1
  fi
done

echo
echo "=============================================================="
echo "BOOTSTRAP SUMMARY ($TS)"
echo "=============================================================="
printf "%-32s  %-14s  %s\n" "PHASE" "STATUS" "LOG"
printf "%-32s  %-14s  %s\n" "--------------------------------" "--------------" "---"
for i in "${!NAMES[@]}"; do
  printf "%-32s  %-14s  %s\n" "${NAMES[$i]}" "${STATUSES[$i]}" "${LOGS[$i]}"
done
echo

exit "$OVERALL_RC"
