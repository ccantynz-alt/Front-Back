# HANDOFF — Next Session Starts Here

**First action:** Review & merge PR #124 (BLK-020 frontend completion) once Craig signs off. After merge, flip BLK-020 from 🟡 BUILDING to ✅ SHIPPED in `docs/BUILD_BIBLE.md` (requires Craig's in-chat authorization per the Amending-this-file protocol). Then pick up the two open strategic decisions below.

---

## SESSION_LOG 2026-04-18 (branch: claude/review-crontech-handoff-qYEVq)

### Block advanced
- **BLK-020 Admin Claude Console** — shipped end-to-end frontend (PR #124). Exit criteria now met; ready to flip to ✅ SHIPPED on Craig's auth.

### Shipped this session
- **Commit `f975386`** / **PR #124**: complete BLK-020 frontend.
  - `apps/web/src/routes/admin/claude.tsx` — admin-only chat console. Streams via `POST /api/chat/stream`, conversation sidebar, Anthropic model picker, monthly-spend badge, inline missing-key CTA to settings. Local `ANTHROPIC_MODELS` mirror avoids dragging Mastra Node-only modules into the Vite client bundle.
  - `apps/web/src/routes/admin/claude/settings.tsx` — paste/mask/delete Anthropic API key via `chat.saveProviderKey` / `chat.deleteProviderKey`. Default-model + system-prompt persisted to localStorage (`btf:admin:claude:defaultModel`, `btf:admin:claude:systemPrompt`).
  - `apps/web/src/routes/admin.tsx` — 5th stat tile "Claude spend (this month)" from `chat.getUsageStats.monthCostDollars` + Claude Console quick-action.
  - Smoke tests for both new routes.
- All gates green locally: build 5/5, check 16/16, test 149/149, check-links 0 dead, check-buttons 0 dead, biome exit 0.

### Handoff-drift discovered
The previous `HANDOFF.md` was entirely obsolete by the time this session started:
- "First action" was "open PR #101 for `c388d22`" — PR #101 merged 2026-04-15 (LaunchChecklist HUD).
- Phase B (12 Cloudflare Worker secrets) — obsolete. PR #115 (2026-04-17) pivoted the stack *off* Cloudflare Workers/Pages and back onto **Vultr self-hosting** (Caddy + Bun + systemd + local SQLite at 45.76.21.235). `set-worker-secrets.yml` was deleted; `apps/api/wrangler.toml` no longer exists.
- Phase C (DNS cutover Vultr → Cloudflare) — inverted; DNS is now pointed at Vultr.
- Phase D/E (Vultr decommission) — moot; Vultr is the production host.

Moral: always verify git state before trusting a handoff's "first action."

### BLK-009 audit — not touched this session
BLK-009 (git-push deploy pipeline for customer repos) **is partially a façade.** Audited this session:
- ✅ GitHub webhook receiver with HMAC-SHA256 signature verification (`apps/api/src/github/webhook.ts`)
- ✅ `deployments` tRPC procs, DB log rows, SSE-ready pipeline
- ✅ Deployments UI (`apps/web/src/routes/deployments.tsx`), DeploymentCard, DeploymentLogs
- ⚠️ **Build runner is STUBBED** at `apps/api/src/automation/build-runner.ts` lines 8–14 ("intentionally stubbed"). No real `git clone`, no real `bun install`, no real `bun run build`, no real deploy. The UI is wired end-to-end but the engine is a placeholder.
- Subdomain architecture pivoted from `*.crontech.app` (BUILD_BIBLE spec) to `*.crontech.ai` in the actual code. BUILD_BIBLE amendment pending.
- Deploy target pivoted from Cloudflare Wrangler to Vultr Docker via `services/orchestrator/src/deployer.ts` (commits 4a43651, 907f08b).

**Next agent:** this is the real revenue unlock. Needs Craig's explicit auth to spawn the big build-runner work (real clone + build + Docker deploy + subdomain routing).

### Open PRs for Craig to decide
1. **PR #124** (this session) — BLK-020 frontend. Ready for review/merge. All local gates green.
2. **PR #102** — Dependabot: `actions/setup-node` v4→v6. Audited safe. Only used in GateTest workflows; no caching config affected; CI green.

### Craig's in-session directives (quoted verbatim)
- "Sorry to bother you I'm just checking in to make sure that we've kicked off and we're running with the ball as many agents as you can put on would be great" — standing parallel-agent green light.
- "I need sleep now can you promise me that you were gonna continue until this is completely finished and writing" + "That's meant to say and wired in" — authorization to drive BLK-020 to fully-wired completion + PR, which this session honored.

### Files touched this session
- `apps/web/src/routes/admin.tsx` (modified — 5th stat tile + Claude Console quick-action)
- `apps/web/src/routes/admin/claude.tsx` (new)
- `apps/web/src/routes/admin/claude.test.ts` (new)
- `apps/web/src/routes/admin/claude/settings.tsx` (new)
- `apps/web/src/routes/admin/claude/settings.test.ts` (new)
- `HANDOFF.md` (this file — rewritten)

### Session quirks to know about
- `Agent`'s `isolation: "worktree"` mode is NOT available in this sandbox (no git worktree support in the hook config). Agents ran without isolation; non-overlapping file scopes prevented collisions.
- The `~/.claude/stop-hook-git-check.sh` hook automatically `git stash`es uncommitted work when a stop event fires. During this session, agent α's freshly-created (un-added) files got stashed mid-gate-run — had to be recovered from stash commit `1891b06` (untracked-files commit) via `git cat-file -p <blob>`. **Pattern for next session: `git add` new files as early as possible so the stop hook sees them as "index changes" not "untracked."**
- Two deferred MCP tools disappeared mid-session: `Monitor` and `PushNotification`. ToolSearch will return no match.

### Doctrine state
- `CLAUDE.md`, `docs/POSITIONING.md`, `docs/BUILD_BIBLE.md` untouched this session. No locked-block modifications.
- BLK-020 is ready for its 🟡 → ✅ status flip, but that is a BUILD_BIBLE amendment and per §Amending-this-file it needs Craig's explicit "yes" in chat before the edit.

### Next agent should start by
1. Read PR #124 review feedback from Craig, if any.
2. On Craig's approval, either merge PR #124 yourself or ask him to merge.
3. On Craig's in-chat auth, amend `docs/BUILD_BIBLE.md` to flip BLK-020 to ✅ SHIPPED.
4. Ask Craig about (a) merging Dependabot PR #102, and (b) whether to spawn the BLK-009 real build-runner work — that's the revenue-blocker.
