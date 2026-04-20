# Woodpecker CI — Bare-Metal Install Runbook

Self-hosted Woodpecker CI on the Crontech box, running as native systemd
services (no Docker). GitHub is the source forge for now; the final plan
is to point Woodpecker at Gluecron once Gluecron is stable.

- **Woodpecker version:** `3.10.0` (current stable). Override with
  `WOODPECKER_VERSION=<x.y.z>` when running the installer.
- **Installer:** [`scripts/install-woodpecker.sh`](../../scripts/install-woodpecker.sh)
- **Systemd units:** [`infra/systemd/woodpecker-server.service`](../../infra/systemd/woodpecker-server.service),
  [`infra/systemd/woodpecker-agent.service`](../../infra/systemd/woodpecker-agent.service)
- **Caddy front:** [`infra/caddy/woodpecker.Caddyfile`](../../infra/caddy/woodpecker.Caddyfile)

---

## 1. Prerequisites

### 1.1 Create the GitHub OAuth app

Woodpecker authenticates users and fetches repos via a GitHub OAuth app.
For the full GitHub walkthrough, see:
<https://woodpecker-ci.org/docs/administration/forges/github>
(Woodpecker docs → Administration → Forges → GitHub).

1. Go to <https://github.com/settings/developers> → **OAuth Apps** →
   **New OAuth App**.
   - **Application name:** `Crontech Woodpecker CI`
   - **Homepage URL:** `https://ci.crontech.ai`
   - **Authorization callback URL:** `https://ci.crontech.ai/authorize`
2. Generate a client secret. Copy both the **Client ID** and **Client
   Secret** — the secret is only shown once.
3. Stash them somewhere safe (1Password, your secrets vault).

### 1.2 Host requirements

- Ubuntu 22.04+ (or any modern systemd distro)
- `curl`, `tar`, `systemd`, `openssl` (the installer checks)
- Caddy already running (Crontech main Caddyfile lives at
  `/etc/caddy/Caddyfile`)
- Ports 80/443 open to the public; the Woodpecker server binds to
  `127.0.0.1:8000` (HTTP) and `127.0.0.1:9000` (gRPC) — both loopback,
  Caddy fronts the HTTP side.

---

## 2. Run the installer

SSH to the box, export the required env vars, and run the script.

```bash
export WOODPECKER_HOST='ci.crontech.ai'
export WOODPECKER_GITHUB_CLIENT_ID='<from step 1.1>'
export WOODPECKER_GITHUB_CLIENT_SECRET='<from step 1.1>'
# Optional — installer generates one if unset:
# export WOODPECKER_AGENT_SECRET="$(openssl rand -hex 32)"

sudo -E bash scripts/install-woodpecker.sh
```

`sudo -E` is important — it preserves the env vars you just exported.

The script is **idempotent**. Re-run it to upgrade Woodpecker
(`WOODPECKER_VERSION=<newer>`) or to refresh the env files / systemd
units after editing inputs.

### What the installer does

1. Creates a `woodpecker` system user + group.
2. Creates `/var/lib/woodpecker/{server,agent,agent/tmp}` (mode 0750).
3. Downloads `woodpecker-server` and `woodpecker-agent` binaries from
   the official Woodpecker GitHub releases to `/usr/local/bin/`.
4. Writes `/etc/woodpecker/server.env` and `/etc/woodpecker/agent.env`
   (mode 0640, `root:woodpecker`).
5. Installs systemd units at `/etc/systemd/system/woodpecker-{server,agent}.service`.
6. `daemon-reload`, enables, and (re)starts both services.

---

## 3. Verify

```bash
# Unit status
systemctl status woodpecker-server woodpecker-agent

# HTTP health (local, pre-Caddy)
curl -fsS http://127.0.0.1:8000/healthz && echo OK

# Live logs
journalctl -u woodpecker-server -f
journalctl -u woodpecker-agent  -f
```

If `systemctl status` shows `active (running)` for both units and
`/healthz` returns 200, the server is up. If either is failing, the
journal tells you why (usually a typo in the OAuth credentials).

---

## 4. Expose at `ci.crontech.ai`

### 4.1 DNS

Add an `A` record (and `AAAA` if you have IPv6) for `ci.crontech.ai`
pointing at the Crontech box public IP. TTL 300 is fine.

Verify:

```bash
dig +short ci.crontech.ai A
```

### 4.2 Caddy

Two ways to wire the Caddy block; pick one.

**Option A — `import` from the main Caddyfile (preferred):**

```bash
sudo install -D -m 0644 infra/caddy/woodpecker.Caddyfile \
  /etc/caddy/conf.d/woodpecker.Caddyfile
```

Then in `/etc/caddy/Caddyfile`, at the top-level (outside any site
block), add:

```caddy
import /etc/caddy/conf.d/woodpecker.Caddyfile
```

**Option B — paste the site block:**

Append the `ci.crontech.ai { … }` block from
`infra/caddy/woodpecker.Caddyfile` to the main `Caddyfile`.

Then:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy will request a Let's Encrypt cert for `ci.crontech.ai` on the
first request. Verify:

```bash
curl -fsS https://ci.crontech.ai/healthz && echo OK
```

---

## 5. Register the Crontech repo

1. Open <https://ci.crontech.ai>. Click **Login** → log in via GitHub.
   The first user whose GitHub username matches `WOODPECKER_ADMIN`
   (default `craig`) becomes the instance admin.
2. Woodpecker will sync your GitHub repo list. Click **Repositories**
   → find **ccantynz-alt/Crontech** → toggle it **on**. Woodpecker
   automatically installs the webhook on the GitHub side.
3. The repo already has `.woodpecker.yml` + `.woodpecker/*` pipelines
   committed. The next push to `Main` (or any branch) triggers the
   pipeline. Visit **Repositories → Crontech** to watch it run.

---

## 6. Migrate to Gluecron later (2 config changes)

When Gluecron's forge API is stable, swap Woodpecker's source forge
from GitHub to Gluecron — it's a config-only change, no data loss.
See: <https://woodpecker-ci.org/docs/administration/forges/overview>.

1. **Register Woodpecker as an OAuth client inside Gluecron** (Gluecron
   admin panel → Applications → New OAuth2 Application):
   - Redirect URI: `https://ci.crontech.ai/authorize`
   - Note the client ID + secret.
2. **Edit `/etc/woodpecker/server.env`**, replace the GitHub block with:

   ```env
   # was: WOODPECKER_GITHUB=true / WOODPECKER_GITHUB_CLIENT / WOODPECKER_GITHUB_SECRET
   WOODPECKER_GITEA=true
   WOODPECKER_GITEA_URL=https://gluecron.com
   WOODPECKER_GITEA_CLIENT=<gluecron client id>
   WOODPECKER_GITEA_SECRET=<gluecron client secret>
   ```

   (Gluecron presents the Gitea-compatible forge API, so the existing
   `WOODPECKER_GITEA_*` variables are what Woodpecker expects.)
3. `sudo systemctl restart woodpecker-server woodpecker-agent`.
4. Log in to `ci.crontech.ai` with your Gluecron account and re-activate
   the mirrored Crontech repo. Pipelines resume against Gluecron
   webhooks. Existing build history is preserved in the SQLite DB.

---

## 7. Migrate SQLite → Postgres (later, when scale demands)

The installer uses SQLite for bootstrap simplicity. When build volume
justifies it (roughly: >5 concurrent agents or >100 builds/day), move
to Postgres. Full docs:
<https://woodpecker-ci.org/docs/administration/database>.

Outline:

1. Stop Woodpecker: `sudo systemctl stop woodpecker-server woodpecker-agent`.
2. Dump SQLite:
   `sqlite3 /var/lib/woodpecker/server/woodpecker.sqlite .dump > /tmp/woodpecker.sql`.
3. Provision a Postgres 15+ database (Neon serverless works well;
   or a local Postgres service on the box).
4. Convert the SQL dump to Postgres-compatible syntax (Woodpecker ships
   a `woodpecker-server migrate` helper in recent releases — see their
   migration docs).
5. Edit `/etc/woodpecker/server.env`:

   ```env
   # was: WOODPECKER_DATABASE_DRIVER=sqlite3 / DATASOURCE=/var/lib/woodpecker/server/woodpecker.sqlite
   WOODPECKER_DATABASE_DRIVER=postgres
   WOODPECKER_DATABASE_DATASOURCE=postgres://woodpecker:<pw>@<host>:5432/woodpecker?sslmode=require
   ```

6. `sudo systemctl start woodpecker-server woodpecker-agent`.
7. Verify in the UI that old builds + active repos are intact; delete
   the old SQLite file once you're happy.

---

## 8. Ops cheat sheet

| Task | Command |
|---|---|
| Status | `systemctl status woodpecker-server woodpecker-agent` |
| Server logs | `journalctl -u woodpecker-server -f` |
| Agent logs | `journalctl -u woodpecker-agent -f` |
| Restart both | `sudo systemctl restart woodpecker-server woodpecker-agent` |
| Upgrade Woodpecker | `WOODPECKER_VERSION=<x.y.z> sudo -E bash scripts/install-woodpecker.sh` |
| Edit env | `sudo -e /etc/woodpecker/server.env` then restart |
| Reset agent secret | Unset `WOODPECKER_AGENT_SECRET` in env, re-run installer, restart both units |
| Back up SQLite | `sudo cp /var/lib/woodpecker/server/woodpecker.sqlite /path/to/backup/woodpecker-$(date +%F).sqlite` |

---

## 9. Files this runbook covers

- `scripts/install-woodpecker.sh` — the installer
- `infra/systemd/woodpecker-server.service` — server unit (same content the installer writes)
- `infra/systemd/woodpecker-agent.service` — agent unit (same content the installer writes)
- `infra/caddy/woodpecker.Caddyfile` — Caddy block for `ci.crontech.ai`
