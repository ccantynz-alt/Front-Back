# Web Terminal Runbook (ttyd @ terminal.crontech.ai)

> **DANGER - ROOT-EQUIVALENT ACCESS OVER HTTP.**
> A successful login gives a real bash shell as the service user on the Vultr
> box. HTTPS + a long random password are the *minimum*. Prefer an IP allowlist
> or a VPN (Tailscale/WireGuard) in front. No MFA. Treat like `sudo` over the
> internet.

## What this is

`ttyd` exposes a local bash shell as a websocket. Caddy terminates TLS and
enforces HTTP basic-auth, then reverse-proxies to `127.0.0.1:7681`. ttyd itself
binds loopback only, so Caddy is the single public entry point.

Stateless: each browser tab = fresh shell. Closing the tab kills the shell.

## Prereqs

- Ubuntu 22.04 Vultr box with Caddy already serving crontech.ai
- Non-root service user (`craig` or `deploy`) that you're happy to give a shell to
- Caddy binary on PATH (for `caddy hash-password`)
- DNS control for crontech.ai

## Install

```bash
# on the Vultr box
sudo TTYD_USER=craig bash scripts/install-web-terminal.sh
```

The script:

1. Installs ttyd (apt; falls back to GitHub release binary).
2. Writes `/etc/systemd/system/ttyd.service` (bound to `127.0.0.1:7681`, `-W`).
3. Enables + starts the unit.
4. Generates a random 32-hex-char password, stores it at `/etc/caddy/terminal-auth`
   (mode 600), and prints it to stdout **once**. Copy it now.

Re-running the script is safe. It will NOT regenerate the password if
`/etc/caddy/terminal-auth` already exists - delete that file first to rotate.

## DNS

Create an A record:

```
terminal.crontech.ai.  A  <vultr-box-public-ip>  TTL 300
```

## Caddy wiring

1. Copy `infra/caddy/terminal.Caddyfile` to `/etc/caddy/sites/terminal.Caddyfile`.
2. Hash the password the installer printed:

   ```bash
   caddy hash-password --plaintext '<paste-password-here>'
   ```

3. Replace `{CADDY_TERMINAL_PASSWORD_HASH}` in the copied file with that hash.
4. Ensure the main `/etc/caddy/Caddyfile` imports it:

   ```
   import /etc/caddy/sites/*.Caddyfile
   ```

5. Validate + reload:

   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

## Test

From any browser: `https://terminal.crontech.ai` -> basic-auth prompt -> bash.
From iPad Safari too. No SSH client needed.

Smoke check from the box:

```bash
curl -sI http://127.0.0.1:7681 | head -1      # expect 200 OK
systemctl status ttyd caddy --no-pager
journalctl -u ttyd -n 20 --no-pager
```

## Adding more users

Edit `/etc/caddy/sites/terminal.Caddyfile`:

```
basicauth {
    admin  <bcrypt-hash-1>
    craig  <bcrypt-hash-2>
}
```

Then `sudo systemctl reload caddy`. Note: basic-auth user is independent of the
unix user ttyd runs as - every authenticated browser gets the SAME shell user
(configured via `TTYD_USER` in the install script).

## Security notes / hardening to consider

- **Strong password**: the installer uses `openssl rand -hex 16` (128 bits). Do
  not weaken this.
- **IP allowlist**: uncomment the `@blocked` matcher block in
  `terminal.Caddyfile` and add your office/home IPs. Huge blast-radius reducer.
- **VPN-only**: even better, only bind Caddy's listener to a Tailscale IP and
  skip the public DNS record entirely.
- **Audit**: Caddy access log is at `/var/log/caddy/terminal.access.log`. Shell
  history lands in `~craig/.bash_history` (non-durable - sessions are short).
- **Rotate** the password quarterly: delete `/etc/caddy/terminal-auth`, re-run
  the install script, re-hash, reload Caddy.

## Uninstall

```bash
sudo systemctl disable --now ttyd
sudo rm /etc/systemd/system/ttyd.service /etc/caddy/terminal-auth
sudo rm /etc/caddy/sites/terminal.Caddyfile
sudo systemctl daemon-reload
sudo systemctl reload caddy
# optional: sudo apt-get remove -y ttyd  (or rm /usr/local/bin/ttyd)
```
