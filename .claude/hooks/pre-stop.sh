#!/bin/bash
# pre-stop.sh — Clean state verification before session ends
# Hook type: Stop
#
# Verifies the repo is in a clean state before Claude stops working.
# Catches uncommitted changes, failing tests, and other loose ends.

set -euo pipefail
cd /home/user/Front-Back

echo "=== Pre-stop verification ==="

# Check for uncommitted changes
DIRTY=$(git status --porcelain 2>/dev/null | head -5)
if [ -n "$DIRTY" ]; then
  echo "WARNING: Uncommitted changes detected:"
  echo "$DIRTY"
  echo "Consider committing before stopping."
fi

# Quick test run
echo "Running tests..."
bun test 2>&1 | tail -3

echo "=== Verification complete ==="
exit 0
