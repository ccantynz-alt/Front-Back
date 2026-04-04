#!/bin/bash
# post-edit.sh — Auto-typecheck after file edits
# Hook type: PostToolUse (Edit, Write)
#
# Runs TypeScript type checking after any file modification to catch
# type errors immediately, before they compound.

set -euo pipefail

# Only typecheck .ts/.tsx files
INPUT=$(cat)
FILE=$(echo "$INPUT" | grep -o '"file_path":"[^"]*"' | sed 's/"file_path":"//;s/"$//' 2>/dev/null || echo "")

if [ -z "$FILE" ]; then
  exit 0
fi

# Check if it's a TypeScript file
case "$FILE" in
  *.ts|*.tsx)
    # Quick type check — suppress output unless there are errors
    cd /home/user/Front-Back
    npx tsc --noEmit --pretty 2>&1 | head -20 || true
    ;;
esac

exit 0
