# Phase E — Vultr Decommission Plan

Phase E is the final phase of the Crontech launch. It runs **24 hours after DNS cutover (Phase C) has succeeded** and the Cloudflare-hosted stack has been stable under real traffic.

This document is the careful, stepwise procedure for powering down the old Vultr server at `204.168.251.243`. Read it top to bottom before touching anything. Nothing in this procedure is reversible after Day +4.

---

## Pre-decom checklist

Complete **every** item below before powering anything down. If any check fails, stop and investigate — do not proceed.

### 1. DNS validation

- [ ] At least **24 hours** have elapsed since the Phase C DNS cutover.
- [ ] **Zero production traffic** has arrived at `204.168.251.243` in the last 6 hours.
- [ ] Confirm by inspecting the Vultr server's Nginx access logs:

```bash
ssh root@204.168.251.243 "tail -1000 /var/log/nginx/access.log | head -20"
```

Output should be empty, or contain only health checks / Cloudflare probes. Any real user request means DNS has not fully propagated — wait another 24h and re-check.

### 2. Backup everything

Take a **full backup** before powering the server down. You cannot recover from a missing backup.

- [ ] **Full disk image snapshot** via the Vultr dashboard → server → Snapshots → Take snapshot. Wait for it to complete before proceeding.
- [ ] **Postgres dump** — pull a final dump to local disk:

```bash
ssh root@204.168.251.243 'pg_dump -Fc crontech > /root/final-dump.dump'
scp root@204.168.251.243:/root/final-dump.dump ~/crontech-vultr-final-$(date +%Y%m%d).dump
```

- [ ] **Tarball of application files** — capture every path the app lived in (typical locations: `/opt/crontech`, `/var/www/crontech`, `/home/deploy/crontech`):

```bash
ssh root@204.168.251.243 'tar czf /root/app-files.tar.gz /opt/crontech /var/www/crontech 2>/dev/null'
scp root@204.168.251.243:/root/app-files.tar.gz ~/crontech-vultr-files-$(date +%Y%m%d).tar.gz
```

- [ ] **Env file copy** — pull the live env file and review for any secret that has not yet been migrated into Cloudflare Workers secrets / the Crontech secret store:

```bash
ssh root@204.168.251.243 'cat /etc/crontech/env' > ~/crontech-vultr-env-$(date +%Y%m%d).env
```

Open the file and diff against the Cloudflare secret inventory. Note anything missing and migrate before continuing.

- [ ] **Git remote verification** — make sure every branch on the server has been pushed to GitHub:

```bash
ssh root@204.168.251.243 'cd /opt/crontech && git remote -v && git branch -r'
```

Any local-only branches must be pushed before the server is deleted.

### 3. Export Postgres data to Neon

If the Vultr Postgres held any **production data** that is not already mirrored in Neon, restore the dump into Neon:

```bash
pg_restore -h <neon-host> -U <neon-user> -d crontech ~/crontech-vultr-final.dump
```

If all data on Vultr was dummy / test data, document that explicitly in the session log and skip the restore. Do not guess.

### 4. Verify backups are restorable

A backup you have not tested is not a backup.

- [ ] Download the Vultr snapshot artifact to local disk.
- [ ] Restore the Postgres dump into a local scratch database:

```bash
createdb crontech_restore_test
pg_restore -d crontech_restore_test ~/crontech-vultr-final-$(date +%Y%m%d).dump
```

- [ ] Spot-check row counts for the primary tables against production expectations. Any gap → stop and investigate.

### 5. Check external integrations pointing at the old IP

Every external system that still references `204.168.251.243` will break the moment the server goes dark. Audit each one.

- [ ] **Stripe webhook endpoints** — confirm every endpoint is `https://api.crontech.ai/api/stripe/webhook` (or equivalent on the new domain), not the old Vultr IP.
- [ ] **Sentry ingestion** — should hit the Sentry cloud DSN directly, not be routed through Vultr.
- [ ] **Google OAuth redirect URIs** — must be `https://crontech.ai/auth/callback`, not the old IP. Update in Google Cloud Console.
- [ ] **Microsoft / Entra OAuth redirect URIs** — same check, update in Azure.
- [ ] **External monitoring** (Pingdom, UptimeRobot, Better Stack, etc.) pointing at `204.168.251.243` — update targets to the new domain or disable the old checks.
- [ ] **MX / email** — if `crontech.ai` had MX records pointing at Vultr, the mailbox must move to a hosted provider (Google Workspace, Fastmail, Zoho, or Cloudflare Email Routing) **before** the server goes down. Email outages on launch day are avoidable; do not cause one.

---

## The decom procedure

Stepwise, with a rollback window built in. Do not skip ahead.

| Day | Action |
|-----|--------|
| **Day 0** | DNS cutover (Phase C) — already complete before this doc starts. |
| **Day +1** | Power **OFF** the Vultr server via the Vultr dashboard. **Do not delete.** Just power off. Monitor the new Cloudflare-hosted stack for 72 hours. |
| **Day +4** | If nothing has broken on Cloudflare during the 72h window, **delete** the server from the Vultr dashboard. |
| **Day +5** | **Cancel** the Vultr subscription (only relevant if the server was a dedicated box with its own contract, not a Cloud instance). |
| **Day +5** | Verify final billing. Confirm the final invoice will be prorated correctly and that recurring charges stop. |

---

## Rollback window

- **Up to Day +4** (before the server is deleted): Craig can power the Vultr server back on from the dashboard and revert the DNS records to `204.168.251.243`. Full rollback takes ~15 minutes once the DNS change is made and TTLs expire.
- **After Day +4** (server deleted, snapshot still retained by Vultr): rollback requires redeploying from the snapshot. This is slower — allow several hours — but is still possible for as long as Vultr retains the snapshot (typically **30 days** from the date it was taken).
- **After snapshot purge** (usually 30 days post-deletion): rollback requires rebuilding from the local backups captured in the pre-decom checklist. Treat this as a cold-start, not a rollback.

---

## Estimated cost saving

A Vultr dedicated server runs **€40–€100 / month** depending on plan tier. Decommissioning returns:

- **€480–€1,200 / year** directly to Crontech runway.

That saving is Craig's reward for executing this procedure cleanly. Note it in the next CFO review.

---

## Strategic note

Once Vultr is gone, Crontech is running **entirely on Cloudflare's global edge** — Workers, D1, R2, KV, Durable Objects, and Pages. There is no centralized compute anywhere in the stack.

This is a milestone worth flagging publicly and internally:

> Crontech is now a pure edge-native platform with no centralized compute.

The next self-hosted-dependency milestone after this is **Gluecon shipping** — removing the GitHub dependency from the build and deploy path. Vultr going dark is the first half of that story; Gluecon is the second.
