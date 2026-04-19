# Auto-Deploy Runbook

Push-to-`Main` triggers a redeploy of `crontech.ai` via a tiny localhost
webhook service (`crontech-deploy-hook`). No more manual
`git pull && bun run build && systemctl restart`.

## Prereqs

- `deploy` user exists on the box (`id deploy`)
- `/opt/crontech` is a valid git checkout of this repo, owned by `deploy`
- `bun` and `node` on `PATH` for root and the `deploy` user
- `crontech-web` and `crontech-api` systemd units already exist
- Caddy is installed and `/etc/caddy/Caddyfile` imports `/etc/caddy/conf.d/*.caddy`
- DNS A record for `hooks.crontech.ai` points at the box (or use the path-only
  fallback described in "Caddy" below)

## Install

```
sudo bash scripts/install-auto-deploy.sh
```

Overrides (optional): `DEPLOY_USER`, `DEPLOY_DIR`, `HOOK_PORT`, `HOOK_HOST`,
`DEPLOY_WEBHOOK_SECRET`. The installer is idempotent; re-running preserves the
existing secret unless `DEPLOY_WEBHOOK_SECRET` is passed explicitly.

On success it prints the webhook URL + secret.

## Configure GitHub webhook

1. GitHub -> `ccantynz-alt/Crontech` -> **Settings** -> **Webhooks** -> **Add webhook**
2. Payload URL: `https://hooks.crontech.ai/deploy`
3. Content type: `application/json`
4. Secret: paste the value printed by the installer (also in `/etc/crontech-deploy-hook.env`)
5. SSL verification: **Enable**
6. Which events: **Just the `push` event**
7. Active: checked -> **Add webhook**
8. GitHub sends a `ping` immediately; check `tail -f /var/log/crontech-deploy-hook.log` for `pong`.

## Caddy

The installer writes `/etc/caddy/conf.d/crontech-deploy-hook.caddy` for
`hooks.crontech.ai`. If you prefer to avoid a new subdomain, replace the
snippet with a path handler on the main site:

```
crontech.ai {
    handle /hooks/deploy { reverse_proxy 127.0.0.1:9999 }
    # ...existing site...
}
```

And set the GitHub Payload URL to `https://crontech.ai/hooks/deploy`.

## Test

```
curl -fsS http://127.0.0.1:9999/healthz          # -> ok
BODY='{"ref":"refs/heads/Main","after":"test"}'
SECRET=$(sudo awk -F= '/^DEPLOY_WEBHOOK_SECRET=/{print $2}' /etc/crontech-deploy-hook.env)
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"
curl -fsS -X POST http://127.0.0.1:9999/deploy \
  -H "X-GitHub-Event: push" -H "X-Hub-Signature-256: $SIG" \
  -H "Content-Type: application/json" --data "$BODY"
sudo tail -f /var/log/crontech-deploy-hook.log
```

From GitHub: the webhook page has **Recent Deliveries** -> **Redeliver**.

## Rollback

```
sudo systemctl stop crontech-deploy-hook
sudo systemctl disable crontech-deploy-hook
```

Then deploy manually:

```
sudo -u deploy bash -c 'cd /opt/crontech && git fetch && git checkout Main && \
  git reset --hard origin/Main && bun install --frozen-lockfile && bun run build'
sudo systemctl restart crontech-web crontech-api
```

Builds are idempotent: a failed build returns HTTP 500 and leaves the
running `crontech-web` / `crontech-api` untouched. No half-deploys.

## Migration to Gluecron webhooks

When Gluecron becomes the source of truth:

1. Point the same GitHub webhook at Gluecron's receiver, OR add a second webhook.
2. Keep `crontech-deploy-hook` running as a fallback for one release cycle.
3. Once Gluecron has deployed a Main push end-to-end twice, stop + disable the local hook (see Rollback).
4. Remove `/etc/caddy/conf.d/crontech-deploy-hook.caddy` and reload Caddy.
5. Archive `/etc/crontech-deploy-hook.env` (it holds the GitHub secret).

## Security

- **Secret rotation:** edit `DEPLOY_WEBHOOK_SECRET` in `/etc/crontech-deploy-hook.env`,
  `sudo systemctl restart crontech-deploy-hook`, then update the secret in the
  GitHub webhook settings. File is `0640 root:deploy`.
- **IP allowlist:** restrict Caddy to GitHub's webhook IPs
  (https://api.github.com/meta `.hooks`). Example Caddy matcher:

  ```
  @github remote_ip 192.30.252.0/22 185.199.108.0/22 140.82.112.0/20 143.55.64.0/20 2a0a:a440::/29 2606:50c0::/32
  handle @deploy { @ok { expression {http.matchers.remote_ip.match} } reverse_proxy @github 127.0.0.1:9999 }
  ```

  Refresh the list monthly.
- HMAC verification is constant-time (`crypto.timingSafeEqual`); non-`Main`
  refs and non-`push` events are logged + 202'd without running a deploy.
- The hook listens on `127.0.0.1` only; the public surface is Caddy.
- Deploys are serialized via `flock -n /var/lock/crontech-deploy.lock`;
  concurrent pushes don't corrupt the build tree.
