# Staging environment runbook

Minimal staging env co-located on the production Vultr box. Web on
`:3010`, API on `:3011`, postgres db `crontech_staging`.

## Prereqs

- Production already installed under `/opt/crontech` (shares the checkout).
- `deploy` user exists, `bun` at `/usr/local/bin/bun`.
- Postgres running (see `infra/bare-metal/postgres.service`).
- Caddy running with a main Caddyfile at `/etc/caddy/Caddyfile`.
- `openssl` on PATH (used to mint staging secrets).

## Install

```bash
sudo bash /opt/crontech/scripts/install-staging.sh
```

Idempotent — re-run safely. It will:

1. Write `/etc/systemd/system/crontech-web-staging.service` (port 3010).
2. Write `/etc/systemd/system/crontech-api-staging.service` (port 3011).
3. Create pg role + db `crontech_staging` (skips if present).
4. Generate `/opt/crontech/.env.staging` from `.env.production.example`
   with fresh `SESSION_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY`, and the
   staging `DATABASE_URL`.
5. `daemon-reload`, `enable`, `start` both units.

## DNS

Add these A records (Cloudflare / whatever you use), both pointing at
the same Vultr box IP as production:

| Host                      | Type | Value           |
| ------------------------- | ---- | --------------- |
| `staging.crontech.ai`     | A    | `<box-ip>`      |
| `staging-api.crontech.ai` | A    | `<box-ip>`      |

## Caddy

Copy the site blocks onto the box and import from the main Caddyfile:

```bash
sudo install -m 0644 /opt/crontech/infra/caddy/staging.Caddyfile \
  /etc/caddy/staging.Caddyfile

# In /etc/caddy/Caddyfile, add once near the top:
#   import /etc/caddy/staging.Caddyfile

sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy will auto-mint LE certs on the next request.

## Deploy a branch to staging (manual)

```bash
cd /opt/crontech
sudo -u deploy git fetch origin
sudo -u deploy git checkout <branch-or-sha>
sudo -u deploy bun install --frozen-lockfile
sudo -u deploy bun run build
sudo systemctl restart crontech-api-staging crontech-web-staging
sudo journalctl -fu crontech-web-staging -u crontech-api-staging
```

Note: prod and staging share `/opt/crontech`, so whichever ref is
checked out is what *both* run. Deploy production refs back when done,
or split the checkout later if this becomes annoying.

## Teardown

```bash
sudo systemctl disable --now crontech-web-staging crontech-api-staging
sudo rm -f /etc/systemd/system/crontech-{web,api}-staging.service
sudo systemctl daemon-reload
sudo -u postgres psql -c "DROP DATABASE IF EXISTS crontech_staging;"
sudo -u postgres psql -c "DROP USER IF EXISTS crontech_staging;"
sudo rm -f /opt/crontech/.env.staging
# Remove the `import /etc/caddy/staging.Caddyfile` line, then:
sudo rm -f /etc/caddy/staging.Caddyfile
sudo systemctl reload caddy
```
