# Self-Sufficiency Scoreboard

> **One-page answer to "where are we on getting Crontech off every
> third-party platform it doesn't need."** Updated as state changes.
>
> Companion: `docs/SELF_HOSTED_CUTOVER.md` (the runbook),
> `docs/TONIGHT_CHEAT_SHEET.md` (the copy-paste commands),
> `docs/BUILD_BIBLE.md` (the block tracker), `HANDOFF.md` (session state).

## Legend

- ✅ **on us** — runs on our infrastructure, no dependency
- 🟡 **in flight** — code/tooling ready, execution pending
- 🔴 **off us** — still on a third party
- ⚪ **intentional** — third-party by design (ICANN, AI providers, etc.)

## Scoreboard

| Axis | Current | Target | Blocker | Owner |
|---|---|---|---|---|
| **Compute (web/api)** | 🟡 running on `45.76.21.235` (old VPS) | bare-metal `45.76.171.37` via systemd | Step 4–5 of TONIGHT_CHEAT_SHEET — run `bare-metal-migrate.sh` + verify | Craig (SSH) |
| **Reverse proxy + TLS** | 🟡 Caddy ready at `infra/caddy/Caddyfile` | Caddy on new box with Let's Encrypt | Box has to receive traffic first (needs DNS flip) | Craig (SSH + DNS) |
| **Postgres (data)** | 🟡 mixed — some on Neon, provisioner ready for self-host | self-hosted PG 16 via `postgres.service` | Run `bare-metal-setup.sh` on new box then `bare-metal-migrate.sh` for data | Craig (SSH) |
| **Vector DB (Qdrant)** | ✅ self-hosted (docker-compose.production.yml) | — | — | done |
| **Container runtime** | ✅ Docker on the metal box | — | — | done |
| **Deploy pipeline (BLK-009)** | 🟡 merged-ready in PR #163 | sandbox-wrapped git-push build+deploy | Merge PR #163 | Craig (merge button) |
| **CI** | 🟡 Woodpecker self-hosted config committed (`.woodpecker.yml`), GitHub Actions still primary | Woodpecker fed by Gluecron webhooks | Gluecron live + Woodpecker fired up via `scripts/setup-woodpecker.sh` | Craig (SSH after gluecron live) |
| **Git host** | 🔴 GitHub (`ccantynz-alt/Crontech`) | `gluecron.crontech.ai` | Gluecron live + `scripts/mirror-repos-to-gluecron.sh` | depends on gluecron.com being live |
| **DNS resolver** | 🔴 Cloudflare | self-hosted DNS via `dns-server.service` | Run `import-all-cloudflare-zones.ts` then flip nameservers at registrar | Craig (registrar UI) |
| **DNS edge (CDN/proxy)** | 🟡 Cloudflare "DNS only" (grey cloud) — not proxying | direct → Caddy | Just flip A-records to `45.76.171.37` (TONIGHT_CHEAT_SHEET step 6) | Craig (Cloudflare UI) |
| **Observability (BLK-014)** | 🟡 LGTM stack + dashboard merged-ready in PR #163 | OTel → Loki/Tempo/Mimir → Grafana | Merge PR #163, then `--profile observability` on compose | Craig (merge), then SSH |
| **Sentinel monitoring (BLK-015)** | 🟡 systemd timer + Slack alerter merged-ready in PR #163 | 15-min oneshot with dead-man's switch | Merge PR #163, then install systemd units from `infra/systemd/` | Craig (merge), then SSH |
| **Backups** | 🟡 `scripts/backup-postgres.sh` + `install-backup-cron.sh` exist | daily PG dumps + repo snapshots | Run `install-backup-cron.sh` on new box after migrate | Craig (SSH) |
| **Server hardening** | 🟡 `scripts/harden-ubuntu.sh` exists | ufw + fail2ban + unattended-upgrades | Run once during box setup | Craig (SSH) |
| **Secrets management** | ✅ `.env.production` + `scripts/secrets-{init,rotate,verify}.sh` | — | — | done |
| **Auth** | ✅ self-hosted (passkeys + Google OAuth + u/p) | — | Google is optional — users can stick to passkeys | done |
| **Email outbound** | 🟡 via AlecRae API (our own) + Resend fallback | AlecRae as primary | AlecRae box provisioned; just set `ALECRAE_API_URL` | Craig |
| **Vercel** | 🔴 `vercel.json` still in repo | removed | Post-gluecron-live scrub | Claude (on signal) |
| **GitHub Actions workflows** | 🔴 primary CI | disabled, Woodpecker primary | Gluecron live + Woodpecker verified | Claude (on signal) |
| **Anthropic / OpenAI API** | ⚪ external AI providers | intentional | — | by design |
| **Let's Encrypt** | ⚪ ACME CA | intentional | — | by design |
| **Domain registrar** | ⚪ ICANN-mandated third party | intentional | — | by design |
| **Vultr (VPS hardware)** | ⚪ hardware provider | intentional (ours until we rack metal) | — | by design |

## Summary

- **✅ on us**: 6 axes — auth, secrets, vector DB, container runtime, docs/infra scripts, most of the backend stack
- **🟡 in flight**: 11 axes — code is written, merged or merge-ready. Blocked on Craig actions (merge PR #163, SSH to new box, DNS flip, registrar flip)
- **🔴 off us still**: 3 axes — GitHub as source-of-truth, GitHub Actions as primary CI, Cloudflare as DNS resolver. All three are blocked on gluecron.com going live first.
- **⚪ intentional external**: 4 — AI providers, ACME CA, domain registrar, VPS hardware. Not fixing these; they're the commodity layer.

## What unblocks each remaining item

### Sequence (do in order; each unblocks the next)

1. **Get gluecron.com live** on the metal box. `docker compose up -d` after filling `.env` with `DATABASE_URL`. (See `Gluecron.com/DEPLOY_METAL.md`.)
2. **Merge Crontech PR #163**. Flips BLK-009 / BLK-014 / BLK-015 → ✅ SHIPPED in `docs/BUILD_BIBLE.md`.
3. **Run `scripts/bare-metal-migrate.sh`** from the OLD VPS (`45.76.21.235`) targeting the NEW box (`45.76.171.37`). See `docs/TONIGHT_CHEAT_SHEET.md` step 4.
4. **Flip Cloudflare A-records** for `crontech.ai`, `www.crontech.ai`, `api.crontech.ai` to `45.76.171.37`. Keep "DNS only". (Step 6 of the cheat sheet.)
5. **Mirror Crontech + AlecRae repos to gluecron** via `scripts/mirror-repos-to-gluecron.sh`. Now git is on us.
6. **Fire up Woodpecker** via `scripts/setup-woodpecker.sh`. Now CI is on us.
7. **Import Cloudflare zones** via `bun run scripts/import-all-cloudflare-zones.ts --token=$CF_API_TOKEN`, then flip nameservers at registrar. Now DNS is on us.
8. **Post-gluecron-live scrub**: delete `vercel.json`, `.github/workflows/*` deploy actions, competitor refs across all three repos. (Per HANDOFF.md "POST-GLUECRON-LIVE DIRECTIVE".)

After step 8: self-sufficiency is at the "~75% ceiling" Craig called out in `docs/SELF_HOSTED_CUTOVER.md` — everything except the four intentional externals.

## Cost of doing nothing

None of this needs to be done in one sitting. The old VPS keeps serving. The gluecron deploy bits on `claude/new-session-xk1l7` of `Gluecron.com` just wait. PR #163 just waits. Every item above has a rollback. The cheapest failure mode is "pause and come back" — not "rush the cutover."
