# Cloudflare Infrastructure Setup

## Quick Setup

```bash
./infra/cloudflare/setup.sh              # production
./infra/cloudflare/setup.sh staging      # staging
```

## API (Cloudflare Workers)

```bash
cd apps/api
bun run deploy           # production
bun run deploy:staging   # staging
bun run dev:cf           # local dev
```

Entry point: `apps/api/src/worker-entry.ts`
- Exports Hono app as `fetch` handler
- Exports `CollabRoom` Durable Object class
- Maps Cloudflare bindings to `globalThis`

## Web (Cloudflare Pages)

```bash
cd apps/web
bun run build && bun run deploy
```

Uses `preset: "cloudflare-pages"` in `app.config.ts`.

## Manual Resource Provisioning

```bash
bunx wrangler d1 create cronix-db
bunx wrangler d1 execute cronix-db --file=infra/cloudflare/d1-schema.sql --yes
bunx wrangler r2 bucket create cronix-assets
bunx wrangler kv namespace create CACHE
```

Paste returned IDs into `apps/api/wrangler.toml`.

## Secrets

```bash
bunx wrangler secret put DATABASE_URL
bunx wrangler secret put TURSO_URL
bunx wrangler secret put TURSO_AUTH_TOKEN
bunx wrangler secret put OPENAI_API_KEY
bunx wrangler secret put STRIPE_SECRET_KEY
bunx wrangler secret put STRIPE_WEBHOOK_SECRET
bunx wrangler secret put SESSION_SECRET
```

## CI/CD

GitHub Actions workflow: `.github/workflows/deploy.yml`

Required secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
