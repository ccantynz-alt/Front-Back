# Cloudflare Infrastructure Setup

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- `wrangler` CLI (installed as a dev dependency in `apps/api` and `apps/web`)
- Authenticate: `bunx wrangler login`

## API (Cloudflare Workers)

Deploy from `apps/api/`:

```bash
bun run deploy           # production
bun run deploy:staging   # staging
bun run dev:cf           # local Workers dev server
```

## Web (Cloudflare Pages)

Deploy from `apps/web/`:

```bash
bun run build            # build the SolidStart app
bun run deploy           # deploy to Cloudflare Pages
```

## Provisioning Resources

### D1 Database

```bash
bunx wrangler d1 create btf-db
```

Copy the `database_id` into `apps/api/wrangler.toml` and uncomment the `[[d1_databases]]` block.

### R2 Bucket

```bash
bunx wrangler r2 bucket create btf-storage
```

Uncomment the `[[r2_buckets]]` block in `apps/api/wrangler.toml`.

### KV Namespace

```bash
bunx wrangler kv namespace create CACHE
```

Copy the `id` into `apps/api/wrangler.toml` and uncomment the `[[kv_namespaces]]` block.

## CI/CD

The GitHub Actions workflow at `.github/workflows/deploy.yml` handles automated deployments on push to `main`. Required repository secrets:

- `CLOUDFLARE_API_TOKEN` -- API token with Workers and Pages permissions
- `CLOUDFLARE_ACCOUNT_ID` -- your Cloudflare account ID

Create the API token at: https://dash.cloudflare.com/profile/api-tokens
Use the "Edit Cloudflare Workers" template and add Pages permissions.
