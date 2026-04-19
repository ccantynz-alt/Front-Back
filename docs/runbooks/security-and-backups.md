# Runbook: security hardening + Postgres backups

Target host: Crontech bare-metal Vultr box, Ubuntu 22.04.

This runbook covers three scripts shipped in `scripts/`:

- `harden-ubuntu.sh` — baseline OS hardening (ufw, fail2ban, unattended-upgrades, sshd)
- `backup-postgres.sh` — nightly full cluster dump to `/var/backups/postgres/`
- `install-backup-cron.sh` — systemd timer that runs the backup at 03:00 UTC

## Prerequisites — READ BEFORE YOU TOUCH sshd

**Before running `harden-ubuntu.sh` with sshd changes enabled, SSH key auth MUST already work.**

From your laptop:

```bash
ssh-copy-id root@<host>          # push your pubkey
ssh -o PasswordAuthentication=no root@<host> 'echo OK'
```

If that second command prints `OK`, you are safe to harden sshd. If it fails, fix key auth first — or you WILL be locked out.

The script also self-checks: if `/root/.ssh/authorized_keys` is missing or empty, the sshd step aborts.

## 1. Harden the box

Copy the script onto the host and run:

```bash
# Minimum viable hardening (ufw + fail2ban + unattended-upgrades, no sshd changes)
sudo bash scripts/harden-ubuntu.sh

# Full hardening (ALSO disables SSH password auth). Only run after key auth confirmed.
sudo I_HAVE_SSH_KEY=yes bash scripts/harden-ubuntu.sh
```

What it does:

| Step | Effect |
| ---- | ------ |
| 1 | `apt install ufw fail2ban unattended-upgrades apt-listchanges` |
| 2 | ufw default deny incoming / allow outgoing; allow 22,80,443/tcp + 443/udp |
| 3 | fail2ban sshd jail: `maxretry=3`, `findtime=10m`, `bantime=30m` |
| 4 | unattended-upgrades: `*-security` origins only, no auto-reboot |
| 5 | sshd: `PasswordAuthentication no`, `PermitRootLogin prohibit-password` — **only if `I_HAVE_SSH_KEY=yes`** |

Before restarting sshd the script runs `sshd -t`; if the config is invalid the backup is restored and the restart is aborted. Existing SSH sessions survive the restart; only new logins are affected.

The pre-edit sshd_config is saved as `/etc/ssh/sshd_config.bak.YYYYMMDD_HHMMSS`.

## 2. Verify

```bash
# firewall
sudo ufw status verbose

# fail2ban sshd jail is active
sudo fail2ban-client status
sudo fail2ban-client status sshd
# -> should show "Currently banned: 0", "Total failed: N"

# unattended-upgrades will actually run
sudo unattended-upgrade --dry-run --debug 2>&1 | tail -n 20

# sshd effective config (after hardening)
sudo sshd -T | grep -Ei '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication)'
# expected:
#   passwordauthentication no
#   permitrootlogin prohibit-password
#   kbdinteractiveauthentication no
```

Smoke-test fail2ban from another machine:

```bash
for i in 1 2 3 4; do sshpass -p wrong ssh -o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PubkeyAuthentication=no root@<host> true; done
# then, from the host:
sudo fail2ban-client status sshd   # your test IP should be listed under "Banned IP list"
sudo fail2ban-client set sshd unbanip <your-ip>
```

## 3. Install the backup script

```bash
# Deploy script + systemd timer
sudo install -d /opt/crontech/scripts
sudo install -m 0755 scripts/backup-postgres.sh /opt/crontech/scripts/
sudo bash scripts/install-backup-cron.sh
```

Verify the timer:

```bash
systemctl list-timers crontech-backup.timer --no-pager
systemctl status crontech-backup.timer
journalctl -u crontech-backup.service -n 50
```

Force an immediate run:

```bash
sudo systemctl start crontech-backup.service
ls -lh /var/backups/postgres/
tail -n 20 /var/log/crontech-backup.log
```

Expected output:

```
-rw-r----- 1 root root 1.2M Apr 19 03:00 20260419_030000.sql.gz
```

Retention is 14 daily + 4 weekly. Sunday runs are hardlinked into `/var/backups/postgres/weekly/`.

## 4. Test restore on a scratch Postgres

Never trust a backup you have not restored. On a scratch host (or a container) run:

```bash
# spin a throwaway postgres (docker example)
docker run -d --name pgscratch -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16

# pull the latest dump
scp root@<host>:/var/backups/postgres/$(ssh root@<host> 'ls -1t /var/backups/postgres/*.sql.gz | head -1') /tmp/latest.sql.gz

# restore (pg_dumpall produces a full-cluster script, incl. CREATE USER/DATABASE)
gunzip -c /tmp/latest.sql.gz | PGPASSWORD=x psql -h 127.0.0.1 -p 55432 -U postgres

# sanity-check a few tables
PGPASSWORD=x psql -h 127.0.0.1 -p 55432 -U postgres -d crontech -c '\dt'
PGPASSWORD=x psql -h 127.0.0.1 -p 55432 -U postgres -d crontech -c 'select count(*) from users;'
```

Clean up:

```bash
docker rm -f pgscratch
```

## 5. Off-box backup upload

Backups on the same box as Postgres protect against corruption, not against losing the box. Wire up an off-site target by setting `BACKUP_UPLOAD_CMD` in `/etc/crontech/backup.env` (created empty by `install-backup-cron.sh`, mode `0600`, never committed).

### Backblaze B2 via rclone

```bash
# one-time, as root
apt-get install -y rclone
rclone config    # add remote 'b2' with account id + app key
# sanity:
rclone mkdir b2:crontech-backups/postgres

# then edit /etc/crontech/backup.env:
BACKUP_UPLOAD_CMD='rclone rcat b2:crontech-backups/postgres/$(date -u +%Y%m%d_%H%M%S).sql.gz'
```

### S3 via aws-cli

```bash
apt-get install -y awscli
# configure via /root/.aws/credentials OR an IAM-role-backed instance
# then in /etc/crontech/backup.env:
BACKUP_UPLOAD_CMD='aws s3 cp - s3://crontech-backups/postgres/$(date -u +%Y%m%d_%H%M%S).sql.gz --storage-class STANDARD_IA'
```

### rsync to another box

```bash
# in /etc/crontech/backup.env:
BACKUP_UPLOAD_CMD='ssh -i /root/.ssh/backup_key backups@off-box "cat > /srv/crontech-backups/postgres/$(date -u +%Y%m%d_%H%M%S).sql.gz"'
```

Test after editing:

```bash
sudo systemctl start crontech-backup.service
journalctl -u crontech-backup.service -n 50 --no-pager
```

The backup script tees the gzipped dump to both the local file and the upload command; a failure in either fails the whole run (thanks to `set -o pipefail`).

## 6. Rollback — locked out of SSH

If you get locked out after running `harden-ubuntu.sh` with `I_HAVE_SSH_KEY=yes`:

1. Open the Vultr dashboard -> your server -> **View Console** (noVNC).
2. Log in as root with your Vultr root password.
3. Restore the pre-hardening sshd_config:

   ```bash
   ls -lt /etc/ssh/sshd_config.bak.*   # pick the most recent
   cp -a /etc/ssh/sshd_config.bak.YYYYMMDD_HHMMSS /etc/ssh/sshd_config
   # Also check for drop-ins the script neutralised:
   grep -RIn PasswordAuthentication /etc/ssh/sshd_config.d/ || true
   sshd -t && systemctl restart ssh
   ```

4. If ufw is the culprit instead of sshd:

   ```bash
   ufw status numbered
   ufw disable        # temporary
   # fix rules, then:
   ufw enable
   ```

5. If fail2ban banned your IP:

   ```bash
   fail2ban-client status sshd
   fail2ban-client set sshd unbanip <your-ip>
   ```

Once you are back in, re-add your pubkey to `/root/.ssh/authorized_keys`, confirm `ssh -o PasswordAuthentication=no` works, and re-run the hardening script.

## 7. Uninstall / disable

```bash
# stop nightly backups
sudo systemctl disable --now crontech-backup.timer
sudo rm -f /etc/systemd/system/crontech-backup.{service,timer}
sudo systemctl daemon-reload

# relax sshd back to password auth (emergencies only)
sudo sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## Appendix: file locations

| Path | Purpose |
| ---- | ------- |
| `/etc/fail2ban/jail.d/sshd.local` | fail2ban sshd jail (managed) |
| `/etc/apt/apt.conf.d/20auto-upgrades` | unattended-upgrades schedule |
| `/etc/apt/apt.conf.d/50unattended-upgrades` | unattended-upgrades policy |
| `/etc/ssh/sshd_config.bak.*` | pre-hardening sshd backups |
| `/opt/crontech/scripts/backup-postgres.sh` | installed backup script |
| `/etc/systemd/system/crontech-backup.service` | backup oneshot unit |
| `/etc/systemd/system/crontech-backup.timer` | 03:00 UTC daily trigger |
| `/etc/crontech/backup.env` | env file for `BACKUP_UPLOAD_CMD` etc. (mode 0600) |
| `/var/backups/postgres/` | daily dumps (14 retained) |
| `/var/backups/postgres/weekly/` | Sunday snapshots (4 retained) |
| `/var/log/crontech-backup.log` | append-only backup log |
