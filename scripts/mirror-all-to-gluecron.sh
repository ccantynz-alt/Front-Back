#!/usr/bin/env bash
# mirror-all-to-gluecron.sh
#
# Wrapper that mirrors all 3 empire repos (Crontech, Gluecron.com, GateTest)
# from GitHub into a running Gluecron instance in one command.
#
# Wraps scripts/mirror-to-gluecron.sh (PR #136) for each repo and verifies
# with scripts/verify-gluecron-mirror.sh.
#
# Required env vars:
#   GLUECRON_URL    Base URL of the running Gluecron instance
#   GLUECRON_USER   Gluecron username
#   GLUECRON_TOKEN  Gluecron PAT (never logged)

set -euo pipefail

# --- Config ---------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIRROR_SCRIPT="${SCRIPT_DIR}/mirror-to-gluecron.sh"
VERIFY_SCRIPT="${SCRIPT_DIR}/verify-gluecron-mirror.sh"

# source_repo|target_repo|tmp_name
REPOS=(
  "ccantynz-alt/Crontech|crontech/crontech|crontech"
  "ccantynz-alt/Gluecron.com|crontech/gluecron|gluecron"
  "ccantynz-alt/GateTest|crontech/gatetest|gatetest"
)

SUCCEEDED=()
FAILED=()

# --- Helpers --------------------------------------------------------------
log()    { printf '>>> %s\n' "$*"; }
warn()   { printf '!!! %s\n' "$*" >&2; }
# redact(): scrub token from any string before logging
redact() { sed -e "s|${GLUECRON_TOKEN:-__NO_TOKEN__}|***REDACTED***|g"; }

require_env() {
  local var="$1"
  if [[ -z "${!var:-}" ]]; then
    warn "Required env var ${var} is not set"
    exit 2
  fi
}

require_script() {
  local p="$1"
  if [[ ! -x "${p}" ]]; then
    warn "Required script missing or not executable: ${p}"
    warn "Ensure PR #136 (mirror-to-gluecron.sh, verify-gluecron-mirror.sh) is merged."
    exit 3
  fi
}

cleanup_tmp() {
  local name="$1"
  rm -rf "/tmp/mirror-source-${name}"
}

mirror_one() {
  local entry="$1"
  local source_repo target_repo name tmp_dir
  source_repo="${entry%%|*}"
  local rest="${entry#*|}"
  target_repo="${rest%%|*}"
  name="${rest#*|}"
  tmp_dir="/tmp/mirror-source-${name}"

  log "[${name}] Mirroring ${source_repo} -> ${target_repo}"

  # Clean any stale clone from a previous run (idempotent)
  cleanup_tmp "${name}"

  log "[${name}] Cloning from GitHub into ${tmp_dir}"
  if ! git clone --mirror "https://github.com/${source_repo}.git" "${tmp_dir}" 2>&1 | redact; then
    warn "[${name}] clone failed"
    cleanup_tmp "${name}"
    return 1
  fi

  log "[${name}] Pushing via mirror-to-gluecron.sh"
  if ! TARGET_REPO="${target_repo}" SOURCE_DIR="${tmp_dir}" \
       GLUECRON_URL="${GLUECRON_URL}" \
       GLUECRON_USER="${GLUECRON_USER}" \
       GLUECRON_TOKEN="${GLUECRON_TOKEN}" \
       "${MIRROR_SCRIPT}" 2>&1 | redact; then
    warn "[${name}] mirror-to-gluecron.sh failed"
    cleanup_tmp "${name}"
    return 1
  fi

  log "[${name}] Verifying via verify-gluecron-mirror.sh"
  if ! TARGET_REPO="${target_repo}" SOURCE_DIR="${tmp_dir}" \
       GLUECRON_URL="${GLUECRON_URL}" \
       GLUECRON_USER="${GLUECRON_USER}" \
       GLUECRON_TOKEN="${GLUECRON_TOKEN}" \
       "${VERIFY_SCRIPT}" 2>&1 | redact; then
    warn "[${name}] verification failed"
    cleanup_tmp "${name}"
    return 1
  fi

  log "[${name}] Cleaning up ${tmp_dir}"
  cleanup_tmp "${name}"
  log "[${name}] OK"
  return 0
}

# --- Main -----------------------------------------------------------------
log "Starting mirror-all-to-gluecron"
require_env GLUECRON_URL
require_env GLUECRON_USER
require_env GLUECRON_TOKEN
require_script "${MIRROR_SCRIPT}"
require_script "${VERIFY_SCRIPT}"

for entry in "${REPOS[@]}"; do
  name="${entry##*|}"
  if mirror_one "${entry}"; then
    SUCCEEDED+=("${name}")
  else
    FAILED+=("${name}")
    log "Aborting: fail-fast on ${name}"
    break
  fi
done

# --- Summary --------------------------------------------------------------
log "====== Summary ======"
log "Succeeded (${#SUCCEEDED[@]}): ${SUCCEEDED[*]:-none}"
log "Failed    (${#FAILED[@]}): ${FAILED[*]:-none}"

if (( ${#FAILED[@]} > 0 )); then
  exit 1
fi
log "All 3 empire repos mirrored successfully"
