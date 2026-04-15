# HANDOFF — next session MUST start here

**Date of handoff:** 2026-04-15 (updated mid-session)
**Handed off by:** session on `claude/admin-custom-ai-api-pDjEV`
**Read this before anything else per CLAUDE.md §0.0.**

---

## 🔴 P0 — production outage is BROADER than previously thought

Re-verified at ~07:54 UTC and again at ~08:26 UTC:

```
crontech.ai         → HTTP 403  x-deny-reason: host_not_allowed
www.crontech.ai     → HTTP 403  Host not in allowlist
api.crontech.ai/*   → HTTP 403
```

**New finding (this session):** every tenant on the Hetzner box
returns the same 403 — not just crontech.ai:

| Host header | Result |
|---|---|
| `crontech.ai` / `www` / `api` | 403 `Host not in allowlist` |
| `emailed.dev` | 403 |
| `gatetest.io` | 403 |
| `zoobicon.com` | 403 |
| `localhost` | 403 |
| bare IP `204.168.251.243` | 403 |

The entire box is down, not a per-tenant allowlist slip. Something is
sitting in front of our host-installed Caddy (`infra/hetzner/Caddyfile.crontech`)
and rejecting 100% of traffic with body `Host not in allowlist`. The
string `host_not_allowed` is NOT in the repo (confirmed via grep).
Candidates: a misdeployed container bound to :443, a WAF flipped to
deny-by-default, or Caddy crashed and systemd started a fallback.

### SSH access from the agent sandbox is FIREWALLED

Port 22 on 204.168.251.243 times out from the agent environment
(likely an IP allow-list on the Hetzner Cloud Firewall restricting SSH
to the GitHub Actions runner and Craig's home IP). Port 443 reaches
the host fine. **Any SSH-based diagnosis must go through Craig or
through a GitHub Actions workflow that uses `DEPLOY_SSH_KEY`.**

### State of diagnosis at handoff

Craig authorized (2026-04-15 in-chat) "SSH in, I diagnose + fix" — but
because SSH is blocked, the fallback path activated:
Craig is running a recon script I provided and pasting output back.
**As of this handoff the recon output has not yet been pasted** (Craig
pasted the script itself back, probably by accident). Next agent
should ask Craig for the actual output of the 10-section recon script
(Sections 1–10, ss/docker/systemctl/caddyfile/admin-api/journal/grep/ls/curl/find).
The full script is in the chat history on this branch.

### What the next agent MUST do (in order)

1. Re-verify all three URLs with `curl -sSI` — if they're 200, state
   of the world has changed.
2. If still 403, ask Craig for the recon output (he was in the middle
   of running it when the prior session ended).
3. Do NOT SSH (it's blocked); do NOT touch Cloudflare; do NOT touch
   `infra/hetzner/` without Craig's explicit in-chat "go". §0.7 hard
   gate — shared infra.
4. Based on recon output, identify the process on :443 and propose a
   single surgical fix. Wait for Craig's "go". Then have Craig (or a
   GH Actions workflow) execute.

---

## Session state at handoff

### What this session shipped

- Onboarding polish (committed this session):
  - `apps/web/src/routes/register.tsx` — parses `?plan=` and
    `?billing=` from the URL. Pro/Enterprise callouts show the right
    price + next step. Pending plan is stored in `localStorage`
    (`btf_pending_plan`) and post-signup redirects to
    `/billing?upgrade=pro` when plan is Pro. Google OAuth redirect is
    plan-aware (no localStorage round-trip).
  - Quality gates: `check` ✅ 16/16, `check-links` ✅, `check-buttons`
    ✅, `biome check apps/web` ✅.

### ⚠️ REVERSAL — `vercel.json` is NOT stale, do NOT delete it

Mid-session, Craig revealed a screenshot of Crontech loading on a
Vercel deploy. The prior session's agent #3 was WRONG that Vercel is
unused. The real setup appears to be **dual-deploy**: Vercel + Hetzner
both serve copies, and Craig is observing a **version mismatch
between the Vercel copy and "live"** (live = Hetzner, which is 403).
The onboarding-polish BG agent had deleted `vercel.json` thinking it
was stale; this was restored before commit. Next agent MUST NOT delete
it and should diagnose what URL Craig is viewing on Vercel and the
DNS situation (crontech.ai CNAME target + which Vercel project owns
the build).

### Background agents still running at handoff

Two agents were spawned in isolated git worktrees and had not yet
reported at handoff time:

- **BLK-009** — GitHub webhook receiver scaffold (Hono route,
  signature verification, `build_jobs` + `github_installations` Drizzle
  tables, tests). Worktree: `.claude/worktrees/agent-a43d05e1`.
- **BLK-010** — Usage metering scaffold (`usage_events` table,
  `usage.record` + `usage.getMonthlyUsage` tRPC procs, tests).
  Worktree: `.claude/worktrees/agent-a1848438`.

Next agent should check both worktrees for completed work, verify
quality gates, and cherry-pick onto this branch if the work is clean.
Both are SCHEMA-ADDITIVE only (no destructive migrations) so they're
safe to merge into the main tree.

### Commits on this branch (newest last)

- `7e2959b feat(BLK-020): scope Admin Claude Console + usage stats +
  totalCost fix` — prior session
- (this session) onboarding polish + stale vercel.json removal +
  HANDOFF update

Branch is NOT merged to main. No PR opened (Craig has not asked).

### Craig's locked priority order

After the 403 is resolved:

1. **BLK-010 — Stripe metered billing** (revenue gate). ~60% done;
   critical gap = usage metering + dunning. BG agent scaffolded this.
2. **BLK-009 — Git-push deploy pipeline for customer repos**. ~20%
   stub; webhook receiver scaffolded by BG agent.
3. Onboarding-flow polish (register `?plan` wiring ✅ this session).
4. Resume BLK-020 — Admin Claude Console.

---

## SESSION_LOG

### 2026-04-15 (continued) — `claude/admin-custom-ai-api-pDjEV`

- **Branch**: `claude/admin-custom-ai-api-pDjEV`
- **Blocks advanced**:
  - Onboarding-flow polish (no BLK — part of broader onboarding work):
    `/register` query-param wiring + stale `vercel.json` removal. ✅
    Shipped.
  - BLK-009 webhook scaffold — in-flight agent.
  - BLK-010 usage metering scaffold — in-flight agent.
- **Files touched**:
  - `apps/web/src/routes/register.tsx` (+110/-4 lines)
  - `vercel.json` (BG agent tried to delete — reverted; Vercel IS active)
  - `HANDOFF.md` (rewrite)
- **Craig authorizations granted (this session)**:
  - "SSH in, I diagnose + fix" for the 403 — delivered via
    AskUserQuestion, answer "SSH in, I diagnose + fix (Recommended)".
    SSH was firewalled from the sandbox → fell back to Craig-runs-recon
    path.
  - "Get extra agents on it now while you carry on" — parallel-agent
    spawn authorized. 3 agents launched (BLK-009 / BLK-010 / onboarding
    polish).
- **Open issues for next agent**:
  - **P0**: box-wide 403 on 204.168.251.243 — recon output still
    needed from Craig.
  - BG agent worktrees need to be reviewed and merged if clean.
- **Handoff line**: *Next agent should ask Craig for the recon-script
  output, and (in parallel) review the two running worktree agents for
  cherry-pickable schema/tRPC scaffolds.*

### 2026-04-15 — `claude/admin-custom-ai-api-pDjEV` (earlier in session)

- Scoped BLK-020 Admin Claude Console, added `chat.getUsageStats` +
  totalCost fix. Committed as `7e2959b`. Paused UI work on Craig's
  pivot to website-first.
- Discovered the 403 problem during pivot diagnosis.
