# Self-Hosted Cutover Runbook

> **Goal:** move Crontech off GitHub + Cloudflare + Neon onto our own bare metal.
> **Result:** everything that can be ours, is ours. ~75% self-sufficient (ceiling for a single-site stack).
> **Rollback at every step:** revert DNS = instant, mirror is additive (GitHub stays until you kill it).

## Prerequisites (Craig, 5 minutes)

1. Deploy a **Vultr Bare Metal** box — same region as current VPS (45.76.21.235). Ubuntu 22.04 or 24.04 LTS. Add your root SSH key. Note the new IP.
2. On Vultr console, set the PTR / reverse DNS on the new IP to `crontech.ai`.
3. Grab a **Cloudflare API token** with `Zone:Read` + `DNS:Read` scope on `crontech.ai`, `gluecron.com`, `alecrae.com`.
4. Know which **registrar** sells you `crontech.ai` (Namecheap, GoDaddy, iwantmyname, whoever). You'll need to log in to flip nameservers later.

---

## Step 1 — Bare metal box up (~20 minutes)

SSH into the new box as `root` and run:

```bash
# Clone Crontech into /opt/crontech
apt-get update -qq && apt-get install -y -qq git curl
git clone https://github.com/ccantynz-alt/Crontech.git /opt/crontech
cd /opt/crontech

# Generate strong Postgres passwords
export POSTGRES_CRONTECH_PASSWORD="$(openssl rand -hex 32)"
export POSTGRES_GLUECRON_PASSWORD="$(openssl rand -hex 32)"

# Save them somewhere safe — you'll need them for step 3
echo "CRONTECH_PG=$POSTGRES_CRONTECH_PASSWORD"
echo "GLUECRON_PG=$POSTGRES_GLUECRON_PASSWORD"

# Run the provisioner
DOMAIN=crontech.ai DEPLOY_USER=deploy \
POSTGRES_CRONTECH_PASSWORD="$POSTGRES_CRONTECH_PASSWORD" \
POSTGRES_GLUECRON_PASSWORD="$POSTGRES_GLUECRON_PASSWORD" \
sudo -E bash /opt/crontech/scripts/bare-metal-setup.sh
```

What that does: installs Bun, Postgres 16, Caddy. Sets up systemd units for crontech-web (3000), crontech-api (3001), gluecron (3002), dns-server (53). Creates Postgres databases + users. Writes `/etc/caddy/Caddyfile` with all vhosts. Firewall: allow 22/53/80/443.

**Verify before moving on:**
```bash
systemctl status crontech-web crontech-api gluecron dns-server caddy postgresql
# All should be active (running). If dns-server fails, check logs: journalctl -u dns-server -n 50
```

**Rollback:** old VPS at `45.76.21.235` is untouched. If this step fails, don't touch DNS — old VPS keeps serving.

---

## Step 2 — DNS zones imported, nameservers flipped (~15 minutes)

### 2a. Import zones from Cloudflare into our DNS

From anywhere (locally or on the new bare metal box):

```bash
export CF_API_TOKEN="<the Cloudflare token from prerequisites>"

# Import each zone — this reads from Cloudflare, writes to our Postgres
bun run scripts/import-dns-zone.ts --token="$CF_API_TOKEN" --zone=crontech.ai
bun run scripts/import-dns-zone.ts --token="$CF_API_TOKEN" --zone=gluecron.com
bun run scripts/import-dns-zone.ts --token="$CF_API_TOKEN" --zone=alecrae.com
```

Add `--dry-run` first to see what would be imported.

### 2b. Add the wildcard + nameserver records

In the admin UI at `https://crontech.ai/admin/dns` (or via tRPC directly), add for `crontech.ai`:

- `* A <new-bare-metal-ip>` — wildcard → all subdomains point here
- `ns1 A <new-bare-metal-ip>` — our nameserver IP
- `ns2 A <new-bare-metal-ip>` — same for now; when we add a second region this points elsewhere

Same pattern for `gluecron.com` and `alecrae.com`.

### 2c. Flip nameservers at the registrar

At your domain registrar's web UI, for each of the three domains:
- Change nameservers from Cloudflare's (`*.ns.cloudflare.com`) to ours:
  - `ns1.crontech.ai`
  - `ns2.crontech.ai`

Propagation: 1–48 hours. Watch with `dig NS crontech.ai`.

**Rollback:** revert nameservers to Cloudflare's in the registrar UI. Takes effect within an hour.

---

## Step 3 — GitHub repos mirrored to Gluecron (~15 minutes)

### 3a. Create admin account on Gluecron

Once `gluecron.crontech.ai` resolves (after step 2 propagates):
- Visit `https://gluecron.crontech.ai/register`
- Create the `craig` admin account
- In settings → access tokens, generate a personal access token. Copy it.

### 3b. Mirror the three repos

From your local laptop (or anywhere with git):

```bash
export GLUECRON_HOST="gluecron.crontech.ai"
export GLUECRON_USER="craig"
export GLUECRON_TOKEN="<the PAT from step 3a>"

bash scripts/mirror-repos-to-gluecron.sh
```

That script does `git push --mirror` for all three repos from GitHub to Gluecron. GitHub stays intact — this is additive, not destructive.

### 3c. Point deploy workflows at Gluecron

In each repo's `.github/workflows/deploy.yml` (or equivalent), change the `REPO_URL` to point at Gluecron. For now you can leave GitHub's workflow running as a backup — once Gluecron's CI is verified, disable the GitHub Actions workflow.

**Rollback:** do nothing. GitHub is untouched. The mirror is a one-way sync; flip it back by ignoring Gluecron and continuing to push to GitHub.

---

## Verification checklist

After all three steps complete:

- [ ] `dig +short crontech.ai` returns the new bare-metal IP
- [ ] `dig +short NS crontech.ai` returns `ns1.crontech.ai` and `ns2.crontech.ai`
- [ ] `https://crontech.ai` loads the same landing page as before
- [ ] `https://api.crontech.ai/api/health` returns 200
- [ ] `https://gluecron.crontech.ai` loads the Gluecron landing
- [ ] `git push gluecron main` from any mirrored repo works
- [ ] DB queries from the API work (services depend on self-hosted Postgres)
- [ ] Admin UI at `/admin/dns` shows all 3 zones

If any fail, revert the failed step only. The old stack (GitHub + Cloudflare + Neon) stays warm for 7 days post-cutover, at which point you can decommission.

---

## Post-cutover cleanup (1 week later)

Once you're confident the self-hosted stack is stable:

1. Cancel Neon (delete the project)
2. Cancel the old Vultr VPS (keep snapshot for 30 days)
3. Disable GitHub Actions workflows (keep the repos as a read-only backup)
4. Remove Cloudflare proxy / leave zone records static (you're no longer using them)

What's NOT cancelled:
- **Domain registrar** — you always need a registrar, ICANN requirement
- **Anthropic / OpenAI API keys** — external AI providers, intentional
- **Let's Encrypt** — free, automated, commodity cert authority

---

## What breaks if we skip a step

- Skip 1, do 2: zones point at a non-existent DNS server → crontech.ai goes down
- Skip 2, do 3: Gluecron exists but is unreachable (no DNS) → mirror step still works via IP
- Skip 3, do 1+2: DNS is ours but source still lives on GitHub. That's fine as an intermediate state.

**Order matters. Do 1 → 2 → 3.**

---

## Gotchas we hit on the first live run (2026-04-19)

These are in the scripts now — but documented here so future eyes know why:

1. **Vultr bare metal defaults SSH to key-only.** `PermitRootLogin prohibit-password` in sshd_config. Password auth will be denied no matter what you type. Solutions:
   - Use the SSH key from the deploy form (whichever one you picked when provisioning)
   - OR use **vSerial** from the Vultr dashboard — that bypasses sshd entirely and accepts root password from Vultr's "Show Password" in server Overview
   - OR from iPad: import the private key into a proper SSH client (Termius, Blink) via their Key File section — never paste the key into chat

2. **Postgres initdb `--pwfile=<(...)` fails under sudo.** Bash process substitution creates `/dev/fd/N` owned by root; `sudo -u postgres` can't read it. Script now uses a temp file chowned to postgres. (Fixed in commit 6083435.)

3. **psql `:'var'` does NOT substitute inside PL/pgSQL DO blocks.** The dollar-quoting makes psql treat it as literal text, so the server sees `:'crontech_password'` and chokes. Script now uses `\gexec` pattern which runs at psql-client-side where `:'var'` expands. (Fixed in commit a2e819f.)

4. **Postgres data dir must be 0700 or 0750.** Ubuntu's apt postinst can leave it 0755, which Postgres refuses at startup. Script now chmods 0700 after initdb. (Fixed in commit 896db1e.)

5. **Git refuses "dubious ownership" after the script chowns `/opt/crontech` to `deploy`.** When you come back and try `git pull` as root, git bails. Fix: `git config --global --add safe.directory /opt/crontech` before the first pull.

6. **Stopping the postgres restart loop.** If postgres is in a crash loop (wrong perms, bad config), `sudo systemctl stop postgres` before chmod — otherwise the next restart races your chmod.

7. **iPad SSH paste wraps URLs in `<>`.** iPad auto-linking adds angle brackets around anything that starts with `https://` on multi-line paste. Symptom: bash says `No such file or directory` with `<URL>` in the error. Workarounds: paste into Notes first (strips auto-linking), or paste line-by-line, or use PowerShell on PC.

---
