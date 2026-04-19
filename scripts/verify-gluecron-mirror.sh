#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# verify-gluecron-mirror.sh
#
# Clone a repo from Gluecron into /tmp, print recent history, and
# compute a single file-tree hash. Optionally compare to GitHub.
#
# Required env:
#   GLUECRON_URL   — e.g. https://gluecron.crontech.ai
#   TARGET_REPO    — "<owner>/<name>", e.g. "crontech/crontech"
#
# Optional env:
#   GLUECRON_USER  — username (needed for private repos)
#   GLUECRON_TOKEN — PAT (needed for private repos, NEVER logged)
#   GITHUB_REPO    — "<owner>/<name>" to compare against, e.g.
#                    "ccantynz-alt/Crontech". If set, we clone the
#                    GitHub copy too and compare hashes.
#   GITHUB_TOKEN   — optional, for private GitHub repos
#   REF            — branch/tag/sha to check out on both sides
#                    (default: the remote HEAD of each clone)
#
# Exit codes:
#   0 — clone + hash succeeded; if GITHUB_REPO was set, hashes match
#   1 — missing/invalid env
#   2 — clone from gluecron failed
#   3 — clone from github failed (only when GITHUB_REPO is set)
#   4 — hash mismatch between gluecron and github
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_RED=$'\033[31m'
  C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_RESET=$'\033[0m'
else
  C_BOLD=''; C_GREEN=''; C_RED=''; C_YELLOW=''; C_BLUE=''; C_RESET=''
fi
log()  { printf '%s[verify]%s %s\n' "$C_BLUE"  "$C_RESET" "$*"; }
ok()   { printf '%s[ ok   ]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s[warn  ]%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
fail() { printf '%s[FAIL  ]%s %s\n' "$C_RED"   "$C_RESET" "$*" 1>&2; }

: "${GLUECRON_URL:?set GLUECRON_URL, e.g. https://gluecron.crontech.ai}"
: "${TARGET_REPO:?set TARGET_REPO, e.g. crontech/crontech}"

GLUECRON_URL="${GLUECRON_URL%/}"
if [[ ! "$TARGET_REPO" =~ ^[^/]+/[^/]+$ ]]; then
  fail "TARGET_REPO must be '<owner>/<repo>', got: $TARGET_REPO"
  exit 1
fi

url_encode() {
  local raw="$1" out='' i ch
  local LC_ALL=C
  for (( i=0; i<${#raw}; i++ )); do
    ch="${raw:i:1}"
    case "$ch" in
      [a-zA-Z0-9._~-]) out+="$ch" ;;
      *) out+=$(printf '%%%02X' "'$ch") ;;
    esac
  done
  printf '%s' "$out"
}

# Build gluecron clone URL (auth if token provided)
scheme_part="${GLUECRON_URL%%://*}"
host_part="${GLUECRON_URL#*://}"
host_part="${host_part%%/*}"

if [ -n "${GLUECRON_TOKEN:-}" ] && [ -n "${GLUECRON_USER:-}" ]; then
  gluecron_clone_url="${scheme_part}://$(url_encode "$GLUECRON_USER"):$(url_encode "$GLUECRON_TOKEN")@${host_part}/${TARGET_REPO}.git"
else
  gluecron_clone_url="${GLUECRON_URL}/${TARGET_REPO}.git"
fi
gluecron_display_url="${GLUECRON_URL}/${TARGET_REPO}.git"

TMP_ROOT="$(mktemp -d -t verify-gluecron.XXXXXX)"
trap 'rm -rf "$TMP_ROOT"' EXIT

tree_hash() {
  local dir="$1"
  ( cd "$dir" && \
    find . -type f -not -path './.git/*' -print0 | \
    LC_ALL=C sort -z | \
    xargs -0 sha256sum | \
    sha256sum | \
    awk '{print $1}'
  )
}

echo ""
printf '%s── Verifying Gluecron mirror ─────────────────────────%s\n' "$C_BOLD" "$C_RESET"
log "Gluecron: $gluecron_display_url"
[ -n "${GITHUB_REPO:-}" ] && log "GitHub:   https://github.com/$GITHUB_REPO.git"
[ -n "${REF:-}" ] && log "Ref:      $REF"
echo ""

# ── clone gluecron copy ──────────────────────────────────────────────
gluecron_dir="$TMP_ROOT/gluecron"
log "[1/3] Cloning from Gluecron"
if ! git clone --quiet "$gluecron_clone_url" "$gluecron_dir" 2>"$TMP_ROOT/g-clone.log"; then
  # redact token from the log before printing
  if [ -n "${GLUECRON_TOKEN:-}" ]; then
    enc_token=$(url_encode "$GLUECRON_TOKEN")
    sed -i "s|${enc_token}|<REDACTED>|g" "$TMP_ROOT/g-clone.log" 2>/dev/null || true
  fi
  fail "Clone from Gluecron failed:"
  cat "$TMP_ROOT/g-clone.log" 1>&2
  cat 1>&2 <<EOF

Check:
  1. $gluecron_display_url resolves (dig +short $host_part)
  2. The repo exists — run scripts/mirror-to-gluecron.sh first
  3. If private, set GLUECRON_USER and GLUECRON_TOKEN
EOF
  exit 2
fi

if [ -n "${REF:-}" ]; then
  ( cd "$gluecron_dir" && git checkout --quiet "$REF" ) || {
    fail "Ref '$REF' not found in Gluecron clone"
    exit 2
  }
fi

ok "    Cloned to $gluecron_dir"
echo ""
log "    Recent history (git log --oneline | head):"
( cd "$gluecron_dir" && git log --oneline | head ) | sed 's/^/      /'
echo ""

gluecron_hash=$(tree_hash "$gluecron_dir")
log "    Gluecron tree hash: $gluecron_hash"
echo ""

# ── optionally clone github copy to compare ──────────────────────────
if [ -n "${GITHUB_REPO:-}" ]; then
  log "[2/3] Cloning from GitHub for comparison"
  if [[ ! "$GITHUB_REPO" =~ ^[^/]+/[^/]+$ ]]; then
    fail "GITHUB_REPO must be '<owner>/<repo>', got: $GITHUB_REPO"
    exit 1
  fi

  if [ -n "${GITHUB_TOKEN:-}" ]; then
    gh_clone_url="https://x-access-token:$(url_encode "$GITHUB_TOKEN")@github.com/${GITHUB_REPO}.git"
  else
    gh_clone_url="https://github.com/${GITHUB_REPO}.git"
  fi

  github_dir="$TMP_ROOT/github"
  if ! git clone --quiet "$gh_clone_url" "$github_dir" 2>"$TMP_ROOT/gh-clone.log"; then
    if [ -n "${GITHUB_TOKEN:-}" ]; then
      enc_tok=$(url_encode "$GITHUB_TOKEN")
      sed -i "s|${enc_tok}|<REDACTED>|g" "$TMP_ROOT/gh-clone.log" 2>/dev/null || true
    fi
    fail "Clone from GitHub failed:"
    cat "$TMP_ROOT/gh-clone.log" 1>&2
    exit 3
  fi

  if [ -n "${REF:-}" ]; then
    ( cd "$github_dir" && git checkout --quiet "$REF" ) || {
      fail "Ref '$REF' not found in GitHub clone"
      exit 3
    }
  fi

  github_hash=$(tree_hash "$github_dir")
  log "    GitHub tree hash:   $github_hash"
  echo ""

  log "[3/3] Comparing hashes"
  if [ "$gluecron_hash" = "$github_hash" ]; then
    ok "    MATCH — Gluecron mirror is byte-identical to GitHub"
  else
    fail "    MISMATCH — Gluecron and GitHub differ"
    cat 1>&2 <<EOF

  gluecron: $gluecron_hash
  github:   $github_hash

To diff the actual files:
  diff -rq $gluecron_dir $github_dir | grep -v '\\.git'

Likely causes:
  • Mirror is stale — re-run scripts/mirror-to-gluecron.sh
  • GitHub received a push after the last mirror run
  • Different branches checked out (pass REF=<branch> to pin both)
EOF
    exit 4
  fi
else
  log "[2/3] (GITHUB_REPO not set — skipping GitHub comparison)"
  log "[3/3] Gluecron hash computed; no comparison target"
fi

echo ""
printf '%s✔ verification complete%s\n' "$C_GREEN" "$C_RESET"
echo ""
exit 0
