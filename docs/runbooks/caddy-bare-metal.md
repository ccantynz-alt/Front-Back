# Caddy bare-metal runbook

Caddy runs as a **systemd service on the Vultr host** (not inside a
docker-compose network). Upstreams in `infra/caddy/Caddyfile` therefore
reference `localhost:<port>` — the app services (`crontech-web`,
`crontech-api`, `gluecron`) are also systemd units binding to
`0.0.0.0` on the host.

If the deployment model ever flips back to docker-compose with Caddy in
the compose network, swap the `localhost:3000` / `localhost:3001`
upstreams back to `web:3000` / `api:3001`. The header block at the top
of the Caddyfile says the same thing.

## Apply a Caddyfile change

The repo lives at `/opt/crontech` on the Vultr box. After pulling the
latest changes (`git -C /opt/crontech pull`), copy the file into place
and bounce Caddy:

```bash
cp /opt/crontech/infra/caddy/Caddyfile /etc/caddy/Caddyfile
systemctl restart caddy
```

### Why `restart`, not `reload`

`systemctl reload caddy` and `caddy reload` both talk to Caddy's admin
API. We set `admin off` in the global options block for security, so
the admin API is unavailable and reload will fail with a connection
error. Use `systemctl restart caddy` — it's the only supported path
for this deployment. The brief drop (sub-second) is acceptable; if you
ever need true zero-downtime reloads, you'll have to re-enable the
admin API on a localhost-only socket first.

## Validate before applying

Always validate the Caddyfile before restarting in production:

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

A non-zero exit means don't restart — fix the config first. You can
validate the file straight from the repo checkout too:

```bash
caddy validate --config /opt/crontech/infra/caddy/Caddyfile --adapter caddyfile
```

## Logs

All per-site access logs are written to `/var/log/caddy/*.log` (see the
`log` blocks in the Caddyfile). The systemd unit runs Caddy as the
`caddy` user, so the directory and any files inside it must be owned
by `caddy:caddy`, otherwise Caddy will silently drop log writes (or
fail to start if the directory is missing).

First-time setup / if you see permission errors in `journalctl -u caddy`:

```bash
mkdir -p /var/log/caddy
chown -R caddy:caddy /var/log/caddy
systemctl restart caddy
```

Useful log files:

- `/var/log/caddy/crontech-web.log` — apex `crontech.ai` (web/SSR)
- `/var/log/caddy/crontech-api.log` — `api.crontech.ai`
- `/var/log/caddy/gluecron.log` — `gluecron.crontech.ai`
- `/var/log/caddy/gluecron-apex.log` — `gluecron.com`

Live-tail Caddy's own stderr (startup errors, ACME, routing):

```bash
journalctl -u caddy -f
```
