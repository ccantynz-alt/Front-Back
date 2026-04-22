#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# mirror-to-gluecron.sh
#
# Mirror the CURRENT git repo (expected: Crontech, but works for any)
# into a self-hosted Gluecron instance, closing the dogfood loop where
# Gluecron hosts Crontech's own source code.
#
# What it does:
#   1. Ensures the target repo exists on Gluecron (creates it via v2 API
#      if missing — idempotent).
#   2. Adds a `gluecron` remote to the current clone (or updates the URL
#      if the remote already exists).
#   3. `git push --mirror` — pushes ALL branches, ALL tags, and prunes
#      anything on Gluecron that no longer exists here.
#   4. Clones the gluecron-hosted copy into a temp dir and diffs the
#      file-tree hash against the local tree to prove integrity.
#
# Required env:
#   GLUECRON_URL    — e.g. https://gluecron.crontech.ai (no trailing slash)
#   GLUECRON_USER   — username on the Gluecron instance
#   GLUECRON_TOKEN  — personal access token (NEVER logged)
#   TARGET_REPO     — "<owner>/<name>", e.g. "crontech/crontech"
#
# Optional env:
#   SOURCE_DIR      — path to the local repo (default: $PWD)
#   TMP_DIR         — temp workspace (default: mktemp -d)
#
# Exit codes:
#   0  — mirror + verification succeeded
#   1  — missing/invalid env
#   2  — source is not a git repo
#   3  — could not reach Gluecron API
#   4  — could not create target repo
#   5  — push --mirror failed
#   6  — verification clone failed
#   7  — verification hash mismatch
#
# Safe to run twice. Idempotent by design.
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── colours ──────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_RED=$'\033[31m'
  C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_RESET=$'\033[0m'
else
  C_BOLD=''; C_GREEN=''; C_RED=''; C_YELLOW=''; C_BLUE=''; C_RESET=''
fi

log()   { printf '%s[mirror]%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok()    { printf '%s[ ok  ]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '%s[warn ]%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
fail()  { printf '%s[FAIL ]%s %s\n' "$C_RED" "$C_RESET" "$*" 1>&2; }

# ── env validation ───────────────────────────────────────────────────
missing=()
[ -z "${GLUECRON_URL:-}" ]   && missing+=("GLUECRON_URL")
[ -z "${GLUECRON_USER:-}" ]  && missing+=("GLUECRON_USER")
[ -z "${GLUECRON_TOKEN:-}" ] && missing+=("GLUECRON_TOKEN")
[ -z "${TARGET_REPO:-}" ]    && missing+=("TARGET_REPO")

if [ ${#missing[@]} -gt 0 ]; then
  fail "Missing required env vars: ${missing[*]}"
  cat 1>&2 <<EOF

Set each of these before running:

  export GLUECRON_URL=https://gluecron.crontech.ai
  export GLUECRON_USER=craig
  export GLUECRON_TOKEN=\$(cat ~/.gluecron-pat)
  export TARGET_REPO=crontech/crontech

  bash scripts/mirror-to-gluecron.sh

The token is never echoed or written to disk by this script.
Generate one at: \${GLUECRON_URL}/-/user/settings/tokens
EOF
  exit 1
fi

# Strip trailing slash from URL
GLUECRON_URL="${GLUECRON_URL%/}"

# Sanity check TARGET_REPO shape
if [[ ! "$TARGET_REPO" =~ ^[^/]+/[^/]+$ ]]; then
  fail "TARGET_REPO must be '<owner>/<repo>', got: $TARGET_REPO"
  exit 1
fi
TARGET_OWNER="${TARGET_REPO%/*}"
TARGET_NAME="${TARGET_REPO#*/}"

SOURCE_DIR="${SOURCE_DIR:-$PWD}"
# Accept both working-tree clones (with .git/) and bare --mirror clones
# (the shape scripts/mirror-all-to-gluecron.sh passes in). rev-parse
# --git-dir succeeds in either layout.
if ! git -C "$SOURCE_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  fail "$SOURCE_DIR is not a git repository"
  cat 1>&2 <<EOF

Set SOURCE_DIR to the root of the Crontech clone, e.g.:
  SOURCE_DIR=/home/craig/Crontech bash scripts/mirror-to-gluecron.sh

Or run this script from inside the repo directory.
EOF
  exit 2
fi

OWN_TMP=0
if [ -z "${TMP_DIR:-}" ]; then
  TMP_DIR="$(mktemp -d -t mirror-gluecron.XXXXXX)"
  OWN_TMP=1
fi
cleanup() {
  if [ "$OWN_TMP" -eq 1 ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

# ── header ───────────────────────────────────────────────────────────
echo ""
printf '%s╔════════════════════════════════════════════════════╗%s\n' "$C_BOLD" "$C_RESET"
printf '%s║  Mirror → Gluecron                                 ║%s\n' "$C_BOLD" "$C_RESET"
printf '%s╚════════════════════════════════════════════════════╝%s\n' "$C_BOLD" "$C_RESET"
log "Source:  $SOURCE_DIR"
log "Target:  $GLUECRON_URL/$TARGET_OWNER/$TARGET_NAME"
log "User:    $GLUECRON_USER"
echo ""

# ── pre-flight: can we reach Gluecron? ──────────────────────────────
log "[0/4] Pre-flight: reaching Gluecron API"

# /api/v2/version is our canonical probe. Fall back to root if absent.
probe_status=$(curl -sS -o /dev/null -w '%{http_code}' \
  --max-time 15 \
  -H "Authorization: token $GLUECRON_TOKEN" \
  "$GLUECRON_URL/api/v2/version" || echo "000")

case "$probe_status" in
  2*|404)
    ok  "Gluecron reachable (HTTP $probe_status)"
    ;;
  401|403)
    fail "Gluecron returned $probe_status on /api/v2/version — token is invalid or lacks scope"
    cat 1>&2 <<EOF

Check:
  1. GLUECRON_TOKEN is a valid PAT (not expired, not revoked)
  2. The PAT has 'repo' and 'admin' (or equivalent) scopes
  3. Generate a new one at: $GLUECRON_URL/-/user/settings/tokens
EOF
    exit 3
    ;;
  000)
    fail "Could not reach $GLUECRON_URL — network, DNS, or TLS failure"
    cat 1>&2 <<EOF

Check:
  1. GLUECRON_URL=$GLUECRON_URL (typo? protocol?)
  2. DNS: dig +short $(echo "$GLUECRON_URL" | sed -E 's~https?://([^/]+).*~\1~')
  3. TLS: curl -vI $GLUECRON_URL 2>&1 | head -40
  4. The Gluecron process is running on the target host
EOF
    exit 3
    ;;
  *)
    warn "Gluecron responded HTTP $probe_status on /api/v2/version — continuing anyway"
    ;;
esac

# ── step 1: ensure target repo exists ───────────────────────────────
log "[1/4] Ensuring repo exists: $TARGET_OWNER/$TARGET_NAME"

# First, check if it already exists (GET is cheap and idempotent)
get_status=$(curl -sS -o /dev/null -w '%{http_code}' \
  --max-time 15 \
  -H "Authorization: token $GLUECRON_TOKEN" \
  "$GLUECRON_URL/api/v2/repos/$TARGET_OWNER/$TARGET_NAME" || echo "000")

case "$get_status" in
  200)
    ok "Repo already exists on Gluecron"
    ;;
  404)
    log "Repo not found — creating via v2 API"

    # Decide the create endpoint based on whether the owner matches the
    # authenticated user or is an org.
    if [ "$TARGET_OWNER" = "$GLUECRON_USER" ]; then
      create_endpoint="$GLUECRON_URL/api/v2/user/repos"
    else
      create_endpoint="$GLUECRON_URL/api/v2/orgs/$TARGET_OWNER/repos"
    fi

    create_body=$(cat <<JSON
{
  "name": "$TARGET_NAME",
  "description": "Mirrored from upstream — managed by scripts/mirror-to-gluecron.sh",
  "private": false,
  "auto_init": false,
  "default_branch": "Main"
}
JSON
)

    create_response="$TMP_DIR/create-response.json"
    create_status=$(curl -sS -o "$create_response" -w '%{http_code}' \
      --max-time 30 \
      -X POST "$create_endpoint" \
      -H "Authorization: token $GLUECRON_TOKEN" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d "$create_body" || echo "000")

    case "$create_status" in
      201|200)
        ok "Created $TARGET_OWNER/$TARGET_NAME on Gluecron"
        ;;
      409|422)
        # Race: another caller created it between our GET and POST. Fine.
        ok "Repo already exists (race: HTTP $create_status)"
        ;;
      401|403)
        fail "HTTP $create_status creating repo — token lacks create-repo scope"
        cat 1>&2 <<EOF

The PAT needs permission to create repos under '$TARGET_OWNER'.
- For user repos: 'write:repo' or 'repo' scope
- For org repos: you must be an owner of the '$TARGET_OWNER' org
EOF
        exit 4
        ;;
      404)
        fail "HTTP 404 creating repo — the '$TARGET_OWNER' owner/org does not exist"
        cat 1>&2 <<EOF

Create the org '$TARGET_OWNER' first, or set TARGET_REPO so the owner
matches an existing user/org on Gluecron.
EOF
        exit 4
        ;;
      *)
        fail "HTTP $create_status creating repo on Gluecron"
        if [ -s "$create_response" ]; then
          echo "--- response body ---" 1>&2
          head -c 2000 "$create_response" 1>&2
          echo "" 1>&2
          echo "---------------------" 1>&2
        fi
        exit 4
        ;;
    esac
    ;;
  401|403)
    fail "HTTP $get_status checking repo — token is invalid or lacks scope"
    exit 3
    ;;
  *)
    warn "HTTP $get_status checking repo existence — proceeding with create attempt"
    ;;
esac

# ── step 2: configure the gluecron remote and push --mirror ─────────
log "[2/4] Configuring gluecron remote + pushing --mirror"

# Build an auth-bearing URL for the push, but never echo it.
# Format: https://<user>:<token>@host/owner/name.git
#   - user/token URL-encoded (simple enough to inline)
url_encode() {
  local raw="$1"
  # Pure bash URL-encode using printf for safety with '@', ':', '/' etc.
  local LC_ALL=C
  local out=''
  local i ch
  for (( i=0; i<${#raw}; i++ )); do
    ch="${raw:i:1}"
    case "$ch" in
      [a-zA-Z0-9._~-]) out+="$ch" ;;
      *) out+=$(printf '%%%02X' "'$ch") ;;
    esac
  done
  printf '%s' "$out"
}

enc_user=$(url_encode "$GLUECRON_USER")
enc_token=$(url_encode "$GLUECRON_TOKEN")

# host portion of GLUECRON_URL (strip scheme, strip any path)
host_part="${GLUECRON_URL#*://}"
host_part="${host_part%%/*}"
scheme_part="${GLUECRON_URL%%://*}"

gluecron_push_url="${scheme_part}://${enc_user}:${enc_token}@${host_part}/${TARGET_OWNER}/${TARGET_NAME}.git"
gluecron_display_url="${GLUECRON_URL}/${TARGET_OWNER}/${TARGET_NAME}.git"

# Use a fresh bare --mirror clone of the source so we don't pollute the
# working tree. This also guarantees --mirror semantics even if the
# invoker is running from a shallow or partial clone.
bare_mirror="$TMP_DIR/source.git"
log "    cloning bare --mirror of $SOURCE_DIR into temp dir"
git clone --quiet --mirror "$SOURCE_DIR" "$bare_mirror"

# --mirror pulls ALL refs — including refs/remotes/origin/* tracking
# refs inherited from the source clone. Pushing those into Gluecron
# would pollute it with GitHub-shaped tracking branches. Strip them,
# plus any pull-request refs that fetch configs left behind.
log "    pruning remote-tracking + PR refs from bare mirror"
# for-each-ref takes prefixes, not globs. Iterate each prefix.
for prefix in refs/remotes refs/pull refs/pr refs/keep-around; do
  # Collect refs first (avoid subshell losing state) then delete.
  refs_to_delete=$(git -C "$bare_mirror" for-each-ref --format='%(refname)' "$prefix" || true)
  if [ -n "$refs_to_delete" ]; then
    while IFS= read -r ref; do
      [ -n "$ref" ] && git -C "$bare_mirror" update-ref -d "$ref"
    done <<<"$refs_to_delete"
  fi
done

# Pushing --mirror from a bare mirror clone is the canonical way to
# replicate absolutely every ref that remains (branches + tags + HEAD).
log "    pushing --mirror → $gluecron_display_url"
push_log="$TMP_DIR/push.log"
if ! git -C "$bare_mirror" push --mirror "$gluecron_push_url" >"$push_log" 2>&1; then
  # Redact token from any echoed log path
  sed -i "s|${enc_token}|<REDACTED>|g" "$push_log" 2>/dev/null || true
  fail "git push --mirror failed. Log:"
  cat "$push_log" 1>&2
  cat 1>&2 <<EOF

Common causes + fixes:
  • 401/403: token lacks 'write' on $TARGET_OWNER/$TARGET_NAME → regenerate with repo scope
  • 404 on push: repo was deleted between step 1 and step 2 → re-run
  • 'remote rejected' for protected branch: turn off branch protection
    on Gluecron for the initial mirror, or push without --mirror and
    then re-enable protection
  • large-pack timeout: set a bigger http.postBuffer:
      git -C $bare_mirror config http.postBuffer 524288000
EOF
  exit 5
fi
ok "push --mirror complete"

# Also register 'gluecron' as a remote on the caller's working clone
# (the SOURCE_DIR), so follow-up pushes are one command. We use the
# display URL (no embedded token) so it's safe to commit/ls-remote.
if git -C "$SOURCE_DIR" remote get-url gluecron >/dev/null 2>&1; then
  existing_url=$(git -C "$SOURCE_DIR" remote get-url gluecron)
  if [ "$existing_url" != "$gluecron_display_url" ]; then
    log "    updating existing 'gluecron' remote → $gluecron_display_url"
    git -C "$SOURCE_DIR" remote set-url gluecron "$gluecron_display_url"
  else
    ok "    'gluecron' remote already configured"
  fi
else
  log "    adding 'gluecron' remote → $gluecron_display_url"
  git -C "$SOURCE_DIR" remote add gluecron "$gluecron_display_url"
fi

# ── step 3: verify by cloning back + tree-hash diff ─────────────────
log "[3/4] Verifying mirror integrity (clone-back + tree hash)"

verify_dir="$TMP_DIR/verify"
mkdir -p "$verify_dir"

# Determine what branch SOURCE_DIR currently has checked out so we can
# ask the verify clone to land on the same ref.
source_branch=$(git -C "$SOURCE_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")

# Clone the Gluecron copy (no --mirror: we want a working tree)
clone_args=(--quiet)
if [ "$source_branch" != "HEAD" ]; then
  clone_args+=(--branch "$source_branch")
fi
if ! git clone "${clone_args[@]}" "$gluecron_push_url" "$verify_dir/mirror" 2>"$TMP_DIR/clone.log"; then
  sed -i "s|${enc_token}|<REDACTED>|g" "$TMP_DIR/clone.log" 2>/dev/null || true
  fail "Clone-back from Gluecron failed:"
  cat "$TMP_DIR/clone.log" 1>&2
  exit 6
fi

# Compute a tree hash over the tree object at HEAD. Works on both bare
# and non-bare repos, so the same function can hash SOURCE_DIR (which
# the all-to-gluecron wrapper passes as a bare --mirror clone) and the
# verify clone (a normal working tree). git ls-tree yields deterministic
# output — object ids plus paths — so any divergence surfaces as a
# different hash without needing to materialise file contents.
tree_hash() {
  local dir="$1"
  ( cd "$dir" && \
    git ls-tree -r HEAD | \
    LC_ALL=C sort | \
    sha256sum | \
    awk '{print $1}'
  )
}

source_hash=$(tree_hash "$SOURCE_DIR")
mirror_hash=$(tree_hash "$verify_dir/mirror")

log "    source tree hash: $source_hash"
log "    mirror tree hash: $mirror_hash"

if [ "$source_hash" != "$mirror_hash" ]; then
  fail "Tree-hash mismatch — mirror diverged from source"
  cat 1>&2 <<EOF

This means the pushed refs don't reconstitute to the same file tree as
the local working tree. Most common causes:
  • Uncommitted changes in SOURCE_DIR — run 'git status' and commit/stash
  • SOURCE_DIR is on a different branch than the default branch checked
    out by the verify clone — check 'git -C $SOURCE_DIR branch --show-current'
  • Submodule mismatch — submodules are NOT pushed by --mirror

To debug, compare:
  diff -rq $SOURCE_DIR $verify_dir/mirror | grep -v '\\.git'
EOF
  exit 7
fi
ok "    tree hashes match — mirror is byte-identical"

# ── step 4: final summary banner ────────────────────────────────────
log "[4/4] Success banner"
echo ""
printf '%s╔════════════════════════════════════════════════════╗%s\n' "$C_GREEN" "$C_RESET"
printf '%s║  ✔ MIRROR COMPLETE — dogfood loop closed            ║%s\n' "$C_GREEN" "$C_RESET"
printf '%s╚════════════════════════════════════════════════════╝%s\n' "$C_GREEN" "$C_RESET"
echo ""
echo "  Target:     $gluecron_display_url"
echo "  Tree hash:  $source_hash"
echo "  Next push:  git push gluecron <branch>"
echo ""
echo "  Verify at any time:"
echo "    bash scripts/verify-gluecron-mirror.sh"
echo ""

exit 0
