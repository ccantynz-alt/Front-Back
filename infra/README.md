# Crontech Infrastructure

This directory is the single source of truth for every piece of infrastructure Crontech runs on.

## Layout

```
infra/
├── README.md              # This file
├── phase-0.sh             # One-shot Hetzner bootstrap (run as root)
├── cloudflare/            # Wrangler configs for edge workers
├── docker/                # App Dockerfiles (web, api)
└── lgtm/                  # Loki + Grafana + Tempo + Mimir observability stack
    ├── docker-compose.yml
    ├── .env.example
    └── config/
        ├── loki/
        ├── tempo/
        ├── mimir/
        ├── otel/
        └── grafana/
```

## Phase 0: First Box Bootstrap

**Goal:** take a fresh Hetzner box (or any Ubuntu 22.04+ host) from zero to fully-provisioned Crontech substrate in one command.

### Prerequisites

- Hetzner Cloud account (or equivalent: Vultr, Hivelocity, OVH)
- Box specs (starter): CX32 — 4 vCPU, 8 GB RAM, 80 GB SSD (~€8/month)
- SSH access as root
- DNS zone control for `crontech.nz` (or whatever apex domain you use)

### Steps

1. **Provision the box.** In Hetzner Cloud Console: New Project → Add Server → Ubuntu 22.04 → CX32 → EU region.

2. **SSH in as root.**

   ```bash
   ssh root@<box-ip>
   ```

3. **Run the bootstrap.** Either clone the repo and run locally, or pipe directly:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/ccantynz-alt/Front-Back/main/infra/phase-0.sh | bash
   ```

   OR (preferred — lets you inspect before running):

   ```bash
   git clone https://github.com/ccantynz-alt/Front-Back.git /srv/crontech/apps/crontech
   cd /srv/crontech/apps/crontech
   bash infra/phase-0.sh
   ```

4. **Add your SSH public key** to the `crontech` user:

   ```bash
   cat >> /srv/crontech/.ssh/authorized_keys <<'EOF'
   ssh-ed25519 AAAA... your-key-here
   EOF
   ```

5. **Harden SSH** (after you've verified key-based login works):

   ```bash
   cat > /etc/ssh/sshd_config.d/00-crontech.conf <<'EOF'
   PasswordAuthentication no
   PermitRootLogin prohibit-password
   PubkeyAuthentication yes
   EOF
   systemctl restart ssh
   ```

6. **Point DNS** at the box:

   | Record | Type | Value |
   |---|---|---|
   | `crontech.nz` | A | `<box-ip>` |
   | `www.crontech.nz` | A | `<box-ip>` |
   | `grafana.crontech.nz` | A | `<box-ip>` |
   | `api.crontech.nz` | A | `<box-ip>` |

7. **Drop the Caddyfile** at `/etc/caddy/Caddyfile`:

   ```caddy
   crontech.nz, www.crontech.nz {
     reverse_proxy localhost:3000
   }

   api.crontech.nz {
     reverse_proxy localhost:3001
   }

   grafana.crontech.nz {
     reverse_proxy localhost:3000
   }
   ```

   Then:

   ```bash
   systemctl reload caddy
   ```

   Caddy handles HTTPS automatically via Let's Encrypt.

8. **Verify the LGTM stack** is up:

   ```bash
   cd /srv/crontech/observability/lgtm
   docker compose ps
   docker compose logs --tail=50
   ```

### Exit Criteria

Phase 0 is DONE when all of these are true:

- [ ] Fresh Hetzner box provisioned and reachable
- [ ] `phase-0.sh` completed without errors
- [ ] `crontech` user exists with SSH key auth, password auth disabled
- [ ] `docker ps` shows 5 healthy LGTM containers (loki, tempo, mimir, grafana, otel-collector)
- [ ] `caddy` serves HTTPS for `crontech.nz` with a valid cert
- [ ] `curl https://crontech.nz/healthz` returns 200
- [ ] Grafana login works at `https://grafana.crontech.nz` (admin password rotated)
- [ ] Datasources show Loki, Tempo, and Mimir as "healthy" in Grafana
- [ ] `bun run build` completes on the box from a fresh clone

Once Phase 0 exit criteria are all green, **Week 1 of the dogfood migration is unblocked** (see `docs/migrations/week-1-marcoreid.md`).

## Observability Stack (LGTM)

The `lgtm/` directory contains the unified observability stack:

- **Loki** (3100) — log aggregation. 30-day retention, filesystem backend.
- **Tempo** (3200, 4317, 4318) — distributed tracing. 7-day retention.
- **Mimir** (9009) — Prometheus-compatible metrics. 30-day retention.
- **Grafana** (3000) — dashboards. Provisioned with all three datasources pre-wired.
- **OTel Collector** (4319, 4320) — single ingestion endpoint for every Crontech service.

### Running it

```bash
cd infra/lgtm
cp .env.example .env
# edit .env — rotate GF_ADMIN_PASSWORD
docker compose up -d
docker compose ps
```

### Pointing apps at it

Every Crontech service (web, api, sentinel, workers) sends OTLP to the collector:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4319
OTEL_SERVICE_NAME=crontech-api
```

### Scaling beyond Phase 0

Single-box LGTM is fine for Phase 0 (one Hetzner CX32 can handle MarcoReid + emailed + Astra traffic). When any of these hit, it's time to scale:

- > 50 GB/day log volume
- > 500 RPS sustained across the fleet
- Need for multi-region
- SOC 2 audit requires HA

The upgrade path is:
1. Move storage backends to S3/R2 (Loki, Tempo, Mimir all support it natively)
2. Run each component in `-target=<role>` mode for horizontal scaling
3. Add a second box behind a load balancer
4. Promote to Grafana Cloud if the operational load stops being worth the savings

See `docs/migrations/` for when each scale event is expected to hit.

## Cloudflare (edge workers)

See `infra/cloudflare/wrangler.toml`. Cloudflare Workers handle the edge layer for Crontech — the static web front-end and lightweight API routes. The Hetzner box handles the stateful core: auth, DB, AI inference, long-running jobs.

**Doctrine reminder:** per §0.11 (Competitor-Free Stack Rule), we do not deploy the core platform on infrastructure owned by a platform-layer competitor. Cloudflare is acceptable because they compete on CDN/edge, not on full-stack dev platform. Vercel and Netlify are NOT acceptable.

## Docker (app images)

`infra/docker/` holds the Dockerfiles for the web and api apps, plus the OTel collector config used in the app stack (distinct from the LGTM collector config, which is infrastructure).
