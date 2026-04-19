# Tonight Cheat Sheet — Bare Metal Cutover

> Open this when you're at your PC. Everything below is copy-paste in order.

---

## 0. Connect (PowerShell)

```powershell
ssh root@45.76.171.37
```

If host-key warning appears:
```powershell
ssh-keygen -R 45.76.171.37
ssh root@45.76.171.37
```

---

## 1. Start the 3 infra services

```bash
sudo systemctl start postgres dns-server caddy
sudo systemctl status postgres dns-server caddy --no-pager | grep -E "Active|●"
```

Expected: all 3 show `active (running)` (green dot).

---

## 2. Pull latest code (safety)

```bash
git config --global --add safe.directory /opt/crontech
cd /opt/crontech
git pull origin Main
```

---

## 3. Disconnect — jump to OLD VPS

```bash
exit
ssh root@45.76.21.235
```

---

## 4. Run the migrate script from OLD VPS

```bash
export NEW_HOST=45.76.171.37
export NEW_USER=root

# If you have a Neon DATABASE_URL to import, export it. Otherwise skip this line.
export POSTGRES_SOURCE_URL="$(grep -E '^(DATABASE_URL|NEON_DATABASE_URL)=' /opt/Crontech/.env 2>/dev/null | head -1 | cut -d= -f2-)"

bash /opt/Crontech/scripts/bare-metal-migrate.sh
```

What it does: pg_dump old data → push to new box → psql import → rsync `/opt/crontech` + `/opt/gluecron` + `/data/repos` → systemctl start crontech-web/api/gluecron/dns-server → health check.

---

## 5. Verify new box is serving

Back in PowerShell (new terminal tab):

```powershell
curl -I http://45.76.171.37/
curl -I http://45.76.171.37/ -H "Host: crontech.ai"
```

Expected: HTTP/1.1 200 from both.

Or SSH into new box and check services:
```bash
ssh root@45.76.171.37
sudo systemctl status crontech-web crontech-api gluecron dns-server caddy postgres --no-pager | grep -E "Active|●"
```

All 6 should be `active (running)`.

---

## 6. Flip DNS at Cloudflare

Cloudflare dashboard → `crontech.ai` zone → DNS records. For each of:

- `crontech.ai` (A)
- `www.crontech.ai` (A)
- `api.crontech.ai` (A)

Change value from `45.76.21.235` → `45.76.171.37`. TTL: Auto. Proxy status: DNS only (grey cloud) so Caddy handles TLS directly.

Add new:
- `gluecron.crontech.ai A 45.76.171.37`
- `*.crontech.ai A 45.76.171.37` (wildcard for future subdomains)

Propagation: 1–5 min typical.

---

## 7. Verify live

On your phone (4G, bypasses WiFi DNS cache):
- `https://crontech.ai` — loads the site
- `https://gluecron.crontech.ai` — loads Gluecron

Check TLS issued:
```bash
ssh root@45.76.171.37
sudo journalctl -u caddy -n 30 --no-pager | grep -i "certificate"
```

Should show Let's Encrypt successfully issued certs for all 3 domains.

---

## 8. Keep old box warm for 24h

Don't cancel `45.76.21.235` yet. If anything breaks, revert the DNS A records in Cloudflare and you're back on old infra in 60 seconds.

After 24h of smooth running:
- Vultr dashboard → old Chicago server → Destroy (keep snapshot 30 days)

---

## Rollback at any point

- Step 1–4 failed → old box untouched, do nothing
- Step 6 failed → revert Cloudflare A records back to `45.76.21.235`
- Step 7 failed → same as above

---

## Post-cutover to-do (not tonight)

1. Stripe (docs/STRIPE_SETUP.md) — your checklist
2. Run Cloudflare → our-DNS import: `bun run scripts/import-all-cloudflare-zones.ts --token="$CF_API_TOKEN"`
3. Mirror GitHub repos to Gluecron: `bash scripts/mirror-repos-to-gluecron.sh`
4. Celitech / Sinch / Tucows account signups when you want those products live
