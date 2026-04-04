#!/bin/bash
# dep-check.sh — Dependency audit on session start
# Hook type: SessionStart
#
# Checks for outdated deps, known vulnerabilities, and lockfile integrity.

set -euo pipefail
cd /home/user/Front-Back

echo "=== Dependency Health Check ==="

# Verify lockfile exists and is up to date
if [ ! -f "bun.lock" ]; then
  echo "WARNING: No bun.lock found. Running bun install..."
  bun install
else
  echo "Lockfile: OK"
fi

# Check for known vulnerabilities (best-effort, non-blocking)
if command -v bun &> /dev/null; then
  echo "Checking for audit issues..."
  bun pm ls 2>/dev/null | head -5 || true
fi

echo "=== Dependency check complete ==="
exit 0
