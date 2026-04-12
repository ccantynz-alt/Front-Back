#!/bin/bash
set -euo pipefail

# Daily backup of Crontech platform data
# Runs via cron: 0 2 * * * (see /etc/cron.d/crontech-backup)

BACKUP_DIR=/opt/crontech/backups
DATE=$(date +%Y-%m-%d)
COMPOSE_FILE=/opt/crontech/docker-compose.yml

echo "=== Crontech Backup: $DATE ==="

mkdir -p "$BACKUP_DIR"

# 1. Backup Redis data
echo "Backing up Redis..."
if docker compose -f "$COMPOSE_FILE" ps redis | grep -q "Up"; then
    docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli BGSAVE
    sleep 2  # Wait for BGSAVE to complete
    docker cp "$(docker compose -f "$COMPOSE_FILE" ps -q redis)":/data/dump.rdb "$BACKUP_DIR/redis-$DATE.rdb" 2>/dev/null || echo "Warning: Could not copy Redis dump"
else
    echo "Warning: Redis container not running, skipping Redis backup"
fi

# 2. Backup configuration files
echo "Backing up configs..."
tar czf "$BACKUP_DIR/config-$DATE.tar.gz" \
    /opt/crontech/.env \
    /etc/caddy/Caddyfile \
    /opt/crontech/docker-compose.yml \
    2>/dev/null || echo "Warning: Some config files missing"

# 3. Backup Docker volume data (app-specific data)
echo "Backing up volume data..."
docker run --rm \
    -v crontech_redis-data:/source:ro \
    -v "$BACKUP_DIR":/backup \
    alpine tar czf "/backup/volumes-$DATE.tar.gz" -C /source . \
    2>/dev/null || echo "Warning: Could not backup Docker volumes"

# 4. Prune old backups (keep last 30 days)
echo "Pruning backups older than 30 days..."
find "$BACKUP_DIR" -type f -mtime +30 -delete

# 5. Report
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo "Backup completed: $DATE (total backup dir size: $BACKUP_SIZE)"
