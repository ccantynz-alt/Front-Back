# Runbook: add-gluecron.sh

Bootstraps the Gluecron service on a bare-metal Ubuntu 22.04 host
(current target: Vultr `45.76.171.37`). Safe to re-run - every step is
idempotent.

## Usage

```bash
sudo -E DATABASE_URL='postgres://user:pass@host:5432/gluecron' \
        GATETEST_URL='https://gatetest.example' \
        CRONTECH_DEPLOY_URL='https://crontech.example/deploy' \
        bash scripts/add-gluecron.sh
```

Re-run any time to pick up a new commit on `main` - the script fetches,
hard-resets, reinstalls deps, re-migrates, and restarts the unit.

## Environment variables

| Variable              | Required | Default                                            |
| --------------------- | -------- | -------------------------------------------------- |
| `DATABASE_URL`        | yes      | -                                                  |
| `PORT`                | no       | `3002`                                             |
| `NODE_ENV`            | no       | `production`                                       |
| `GIT_REPOS_PATH`      | no       | `/data/gluecron/repos`                             |
| `GATETEST_URL`        | no       | empty                                              |
| `CRONTECH_DEPLOY_URL` | no       | empty                                              |
| `GLUECRON_REPO`       | no       | `https://github.com/ccantynz-alt/Gluecron.com.git` |
| `GLUECRON_BRANCH`     | no       | `main`                                             |
| `GLUECRON_DIR`        | no       | `/opt/gluecron`                                    |

## Troubleshooting

- `DATABASE_URL is required` -> export it (or pass via `sudo -E`); the script fails loud on purpose.
- `bun: command not found` after install -> installer placed bun outside `/usr/local`; re-run with `BUN_INSTALL=/usr/local` or symlink `~/.bun/bin/bun` into `/usr/local/bin`.
- `createdb` / migrate fails -> confirm the Postgres role in `DATABASE_URL` has `CREATEDB`, and that the admin URL (derived by swapping the db name to `postgres`) is reachable: `psql "$ADMIN_URL" -c '\\l'`.
- Healthcheck fails after 30s -> inspect `journalctl -u gluecron -n 200 --no-pager` (the script also dumps the last 80 lines on failure) and verify `/opt/gluecron/.env` was written with the expected values.
- Service won't start after a redeploy -> `systemctl status gluecron`; common cause is a stale `node_modules` after a bun upgrade, fixed by `rm -rf /opt/gluecron/node_modules` and re-running the script.
