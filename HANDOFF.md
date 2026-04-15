# HANDOFF — next session MUST start here

**Date of handoff:** 2026-04-15 (late session)
**Handed off by:** session on `claude/admin-custom-ai-api-pDjEV`
**Read this before anything else per CLAUDE.md §0.0.**

---

## 🟢 BLK-020 Crontech Independence — merged to this branch

The old P0 403 on Hetzner is **no longer the path forward**. Prior
session on `claude/continue-work-X7reL` pivoted the stack off
Hetzner/SSH/Docker entirely and onto **Cloudflare Workers (API) +
Cloudflare Pages (web)**. This session merged that work into the
assigned branch `claude/admin-custom-ai-api-pDjEV` (merge commit
`38c1018`, nothing rebased, no force-push).

### What's on this branch now

- Live **Build Track HUD** with deploy-drift probe (`658c43f`)
- `Bun.password` → **hash-wasm argon2id** for Workers compat (`aa8b1d1`)
- `apps/api/wrangler.toml` with production/staging envs + stubbed
  D1/R2/KV/DO bindings (`58cc9fd`)
- `.github/workflows/deploy.yml` rewritten for Cloudflare Workers +
  Pages via `cloudflare/wrangler-action@v3` (`3a79d56`)
- Bun-only code guarded for Workers compat (`a0baf99`)
- `workerHandler` default export for cron triggers (`aa6a6cc`)
- `apps/web` ported to Cloudflare Pages Nitro preset (`e8a3a32`)
- `@ai-sdk/*` Vercel wrappers dropped → native `@anthropic-ai/sdk` +
  `openai` SDKs (`b1ad504`)
- Sentinel intelligence snapshot refresh (`1e8d827`)
- Obsolete `.github/workflows/hetzner-recon.yml` removed (`38c1018`)

All local quality gates: ✅ check (16/16) · ✅ check-links · ✅
check-buttons · ✅ biome. Pushed to `origin/claude/admin-custom-ai-api-pDjEV`.

---

## 🔴 Ball in Craig's court — two blockers for first CF deploy

Until these land, `deploy.yml` cannot complete a push to main:

### 1. GitHub repo secrets (required)

Set under **Settings → Secrets and variables → Actions → Repository
secrets** (or inside the `production` environment):

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | CF dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template. Scope: account-wide, with Pages + Workers Scripts + D1 + KV + R2 + Durable Objects edit. |
| `CLOUDFLARE_ACCOUNT_ID` | CF dashboard → any domain overview → right sidebar "Account ID". |

### 2. Cloudflare Pages project

Create a Pages project named **`crontech-web`** in the CF dashboard.
The deploy workflow calls `cloudflare/wrangler-action@v3` with
`projectName: crontech-web`. No build command is needed in the CF UI
— the Action uploads the pre-built `apps/web/dist` directory.

Once both land, next push to `main` will deploy end-to-end. To cut
this branch over, either:
- merge this PR to `main` (normal path), or
- run `workflow_dispatch` on the current branch once `deploy.yml`
  triggers are adjusted.

---

## Post-deploy punch list (session after this)

Once CF deploy is green, the remaining work to retire Hetzner fully:

1. **DNS cutover** — point `crontech.ai`, `www.crontech.ai`, and
   `api.crontech.ai` at the Cloudflare Workers/Pages targets.
   Currently the Cloudflare DNS records for all three point at the
   Hetzner IP `204.168.251.243` with proxy OFF. Flip:
   - `crontech.ai` + `www` → Pages project `crontech-web` custom domain
   - `api.crontech.ai` → Workers route for `apps/api`
2. **Verify `/api/version` reports the new SHA** via the Build Track
   HUD deploy-drift probe (admin-only, bottom-right of any page).
3. **Decommission Hetzner** — keep warm ~24h as rollback, then power
   the box down. Retain `infra/hetzner/` in git history only.
4. **Phase B prep** (Craig offered, not yet started):
   - Durable Objects for WebSocket / Yjs transport
   - BYOK UI (user-supplied API keys stored encrypted in D1)
   - WebGPU draft model stub for Zoobicon TTFT <100ms (BLK-021)
   - AI Gateway + BYOK caching layer (BLK-022)

---

## ⚠️ Background agent worktrees — still unmerged

Two agents from earlier in the day committed scaffolds to their own
branches (not this one):

- **BLK-009** — GitHub webhook receiver scaffold. Worktree:
  `.claude/worktrees/agent-a43d05e1`.
- **BLK-010** — Usage metering scaffold. Worktree:
  `.claude/worktrees/agent-a1848438`.

Both are SCHEMA-ADDITIVE only (no destructive migrations) so safe to
cherry-pick once the CF deploy is green and Craig unblocks revenue
work. See prior session log for detail.

---

## Craig's locked priority order

Once Crontech is live on Cloudflare:

1. **BLK-010 — Stripe metered billing** (revenue gate). ~60% done;
   critical gap = usage metering + dunning. BG agent scaffolded this.
2. **BLK-009 — Git-push deploy pipeline for customer repos**. ~20%
   stub; webhook receiver scaffolded by BG agent.
3. **BLK-020 — Admin Claude Console** UI (BYOK builder interface).
4. **BLK-021 — WebGPU draft model** for Zoobicon TTFT <100ms.
5. **BLK-022 — AI Gateway + BYOK** caching/fallback layer.

---

## SESSION_LOG

### 2026-04-15 (late) — `claude/admin-custom-ai-api-pDjEV`

- **Branch**: `claude/admin-custom-ai-api-pDjEV`
- **Blocks advanced**:
  - **BLK-020 Crontech Independence** — merged 9 commits from
    `claude/continue-work-X7reL` into the assigned dev branch.
    Hetzner deploy path removed. Cloudflare Workers + Pages path
    now the only deploy path. Status: advanced (merge in place;
    awaiting CF secrets + Pages project to actually deploy).
- **Files touched** (net result of merge):
  - `.github/workflows/deploy.yml` — Cloudflare-native rewrite
  - `.github/workflows/hetzner-recon.yml` — deleted (obsolete)
  - `apps/api/package.json` · `apps/api/src/ai/*` ·
    `apps/api/src/auth/password.ts` · `apps/api/src/index*.ts` ·
    `apps/api/src/smoke.test.ts` · `apps/api/src/telemetry.ts` ·
    `apps/api/src/trpc/procedures/voice.ts` · `apps/api/wrangler.toml`
  - `apps/web/app.config.ts` · `apps/web/public/sitemap.xml` ·
    `apps/web/src/app.tsx` · `apps/web/src/components/BuildTrack.tsx`
  - `bun.lock` · `packages/ai-core/**`
  - `services/sentinel/data/tracked-repos.json`
- **Craig authorizations granted (this session)**:
  - "If something needs to be done you just do it" — standing green
    light used to proceed with Option B (merge migration branch into
    assigned branch) without a second confirmation. Switching
    branches was never on the table because the system prompt pins
    this session to `claude/admin-custom-ai-api-pDjEV`.
- **Open issues for next agent**:
  - ⚠️ Awaiting Craig: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
    GitHub secrets, plus `crontech-web` Pages project creation.
  - ⚠️ DNS cutover for crontech.ai/www/api still pending (records
    still point at Hetzner `204.168.251.243`).
  - BG worktrees (BLK-009, BLK-010) still unmerged.
- **Handoff line**: *Next agent: confirm Craig has set the two CF
  secrets and created the `crontech-web` Pages project, then verify
  the next push to main triggers a green deploy. After that: DNS
  cutover, then Hetzner decom.*

### 2026-04-15 (continued) — earlier

- Merged in BLK-009 + BLK-010 BG-agent worktree commits into their
  own branches. Main tree clean. Recon diagnostic workflow delivered
  for 403 (`ac7e039` → `d7c9484`) — now obsolete and removed.

### 2026-04-15 — `claude/admin-custom-ai-api-pDjEV` (earliest)

- Scoped BLK-020 Admin Claude Console, added `chat.getUsageStats` +
  totalCost fix. Committed as `7e2959b`. Paused UI work on Craig's
  pivot to website-first.
- Discovered the 403 problem during pivot diagnosis (since resolved
  by retiring Hetzner entirely).
