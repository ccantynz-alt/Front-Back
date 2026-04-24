# HANDOFF — Next Session Starts Here

---

## SESSION_LOG — 2026-04-23 — claude/fix-website-reliability-fmr2O

**Branch:** `claude/fix-website-reliability-fmr2O`  
**Objective:** Comprehensive website reliability sweep — fix all build failures, dead links, type errors, and homepage visual breakage.

**Blocks advanced:** None (reliability/stability sweep of existing code)

**Files touched:**
- `apps/api/src/email/client.ts` — exactOptionalPropertyTypes fix
- `apps/web/src/components/Icon.tsx` — added 8 missing icon registrations (bar-chart, briefcase, code, heart, home, pen-tool, shopping-cart, utensils)
- `apps/web/src/components/LegalPage.tsx` — dead link /terms → /legal/terms
- `apps/web/src/components/NotificationCenter.tsx` — type param broadening (string vs narrow enum)
- `apps/web/src/routes/admin/claude.tsx` — role union cast
- `apps/web/src/routes/admin/sms.tsx` — direction type widened to string
- `apps/web/src/routes/dashboard.tsx` — null-safe evt.category
- `apps/web/src/routes/index.tsx` — complete rewrite fixing broken JSX from prior parallel-agent merge + restored POSITIONING.md-locked headline + early access badge + CTAs
- `apps/web/src/routes/pricing.tsx` — Free tier ctaLabel "Start free" → "Join waitlist"
- `apps/web/src/routes/projects.tsx` — CSS property borderColor → border-color
- `apps/web/src/routes/wordpress.tsx` — dead link /docs/wordpress/install → /docs/getting-started/install
- `packages/db/migrations/0027_billing_plumbing.sql` — renamed from 0026
- `packages/db/migrations/meta/_journal.json` — fixed invalid JSON, renumbered duplicate idx
- `packages/db/src/schema.test.ts` — users column count 11 → 12 (emailVerified added)
- `packages/db/src/schema.ts` — complete rewrite with all 47 table exports (was truncated with TENANT_PROJECTS_PLACEHOLDER)

**Quality gates at push:**
- `bun run build` ✅ 6/6 packages
- `bun run check` ✅ 19/19 packages, 0 errors
- `bun run test` ✅ 903/903 tests (785 web + 118 db + rest)
- `bun run check-links` ✅ 0 dead links
- `bun run check-buttons` ✅ 0 dead buttons
- `bunx biome check` ✅ exit 0

**Craig's authorizations this session:** None needed — all fixes were free actions (§0.7 🟢)

**Next agent should start by:**
1. Read CLAUDE.md, docs/POSITIONING.md, docs/BUILD_BIBLE.md. Post doctrine-confirmed line.
2. Check if a PR exists for branch `claude/fix-website-reliability-fmr2O`; if not, create one.
3. Monitor GateTest results on the PR.
4. Continue with next BUILD_BIBLE block.

---

**First action (morning of 2026-04-21):** Merge **PR #163** — it now carries **BLK-009 sandbox-wrap + BLK-014 Grafana LGTM + BLK-015 Sentinel live daemon**, all on `claude/build-status-update-VqeIy`, 5 clean commits, 6/6 local gates green. After merge, say "yes" in chat to flip BLK-009, BLK-014, BLK-015 → ✅ SHIPPED in `docs/BUILD_BIBLE.md`. (BLK-020 Admin Claude Console also still pending its 🟡 → ✅ flip from the previous session.)

**Pending your strategic call:** BLK-010 Stripe metered billing (§0.7 HARD GATE — pricing/billing/revenue). Say "go" and the next session spawns a scoped agent that ships schema + webhooks + customer portal plumbing only (no pricing values set — you pick those).

---

## SESSION LOG — 2026-04-20

**Branch:** `claude/build-status-update-VqeIy`
**Branch head:** `ec893c9 data(sentinel): tracked-repos collector refresh`
**PR:** #163 (https://github.com/ccantynz-alt/Crontech/pull/163) — open, awaiting your merge.

**Blocks advanced this session:**

| Block | State before | State after this session |
|---|---|---|
| BLK-009 Git-push deploy pipeline | 🔵 PLANNED (pre-sandbox P0 flagged) | sandbox P0 closed — install + build run inside Docker, clone stays on host. Ready to flip to ✅ SHIPPED on merge. |
| BLK-014 Observability (Grafana LGTM) | 🔵 PLANNED | deployable stack — OTel collector → Loki/Tempo/Mimir, 6-panel Crontech Overview dashboard, schema-drift guard test. Ready to flip to ✅ SHIPPED on merge. |
| BLK-015 Sentinel live service | 🔵 PLANNED | systemd timer (15-min oneshot) + Slack alerter with secret scrub + dead-man's switch via `.last-run` timestamp. Ready to flip to ✅ SHIPPED on merge. |

**Commits on this branch (chronological):**
1. `a803ddc feat(blk-009): sandbox-wrap build-runner install+build — close the customer-code-on-host P0`
2. `eb99b9c fix(blk-009): resolve noUncheckedIndexedAccess error in e2e test`
3. `86e9132 data(sentinel): tracked-repos collector refresh`
4. `6983d82 feat(blk-014): Grafana LGTM stack + Crontech Overview dashboard`
5. `fd474f3 feat(blk-015): Sentinel live daemon — systemd timer + Slack alerter + secret scrub`
6. `ec893c9 data(sentinel): tracked-repos collector refresh`

**Files touched (this session, consolidated):**

*BLK-009 sandbox-wrap:*
- `apps/api/src/automation/build-runner.ts` (+162/-81) — install/build routed through `runInSandbox`
- `apps/api/src/automation/build-runner.test.ts` — new security-invariant test + timeout test
- `apps/api/test/blk009-e2e.test.ts` — `hostSpawningSandboxRun` adapter for CI (no Docker required)
- `apps/api/package.json` — `@back-to-the-future/orchestrator` workspace dep
- `services/orchestrator/package.json` — `exports` → `./sandbox` subpath

*BLK-014 Grafana LGTM:*
- NEW `apps/api/test/observability.test.ts` — dashboard drift guard (6 tests, 26 assertions)
- NEW `infra/lgtm/README.md` — 70-line spin-up guide
- NEW `infra/lgtm/dashboards/crontech-overview.json` — 6 panels, all reference metrics API actually emits
- MOD `infra/lgtm/docker-compose.yml` + `infra/lgtm/config/{otel,loki,tempo,mimir}/`

*BLK-015 Sentinel live:*
- NEW `services/sentinel/src/alerts/slack.ts` + `.test.ts` — 9 tests: no-webhook / 2xx / non-2xx / throw / 4 scrub cases
- NEW `infra/systemd/sentinel.service` — oneshot, User=crontech
- NEW `infra/systemd/sentinel.timer` — OnBootSec=2min, OnUnitActiveSec=15min, Persistent=true
- NEW `infra/systemd/README.md` — install index
- MOD `services/sentinel/src/{runner,dead-mans-switch}.ts` — touchLastRun() per cycle
- MOD `.gitignore` — excludes `services/sentinel/data/.last-run`

**Gates on HEAD (`ec893c9`):**

| Gate | Result |
|---|---|
| `bun run check` | ✅ 19/19 packages, 0 TS errors |
| `bun run test` | ✅ 21/21 packages (350 web + 458 api + 54 sentinel + others) |
| `bun run build` | ✅ 6/6 packages |
| `bun run check-links` | ✅ 0 dead (61 routes, 184 files) |
| `bun run check-buttons` | ✅ 0 dead (116 files) |
| `bunx biome check apps packages services` | ✅ exit 0 |

**CI on PR #163:** First run had Lint & Type Check red because local turbo cache hid a `noUncheckedIndexedAccess` error in the E2E sandbox adapter. Fixed in `eb99b9c`. GateTest run was red on a SARIF-upload bug in the GateTest service itself (not Crontech code) — BLK-007 is still report-only so it doesn't block merge. Re-run in flight at HEAD.

**Craig's authorization quotes (verbatim):**
> "Awesome let's smash out as much as we can I apologise for putting the pressure on but I've had so many Claude sessions and the different usernames and hit so many issues lately that's taken about two weeks behind where we're supposed to be"

> "I have to go to sleep now but do you think we could put it quickly put a build plan together to get this finished and completely polished just work out what you wanna do and just go through the night so it's in the morning it's finished can we do that"

This authorized the overnight parallel fan-out on BLK-014 + BLK-015. BLK-010 Stripe explicitly held for his wake-up green-light.

**Polish audits (all clean, no fixes needed):**
- Grep for `<button>` without `aria-label` / `aria-labelledby` → 0 hits
- Grep for `<img>` without `alt=` → 0 hits
- Grep for `.only(` / `.skip(` in test files → 0 hits
- `any` uses in `packages/db/src/scoped-query.ts` are all `biome-ignore`-annotated principled escape hatches for Drizzle's loose column typing — intentionally left alone (fix risk > reward in multi-tenant query code)

**Doctrine compliance:**
- `CLAUDE.md`, `docs/POSITIONING.md`, `docs/BUILD_BIBLE.md` untouched ✅
- No pricing, auth, route, or top-level-dep changes ✅
- All parallel agents briefed with scope + non-scope + exit criteria ✅
- No force-push, no branch delete, no PR merge ✅

**Open PRs:** PR #163 is the only open PR for this branch; it now contains the full night's work. No need to cut a second PR.

**Next agent should start by:**
1. Read `CLAUDE.md`, `docs/POSITIONING.md`, `docs/BUILD_BIBLE.md`. Post doctrine-confirmed line.
2. Check PR #163 CI status. If green, Craig merges. If any CI regressed, diagnose + fix before anything else.
3. On Craig's in-chat "yes", amend `docs/BUILD_BIBLE.md` to flip BLK-009, BLK-014, BLK-015, BLK-020 → ✅ SHIPPED. Single commit, quote Craig's authorization.
4. If Craig green-lights BLK-010 Stripe, spawn a scoped agent per the plan in the top of this file.
5. Smoke-test the sandbox pipeline on the real Vultr box: push a trivial change to a customer fixture repo, confirm `docker inspect crontech-build-*` shows the hardened flags, confirm Caddy route is added.

---

## SESSION LOG — 2026-04-19

**Branch:** `claude/review-crontech-handoff-qYEVq`
**Ended on:** `8fceece feat(ux-polish): aggregate final output from 4 parallel agents`

**Blocks advanced:**
- BLK-020 Admin Claude Console — shipped this session, unchanged since last handoff
- BLK-009 Git-push deploy pipeline — shipped this session, unchanged since last handoff
- UX polish wave (no BLK ID yet — candidates for `docs/PROPOSED_BLOCKS.md`):
  - Universal Cmd+K palette (17 commands, role-gated, in-house fuzzy, 27 tests)
  - Optimistic UI + undo toast (3 destructive actions wired, 16 tests)
  - Keyboard shortcut registry + `?` help + URL-state hook (34 tests)
  - AI-generated changelog via `scripts/generate-changelog.ts` (35 tests)

**Files touched (this session):**
- `apps/web/src/lib/{commands,keyboard,url-state,optimistic}.ts` (+ tests)
- `apps/web/src/components/{CommandPalette,KeyboardHelp,UndoToast,Toast,Layout,DeploymentCard}.tsx`
- `apps/web/src/routes/{deployments,projects,settings,projects/[id]}.tsx`
- `apps/web/src/app.tsx`
- `scripts/generate-changelog.ts` (+ test)
- `CHANGELOG.md`, `docs/changelog/README.md`
- `packages/schemas/src/index.ts` (one-line `export { z } from "zod"` — no new dep)

**Locked-block authorization Craig granted verbatim:**
> "Awesome let's do it all" — authorizing the UX polish wave + legal layer drafting + architecture ideas list. Legal drafting was deferred (see below).

**Legal drafting — NOT done.** `docs/legal/attorney-package.md` (23KB, 2026-04-16) + `pre-launch-audit.md` (11KB) already cover the eight live legal pages at `apps/web/src/routes/legal/*`. Drafting fresh TOS/AUP/Privacy/DMCA files would have duplicated or overwritten attorney-review material — that's a §0.7 HARD GATE risk. Explicit non-action; flagged for Craig to redirect if he wants a different angle.

**Proposed blocks (not yet authorized):** `docs/PROPOSED_BLOCKS.md` to be drafted next session with BLK-031..BLK-045 architecture ideas. Skipped this session in favor of landing the UX polish wave cleanly.

**Gates on `8fceece`:**
| Gate | Result |
|---|---|
| `bun run check` | ✅ 16/16 packages, 0 TS errors |
| `bun run test` | ✅ 250/250 pass (112 net-new), 605 assertions, 21 files |
| `bun run build` | ✅ 5/5 tasks |
| `bunx biome check apps packages services` | ✅ exit 0 |
| `bun run check-links` | ✅ 0 dead (45 routes, 161 files) |
| `bun run check-buttons` | ✅ 0 dead (106 files) |

**Open PRs / unmerged:** PR #124 still open against Main (BLK-020 + BLK-009). New polish-wave commits (`cd97979`, `8fceece`) are pushed on `claude/review-crontech-handoff-qYEVq` but not yet PR'd — reason: same branch, same PR will update on next push. Verify PR #124 shows the 2 new commits before merging, or cut a second PR for the polish wave separately so the deploy pipeline landing stays reviewable.

**Next agent should start by:**
1. Reading `docs/TONIGHT_CHEAT_SHEET.md` to see where Craig is in the cutover
2. Asking Craig's in-chat "yes" to flip BLK-020 + BLK-009 → ✅ in `docs/BUILD_BIBLE.md`
3. Drafting `docs/PROPOSED_BLOCKS.md` (BLK-031..BLK-045) for Craig to authorize later

---

## (prior content preserved below)

**First action (previous session):** Review and merge **PR #124** (https://github.com/ccantynz-alt/Crontech/pull/124). It carries **BLK-020 frontend complete + BLK-009 aggregate (real build-runner + Docker sandbox + live-log SSE + E2E test)**. All 6 local quality gates green. Then Craig's in-chat "yes" to flip BLK-020 + BLK-009 from 🟡 → ✅ in `docs/BUILD_BIBLE.md`.

---

## Branch state — `claude/review-crontech-handoff-qYEVq` (7 commits ahead of Main)

```
df6fca2 fix(blk-009): UI agent final tweaks + sentinel repo data refresh
55fc4a2 docs(handoff): honest gate status for next session  (this file replaces)
655816b (intermediate sentinel refresh from origin)
b715a0b feat(blk-009): aggregate parallel agent output — real build-runner + sandbox + live logs + E2E test
5d0e46b wip(blk-009): partial output from in-flight parallel agents  (superseded)
d76e7ac docs(handoff): rewrite for session handover to new chat
bcf5f6b docs(handoff): rewrite session log for 2026-04-18 BLK-020 completion
f975386 feat(admin): complete BLK-020 — /admin/claude console + settings + spend tile
```

---

## Quality gates on HEAD (`df6fca2`) — ALL GREEN

| Gate | Result |
|------|--------|
| `bun run build` | ✅ 5/5 packages (web Nitro built clean) |
| `bun run check` | ✅ 16/16 packages, 0 TS errors |
| `bun run test` | ✅ 19/19 packages (278 api + 173 web + others) |
| `bun run check-links` | ✅ 0 dead (45 routes, 150 files scanned) |
| `bun run check-buttons` | ✅ 0 dead (104 files) |
| `bunx biome check apps packages services` | ✅ exit 0 |

Note: a mid-session run showed 82 test failures. That was transient — caused by test files running against a stale DB from a previous partial run. `bunfig.toml` preload wipes + migrates per process-start; that works correctly when invoked cleanly (as the final gate run confirmed).

If you see similar flakes: `cd apps/api && rm -f local.db && bun test` should always reproduce clean. For the web build, `rm -rf apps/web/.vinxi apps/web/.output` clears Vinxi state that can get corrupted mid-run.

---

## What's in PR #124

### BLK-020 Admin Claude Console (shipped, ready for SHIPPED flip)
- `/admin/claude` — admin-only chat console. Streams via `POST /api/chat/stream`. Conversation sidebar + thread pane + model picker + monthly-spend badge + inline missing-key CTA.
- `/admin/claude/settings` — paste/mask/delete Anthropic key via `chat.saveProviderKey` / `chat.deleteProviderKey`. Default model + system prompt in localStorage.
- `/admin` — 5th stat tile "Claude spend (this month)" + Claude Console quick-action.

### BLK-009 Git-push deploy pipeline (shipped this session)
- **Real build-runner** at `apps/api/src/automation/build-runner.ts`. Replaces 372-line stub with 727-line real implementation: Bun.spawn git clone → bun install → bun run build → orchestrator HTTP handoff. Dependency-injected `spawn`/`deploy`/`fs` for tests. 10-minute hard timeout. In-memory concurrency guard. Workspace cleanup in `finally`. 9/9 unit tests pass.
- **Live log SSE streaming**. `GET /api/deployments/:id/logs/stream` at `apps/api/src/deploy/logs-stream.ts` replays existing rows + polls for new. Closes on terminal status. SolidJS hook `useDeploymentLogStream` at `apps/web/src/lib/` with jittered backoff reconnection. `DeploymentCard`/`DeploymentLogs` accept `liveLogs` prop. `apps/web/src/routes/deployments.tsx` replaced placeholder data with real tRPC fan-out.
- **E2E integration test** at `apps/api/test/blk009-e2e.test.ts` with fixture repo at `apps/api/test/fixtures/hello-world-repo/` (9.5 KB, buildable). 3 tests: signed webhook → build → live status + logs; build failure path; unsigned payload rejection.
- **Docker sandbox hardening** in `services/orchestrator/src/{sandbox,docker,deployer,caddy}.ts`. 14 enforced security guarantees: cap-drop=ALL, no-new-privileges, read-only root, tmpfs /tmp+/run, non-root uid 1000, mem 2G, cpus 1, pids 512, nofile 4096, network isolation, 10-min wall timeout, path-traversal rejection on deploymentId, atomic Caddyfile append with rollback, log-line scrub of `*_KEY`/`*_SECRET`/`*_TOKEN`/`*_PASSWORD`/Bearer/PEM. `services/orchestrator/src/index.ts` public API **unchanged byte-for-byte**.
- **Tactical sweep** (TAC agent): 12 hardcoded hex colors → CSS vars (6 component files), 3 explicit return types added (VoiceGlobal, createClient, createNeonClient).

### Placeholder/mock audit (research only, not committed)
- **0 pre-launch blockers.** 6 P1 items + 2 P2 items, all honestly documented disabled/waitlist surfaces (notifications+appearance tabs, billing gate on STRIPE_ENABLED, avatar upload pending file-storage pipeline). Report stays in conversation history; see prior turn.

---

## Known security flags (from BR + SEC agents)

1. **Build-runner currently runs customer code on the host, not inside SEC's sandbox.** BR's `build-runner.ts` calls `Bun.spawn` directly against a tmp workspace on the host. SEC's `runInSandbox` exists in `services/orchestrator/src/sandbox.ts` and is wired to the orchestrator's build/install steps — but BR's code clones and installs BEFORE handing off. Before opening signup, the build-runner must either (a) route its clone+install+build through `runInSandbox` instead of raw Bun.spawn, OR (b) ensure the entire runner process runs inside Firecracker/gVisor. Single-tenant v1 is fine; this is the P0 before BLK-009 opens to customers.

2. **Outbound network not fully isolated during build.** Needed for npm install / git fetch. V2 must add egress allowlist (npm, PyPI, target git host) via iptables or Cilium.

3. **Runtime app still runs on host via Bun.spawn.** SEC's sandbox covers build; containerising runtime is a separate block (file it when opening customer signup).

---

## Open strategic decisions for Craig

1. **Merge PR #124** — all gates green, 27 files, ~3600 insertions. His call.
2. **BUILD_BIBLE amendment** — once PR #124 merges, his in-chat "yes" flips BLK-020 and BLK-009 from their current states to ✅ SHIPPED. Per §Amending-this-file, only Craig can authorize.
3. **Dependabot PR #102** (setup-node v4→v6) — audited safe. His merge call.
4. **Schedule BLK-009 signup-readiness hardening block** — the P0 called out above. Probably BLK-019 or next available number.

---

## Craig's in-session authorizations (quoted verbatim)

- "Sorry to bother you I'm just checking in to make sure that we've kicked off and we're running with the ball as many agents as you can put on would be great" — standing parallel-agent directive that carried the session.
- "I need sleep now can you promise me that you were gonna continue until this is completely finished and writing" + "That's meant to say and wired in" — the BLK-020 end-to-end-wired commitment. Honored.
- "To be honest you've been going for hours so I expected you to be further along than this" — pace feedback. Triggered BLK-009 6-agent wave that produced `b715a0b`.
- "Can you write a handover file please so I can start a new coding chat this one is obviously not working" — written.
- "So you do have other agents working on it I'm just a bit annoyed you've been going for hours and if there's had anything been done" — confirmation that substantial work did land (see above).

No locked-block modifications this session. CLAUDE.md, POSITIONING.md, BUILD_BIBLE.md untouched.

---

## Session-environment notes (for future sessions)

1. **Stop-hook auto-stashes untracked files on session stops.** `git add` new files ASAP. If files disappear, check `git ls-tree -r <stash-commit-sha>` and recover via `git cat-file -p <blob-sha> > <path>`.
2. **Worktree isolation (`isolation: "worktree"`) is NOT available.** Agents ran concurrently without isolation; non-overlapping file scopes prevented collisions.
3. **GitHub MCP tools appear/disappear mid-session.** The `authenticate` flow needs the full callback URL pasted as text (not a screenshot; iPad Safari truncates the address bar display).
4. **Test DB pollution can look like real regressions.** When you see many tests failing with DB errors, `rm -f apps/api/local.db` and retry. The bunfig preload wipes once per process — if two runs overlap or state leaks across package boundaries, transient failures happen.
5. **Vinxi web build can get into bad cache state.** `rm -rf apps/web/.vinxi apps/web/.output apps/web/.turbo` clears it.

---

## Next agent should start by

1. Read `CLAUDE.md`, `docs/POSITIONING.md`, `docs/BUILD_BIBLE.md`.
2. Post the doctrine-confirmation line.
3. Check PR #124 status. If merged, proceed. If not merged, ask Craig to review.
4. On merge + Craig's "yes": amend `docs/BUILD_BIBLE.md` to flip BLK-020 and BLK-009 to ✅ SHIPPED with commit message citing his authorization.
5. Then pick up the next priority — likely the signup-readiness hardening block (sandbox-wrap the build-runner's clone+install+build).

---

## POST-GLUECRON-LIVE DIRECTIVE (authorized by Craig 2026-04-19)

> Quote: "Once we are working we need to delete the other products completely from our code and any Claude.MD files or anything that stores that information otherwise Claude is gonna see it as an option and they are competition"

**Trigger:** When gluecron.com is live and actively hosting Crontech + AlecRae git + CI.

**Scope — purge across all three repos (Crontech, Gluecron.com, AlecRae.com):**

Scrub from code, config, env.example, scripts, workflows, CLAUDE.md, BUILD_BIBLE.md, POSITIONING.md, DEPLOY.md, README.md, HANDOFF.md, ALECRAE-BRIEF.md, and any `/docs/**`:

- **Vercel** — all references, config (vercel.json), workflow steps
- **Cloudflare Workers / Cloudflare Pages / Wrangler** — configs, deploy steps, docs. Keep Cloudflare as DNS/CDN only if still used by Craig; remove all framework/platform mentions.
- **GitHub Actions as CI/deploy host** — replace with Gluecron CI references. Keep raw git protocol mentions (we still speak git).
- **Hetzner** — if any residual references exist after PR #115.
- **Supabase / Convex / Render / AWS Amplify / Netlify / Railway / Fly.io (optional)** — competitor comparison tables, "why we beat them" marketing prose in CLAUDE.md §2, etc.
- **Competitor comparison tables** — e.g. "Why Vercel loses" rows in CLAUDE.md §2.

**Keep (we use these, not competitors):**
- Anthropic (Claude), OpenAI (Whisper + embeddings) — our AI providers
- Neon (our Postgres), Turso (our edge SQLite), Qdrant (our vectors)
- Vultr (our current host) until replaced by something else we own
- Bun, Hono, SolidJS, Drizzle, Tailwind, Biome, Yjs — stack tools we depend on

**Execution plan (queued for post-Gluecron-live session):**
1. Spawn 3 parallel agents, one per repo, briefed with the scrub list above
2. Each agent: find all references, propose the scrubbed diffs to Craig, wait for explicit per-file approval (CLAUDE.md change protection layer 1)
3. After approval, commit + open PR for each repo
4. CODEOWNERS gate (layer 2) catches any bypass

**Doctrine note:** This is a MAJOR CLAUDE.md / doctrine edit across three repos. Requires the per-diff ask-in-chat protocol for every locked file. Do NOT do blanket rewrites — each doctrine file gets a reviewed diff.
