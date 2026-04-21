# Full Self-Host Launch Runbook

**One-page cheat sheet for tomorrow morning.** Run steps 1-7 in order from your desktop. Each step is paste-ready; substitute only the clearly marked `<variable>` parts.

Target server: `45.76.171.37` (Vultr). App dir: `/opt/crontech`.

---

## Prereqs (do these before Step 1)

- [ ] SSH access to `root@45.76.171.37` (key-based)
- [ ] Cloudflare API token with `Zone:DNS:Edit` for `gluecron.com` and `crontech.ai` (export as `CF_API_TOKEN`)
- [ ] GitHub OAuth app created (Settings -> Developer settings -> OAuth Apps) with callback `https://ci.crontech.ai/authorize` - save the Client ID and Secret
- [ ] PR `claude/fix-gluecron-systemd-unit` merged or checkout-able (used in Step 1)
- [ ] PR for `scripts/mirror-all-to-gluecron.sh` merged before Step 5

All commands below run as `root` on the Vultr host unless stated otherwise. SSH in first:

```
ssh root@45.76.171.37
```

---

## Step 1: Fix & start gluecron

**What:** Applies the systemd unit fix and brings the gluecron service up.

**Commands:**

```
cd /opt/crontech
git fetch origin claude/fix-gluecron-systemd-unit
git checkout claude/fix-gluecron-systemd-unit
bash scripts/fix-gluecron-service.sh
```

**Expected:**

```
systemctl status gluecron
```

Shows `Active: active (running)` and recent log lines with no crash loop.

**Troubleshooting:**
- Port 3000 in use: `ss -ltnp | grep :3000` then stop the offender.
- Permission errors reading `/opt/gluecron`: `chown -R gluecron:gluecron /opt/gluecron && systemctl restart gluecron`.

---

## Step 2: Add gluecron.com DNS records

**What:** Points `gluecron.com` and `www.gluecron.com` at the Vultr host.

**Option A - Cloudflare UI (manual):**
Cloudflare -> `gluecron.com` -> DNS -> Add record:
- Type `A`, Name `@`, IPv4 `45.76.171.37`, Proxy **DNS only** (grey cloud)
- Type `A`, Name `www`, IPv4 `45.76.171.37`, Proxy **DNS only**

**Option B - automated:**

```
export CF_API_TOKEN=<your_cloudflare_token>
bash scripts/add-dns-gluecron.sh
```

**Expected:** Two A records visible in the Cloudflare dashboard, both grey-cloud.

**Troubleshooting:**
- `401 Unauthorized`: token missing `Zone:DNS:Edit` for `gluecron.com`.
- Record already exists: script is idempotent; safe to re-run.

---

## Step 3: Verify gluecron.com loads

**What:** Confirms DNS + Caddy + gluecron are wired end-to-end.

**Commands:**

```
sleep 60  # DNS propagation
curl -sI https://gluecron.com/ | head -3
```

**Expected:** `HTTP/2 200` within 1-5 min of DNS propagation. Cert issued automatically by Caddy on first hit.

**Troubleshooting:**
- `SSL: no alternative certificate subject name matches`: Caddy hasn't fetched a cert yet - wait 30s and retry, then check `journalctl -u caddy -n 50`.
- `curl: (6) Could not resolve host`: DNS not propagated - `dig +short gluecron.com @1.1.1.1` should return `45.76.171.37`.

---

## Step 4: Generate Gluecron PAT

**What:** Creates a personal access token so the mirror script (Step 5) can push to Gluecron.

**Steps (UI):**
1. Open https://gluecron.com and sign in (or register the first admin user).
2. Avatar -> **Settings** -> **Applications** (or **Tokens**) -> **Generate New Token**.
3. Scope: `repo` (full). Name it `mirror-bot`.
4. Copy the token immediately - it will not be shown again.

**Expected:** Token string in clipboard, saved for Step 5.

**Troubleshooting:**
- Can't see Tokens tab: ensure you're signed in as the admin user created during first-run setup.

---

## Step 5: Mirror all 3 repos into Gluecron

**Prereq:** PR for `scripts/mirror-all-to-gluecron.sh` must be merged to `main` first.

**What:** Creates matching repos on Gluecron and mirror-pushes `crontech`, `gatetest`, and `gluecron` from GitHub.

**Commands:**

```
export GLUECRON_URL=https://gluecron.com
export GLUECRON_USER=craig          # or whichever admin user from Step 4
export GLUECRON_TOKEN=<paste_pat>   # from Step 4
bash scripts/mirror-all-to-gluecron.sh
```

**Expected:** Script prints `OK: <repo> mirrored` three times. `https://gluecron.com/craig/crontech` shows commits.

**Troubleshooting:**
- `401` on push: token missing `repo` scope or wrong user - regenerate in Step 4.
- `remote rejected (pre-receive hook)`: Gluecron disk full or LFS not configured - `df -h /var/lib/gluecron`.

---

## Step 6: Install Woodpecker CI

**What:** Stands up Woodpecker server + agent behind Caddy at `ci.crontech.ai`, using GitHub OAuth for initial login.

**Before running:**
1. Add Cloudflare A record: `ci.crontech.ai` -> `45.76.171.37` (DNS only).
2. Append this block to `/etc/caddy/Caddyfile` (or the project `Caddyfile` include):

```
ci.crontech.ai {
  reverse_proxy localhost:8000
}
```

Then `systemctl reload caddy`.

**Commands:**

```
export WOODPECKER_HOST=ci.crontech.ai
export WOODPECKER_GITHUB_CLIENT_ID=<from_github_oauth_app>
export WOODPECKER_GITHUB_CLIENT_SECRET=<same>
bash scripts/install-woodpecker.sh
```

**Expected:** `curl -sI https://ci.crontech.ai/` returns `HTTP/2 200`. OAuth login lands you in the Woodpecker dashboard.

**Troubleshooting:**
- `502 Bad Gateway`: Woodpecker container not up - `docker compose -f /opt/woodpecker/docker-compose.yml logs server`.
- OAuth callback mismatch: ensure GitHub OAuth app callback is exactly `https://ci.crontech.ai/authorize`.

---

## Step 7: Point Woodpecker at Gluecron-hosted repos

**What:** Switches CI away from GitHub so pushes to Gluecron (Step 5 destinations) trigger builds.

**Steps (UI):**
1. Woodpecker dashboard -> **Repositories** -> **Add Repository**.
2. Choose the **Gluecron** forge (not GitHub). If only GitHub is listed, add `WOODPECKER_GITEA_URL=https://gluecron.com` + Gitea OAuth creds to `/opt/woodpecker/.env` and restart: `docker compose restart`.
3. Enable `crontech`, `gatetest`, and `gluecron`.
4. For each repo: **Settings** -> **Secrets** -> add any needed (e.g. `VULTR_SSH_KEY`).
5. Click **Manual Pipeline** to trigger the first build.

**Expected:** Each repo shows a green build within ~5 min.

**Troubleshooting:**
- No Gluecron forge option: Woodpecker needs Gitea forge env vars - see step 2 above.
- Webhook not firing: Gluecron repo -> Settings -> Webhooks - should list `https://ci.crontech.ai/api/hook`.

---

## Verification (all four must pass)

```
curl -sI https://crontech.ai/        | head -1    # expect 200
curl -sI https://gluecron.com/       | head -1    # expect 200 (see Step 3)
git clone https://gluecron.com/craig/crontech.git /tmp/ct-verify && rm -rf /tmp/ct-verify
```

Then: push a trivial commit to Gluecron and confirm Woodpecker runs the pipeline (Step 7) and GateTest scans the gluecron-hosted version (check `.gatetest.json` artifacts in the build log).

- [ ] crontech.ai loads
- [ ] gluecron.com loads
- [ ] `git clone` from gluecron works
- [ ] Push to gluecron triggers Woodpecker build
- [ ] GateTest scans gluecron-hosted source

Done - self-hosted stack is live.
