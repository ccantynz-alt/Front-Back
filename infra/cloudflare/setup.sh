#!/usr/bin/env bash
# ============================================================================
# Cronix — Cloudflare Resource Provisioning Script
#
# Usage:
#   ./infra/cloudflare/setup.sh              # production (default)
#   ./infra/cloudflare/setup.sh staging      # staging
# ============================================================================

set -euo pipefail

ENV="${1:-production}"
SUFFIX=""
if [[ "$ENV" == "staging" ]]; then
  SUFFIX="-staging"
fi

echo "============================================"
echo "  Cronix — Cloudflare Setup ($ENV)"
echo "============================================"
echo ""

echo "Creating D1 database: cronix-db${SUFFIX}..."
bunx wrangler d1 create "cronix-db${SUFFIX}" 2>&1 | tee /tmp/cronix-d1-output.txt
D1_ID=$(grep -oP 'database_id\s*=\s*"\K[^"]+' /tmp/cronix-d1-output.txt || echo "")
if [[ -n "$D1_ID" ]]; then
  echo "  D1 database_id: $D1_ID"
  echo "  Paste this into wrangler.toml [[d1_databases]] database_id"
fi
echo ""

echo "Applying D1 schema..."
bunx wrangler d1 execute "cronix-db${SUFFIX}" --file=infra/cloudflare/d1-schema.sql --yes
echo "  Schema applied."
echo ""

echo "Creating R2 bucket: cronix-assets${SUFFIX}..."
bunx wrangler r2 bucket create "cronix-assets${SUFFIX}" 2>&1 || true
echo "  R2 bucket created (or already exists)."
echo ""

echo "Creating KV namespace: CACHE${SUFFIX}..."
bunx wrangler kv namespace create "CACHE${SUFFIX}" 2>&1 | tee /tmp/cronix-kv-output.txt
KV_ID=$(grep -oP 'id\s*=\s*"\K[^"]+' /tmp/cronix-kv-output.txt || echo "")
if [[ -n "$KV_ID" ]]; then
  echo "  KV namespace id: $KV_ID"
  echo "  Paste this into wrangler.toml [[kv_namespaces]] id"
fi
echo ""

echo "============================================"
echo "  Setup complete for $ENV"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Paste IDs into apps/api/wrangler.toml"
echo "  2. Set secrets: bunx wrangler secret put <NAME>"
echo "  3. Deploy: cd apps/api && bun run deploy"
echo ""

rm -f /tmp/cronix-d1-output.txt /tmp/cronix-kv-output.txt
