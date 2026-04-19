#!/usr/bin/env bash
set -euo pipefail

# Idempotent fix for the gluecron systemd unit.
# Installs the corrected unit file, reloads systemd, restarts the service,
# and waits for it to reach active (running). Dumps recent logs on failure.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_UNIT="${REPO_ROOT}/infra/systemd/gluecron.service"
DST_UNIT="/etc/systemd/system/gluecron.service"
SERVICE="gluecron"
TIMEOUT=30

log() {
  echo ">>> $*"
}

log "Verifying source unit file exists at ${SRC_UNIT}"
if [[ ! -f "${SRC_UNIT}" ]]; then
  echo "ERROR: source unit file not found: ${SRC_UNIT}" >&2
  exit 1
fi

log "Installing unit file to ${DST_UNIT}"
install -m 0644 "${SRC_UNIT}" "${DST_UNIT}"

log "Running systemctl daemon-reload"
systemctl daemon-reload

log "Restarting ${SERVICE}"
systemctl restart "${SERVICE}"

log "Waiting up to ${TIMEOUT}s for ${SERVICE} to be active (running)"
deadline=$(( $(date +%s) + TIMEOUT ))
while :; do
  state="$(systemctl is-active "${SERVICE}" || true)"
  sub="$(systemctl show -p SubState --value "${SERVICE}" || true)"
  if [[ "${state}" == "active" && "${sub}" == "running" ]]; then
    log "${SERVICE} is active (running)"
    exit 0
  fi
  if (( $(date +%s) >= deadline )); then
    log "${SERVICE} did not reach active (running) within ${TIMEOUT}s (state=${state}, sub=${sub})"
    log "Recent journal output:"
    journalctl -u "${SERVICE}" -n 20 --no-pager -l || true
    exit 1
  fi
  sleep 1
done
