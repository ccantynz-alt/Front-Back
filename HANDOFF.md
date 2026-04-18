# HANDOFF — Next Session Starts Here

**First action:** Review and merge **PR #124** (https://github.com/ccantynz-alt/Crontech/pull/124). It carries **BLK-020 frontend complete + BLK-009 aggregate (real build-runner + Docker sandbox + live-log SSE + E2E test)**. All 6 local quality gates green. Then Craig's in-chat "yes" to flip BLK-020 + BLK-009 from 🟡 → ✅ in `docs/BUILD_BIBLE.md`.

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
