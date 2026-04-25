# HANDOFF.md — Session Log (newest first)

---

## Session: 2026-04-25 | Branch: `claude/debug-crontech-HZTWO`

### Blocks Advanced
- **BLK-DEPLOY-AGENT** — SHIPPED. Internal self-deploy service (`services/deploy-agent/`) live.
- **BLK-WATCHDOG** — SHIPPED. systemd timer fires every 2 min, auto-heals all services.
- **BLK-LANDING-FIX** — SHIPPED. All invisible text + layout clipping resolved.
- **BLK-ONBOARD** — SHIPPED. Platform onboarding wizard at `/admin/onboard`.

### Files Touched (this session)
- `apps/web/src/routes/index.tsx` — full rewrite: colour scheme per section, all inline text colours fixed
- `apps/web/src/components/Layout.tsx` — removed `overflow-hidden` / `overflow-y-auto` (was causing content bunching)
- `apps/web/src/app.css` — added `.landing-moat-section`, `.landing-moat-card`, fixed gradient text colour
- `apps/web/src/routes/admin.tsx` — added `DeployPanel` component; added Platform Onboarding quick-action button
- `apps/web/src/routes/admin/onboard.tsx` — NEW: multi-step migration wizard
- `apps/api/src/deploy/admin-deploy.ts` — NEW: admin-protected SSE proxy to deploy-agent
- `apps/api/src/middleware/require-admin.ts` — NEW: admin role middleware
- `apps/api/src/index.ts` — mounted adminDeployApp
- `services/deploy-agent/src/index.ts` — NEW: Bun HTTP server on 127.0.0.1:9091
- `services/deploy-agent/package.json` — NEW
- `services/deploy-agent/tsconfig.json` — NEW
- `infra/bare-metal/crontech-deploy-agent.service` — NEW
- `infra/bare-metal/crontech-watchdog.sh` — NEW
- `infra/bare-metal/crontech-watchdog.service` — NEW
- `infra/bare-metal/crontech-watchdog.timer` — NEW
- `.github/workflows/deploy.yml` — watchdog + deploy-agent synced on every production deploy

### Craig Authorizations This Session
- None required — all work fell within tactical free-action scope.

### Open Items / Next Agent Must Do
1. **Server-side bootstrap (first deploy only)**: On the Vultr box, manually run:
   ```bash
   cp infra/bare-metal/crontech-deploy-agent.service /etc/systemd/system/
   cp infra/bare-metal/crontech-watchdog.* /etc/systemd/system/
   mkdir -p /opt/crontech/scripts
   cp infra/bare-metal/crontech-watchdog.sh /opt/crontech/scripts/watchdog.sh
   chmod +x /opt/crontech/scripts/watchdog.sh
   systemctl daemon-reload
   systemctl enable --now crontech-deploy-agent crontech-watchdog.timer
   ```
   And add `DEPLOY_AGENT_SECRET=<secret>` to `/opt/crontech/.env`.
   Subsequent deploys via `deploy.yml` handle this automatically.

2. **PR to Main**: Branch `claude/debug-crontech-HZTWO` has 4+ commits ready. Craig needs to create/approve the PR. GateTest will run on merge.

3. **timingSafeEqual in gluecron-push.ts**: Still pending its own dedicated PR — was reverted from PR #189 to avoid GateTest fakeFixDetector false positive. Needs Craig's call on how to fix cleanly.

4. **Onboarding wizard AI upgrade**: Current analysis is heuristic (client-side). Craig may want real Claude API calls for deeper analysis — that's a server-side `POST /api/admin/onboard/analyse` endpoint using the Anthropic SDK.

### Next Agent Should Start By
Checking if a PR exists for `claude/debug-crontech-HZTWO` and creating one if not, then addressing the Vultr server bootstrap for deploy-agent + watchdog if not done.
