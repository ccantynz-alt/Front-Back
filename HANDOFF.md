# HANDOFF — Next Session Starts Here

**First action:** Read this file in full, then read `CLAUDE.md`, `docs/POSITIONING.md`, `docs/BUILD_BIBLE.md`. Then run `git status` and check the filesystem — **do NOT trust that this handover reflects live state**, because there are background agents in-flight that may have landed files after this was written (see "In-flight agents" below).

---

## State as of handover write (2026-04-18, ~05:30 NZST)

### What's landed and pushed
- **Branch `claude/review-crontech-handoff-qYEVq`** has 2 commits ahead of `Main`:
  - `f975386` — `feat(admin): complete BLK-020 — /admin/claude console + settings + spend tile`
  - `bcf5f6b` — `docs(handoff): rewrite session log for 2026-04-18 BLK-020 completion`
- **PR #124 open** against Main: https://github.com/ccantynz-alt/Crontech/pull/124
  - BLK-020 frontend complete: `/admin/claude` chat console, `/admin/claude/settings` key mgmt, `/admin` spend tile + quick-action
  - All local gates green: build 5/5, check 16/16, test 149/149, links 0 dead, buttons 0 dead, biome clean
  - **Not merged.** Awaiting Craig's review.

### What was started but didn't finish
Six agents were dispatched in parallel on BLK-009 + tactical work before this handover was requested. **They may still be running or may have landed files you'll see in `git status`.** They were briefed to NOT commit or push. You must decide whether to integrate their work or abandon it.

Agent brief summaries:

| Agent ID | Scope (files it may have written) | Status at handover |
|---|---|---|
| `a215cdd5ee69fe9a7` (BR) | `apps/api/src/automation/build-runner.ts` + its test. Real git clone → bun install → bun run build with spawn DI. | Running |
| `a714f7b89e1899fb6` (UI) | `apps/web/src/routes/deployments.tsx`, `apps/web/src/routes/projects/[id]/terminal.tsx`, `apps/web/src/components/DeploymentLogs.tsx`, `apps/web/src/lib/useDeploymentLogStream.ts`, new Hono SSE endpoint under `apps/api/src/routes/` | Running |
| `ad3b640bc90c89b5d` (TEST) | `apps/api/test/blk009-e2e.test.ts` + fixture repo at `apps/api/test/fixtures/hello-world-repo/` | Running |
| `acf1bae128e717483` (SEC) | `services/orchestrator/src/{docker,deployer,caddy,sandbox,orchestrator.test}.ts` — Docker sandbox hardening | Running |
| `a38f20ffa81eea409` (MOCK-AUDIT) | Research-only; no file writes. Reports mock/placeholder inventory. | Running |
| `a3e9f17ccfaf36fc1` (TAC) | Tactical sweep across `packages/**`, `services/sentinel/**`, `apps/web/src/components/**` (excl. DeploymentLogs/Card), `apps/web/src/lib/**` (excl. useDeploymentLogStream). Small typing/color/unused-import fixes. | Running |

**How to check their state when you start:**
```
git status --short                   # untracked/modified files from agents
git stash list                       # stop-hook may have stashed agents' work
find apps/api/test/fixtures -type f  # TEST agent's fixture repo
```

**Known hazard:** the `~/.claude/stop-hook-git-check.sh` hook auto-stashes uncommitted work on session stops. Untracked files get swept into stash commits with the "untracked files on ..." message. Recover with:
```
git ls-tree -r <stash-untracked-commit-sha> | grep <filename>
git cat-file -p <blob-sha> > <path>
```
This session lost + recovered `apps/web/src/routes/admin/claude.tsx` this way. **Mitigation: `git add` new files early, even before committing.**

---

## Open strategic decisions for Craig

1. **PR #124 — BLK-020 frontend.** Review and merge on his call.
2. **Flip BLK-020 in BUILD_BIBLE to ✅ SHIPPED.** Requires Craig's in-chat "yes" per §Amending-this-file. Do not edit BUILD_BIBLE without that explicit auth.
3. **Dependabot PR #102 (setup-node v4→v6).** Audited safe in prior session. Craig's merge call.
4. **BLK-009 real build-runner.** The six agents above were kicked off assuming Craig's standing "as many agents as you can" directive covered planned-block work. **If you don't trust that interpretation, abandon the 6 agents' output (discard / reset).** If you do trust it, aggregate + test + ship a second PR. Either is defensible.

---

## Real state of BLK-009 (audited this session, pre-agent-dispatch)

- ✅ GitHub webhook receiver `apps/api/src/github/webhook.ts` — real HMAC-SHA256 verification, payload parsing, repo lookup, deployment-row creation. 344 lines.
- ✅ `deployments` tRPC procs + DB log-row infrastructure + SSE-ready pipeline.
- ✅ Deployments UI files exist (`apps/web/src/routes/deployments.tsx`, `apps/web/src/components/DeploymentLogs.tsx`, etc.)
- ⚠️ **Build-runner stub** at `apps/api/src/automation/build-runner.ts` lines 8–14 — comment: "intentionally stubbed with console.log + log-row inserts; actual spawn/clone is TODO". No real `git clone`, `bun install`, `bun run build`, or deploy. The UI pipeline is wired; the engine is a placeholder. 372 lines.
- Subdomain pivoted from BUILD_BIBLE's `*.crontech.app` spec to `*.crontech.ai` in code (orchestrator/deployer.ts).
- Deploy target pivoted from Wrangler/Cloudflare to Vultr Docker via `services/orchestrator/src/deployer.ts` (635 lines).

---

## Known session problems (failure mode analysis)

This session was slower than it should have been. If starting a new chat, avoid these:

1. **Over-cautious on authorization gates.** When Craig says "as many agents as you can," that IS the authorization for parallel work, including on planned blocks. Don't ask twice.
2. **Agent timeouts waste a lot of wall-clock.** When an agent times out mid-stream, you lose everything unless it wrote to disk first. Brief agents to write files early, don't batch all the edits to the end.
3. **Stop-hook auto-stash hazard.** `git add` new files as soon as they exist. Don't wait until commit time.
4. **Worktree isolation is unavailable in this sandbox.** `isolation: "worktree"` fails silently-ish with "Cannot create agent worktree." Agents must be scoped with strict non-overlapping file boundaries so they can run without isolation.
5. **GitHub MCP auth flow is fragile over iPad Safari.** The `http://localhost:...` callback is unreachable; Craig has to copy the URL from the address bar. Works, but introduces human latency. If GitHub MCP is needed, warn upfront.
6. **Two deferred MCP tools disappeared mid-session and came back later.** `Monitor` and `PushNotification`. If you need them, ToolSearch may show them unavailable then available again — don't panic.

---

## Doctrine state (untouched this session)

- `CLAUDE.md` — not modified
- `docs/POSITIONING.md` — not modified
- `docs/BUILD_BIBLE.md` — not modified (BLK-020 is still shown 🟡 BUILDING; flip pending Craig's auth)

No locked-block violations this session.

---

## Craig's in-session authorizations (quoted verbatim)

- "Sorry to bother you I'm just checking in to make sure that we've kicked off and we're running with the ball as many agents as you can put on would be great" — standing parallel-agent directive.
- "I need sleep now can you promise me that you were gonna continue until this is completely finished and writing" + "That's meant to say and wired in" — authorization to finish BLK-020 frontend end-to-end wired in. Honored: PR #124.
- "To be honest you've been going for hours so I expected you to be further along than this" — pace feedback. This handover exists because of that.
- "Can you write a handover file please so I can start a new coding chat this one is obviously not working" — why this file is being rewritten now.

---

## Next agent should start by

1. **Read CLAUDE.md, docs/POSITIONING.md, docs/BUILD_BIBLE.md.** Post the doctrine-confirmation line.
2. **Run `git status` + `git stash list` + `ls apps/api/src/automation/ apps/web/src/routes/admin/ apps/web/src/routes/admin/claude/ services/orchestrator/src/`** to see what the 6 in-flight agents left behind.
3. **Ask Craig** whether to aggregate the in-flight BLK-009 work into a second PR, or discard it and start clean. Do not assume — he's already frustrated with this session's pace, and the right move might be to reset.
4. **If aggregating:** run full quality gate before committing. Watch for partial / half-wired agent output.
5. **If discarding:** `git stash` or `git checkout -- <files>` any uncommitted agent work, then start a fresh plan from BLK-020 merge onwards.
