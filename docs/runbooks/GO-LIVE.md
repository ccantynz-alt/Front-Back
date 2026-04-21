# GO-LIVE Runbook — Crontech Empire (bare-metal)

**One paste. Empire live.** The stack is **systemd + bare-metal** — Caddy is the apt package, `crontech-web` and `crontech-api` are systemd units running out of `/opt/crontech`, Postgres is local systemd. No docker.

---

## Prereqs

On the box, first time only:

```bash
apt update && apt install -y caddy git curl postgresql
curl -fsSL https://bun.sh/install | bash
```

Then set env vars (all optional — phases auto-skip if unset):

| Var | Required by | Purpose |
|---|---|---|
| `CF_API_TOKEN` | Phase 6 (DNS) | Cloudflare API token, Zone:DNS:Edit |
| `GLUECRON_TOKEN` | Phase 7 (MIRROR) | Gitea/Gluecron API token for mirroring |
| `HEALTH_CHECK_TOKEN` | Phase 8 (HEALTH, optional) | Bearer for `/api/healthz/empire` |

Secrets are redacted from log output (`token=***REDACTED***`).

---

## The Single Command

```bash
cd /opt/crontech && git pull && sudo -E bash scripts/go-live.sh
```

Dry-run first:
```bash
sudo -E bash scripts/go-live.sh --dry-run
```

Exit codes: `0` green, `1` any phase red, `2` yellow only.

---

## Phases

1. **SANITY** — checks root, required binaries (`bun git caddy systemctl curl`), `/opt/crontech` (clones if missing), postgres systemd active, reports unset optional env.
2. **OUTAGE_FIX** — `git pull Main`, `bun install`, `bun run build` (produces `dist/`; without this vinxi is missing), `bun add @libsql/linux-x64-gnu` in `apps/api` (native binary), create + `chown -R caddy:caddy /var/log/caddy` (else caddy fails to start).
3. **CADDY** — `cp infra/caddy/Caddyfile /etc/caddy/Caddyfile`, `caddy validate`, `systemctl restart caddy` (**not reload** — admin API is off on this box), verify `is-active`.
4. **SERVICES** — `systemctl restart crontech-web crontech-api`, verify both active, curl `:3000` and `:3001`.
5. **GLUECRON** (skipped if PR #143 `scripts/fix-gluecron-service.sh` absent) — runs the fix script to repair broken `ExecStart` (points at `apps/api` which doesn't exist), verifies service active.
6. **DNS** (skipped if `CF_API_TOKEN` unset) — runs `scripts/add-dns-gluecron.sh`.
7. **MIRROR** (skipped if `GLUECRON_TOKEN` unset) — mirrors `crontech`, `gluecron.com`, `gatetest` into self-hosted Gluecron via `scripts/mirror-to-gluecron.sh` + `verify-gluecron-mirror.sh`.
8. **HEALTH** — status table: `web / api / caddy / gluecron / postgres / certs`, plus optional `/api/healthz/empire` GET if `HEALTH_CHECK_TOKEN` set.

Each phase is wrapped so a single failure does **not** abort the remaining phases — you always get the full picture.

---

## What Success Looks Like

```
=== SUMMARY ===
  SANITY       OK
  OUTAGE_FIX   OK
  CADDY        OK
  SERVICES     OK
  GLUECRON     OK
  DNS          OK
  MIRROR       OK
  HEALTH       OK

[OK]   empire is LIVE
```

Then open https://crontech.ai and https://gluecron.com — both should render.

---

## Related PRs

- **PR #143** — fixes broken `gluecron.service` `ExecStart` (the unit on disk points at `apps/api` which doesn't exist). Phase 5 auto-skips until merged.
- **PR #144** — fixes `Caddyfile` upstreams from docker names (`web:3000` / `api:3001`) to `localhost`. Merge before Phase 3 actually helps.

---

## Phase-by-phase troubleshooting

### Phase 1: SANITY
- "missing required binaries" → `apt install -y caddy git curl`; bun: `curl -fsSL https://bun.sh/install | bash`.
- "postgresql not active" → `systemctl start postgresql`.

### Phase 2: OUTAGE_FIX
- `bun install` fails → clear cache: `rm -rf /opt/crontech/node_modules && bun install`.
- `bun run build` fails with "vinxi not found" → Phase 2 hasn't finished or `node_modules` is stale; rerun.
- `@libsql/linux-x64-gnu` add fails → check `apps/api/package.json` exists; confirm network.
- Caddy log dir chown fails → confirm `caddy` user exists: `getent passwd caddy`.

### Phase 3: CADDY
- `caddy validate` errors → Caddyfile references `web:3000` instead of `localhost:3000` (needs PR #144).
- `systemctl restart caddy` fails → `journalctl -u caddy -n 50`; most often `/var/log/caddy` perms (redo Phase 2) or port 80/443 in use.

### Phase 4: SERVICES
- `crontech-web` fails: "vinxi not found" → Phase 2 `bun run build` didn't run; rerun whole script.
- `crontech-api` fails: libsql native error → rerun Phase 2 (adds `@libsql/linux-x64-gnu`).
- `:3000` / `:3001` curl fails despite `is-active` → tail `journalctl -u crontech-web -n 100`.

### Phase 5: GLUECRON
- Phase auto-skips with "PR #143 not merged yet" → merge PR #143 and rerun.
- Service still inactive after fix → `journalctl -u gluecron -n 100`; usually `DATABASE_URL` in the unit's `Environment=`.

### Phase 6: DNS
- 403 from Cloudflare → token scope wrong (needs Zone:DNS:Edit).
- Record conflict → delete stale A record in Cloudflare UI, rerun.

### Phase 7: MIRROR
- 401 from Gluecron → rotate `GLUECRON_TOKEN`, re-export, rerun.
- Partial (e.g. 2 of 3 repos) → rerun just that repo: `TARGET_REPO=crontech/<name> bash scripts/mirror-to-gluecron.sh`.

### Phase 8: HEALTH
- `certs` degraded → Caddy hasn't issued yet; wait 60s after first Caddy start, rerun.
- `gluecron` degraded "unit not installed" → merge PR #143.
- HTTP 401 on healthz body → set `HEALTH_CHECK_TOKEN`.

---

## Rerunning

Every phase is idempotent. Fix, rerun the whole command. Already-done work short-circuits (git pull fast-forwards, bun install is cached, systemctl restart is cheap).

---

## Kill-switch

Ctrl-C mid-run is safe: every phase is idempotent and `set -euo pipefail` aborts cleanly without half-written state.
