# Cloudflare Deployment Guide

All Cloudflare Workers and Pages deployments for Back to the Future.

## Prerequisites

1. Install Wrangler CLI: `bun add -g wrangler`
2. Authenticate: `wrangler login`
3. Create required resources (see below)

## Architecture

| Worker | Location | Purpose |
|---|---|---|
| **btf-api** | `apps/api/wrangler.toml` | Main Hono API server with D1, R2, KV, Workers AI, Durable Objects |
| **btf-r2-worker** | `services/edge-workers/wrangler-r2.toml` | R2 object storage CRUD |
| **btf-kv-worker** | `services/edge-workers/wrangler-kv.toml` | KV caching and feature flags |
| **btf-d1-worker** | `services/edge-workers/wrangler-d1.toml` | D1 edge database queries |
| **btf-api (infra)** | `infra/cloudflare/wrangler.toml` | Alternate API worker config (references api-worker.ts) |

The web app (`apps/web/`) is a SolidStart app deployed to Cloudflare Pages.

## Step 1: Create Cloudflare Resources

Run these commands once to create the backing resources. Paste the returned IDs into the corresponding `wrangler.toml` files.

### D1 Databases

```bash
# Production
wrangler d1 create btf-production
wrangler d1 create btf-edge-db

# Staging
wrangler d1 create btf-staging
wrangler d1 create btf-edge-db-staging
```

### KV Namespaces

```bash
# For the API worker
wrangler kv namespace create CACHE

# For the KV worker
wrangler kv namespace create KV_NAMESPACE
```

### R2 Buckets

```bash
wrangler r2 bucket create btf-assets
wrangler r2 bucket create btf-assets-staging
```

After creating each resource, copy the returned ID into the relevant `wrangler.toml` file (replace the empty `database_id = ""` or `id = ""` values).

## Step 2: Set Secrets

Secrets are never stored in config files. Set them via the CLI:

```bash
# From apps/api/
wrangler secret put OPENAI_API_KEY
wrangler secret put DATABASE_AUTH_TOKEN
wrangler secret put QDRANT_API_KEY
wrangler secret put NEON_DATABASE_URL
```

## Step 3: Deploy Workers

### API Server

```bash
cd apps/api
wrangler deploy                    # default (production vars)
wrangler deploy --env staging      # staging environment
wrangler deploy --env production   # explicit production
```

### Edge Workers (from services/edge-workers/)

```bash
cd services/edge-workers

# R2 Worker
wrangler deploy -c wrangler-r2.toml
wrangler deploy -c wrangler-r2.toml --env staging

# KV Worker
wrangler deploy -c wrangler-kv.toml
wrangler deploy -c wrangler-kv.toml --env staging

# D1 Worker
wrangler deploy -c wrangler-d1.toml
wrangler deploy -c wrangler-d1.toml --env staging
```

### All Workers at Once

```bash
# From project root
cd services/edge-workers && wrangler deploy -c wrangler-r2.toml && wrangler deploy -c wrangler-kv.toml && wrangler deploy -c wrangler-d1.toml && cd ../../apps/api && wrangler deploy
```

## Step 4: Deploy Web App (Cloudflare Pages)

SolidStart deploys to Cloudflare Pages. Connect your GitHub repo in the Cloudflare Dashboard or use the CLI:

```bash
cd apps/web
bun run build
wrangler pages deploy dist/
```

Or configure automatic deployments via the Cloudflare Pages dashboard by connecting the GitHub repository with:
- Build command: `cd apps/web && bun run build`
- Build output directory: `apps/web/dist`

## Local Development

Each worker can be run locally with `wrangler dev`:

```bash
# API server (port 3002)
cd apps/api && wrangler dev

# R2 worker (port 3010)
cd services/edge-workers && wrangler dev -c wrangler-r2.toml

# KV worker (port 3011)
cd services/edge-workers && wrangler dev -c wrangler-kv.toml

# D1 worker (port 3012)
cd services/edge-workers && wrangler dev -c wrangler-d1.toml
```

## Tail Logs

```bash
wrangler tail btf-api
wrangler tail btf-r2-worker
wrangler tail btf-kv-worker
wrangler tail btf-d1-worker
```
