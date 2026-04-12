# Phase 0 Bootstrap — Hetzner Box Provisioning

**Purpose:** Script-driven bootstrap of the Hetzner box for Crontech Phase 0.
**Status:** Ready to run the moment Craig hands over the Hetzner IP.
**Referenced by:** `docs/strategy/MIGRATION-PLAN.md` §3 Week 0.

---

## Preconditions (must be true before running)

1. **Hetzner box provisioned.** Craig has ordered and received access to a Hetzner AX41 or AX102 dedicated server.
2. **IP address known.** Craig has shared the public IPv4 address with the session.
3. **SSH key installed.** The bootstrap runner (Craig's machine or a trusted CI) has SSH access as root.
4. **Domain DNS authority transferred.** Cloudflare DNS (or Bunny DNS) is set as authoritative for the primary domain. NOT Vercel managed DNS. See `docs/strategy/COMPETITOR-FREE-STACK.md` §3.
5. **`docs/strategy/COMPETITOR-FREE-STACK.md` §5 bridges are acknowledged.** Vercel and Cloudflare Pages are still live during the 72-hour parallel window.

## What the bootstrap does

1. Updates base system, sets timezone, locale, hostname
2. Configures UFW firewall (22, 80, 443 only)
3. Installs Caddy (reverse proxy + TLS)
4. Installs Postgres 17 with pgvector extension
5. Installs Redis 8
6. Installs MinIO (object storage)
7. Installs Ollama (local LLM inference)
8. Sets up systemd units for each service
9. Sets up nightly borgbackup to a second Hetzner storage box
10. Configures unattended-upgrades for security patches only
11. Installs Bun runtime for Node/TypeScript apps
12. Installs Docker for polyglot runtime host (Python containers)
13. Installs age for secrets encryption
14. Sets up the Grafana LGTM observability stack
15. Deploys a throwaway test app to verify `git push` → live deploy works
16. Verifies TLS is auto-renewing via Caddy
17. Verifies health check automation

## Exit criteria (per MIGRATION-PLAN.md §3 Week 0)

- A throwaway test app deploys from `git push` → live on Hetzner in under 5 minutes
- TLS valid, auto-renewing via Caddy
- Logs visible in Grafana without SSH
- Rollback command works (under 60 seconds)
- Health check automated

## Safety rules

- **Secrets are NEVER committed.** Use age-encrypted files stored in a private repo or a shared vault. See `docs/strategy/MIGRATION-PLAN.md` §3 Week 0.
- **No `.env` files in production.** Secrets must be age-encrypted and decrypted at runtime by the substrate layer.
- **Backups run before any production workload lands.** No data before backup is a doctrine breach.
- **No destructive operations without confirmation.** The script pauses before any irreversible step.
- **All bootstrap actions are logged** to `/var/log/crontech-bootstrap.log`.

## How to run

```bash
# On Craig's local machine (not on the Hetzner box)
cd infra/bootstrap
./phase-0.sh <HETZNER_IP> <SSH_USER>
```

The script will prompt for confirmation at each destructive step. If `CI=true` is set, it runs non-interactively but refuses to proceed past the first destructive step without an explicit `--yes-i-understand` flag.

## What happens next (Week 1+)

Once Phase 0 exit criteria are met, the migration plan kicks off:

- Week 1: MarcoReid.com dress rehearsal
- Week 2: emailed stack-identical dogfood
- Week 3: Astra polyglot proof + CFO engine
- Week 4: AI-Immigration-Compliance §5A proof
- Week 5: GateTest revenue-bearing migration
- Week 6: voice backend streaming AI stress test
- Week 7: Zoobicon thesis proof

See `docs/strategy/MIGRATION-PLAN.md` for the full sequence.

## Blockers to monitor

If any Phase 0 deliverable takes longer than 3 days, STOP and reassess. Phase 0 should be 1 week maximum. If substrate primitives need more work before Week 1 can start, delay the migration uniformly — do NOT rush.

## When the script fails

- Read `/var/log/crontech-bootstrap.log` first
- Check `systemctl status <service>` for any failing service
- Do NOT `rm -rf` anything as a shortcut
- If the failure is irrecoverable, reprovision the Hetzner box (new instance) rather than patching a broken state
- Document the failure in `HANDOFF.md` so the next session knows what to avoid

## Dependencies on Craig

- Hetzner IP address
- SSH access
- Confirmation that DNS authority has been transferred off Vercel
- Confirmation that no production data exists yet that could be accidentally destroyed
