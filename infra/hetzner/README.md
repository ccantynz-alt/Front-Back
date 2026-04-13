# Crontech Hetzner Self-Hosting

Complete infrastructure to run the entire Crontech platform on a single Hetzner server.

## Architecture

- **Caddy** - Reverse proxy with automatic TLS (Let's Encrypt)
- **Docker Compose** - Runs all 5 apps + Redis
- **GitHub Actions** - Push to main = auto-deploy via SSH

### Apps

| App | Port | Domain |
|-----|------|--------|
| crontech-api | 8787 | crontech.ai, api.crontech.ai |
| zoobicon | 3001 | zoobicon.com |
| emailed-web | 3002 | emailed.dev |
| emailed-api | 8788 | api.emailed.dev |
| emailed-mta | 25, 587 | (SMTP) |
| gatetest | 3003 | gatetest.io |
| marcoreid | 3004 | marcoreid.com |
| redis | 6379 | localhost only |
| caddy | 80, 443 | all domains |

## Quick Start

### 1. Run setup on the Hetzner server

```bash
# SSH into your Hetzner server as root
ssh root@YOUR_SERVER_IP

# Clone this repo (or scp the infra/hetzner directory)
git clone https://github.com/CrontechAI/Crontech.git /opt/crontech-setup
cd /opt/crontech-setup/infra/hetzner

# Run setup
sudo bash setup.sh
```

### 2. Edit environment variables

```bash
nano /opt/crontech/.env
```

Fill in all credentials: database URL, API keys, Stripe keys, etc.

### 3. Point DNS A records

Add A records pointing to your server IP for:

- `crontech.ai` + `*.crontech.ai`
- `zoobicon.com` + `www.zoobicon.com`
- `emailed.dev` + `api.emailed.dev`
- `gatetest.io`
- `marcoreid.com` + `www.marcoreid.com`

### 4. Start the platform

```bash
cd /opt/crontech
docker compose up -d
```

Caddy will automatically provision TLS certificates once DNS propagates.

### 5. Add GitHub secrets for CI/CD

In each app's GitHub repo, add these secrets:

| Secret | Value |
|--------|-------|
| `HETZNER_IP` | Your server's IPv4 address |
| `DEPLOY_SSH_KEY` | Contents of the deploy user's private SSH key |

Then copy `workflows/deploy.yml` to `.github/workflows/deploy.yml` in each repo.

### 6. Push to main = auto-deploy

Every push to `main` triggers a build and deploy of that specific app.

## File Structure

```
infra/hetzner/
  setup.sh              # One-time server bootstrap (run as root)
  Caddyfile             # Reverse proxy config (env var substitution)
  docker-compose.yml    # All services definition
  scripts/
    backup.sh           # Daily backup (runs via cron at 2am)
    deploy-app.sh       # Per-app deploy (called by GitHub Actions)
  dockerfiles/
    Dockerfile.nextjs   # Template for Next.js apps
    Dockerfile.bun      # Template for Bun-based apps
  workflows/
    deploy.yml          # GitHub Actions template for each repo
```

## Operations

### View logs

```bash
cd /opt/crontech
docker compose logs -f              # all services
docker compose logs -f zoobicon     # single service
```

### Restart a service

```bash
docker compose restart zoobicon
```

### Manual deploy

```bash
/opt/crontech/scripts/deploy-app.sh zoobicon https://github.com/CrontechAI/zoobicon.git main
```

### Check backups

```bash
ls -la /opt/crontech/backups/
```

### Update Caddy config

```bash
# Edit the Caddyfile
nano /etc/caddy/Caddyfile

# Reload (zero-downtime)
docker compose restart caddy
```
