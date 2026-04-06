#!/bin/bash
# ── Crontech SessionStart Hook ────────────────────────────────────────
# This runs BEFORE every new Claude Code session starts.
#
# Doctrine (from CLAUDE.md):
#   - We are the aggressor. We own the most advanced architecture.
#   - We stay 80-100% ahead of all competitors at all times.
#   - No scatter-gun work. Every session begins with full context.
#   - Zero broken anything. Build green. Checkers green. Tests green.
#
# What this hook does:
#   1. Installs all dependencies (idempotent)
#   2. Verifies the build is green
#   3. Runs the link + button checkers (zero-broken-anything enforcement)
#   4. Surfaces the latest Sentinel intelligence (competitive awareness)
#   5. Reports current platform state to the agent
#
# This makes every session start from a known-good, fully-contextualised
# state. No more scatter-gun. No more guessing what changed.
#
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

# Only run heavy work in remote (Claude Code on the web) sessions.
# Local sessions skip the heavy install — devs handle that themselves.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "═══════════════════════════════════════════════════════════════"
echo "   CRONTECH SESSION-START HOOK"
echo "   Doctrine: Aggressor. 80-100% ahead. Zero broken anything."
echo "═══════════════════════════════════════════════════════════════"

# ── 1. Install dependencies ──────────────────────────────────────────
echo ""
echo "[hook] Installing dependencies via bun..."
if command -v bun >/dev/null 2>&1; then
  bun install --silent 2>&1 | tail -5 || {
    echo "[hook] ⚠️  bun install failed — continuing anyway"
  }
else
  echo "[hook] ⚠️  bun not found in PATH — install manually before running tests"
fi

# Persist Bun in PATH for the session
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -d "$HOME/.bun/bin" ]; then
  echo 'export PATH="$HOME/.bun/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

# ── 2. Pull latest from origin (if on a tracked branch) ──────────────
echo ""
echo "[hook] Fetching latest from origin..."
if git fetch origin 2>/dev/null; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
  BEHIND=$(git rev-list --count "HEAD..origin/$CURRENT_BRANCH" 2>/dev/null || echo "0")
  AHEAD=$(git rev-list --count "origin/$CURRENT_BRANCH..HEAD" 2>/dev/null || echo "0")
  echo "[hook] Branch: $CURRENT_BRANCH | $AHEAD ahead, $BEHIND behind origin"
fi

# ── 3. Verify zero-broken-anything ───────────────────────────────────
echo ""
echo "[hook] Running zero-broken-anything checks..."

LINK_RESULT="✅"
BUTTON_RESULT="✅"

if bun run check-links >/dev/null 2>&1; then
  LINK_COUNT=$(bun run check-links 2>&1 | grep -oP 'Found \K[0-9]+' | head -1 || echo "?")
  echo "[hook] ✅ Link checker: PASS ($LINK_COUNT routes)"
else
  LINK_RESULT="‼️"
  echo "[hook] ‼️  Link checker: FAIL — fix dead links before adding features"
fi

if bun run check-buttons >/dev/null 2>&1; then
  echo "[hook] ✅ Button checker: PASS"
else
  BUTTON_RESULT="‼️"
  echo "[hook] ‼️  Button checker: FAIL — fix dead buttons before adding features"
fi

# ── 4. Surface latest Sentinel intelligence ──────────────────────────
echo ""
echo "[hook] Checking Sentinel intelligence store..."
SENTINEL_STORE="services/sentinel/data/intelligence.json"
if [ -f "$SENTINEL_STORE" ]; then
  ITEM_COUNT=$(grep -c '"id"' "$SENTINEL_STORE" 2>/dev/null || echo "0")
  echo "[hook] Sentinel: $ITEM_COUNT competitive intel items in store"
  echo "[hook] (Run sentinel service for live monitoring of competitors)"
else
  echo "[hook] Sentinel: no intel store yet — start the service to begin monitoring"
fi

# ── 5. Platform state summary ────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "   PLATFORM STATE SUMMARY"
echo "═══════════════════════════════════════════════════════════════"

if [ -f "package.json" ]; then
  ROUTE_COUNT=$(find apps/web/src/routes -name "*.tsx" 2>/dev/null | wc -l || echo "?")
  TRPC_COUNT=$(find apps/api/src/trpc/procedures -name "*.ts" 2>/dev/null | wc -l || echo "?")
  TABLE_COUNT=$(grep -c "sqliteTable" packages/db/src/schema.ts 2>/dev/null || echo "?")
  TEST_COUNT=$(find apps/api/src services/sentinel/src -name "*.test.ts" 2>/dev/null | wc -l || echo "?")
  echo "[hook] Routes:     $ROUTE_COUNT"
  echo "[hook] tRPC procs: $TRPC_COUNT"
  echo "[hook] DB tables:  $TABLE_COUNT"
  echo "[hook] Test files: $TEST_COUNT"
  echo "[hook] Link check: $LINK_RESULT"
  echo "[hook] Btn check:  $BUTTON_RESULT"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "   DOCTRINE REMINDERS (read CLAUDE.md before acting):"
echo "   1. ZERO broken anything. Every button works. Every link resolves."
echo "   2. NO scatter-gun. Plan first. Execute cleanly. Push immediately."
echo "   3. AGGRESSOR mindset. We own the architecture. They chase us."
echo "   4. STAY 80-100% ahead. Every PR must extend the lead."
echo "═══════════════════════════════════════════════════════════════"

exit 0
