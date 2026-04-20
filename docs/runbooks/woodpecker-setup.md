# Woodpecker CI Setup — Crontech on Gluecron

> Operational runbook for pointing Woodpecker at the Gluecron-hosted
> Crontech repo and wiring up auto-deploy to the Vultr box. Written for
> Craig or any future operator doing this from zero.

Audience: anyone bringing Woodpecker up from cold, swapping the source
of truth from GitHub to Gluecron, or rotating the deploy secrets.

Related reading:
- `docs/INFRASTRUCTURE.md` INF-006 (Woodpecker placement, port, domain)
- `docs/empire/gluecron-spec.md` (Gluecron webhook payload shape)
- `.woodpecker.yml` + `.woodpecker/deploy.yml` (pipeline-as-code)
- `.woodpecker/env.yml` (declarative secret/env reference)

---

## 1. Prerequisites

Before starting, confirm all of the following:

| Requirement | How to check |
|---|---|
| Vultr VPS reachable | `ssh deploy@45.76.171.37 'uname -a'` |
| Caddy running + routing `ci.crontech.ai` | `curl -I https://ci.crontech.ai/` — expect 200 or the Woodpecker login page |
| Woodpecker server deployed on port 3003 | `ssh deploy@45.76.171.37 'ss -tlnp \| grep 3003'` |
| Woodpecker agent can reach the host | Should be running on the same box as `woodpecker-agent.service` |
| Gluecron reachable at `gluecron.crontech.ai` | `curl -I https://gluecron.crontech.ai/` |
| The `deploy` user has sudo on `crontech-api` / `crontech-web` | `ssh deploy@45.76.171.37 'sudo -l'` |

If `ci.crontech.ai` returns 502 or a DNS error, Caddy has no route for it
yet. There is NO block for `ci.crontech.ai` in `infra/caddy/Caddyfile` as
of this commit — **TODO: add a `ci.crontech.ai` reverse-proxy block to
`localhost:3003` mirroring the `gluecron.crontech.ai` block** (that file
is out of scope for this PR; see `BUILD_BIBLE.md` INF-006).

---

## 2. Point Woodpecker at the Gluecron-hosted repo

Woodpecker talks to its "forge" (source host) via OAuth. Gluecron emits
GitHub-compatible webhook payloads, so Woodpecker's built-in GitHub
forge works unchanged — it just needs to be pointed at Gluecron's
endpoints instead of `api.github.com`.

### 2.1 Configure Woodpecker server

Edit `/etc/woodpecker/server.env` (or the equivalent systemd dropin)
on the Vultr box:

```bash
# Use the GitHub-compatible forge driver pointed at Gluecron.
WOODPECKER_GITHUB=true
WOODPECKER_GITHUB_URL=https://gluecron.crontech.ai
WOODPECKER_GITHUB_API=https://gluecron.crontech.ai/api/v1
WOODPECKER_GITHUB_CLIENT=<oauth-app-client-id-from-gluecron>
WOODPECKER_GITHUB_SECRET=<oauth-app-client-secret-from-gluecron>

# Keep the old GitHub entry ONLY while mirroring — remove once cutover.
# WOODPECKER_GITHUB_URL=https://github.com
# WOODPECKER_GITHUB_API=https://api.github.com
```

Then: `sudo systemctl restart woodpecker-server`.

### 2.2 Register the repo in Woodpecker

1. Visit https://ci.crontech.ai/ and sign in (uses Gluecron OAuth).
2. Click **Repositories → Add repository**.
3. Select `ccantynz-alt/Crontech` from the list.
4. Woodpecker auto-creates a webhook on the Gluecron side pointing at
   `https://ci.crontech.ai/hook`. Verify under Gluecron → Repo Settings
   → Webhooks.
5. Confirm the webhook secret matches `WOODPECKER_GITHUB_SECRET` (or
   whichever shared secret Gluecron uses — see gluecron-spec §Webhooks).

### 2.3 Trigger mode

Under the Crontech repo in Woodpecker → **Settings**:

- Allow Pull Requests: **ON** (drives `.woodpecker.yml`)
- Protected: **ON** (so forks can't run secrets)
- Trusted: **ON** (so the local-backend steps can run without a container)
- Pipeline path: leave blank (defaults to `.woodpecker.yml` + `.woodpecker/*.yml`)

---

## 3. Register required Woodpecker secrets

Secrets are surfaced into pipeline steps via `secrets:` in the YAML.
Never hardcode any of these values — the pipeline hard-fails if it
can't read a required secret.

Two ways to register, pick whichever matches your operator style:

### Option A — `woodpecker-cli` (preferred, scriptable)

```bash
# Authenticate once:
export WOODPECKER_SERVER=https://ci.crontech.ai
export WOODPECKER_TOKEN=<personal-access-token-from-ci.crontech.ai/user>

# Repo-scoped (use for per-environment values):
woodpecker-cli secret add \
  --repository ccantynz-alt/Crontech \
  --name DATABASE_URL \
  --value "libsql://crontech-prod.turso.io?authToken=..."

# Org-scoped (use for keys shared across the Crontech family):
woodpecker-cli secret add \
  --organization ccantynz-alt \
  --name VULTR_SSH_KEY \
  --value "$(cat ~/.ssh/crontech-deploy)"
```

### Option B — Woodpecker UI

1. Repo page → **Settings → Secrets → Add secret**.
2. For SSH keys, paste the **full multiline PEM** including the
   `-----BEGIN OPENSSH PRIVATE KEY-----` / `-----END …-----` markers.
3. Tick **Available for pull request** ONLY for non-sensitive things.
   Deploy secrets must be UNchecked — otherwise a malicious PR could
   exfiltrate them.

### 3.1 The secret list

| Name | Required? | Scope | Used by | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | yes | repo | `migrate` step | Turso libsql:// or Neon postgres:// |
| `TURSO_AUTH_TOKEN` | yes | repo | `migrate` step | Turso JWT |
| `ANTHROPIC_API_KEY` | yes | org | runtime | Claude API |
| `STRIPE_SECRET_KEY` | yes | repo | runtime | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | yes | repo | runtime | Stripe webhook sig |
| `SESSION_SECRET` | yes | repo | runtime | Session signing |
| `JWT_SECRET` | yes | repo | runtime | JWT signing |
| `GOOGLE_CLIENT_ID` | yes | repo | runtime | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | yes | repo | runtime | Google OAuth |
| `VULTR_HOST` | ssh-mode only | repo | `deploy-remote` | IP or DNS of box |
| `VULTR_SSH_KEY` | ssh-mode only | org | `deploy-remote` | Multiline PEM |
| `VULTR_SSH_USER` | ssh-mode only | repo | `deploy-remote` | Defaults to `deploy` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | org | runtime | Tempo/Mimir endpoint |
| `SLACK_WEBHOOK_URL` | optional | org | alerts | #sentinel-critical |
| `GITHUB_TOKEN` | transitional | repo | mirror sync | Remove after cutover |

`ssh-mode only` means: the secret is only consulted when the repo-level
env var `DEPLOY_MODE=ssh` is set (see `.woodpecker/env.yml`). Default
is `in-place` and those secrets can be left unset.

---

## 4. Trigger a first run

### 4.1 Dry run (no deploy)

1. Open a throwaway branch: `git checkout -b ci/smoke-test`.
2. Push a trivial commit (e.g. touch a comment in `README.md`).
3. Open a PR into Main.
4. Woodpecker should pick up the webhook within seconds. Watch
   https://ci.crontech.ai/ccantynz-alt/Crontech.
5. Expect all 8 gate steps to go green: `install → lint / typecheck /
   check-links / check-buttons / check-a11y → build → check-bundle →
   test → ci-status`.
6. The `deploy` pipeline does **not** run on PRs — verify by
   checking that `.woodpecker/deploy.yml` shows as "skipped".

### 4.2 Real deploy

1. Merge the PR into Main (squash, conventional commit).
2. Woodpecker receives the push webhook for `branch: Main`.
3. `.woodpecker/deploy.yml` fires. Watch the 7 steps:
   `pull → install → quality-gates → build → test → migrate → deploy`.
4. On success the step prints the DEPLOY SUCCESS banner and the
   public URLs. `curl -I https://crontech.ai` should return 200.
5. On failure, the step dumps `journalctl` for both services and
   exits non-zero. Woodpecker marks the pipeline red; Slack fires
   via the `#sentinel-critical` webhook if `SLACK_WEBHOOK_URL` is
   registered.

### 4.3 Manual re-run

From the Woodpecker UI, any pipeline can be re-run with the
**Restart** button. Useful for rerunning after a transient failure
(network hiccup, flaky test). The `manual` event in `.woodpecker.yml`
allows running the gate suite on any commit on demand.

---

## 5. Rollback if deploy fails

### 5.1 Symptoms

- Woodpecker shows the `deploy` step red.
- `curl -I https://crontech.ai` returns 502 / times out.
- `#sentinel-critical` Slack alert fires (if wired).

### 5.2 Fast rollback (30–60s)

The deploy is essentially `git reset --hard origin/Main` + systemd
restart. To roll back, reset to the previous commit and restart:

```bash
ssh deploy@45.76.171.37
cd /opt/crontech
# Identify the last known-good SHA (the commit before the bad one):
git log --oneline -5
PREV=<sha>

# Reset code:
git reset --hard $PREV

# Rebuild (in case artifacts changed):
bun install --frozen-lockfile
bun run build

# Restart services:
sudo systemctl restart crontech-api
sleep 3
sudo systemctl restart crontech-web
sleep 5

# Verify:
curl -fsS http://localhost:3001/api/health
curl -fsS http://localhost:3000/
```

Then — **critical** — revert the bad commit on Main so the next deploy
doesn't re-break everything:

```bash
# On your laptop:
git revert <bad-sha>
git push origin Main
```

Woodpecker will re-run the deploy against the reverted state, which
should match what you already fast-rolled-back to.

### 5.3 Docker-compose mode rollback (`DEPLOY_MODE=ssh`)

If deploy used the SSH path and Docker Compose:

```bash
ssh deploy@45.76.171.37
cd /opt/crontech

# Rollback to the previous image tag if you tag per-commit:
# (see docker-compose.production.yml — TODO: image tags are currently :latest)
docker compose -f docker-compose.production.yml --env-file .env.production pull
git reset --hard <prev-sha>
docker compose -f docker-compose.production.yml --env-file .env.production up -d --remove-orphans
```

> **TODO:** `docker-compose.production.yml` currently uses `:latest` image
> tags, which means Docker Compose rollback can't fetch a specific
> previous version cleanly. Consider tagging images per commit SHA in a
> follow-up PR so rollback becomes a single `up -d --force-recreate`.

### 5.4 Database migration rollback

Migrations are forward-only by design (Drizzle convention). If a
migration broke prod:

1. Stop Woodpecker auto-deploy by disabling the repo in the UI
   (Settings → Disable).
2. Manually restore from the most recent Turso backup (Turso has
   point-in-time recovery on paid tiers):
   ```bash
   turso db restore crontech-prod --timestamp '2026-04-19T18:00:00Z'
   ```
3. Once data is sane, write a new forward migration that fixes the
   schema, push it to Main, re-enable the repo.

---

## 6. Cutover from GitHub to Gluecron

Once Gluecron hosts the authoritative Crontech source:

1. Mirror this repo from GitHub to Gluecron (Gluecron → New Repo →
   "Mirror from existing").
2. Update the Woodpecker forge config in `/etc/woodpecker/server.env`
   as shown in §2.1 — point `WOODPECKER_GITHUB_URL` at Gluecron only.
3. Restart Woodpecker: `sudo systemctl restart woodpecker-server`.
4. Re-add the repo in the Woodpecker UI (will bind to the new forge).
5. Re-register all secrets — secrets are scoped to the forge+repo pair
   and don't transfer automatically.
6. Delete the GitHub webhook (GitHub repo → Settings → Webhooks).
7. Push a smoke-test commit to the Gluecron repo and confirm the
   pipeline runs end-to-end.
8. Remove the `GITHUB_TOKEN` secret from Woodpecker — not needed once
   the mirror link is gone.

Do steps 1–5 in a maintenance window. The gap where both forges are
wired can double-trigger pipelines; that's annoying but not dangerous
because deploy is idempotent.

---

## 7. Known gaps / follow-ups

- `ci.crontech.ai` Caddy block is NOT yet in `infra/caddy/Caddyfile`.
  Add a reverse-proxy block to `localhost:3003` mirroring the
  `gluecron.crontech.ai` stanza. Out of scope for this PR.
- `docker-compose.production.yml` uses `:latest` image tags. Switch to
  SHA-pinned tags for cleaner rollbacks.
- The deploy step writes runtime secrets into `/opt/crontech/.env` via
  whatever mechanism `setup-vultr.sh` uses. That script is out of
  scope for this PR — confirm it reads Woodpecker env and writes the
  file atomically before the next cutover.
- Once Gluecron is the only forge, remove the transitional
  `GITHUB_TOKEN` secret and any `.github/` CI workflow files that
  duplicate this pipeline.
