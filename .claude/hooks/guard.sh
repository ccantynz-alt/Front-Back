#!/bin/bash
# guard.sh — Blocks dangerous commands before they execute
# Hook type: PreToolUse (Bash)
#
# Prevents destructive git operations, secret exposure, and other
# high-risk actions that should never run without explicit approval.

set -euo pipefail

# Read the command from stdin (hook receives tool input as JSON)
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | grep -o '"command":"[^"]*"' | sed 's/"command":"//;s/"$//' 2>/dev/null || echo "")

# If we can't extract the command, allow it (non-Bash tool call)
if [ -z "$COMMAND" ]; then
  exit 0
fi

# ── Blocked Patterns ─────────────────────────────────────────────────

BLOCKED_PATTERNS=(
  "git push --force"
  "git push -f "
  "git reset --hard"
  "git clean -f"
  "git checkout -- ."
  "git restore ."
  "rm -rf /"
  "rm -rf ~"
  "rm -rf \$HOME"
  "--no-verify"
  "--no-gpg-sign"
  "DROP TABLE"
  "DROP DATABASE"
  "TRUNCATE TABLE"
  "force push"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qi "$pattern"; then
    echo "BLOCKED: Command contains dangerous pattern: '$pattern'"
    echo "This operation requires explicit user approval."
    exit 2
  fi
done

# ── Secret Detection ─────────────────────────────────────────────────

SECRET_PATTERNS=(
  "OPENAI_API_KEY"
  "CLOUDFLARE_API_TOKEN"
  "DATABASE_URL"
  "NEON_"
  "AWS_SECRET"
  "STRIPE_SECRET"
  "GITHUB_TOKEN"
)

# Only check echo/printf/cat that might expose secrets
if echo "$COMMAND" | grep -qE "^(echo|printf|cat)"; then
  for secret in "${SECRET_PATTERNS[@]}"; do
    if echo "$COMMAND" | grep -q "$secret"; then
      echo "BLOCKED: Command may expose secret: '$secret'"
      exit 2
    fi
  done
fi

# All clear
exit 0
