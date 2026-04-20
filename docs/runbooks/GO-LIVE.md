# GO-LIVE Runbook — Crontech Empire

**One paste. Empire live.** Tomorrow morning, Craig pastes one command on the Vultr box and this runbook chains every bring-up step into a single idempotent run.

---

## Prereqs

Set these env vars in your shell **before** running (the master script skips phases whose vars are unset, so a partial run is still useful):

| Var | Required by | Purpose |
|---|---|---|
| `DATABASE_URL` | Phase 4 (GLUECRON) | Postgres URL for gluecron app |
| `CF_API_TOKEN` | Phase 3 (DNS) | Cloudflare API token for DNS records |
| `GLUECRON_TOKEN` | Phase 5 (MIRROR) | Gitea/Gluecron API token for repo mirroring |
| `HEALTH_CHECK_TOKEN` | Phase 6 (HEALTH, optional) | Bearer for `/api/healthz/empire` |

Example:
```bash
export DATABASE_URL='postgres://...'
export CF_API_TOKEN='cf_...'
export GLUECRON_TOKEN='gl_...'
export HEALTH_CHECK_TOKEN='hc_...'
```

Secrets are redacted from log output (`token=***REDACTED***`).

---

## The Single Command

```bash
cd /opt/crontech && git pull && sudo -E bash scripts/go-live.sh
```

Dry-run first if you want to see what will happen:
```bash
sudo -E bash scripts/go-live.sh --dry-run
```

Exit codes: `0` green, `1` any phase red, `2` yellow only.

---

## Phases (what each does)

1. **SANITY** — checks root, Ubuntu 22.04+, `/opt/crontech` (clones if missing), prints missing env vars.
2. **OUTAGE_FIX** — `git checkout Main && git pull`, runs `scripts/fix-website-access.sh`, smoke-tests crontech.ai locally.
3. **DNS** (skipped if `CF_API_TOKEN` unset) — runs `scripts/add-dns-gluecron.sh` to ensure Cloudflare records point at the box.
4. **GLUECRON** (skipped if `DATABASE_URL` unset) — runs `scripts/add-gluecron.sh`, waits up to 60s for `:3002`, smoke-tests gluecron.com.
5. **MIRROR** (skipped if `GLUECRON_TOKEN` unset) — mirrors and verifies `crontech`, `gluecron.com`, `gatetest` into the self-hosted Gluecron.
6. **HEALTH** — GETs `/api/healthz/empire`, parses per-component status, prints the table + public URLs.

Each phase is wrapped so a single failure does **not** abort the remaining phases — you always get the full picture.

---

## What Success Looks Like

```
=== SUMMARY ===
  SANITY       OK
  OUTAGE_FIX   OK
  DNS          OK
  GLUECRON     OK
  MIRROR       OK
  HEALTH       OK

[OK]   empire is LIVE
```
Then open https://crontech.ai and https://gluecron.com in a browser — both should render.

---

## Prereq scripts (where they live today)

The master script expects these siblings in `scripts/`. If a script is missing, its phase logs `script X not found, skipping phase Y` and continues.

| Script | Status | Branch if not yet on Main |
|---|---|---|
| `scripts/fix-website-access.sh` | on Main | — |
| `scripts/add-dns-gluecron.sh` | shipping | sibling agent PR |
| `scripts/add-gluecron.sh` | shipping | sibling agent PR |
| `scripts/mirror-to-gluecron.sh` | shipped | `claude/mirror-crontech-into-gluecron` |
| `scripts/verify-gluecron-mirror.sh` | shipped | `claude/mirror-crontech-into-gluecron` |

Before the paste, merge (or cherry-pick) the prereq branches into `Main` so `git pull` in step 1 of the one-liner picks them up.

---

## Phase-by-phase troubleshooting

### Phase 1: SANITY fails
- "must run as root" → prepend `sudo -E` (the `-E` preserves your env vars).
- "Ubuntu ${v} < 22.04" → box is too old; upgrade or skip by patching the `phase_sanity` check.
- Clone fails → check network + `REPO_URL` env var override.

### Phase 2: OUTAGE_FIX fails
- `git pull` rejects → `cd /opt/crontech && git status` — likely local changes; stash or reset.
- `fix-website-access.sh` errors → tail its log inline; rerun manually: `bash scripts/fix-website-access.sh`.
- Smoke test HTTP != 2xx/3xx → `journalctl -u nginx -n 50` and `systemctl status crontech-web`.

### Phase 3: DNS fails
- 403 from Cloudflare → `CF_API_TOKEN` scope wrong (needs Zone:DNS:Edit).
- Record conflict → delete the stale A record in Cloudflare UI, rerun.
- Script not found → sibling DNS agent PR not merged yet; merge it and rerun.

### Phase 4: GLUECRON fails
- `:3002` never responds → `systemctl status gluecron` / `journalctl -u gluecron -n 100`.
- DB migration error → confirm `DATABASE_URL` reachable: `psql "$DATABASE_URL" -c 'select 1'`.
- Public smoke test yellow → DNS still propagating; wait 2-3 min and rerun Phase 6 only.

### Phase 5: MIRROR fails
- 401 from Gluecron → rotate `GLUECRON_TOKEN`, re-export, rerun.
- "repo already exists" → mirroring is idempotent; the verify step is what matters — check its output.
- Partial (e.g. 2 of 3 repos) → the failing repo's log is inline; rerun just that repo: `TARGET_REPO=crontech/<name> bash scripts/mirror-to-gluecron.sh`.

### Phase 6: HEALTH red
- HTTP 401 → set/refresh `HEALTH_CHECK_TOKEN`.
- HTTP 502/503 → web tier down; rerun Phase 2.
- Component "red" in body → open that component's logs: `journalctl -u <component> -n 200`, fix, rerun.

---

## Rerunning

Every phase is idempotent — if Phase 4 fails, fix, rerun the whole command. Already-done work short-circuits.

---

## Kill-switch

If something catastrophic happens mid-run, Ctrl-C is safe: the script uses `set -euo pipefail` inside each phase but wraps phases so a Ctrl-C aborts cleanly without leaving half-written state (every child script is itself idempotent).
