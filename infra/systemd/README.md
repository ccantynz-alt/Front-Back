# Crontech systemd units

Unit files for services deployed on the Crontech Vultr box. Each `.service`
is paired with a hardening profile; timers live alongside their services.

## Inventory

| Unit | Purpose |
|---|---|
| `crontech-docker.service` | Crontech application containers. |
| `gluecron.service` | Shared cron glue process. |
| `woodpecker-server.service` | Woodpecker CI control plane. |
| `woodpecker-agent.service` | Woodpecker CI agent runner. |
| `sentinel.service` | BLK-015 — Sentinel one-shot collection cycle. |
| `sentinel.timer` | BLK-015 — 15-minute trigger for `sentinel.service`. |

## Running as a systemd timer

Sentinel ships as a `oneshot` service plus a `timer` unit. The timer fires
`sentinel.service` two minutes after boot and every fifteen minutes
thereafter. `Persistent=true` ensures a missed run (e.g. reboot) is caught
up on next boot.

```sh
sudo cp infra/systemd/sentinel.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sentinel.timer
```

### Verifying the timer

```sh
systemctl list-timers sentinel.timer --all
journalctl -u sentinel.service -n 50 --no-pager
# Dead-man's switch: the file below is touched at the end of every cycle.
stat /opt/crontech/services/sentinel/data/.last-run
```

### Required on-box state

- `/opt/crontech/` is a checkout of the repo (or a deploy artifact with
  `services/sentinel/` under it).
- `crontech` user + group exist and own `/opt/crontech/services/sentinel/data/`.
- `/usr/local/bin/bun` points to a current Bun runtime (≥ 1.3.x).
- Optional: `/opt/crontech/.env` supplies `SLACK_WEBHOOK_URL`,
  `DISCORD_WEBHOOK_URL`, `GITHUB_TOKEN`. All are optional — Sentinel
  degrades gracefully if a webhook is missing and runs against public
  GitHub rate limits without a token.
