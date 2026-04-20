# Secrets Runbook — `.env.production`

How to bootstrap, rotate, verify, and recover the production env file
at `/opt/crontech/.env.production`. Tooling lives in `scripts/secrets-*.sh`.

## Bootstrap (first deploy)

```bash
sudo bash scripts/secrets-init.sh
```

- Reads `.env.production.example` from the repo.
- Replaces every `CHANGE_ME` with `openssl rand -hex 32`.
- Replaces every `CHANGE_ME_STRONG_PASSWORD` with `openssl rand -hex 24`.
- Writes `/opt/crontech/.env.production` as `deploy:deploy`, mode `600`.
- Refuses to overwrite an existing file unless `--force` is passed; with
  `--force` the previous file is copied to `.env.production.bak-<UTC>`.
- Never prints any generated secret to stdout.

## Rotate one secret (no downtime target)

```bash
sudo bash scripts/secrets-rotate.sh JWT_SECRET
```

Valid names: `JWT_SECRET`, `SESSION_SECRET`, `POSTGRES_PASSWORD`,
`DATABASE_URL` (rebuild externally, then rotate), any other
`[A-Z_][A-Z0-9_]*` key already present in the file.

What it does, in order:

1. Snapshots current env to `/opt/crontech/.env.production.bak-<UTC>`
   (mode 600).
2. Generates a fresh value (`hex 24` if the key name contains
   `PASSWORD`, otherwise `hex 32`).
3. Rewrites only the named line in place; all other lines byte-identical.
4. Restarts `crontech-api` and `crontech-web` (systemd first, Docker
   fallback).
5. Appends one line to `/var/log/crontech-secrets-rotation.log` with
   UTC timestamp, actor (`$SUDO_USER`), key name, backup path, service
   restart status. **The value is never logged.**

Audit log format (tab-separated):

```
<ts>	actor=<user>	key=<KEY>	backup=<path>	services=<list>	status=<restarted|restart-failed:*|restart-skipped:*>
```

## Verify (pre-deploy CI gate)

```bash
bash scripts/secrets-verify.sh
```

Prints a `[v]` / `[x]` status table per required key and checks that
the file is mode `600`. Exit `0` = all green, `1` = at least one of
the following: missing key, empty value, placeholder still present,
wrong file mode. **Values are never printed.**

Required keys currently enforced:

- `CRONTECH_DOMAIN`, `ACME_EMAIL`
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `SESSION_SECRET`, `JWT_SECRET`
- `EMAIL_FROM`

## Recovery

Backups live next to the env file:

```
/opt/crontech/.env.production.bak-YYYYMMDDTHHMMSSZ
```

To roll back the last rotation:

```bash
sudo ls -lt /opt/crontech/.env.production.bak-* | head -n 5
sudo cp /opt/crontech/.env.production.bak-<TS> /opt/crontech/.env.production
sudo chmod 600 /opt/crontech/.env.production
sudo chown deploy:deploy /opt/crontech/.env.production
sudo systemctl restart crontech-api crontech-web \
  || sudo docker restart crontech-api crontech-web
bash scripts/secrets-verify.sh
```

Prune old backups on a schedule (e.g. keep last 10):

```bash
sudo ls -1t /opt/crontech/.env.production.bak-* | tail -n +11 | xargs -r sudo rm --
```

## Security notes

- File mode is `600`, owner `deploy:deploy`. `secrets-verify.sh` fails
  if the mode drifts.
- Backups inherit mode `600`. Don't copy them to shared storage.
- `/var/log/crontech-secrets-rotation.log` is created mode `640`.
  Consider rotating it via `logrotate` alongside other system logs.
- **Never commit `.env.production`.** The current `.gitignore` covers
  `.env`, `.env.local`, and `.env.*.local`, but the literal filename
  `.env.production` is NOT matched by those globs. Add an explicit
  `.env.production` line to `.gitignore` if you haven't already, and
  double-check with:

  ```bash
  git check-ignore -v .env.production
  ```

- Secrets are generated with `openssl rand -hex`. If FIPS or HSM
  sourcing is later required, swap the generator inside
  `scripts/secrets-init.sh` and `scripts/secrets-rotate.sh` — no other
  caller depends on the generation method.
