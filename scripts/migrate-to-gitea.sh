#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Crontech — Migrate Repository to Self-Hosted Gitea
# ──────────────────────────────────────────────────────────────────────────────
# Adds Gitea as a remote and pushes all branches. After verification, Gitea
# becomes 'origin' and GitHub becomes 'github-archive' (kept as read-only
# backup until Craig is ready to delete it).
#
# Usage:
#   Run from ANY clone of the Crontech repo (local dev machine or VPS):
#     bash scripts/migrate-to-gitea.sh
#
# Prerequisites:
#   - Gitea running at git.crontech.ai (via setup-gitea.sh)
#   - 'crontech' organization created in Gitea
#   - 'crontech' repository created in Gitea under that org
#   - SSH key added to Gitea (Settings → SSH Keys) OR
#     HTTPS credentials configured
#   - Git installed locally
#
# This script is NON-DESTRUCTIVE. It does not delete the GitHub remote.
# It does not force-push. It adds a new remote and pushes.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
readonly GIT_DOMAIN="git.crontech.ai"
readonly GITEA_ORG="crontech"
readonly GITEA_REPO="crontech"
readonly GITEA_SSH_URL="ssh://git@${GIT_DOMAIN}/${GITEA_ORG}/${GITEA_REPO}.git"
readonly GITEA_HTTPS_URL="https://${GIT_DOMAIN}/${GITEA_ORG}/${GITEA_REPO}.git"

# ── Colors ────────────────────────────────────────────────────────────────────
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly NC='\033[0m'

log()      { echo -e "${CYAN}[migrate]${NC} $*"; }
log_ok()   { echo -e "${GREEN}[  OK ]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[ WARN]${NC} $*"; }
log_err()  { echo -e "${RED}[FAIL ]${NC} $*" >&2; }

header() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${BLUE}  $*${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: Preflight Checks
# ══════════════════════════════════════════════════════════════════════════════
header "Step 1/5 — Preflight Checks"

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  log_err "Not inside a git repository. Run this from the Crontech repo root."
  exit 1
fi
log_ok "Inside git repository"

REPO_ROOT=$(git rev-parse --show-toplevel)
log_ok "Repo root: ${REPO_ROOT}"

# Verify this is the Crontech repo
if [ ! -f "${REPO_ROOT}/CLAUDE.md" ]; then
  log_err "This does not appear to be the Crontech repo (no CLAUDE.md found)."
  exit 1
fi
log_ok "Confirmed Crontech repository"

# Check for uncommitted changes
if ! git diff --quiet HEAD 2>/dev/null; then
  log_warn "You have uncommitted changes. Commit or stash them first."
  git status --short
  echo ""
  read -rp "Continue anyway? (y/N): " CONTINUE
  if [ "${CONTINUE}" != "y" ] && [ "${CONTINUE}" != "Y" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: Choose transport (SSH or HTTPS)
# ══════════════════════════════════════════════════════════════════════════════
header "Step 2/5 — Configure Gitea Remote"

echo ""
echo -e "  ${BOLD}Choose git transport:${NC}"
echo -e "    ${BOLD}1.${NC} SSH   — ${DIM}${GITEA_SSH_URL}${NC}"
echo -e "    ${BOLD}2.${NC} HTTPS — ${DIM}${GITEA_HTTPS_URL}${NC}"
echo ""
read -rp "  Choice [1]: " TRANSPORT_CHOICE
TRANSPORT_CHOICE="${TRANSPORT_CHOICE:-1}"

if [ "${TRANSPORT_CHOICE}" = "2" ]; then
  GITEA_URL="${GITEA_HTTPS_URL}"
  log_ok "Using HTTPS transport"
else
  GITEA_URL="${GITEA_SSH_URL}"
  log_ok "Using SSH transport"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: Add Gitea remote
# ══════════════════════════════════════════════════════════════════════════════
header "Step 3/5 — Add Gitea Remote"

# Check if 'gitea' remote already exists
if git remote get-url gitea &>/dev/null; then
  EXISTING_URL=$(git remote get-url gitea)
  if [ "${EXISTING_URL}" = "${GITEA_URL}" ]; then
    log_ok "Remote 'gitea' already points to ${GITEA_URL}"
  else
    log_warn "Remote 'gitea' exists but points to ${EXISTING_URL}"
    log "Updating remote URL to ${GITEA_URL}"
    git remote set-url gitea "${GITEA_URL}"
    log_ok "Remote 'gitea' updated"
  fi
else
  git remote add gitea "${GITEA_URL}"
  log_ok "Added remote 'gitea' → ${GITEA_URL}"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: Push all branches and tags
# ══════════════════════════════════════════════════════════════════════════════
header "Step 4/5 — Push All Branches & Tags"

log "Pushing all branches to Gitea..."
git push gitea --all
log_ok "All branches pushed"

log "Pushing all tags to Gitea..."
git push gitea --tags
log_ok "All tags pushed"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: Swap remotes (optional)
# ══════════════════════════════════════════════════════════════════════════════
header "Step 5/5 — Swap Remotes"

echo ""
echo -e "  ${BOLD}Make Gitea the default remote (origin)?${NC}"
echo ""
echo -e "  This will:"
echo -e "    ${DIM}1. Rename 'origin' to 'github-archive'${NC}"
echo -e "    ${DIM}2. Rename 'gitea' to 'origin'${NC}"
echo -e "    ${DIM}3. Set upstream tracking to the new origin${NC}"
echo ""
echo -e "  ${DIM}The old GitHub remote is kept as 'github-archive' (read-only backup).${NC}"
echo -e "  ${DIM}Delete it later with: git remote remove github-archive${NC}"
echo ""
read -rp "  Swap remotes now? (y/N): " SWAP_CHOICE

if [ "${SWAP_CHOICE}" = "y" ] || [ "${SWAP_CHOICE}" = "Y" ]; then
  # Rename origin -> github-archive (if origin exists and isn't already gitea)
  if git remote get-url origin &>/dev/null; then
    ORIGIN_URL=$(git remote get-url origin)
    if echo "${ORIGIN_URL}" | grep -q "${GIT_DOMAIN}"; then
      log_ok "Origin already points to Gitea — no swap needed"
    else
      # Check if github-archive already exists
      if git remote get-url github-archive &>/dev/null; then
        log_warn "Remote 'github-archive' already exists — removing old one"
        git remote remove github-archive
      fi
      git remote rename origin github-archive
      log_ok "Renamed 'origin' → 'github-archive'"

      git remote rename gitea origin
      log_ok "Renamed 'gitea' → 'origin'"

      # Set upstream tracking for current branch
      CURRENT_BRANCH=$(git branch --show-current)
      git branch --set-upstream-to="origin/${CURRENT_BRANCH}" "${CURRENT_BRANCH}" 2>/dev/null || true
      log_ok "Upstream set to origin/${CURRENT_BRANCH}"
    fi
  else
    git remote rename gitea origin
    log_ok "Renamed 'gitea' → 'origin' (no previous origin found)"
  fi
else
  log_ok "Remotes left as-is (gitea remote available alongside origin)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
header "Migration Complete"

echo ""
echo -e "  ${BOLD}${GREEN}Repository successfully pushed to self-hosted Gitea${NC}"
echo ""
echo -e "  ${BOLD}Current remotes:${NC}"
git remote -v | sed 's/^/    /'
echo ""
echo -e "  ${BOLD}Gitea web UI:${NC}  ${DIM}https://${GIT_DOMAIN}/${GITEA_ORG}/${GITEA_REPO}${NC}"
echo ""
echo -e "  ${YELLOW}${BOLD}For other developers / machines:${NC}"
echo ""
echo -e "  ${BOLD}Fresh clone (SSH):${NC}"
echo -e "    ${DIM}git clone ${GITEA_SSH_URL}${NC}"
echo ""
echo -e "  ${BOLD}Fresh clone (HTTPS):${NC}"
echo -e "    ${DIM}git clone ${GITEA_HTTPS_URL}${NC}"
echo ""
echo -e "  ${BOLD}Update existing clone:${NC}"
echo -e "    ${DIM}cd /path/to/Crontech${NC}"
echo -e "    ${DIM}git remote rename origin github-archive${NC}"
echo -e "    ${DIM}git remote add origin ${GITEA_SSH_URL}${NC}"
echo -e "    ${DIM}git fetch origin${NC}"
echo -e "    ${DIM}git branch --set-upstream-to=origin/main main${NC}"
echo ""
echo -e "  ${BOLD}After verifying Gitea works, remove GitHub remote:${NC}"
echo -e "    ${DIM}git remote remove github-archive${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  Fully self-hosted. No GitHub dependency remaining.${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
