#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# mirror-repos-to-gluecron.sh
#
# Mirror the three Crontech ecosystem repos from GitHub → self-hosted
# Gluecron. Non-destructive: GitHub is untouched. Idempotent: re-running
# force-updates the Gluecron mirror with the latest GitHub state.
#
# Required env:
#   GLUECRON_HOST   — e.g. gluecron.crontech.ai
#   GLUECRON_USER   — admin username on the Gluecron instance
#   GLUECRON_TOKEN  — personal access token from Gluecron settings
#
# Optional env:
#   GITHUB_OWNER    — default: ccantynz-alt
#   REPOS           — default: "Crontech Gluecron.com AlecRae.com"
#   TMP_DIR         — default: /tmp/crontech-mirror
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

GLUECRON_HOST="${GLUECRON_HOST:?set GLUECRON_HOST (e.g. gluecron.crontech.ai)}"
GLUECRON_USER="${GLUECRON_USER:?set GLUECRON_USER}"
GLUECRON_TOKEN="${GLUECRON_TOKEN:?set GLUECRON_TOKEN}"

GITHUB_OWNER="${GITHUB_OWNER:-ccantynz-alt}"
REPOS="${REPOS:-Crontech Gluecron.com AlecRae.com}"
TMP_DIR="${TMP_DIR:-/tmp/crontech-mirror}"

GLUECRON_AUTH_URL="https://${GLUECRON_USER}:${GLUECRON_TOKEN}@${GLUECRON_HOST}"

mkdir -p "$TMP_DIR"

echo "=========================================="
echo "  Mirroring repos to Gluecron"
echo "  Target: https://${GLUECRON_HOST}"
echo "  Repos:  ${REPOS}"
echo "=========================================="

for repo in $REPOS; do
  echo ""
  echo "── ${repo} ─────────────────────────────────────"

  github_url="https://github.com/${GITHUB_OWNER}/${repo}.git"
  gluecron_url="${GLUECRON_AUTH_URL}/${GLUECRON_USER}/${repo}.git"
  # Strip auth from the display URL so we don't log the token
  display_url="https://${GLUECRON_HOST}/${GLUECRON_USER}/${repo}.git"
  mirror_dir="${TMP_DIR}/${repo}.git"

  # Step 1: clone --mirror from GitHub (fresh) or update existing mirror
  if [ -d "$mirror_dir" ]; then
    echo "[1/3] Updating existing mirror at ${mirror_dir}"
    (cd "$mirror_dir" && git remote update --prune)
  else
    echo "[1/3] Cloning --mirror from GitHub: ${github_url}"
    git clone --mirror "$github_url" "$mirror_dir"
  fi

  # Step 2: create the repo on Gluecron if it doesn't exist
  echo "[2/3] Ensuring repo exists on Gluecron: ${display_url}"
  create_status=$(curl -sSf -o /dev/null -w "%{http_code}" \
    -X POST "https://${GLUECRON_HOST}/api/v1/repos" \
    -H "Authorization: Bearer ${GLUECRON_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${repo}\",\"description\":\"Mirror of ${github_url}\",\"private\":false}" \
    || echo "000")

  case "$create_status" in
    201) echo "      Created" ;;
    409) echo "      Already exists (ok)" ;;
    200) echo "      Already exists (ok)" ;;
    *)   echo "      Warn: create returned HTTP ${create_status} — continuing (assume repo exists)" ;;
  esac

  # Step 3: push --mirror into Gluecron (force-syncs refs + tags, removes deleted branches)
  echo "[3/3] Pushing --mirror to Gluecron"
  (cd "$mirror_dir" && git push --mirror "$gluecron_url")
  echo "      ✔ ${repo} mirrored"
done

echo ""
echo "=========================================="
echo "  All repos mirrored."
echo "  Verify with:"
echo "    git ls-remote https://${GLUECRON_HOST}/${GLUECRON_USER}/Crontech.git"
echo "  Switch a local clone:"
echo "    git remote set-url gluecron https://${GLUECRON_HOST}/${GLUECRON_USER}/<repo>.git"
echo "=========================================="
