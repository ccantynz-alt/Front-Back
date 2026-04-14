#!/bin/bash
set -euo pipefail

echo "=== Crontech Platform Setup ==="
echo "This script sets up a Hetzner server to host the Crontech empire."

# Check if running as root
if [ "$EUID" -ne 0 ]; then echo "Run as root: sudo bash setup.sh"; exit 1; fi

# 1. System updates
echo "[1/10] Updating system packages..."
apt-get update && apt-get upgrade -y
apt-get install -y curl git ufw fail2ban unattended-upgrades docker.io docker-compose-v2 jq

# 2. Enable unattended security updates
echo "[2/10] Configuring unattended security updates..."
dpkg-reconfigure -plow unattended-upgrades

# 3. Firewall
echo "[3/10] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # HTTP (Caddy redirect)
ufw allow 443/tcp   # HTTPS
ufw allow 25/tcp    # SMTP inbound (for emailed)
ufw allow 587/tcp   # SMTP submission
ufw --force enable

# 4. Create deploy user
echo "[4/10] Setting up deploy user..."
if ! id "deploy" &>/dev/null; then
    useradd -m -s /bin/bash -G docker deploy
    mkdir -p /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    echo "# Add your SSH public key here" > /home/deploy/.ssh/authorized_keys
    chmod 600 /home/deploy/.ssh/authorized_keys
    chown -R deploy:deploy /home/deploy/.ssh
    echo "Created 'deploy' user. Add your SSH key to /home/deploy/.ssh/authorized_keys"
else
    echo "Deploy user already exists, skipping."
    # Ensure deploy is in docker group
    usermod -aG docker deploy 2>/dev/null || true
fi

# 5. Install Caddy
echo "[5/10] Installing Caddy..."
if ! command -v caddy &>/dev/null; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
else
    echo "Caddy already installed, skipping."
fi

# 6. Create app directories
echo "[6/10] Creating app directories..."
mkdir -p /opt/crontech/{apps,data,backups,certs,logs,scripts}
mkdir -p /opt/crontech/apps/{crontech,zoobicon,emailed,gatetest,marcoreid}
chown -R deploy:deploy /opt/crontech

# 7. Copy config files
echo "[7/10] Copying configuration files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile
cp "$SCRIPT_DIR/docker-compose.yml" /opt/crontech/docker-compose.yml
cp "$SCRIPT_DIR/scripts/backup.sh" /opt/crontech/scripts/backup.sh
cp "$SCRIPT_DIR/scripts/deploy-app.sh" /opt/crontech/scripts/deploy-app.sh
chmod +x /opt/crontech/scripts/*.sh

# Copy Dockerfiles as templates
cp "$SCRIPT_DIR/dockerfiles/Dockerfile.nextjs" /opt/crontech/apps/zoobicon/Dockerfile
cp "$SCRIPT_DIR/dockerfiles/Dockerfile.nextjs" /opt/crontech/apps/gatetest/Dockerfile
cp "$SCRIPT_DIR/dockerfiles/Dockerfile.nextjs" /opt/crontech/apps/marcoreid/Dockerfile
cp "$SCRIPT_DIR/dockerfiles/Dockerfile.bun" /opt/crontech/apps/emailed/Dockerfile
cp "$SCRIPT_DIR/dockerfiles/Dockerfile.bun" /opt/crontech/apps/crontech/Dockerfile

# 8. Create .env template (only if it doesn't exist)
echo "[8/10] Setting up environment template..."
if [ ! -f /opt/crontech/.env ]; then
    cat > /opt/crontech/.env << 'ENVEOF'
# === Crontech Platform Environment ===
# Fill these in and restart: cd /opt/crontech && docker compose up -d

# Server
SERVER_DOMAIN=crontech.ai
SERVER_IP=YOUR_IPV4_HERE

# Domain overrides (change these if using different domains)
CRONTECH_DOMAIN=crontech.ai
ZOOBICON_DOMAIN=zoobicon.com
EMAILED_DOMAIN=emailed.dev
GATETEST_DOMAIN=gatetest.io
MARCOREID_DOMAIN=marcoreid.com

# Database (Neon -- shared across apps, tenant-scoped)
DATABASE_URL=postgresql://user:pass@host/db

# Redis (Upstash -- or use local Redis from docker-compose)
UPSTASH_REDIS_URL=redis://redis:6379
UPSTASH_REDIS_TOKEN=

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# AI
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Storage (Cloudflare R2)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=crontech-storage

# Email (for emailed MTA)
MAILGUN_API_KEY=...
MAILGUN_WEBHOOK_SIGNING_KEY=...

# Virus scanning
VIRUSTOTAL_API_KEY=...

# QStash (for Zoobicon durable crons)
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...
ENVEOF
    echo "Created .env template at /opt/crontech/.env"
else
    echo ".env already exists, not overwriting."
fi

# 9. Enable services
echo "[9/10] Enabling services..."
systemctl enable docker
systemctl start docker
systemctl enable caddy

# 10. Setup backup cron (daily at 2am)
echo "[10/10] Configuring daily backups..."
cat > /etc/cron.d/crontech-backup << 'CRONEOF'
# Crontech daily backup - runs at 2am
0 2 * * * deploy /opt/crontech/scripts/backup.sh >> /opt/crontech/logs/backup.log 2>&1
CRONEOF

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit /opt/crontech/.env with your credentials"
echo "  2. Add your SSH public key to /home/deploy/.ssh/authorized_keys"
echo "  3. Run: cd /opt/crontech && docker compose up -d"
echo "  4. Point your domain DNS A records to this server's IP:"
echo "     - crontech.ai, *.crontech.ai"
echo "     - zoobicon.com, www.zoobicon.com"
echo "     - emailed.dev, api.emailed.dev"
echo "     - gatetest.io"
echo "     - marcoreid.com, www.marcoreid.com"
echo "  5. Caddy will auto-provision TLS certificates"
echo "  6. Add GitHub secrets (HETZNER_IP, DEPLOY_SSH_KEY) for CI/CD"
echo "  7. Push to main = auto-deploy"
echo ""
