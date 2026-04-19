# Bare Metal Migration — Crontech (BLK-028)

Move Crontech from the shared-hypervisor Vultr VPS (`45.76.21.235`) to a
dedicated **Vultr Bare Metal** box in the same region, and consolidate all
host services (web, api, gluecron, DNS, Postgres, Caddy) onto one machine.
**Goal:** stop sharing a hypervisor, own port 53 and Postgres, and keep a
24-hour warm rollback via DNS.

---

## 1. Why

- Noisy-neighbour CPU jitter on the shared VPS hurts Bun/Hono tail latency.
- Port 53 and a self-hosted Postgres both need predictable performance and
  kernel-level access the VPS tier limits.
- One box, one bill, one firewall — easier to reason about than a fleet of
  managed bits (Neon + VPS + future DNS tier).

## 2. Target architecture

Single Vultr Bare Metal host running:

| Service       | Port         | Unit                   | User         |
| ------------- | ------------ | ---------------------- | ------------ |
| Caddy         | 80/443       | `caddy.service`        | `caddy`      |
| Postgres 16   | 5432         | `postgres.service`     | `postgres`   |
| crontech-web  | 3000         | `crontech-web.service` | `deploy`     |
| crontech-api  | 3001         | `crontech-api.service` | `deploy`     |
| gluecron      | 3002         | `gluecron.service`     | `deploy`     |
| DNS server    | 53 UDP+TCP   | `dns-server.service`   | `dns-server` (CAP_NET_BIND_SERVICE) |

Filesystem: `/opt/crontech` (monorepo), `/opt/gluecron`, `/data/postgres/16/main`,
`/data/repos` (Gluecron bare repos), `/var/log/caddy`.
Firewall (ufw): allow `22/tcp`, `53/udp+tcp`, `80/tcp`, `443/tcp+udp`; deny else.

## 3. Prerequisites (Vultr console)

1. Deploy Bare Metal → same region as current VPS → Ubuntu 22.04/24.04 LTS →
   root SSH key → note the public IP.
2. Set reverse DNS (PTR) on the new IP to `crontech.ai`.
3. In Cloudflare DNS, keep TTLs on `Auto` so cutover propagates in ~60s.

## 4. One-shot provisioning (new box)

SSH in as root, clone the repo, export Postgres passwords, run the setup:

```bash
git clone https://github.com/ccantynz-alt/Crontech.git /opt/crontech
cd /opt/crontech
export DOMAIN="crontech.ai"
export DEPLOY_USER="deploy"
export POSTGRES_CRONTECH_PASSWORD="$(openssl rand -hex 32)"
export POSTGRES_GLUECRON_PASSWORD="$(openssl rand -hex 32)"
sudo -E bash scripts/bare-metal-setup.sh
```

Save those two passwords to 1Password — the migrate script on the OLD VPS
does not need them, but the app `.env` files on the NEW box do.

The setup script is idempotent. Re-run it safely after editing anything in
`infra/bare-metal/`.

## 5. Data migration (from OLD VPS)

```bash
export NEW_HOST="<new-bare-metal-ip>"
export NEW_USER="deploy"
export POSTGRES_SOURCE_URL="postgres://<neon-or-local-url>"   # empty if green-field
bash scripts/bare-metal-migrate.sh
```

Phases: (1) snapshot OLD state to `/tmp/`; (2) stop `crontech-api`,
`crontech-web`, `gluecron` so rsync is clean (`SKIP_QUIESCE=1` for live
pre-sync); (3) rsync `/opt/crontech`, `/opt/gluecron`, `/data/repos`,
`local.db` to NEW; (4) `pg_dump` source → `pg_restore` on NEW into the local
`crontech` DB (skipped if URL empty); (5) loopback HTTP + `dig` + `psql`
probes. The script **stops before DNS swap** for operator review.

## 6. Cutover sequence (~10 min)

1. Pre-sync hours earlier with `SKIP_QUIESCE=1` so the live cutover only
   copies deltas.
2. Announce maintenance window.
3. Run `scripts/bare-metal-migrate.sh` on OLD — Phases 1–5 complete.
4. Flip Cloudflare A records (`@`, `www`, `api`, `gluecron`) to `${NEW_HOST}`
   (proxied on for 80/443; `dns.*` records unproxied so port 53 passes).
5. Most resolvers pick up the new IP within 60s.

## 7. Verification

From a laptop (not the boxes):

```bash
dig +short crontech.ai                           # == NEW_HOST
curl -fI https://crontech.ai                     # 200 OK
curl -fI https://api.crontech.ai/api/health      # 200 OK
curl -fI https://gluecron.crontech.ai            # 200 OK
dig +short @<NEW_HOST> example.crontech.ai       # authoritative reply
```

On the NEW box:

```bash
systemctl status postgres caddy crontech-{web,api} gluecron dns-server
journalctl -u crontech-api -n 100 --no-pager
sudo -u postgres psql -d crontech -c 'select count(*) from users;'
```

## 8. Rollback

DNS swap = instant rollback. Point the four A records back to
`45.76.21.235`; proxied records propagate in <60s. During the 24h soak,
do NOT stop services on OLD and do NOT power down the old VPS.

## 9. Post-migration cleanup (T+24h)

1. `systemctl stop` + `disable` web/api/gluecron on OLD.
2. Final rsync `/var/log/caddy` OLD → NEW for access-log continuity.
3. Move remaining secrets from OLD to 1Password.
4. Destroy the OLD VPS via Vultr console.
5. Cancel the Neon Postgres instance (if it was the dump source) and update
   `docs/INFRASTRUCTURE.md` to reflect local Postgres as source of truth.

## 10. Non-scope

App code untouched; only the Postgres URL changes. CI workflows untouched
(follow-up block). The Docker-era `infra/caddy/Caddyfile` stays as
historical record; production now reads `/etc/caddy/Caddyfile` rendered
from `infra/bare-metal/Caddyfile.template`.
