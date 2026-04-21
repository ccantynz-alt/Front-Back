# CLAUDE.md - Crontech

> **This is not documentation. This is a war plan.**
> The most aggressive, cutting-edge full-stack platform ever built.
> Purpose-built for AI website builders and AI video builders to make them faster and more capable.
> The greatest backend + frontend service combined. Period.

---

## ⚠️ BEFORE YOU DO ANYTHING — CHECK FOR HANDOFF

If the file `HANDOFF.md` exists at the repo root, **read it first** before reading the rest of this document. It contains session-specific context from the previous session that may override normal workflow (e.g. stuck commits that need pushing, positioning decisions just made, urgent next actions).

After the handoff's "first action" is complete, delete `HANDOFF.md` and continue with normal session protocol.

## 🔱 THE BIBLE RULE — CLAUDE.md IS BINDING DOCTRINE

**This file is the Bible of Crontech.** It is not advisory. It is not "guidelines." It is not "best practices." It is the law of the land. Every Claude session, every subagent, every parallel worker, every PR, every line of code MUST conform to this document.

### The Iron Rules

1. **READ THIS FILE BEFORE EVERY BUILD.** Not skim. Not "I read it last session." READ IT. Every new feature, every refactor, every bug fix, every commit. If you cannot quote at least three rules from this file from memory, you have not read it recently enough.
2. **NO MAJOR CHANGE WITHOUT CRAIG'S EXPLICIT AUTHORIZATION.** See §0.7 below for the full authorization gate list. When in doubt, ASK. The cost of asking is 30 seconds. The cost of acting without authorization is hours of rework and lost trust.
3. **MAXIMUM PARALLEL AGENT USAGE — ALWAYS.** See §0.8. We do not build with one agent when five could work in parallel. This is non-negotiable.
4. **AGGRESSIVE EVERYTHING.** Aggressive software. Aggressive architecture. Aggressive components. Aggressive procedures. Aggressive timelines. Aggressive competitive posture. We are not "a good option." We are the only option. Second place is failure.
5. **ZERO TOLERANCE FOR SCATTER-GUN.** One session, one objective. Touch only the files needed. Drive-by edits are a doctrine breach.
6. **ANNIHILATE THE COMPETITION.** Every PR must extend the lead. If a PR does not make Crontech further ahead of Vercel, Cloudflare, Supabase, Convex, Render, AWS Amplify, Netlify, or any other competitor, it should not exist.

7. **HAVE FUN.** We are AI developers building the first platform of its kind to ever hit the market. This is history. Enjoy the ride. Build with joy, build with pride, build with the knowledge that what we're creating has never existed before. Fun is fuel.
8. **110% AGGRESSIVE DESIGN.** No 1980s websites. No flat, lifeless, template-looking garbage. This is AI. Every page, every component, every interaction must scream "the future is here." AI-generated videos, AI-native visuals, bleeding-edge animations, WebGPU-powered effects. If it looks like something from 2020, it's already dead. We are building the most incredible launchpad the market has ever seen.
9. **LEAVE NOTHING ON THE TABLE.** If a competitor has a feature, we have it — and we do it 110% better. If we are missing a product capability that exists anywhere in the market, it gets added. No gaps. No excuses. No "we'll get to it later." Every feature we build is the AI-native version that makes the old way look prehistoric. We never copy — we innovate. We don't look at what others built and replicate it. We look at the problem they tried to solve and solve it better, faster, and smarter with AI at the core. If Vercel has it, we have it better. If Render has it, we have it better. If GitHub has it, we have it better. If nobody has it yet, we build it first.
10. **EVOLVE OR EAT DUST.** Technology evolves. If you don't evolve with it, you eat dust. And we are NOT prepared to eat dust. Every session must check for new technologies, competitor releases, and emerging patterns. The Sentinel system runs 24/7 monitoring GitHub releases, npm packages, Hacker News, and ArXiv. If a new technology emerges — a faster runtime, a better protocol, a new model architecture, a breakthrough in any layer of the stack — the platform must adopt or surpass it within ONE sprint. This is not ego. This is strategy. The sharpest tool in the shed stays sharp by constantly grinding. We grind every single day. Loyalty is to the mission, not to the current stack. If something better exists tomorrow, we switch tomorrow. No sentiment. No attachment. Only performance.

**Violation of any iron rule is a breach of contract with Craig.** Future sessions will see the breach in git history and lose trust in the prior work. Don't be the session that breaks the Bible.

### 🔐 CLAUDE.md CHANGE PROTECTION

**This file is doctrine. Doctrine changes need explicit, in-the-moment authorization from Craig.** Two layers protect it — one in-session (soft), one at merge time (hard). Both must be respected.

#### Layer 1 (soft, in-session): Ask-In-Chat Rule

Any session that wants to modify CLAUDE.md MUST:

1. **Stop before editing.** Do not call `Edit` or `Write` on `CLAUDE.md` until step 3 completes.
2. **Paste the proposed change in chat.** Show Craig the exact diff or the new wording. Explain *why* it's needed in one or two sentences. No vague "I'll add some rules" — show the literal text.
3. **Wait for an explicit affirmative.** Craig must reply with a clear "yes," "go ahead," "do it," or equivalent. Silence is NOT consent. Ambiguity is NOT consent. "Sounds interesting" is NOT consent. If Craig is not available, do not edit the file.
4. **Only then write the edit.** And include the rationale in the commit message so future sessions can audit the chain.

This rule has the same protective effect as a PIN but requires nothing for Craig to remember. The only way to bypass it is for the agent to lie about having asked — which `git diff` makes obvious on review.

#### Layer 2 (hard, at merge time): CODEOWNERS Lock

`CLAUDE.md` is listed in `.github/CODEOWNERS` with Craig as the required reviewer. GitHub branch protection enforces this: **no PR touching CLAUDE.md can merge to main without Craig's explicit approval review.** Even if a session somehow bypasses Layer 1 and pushes a doctrine change, it cannot land without Craig clicking "Approve" on the PR.

Together, these two layers cover both failure modes:
- **Rogue in-session edit** → Layer 1 catches it (the diff appears in chat first)
- **Bypassed Layer 1** → Layer 2 catches it (the PR cannot merge without Craig's review)

**No PIN. No memory burden on Craig. Same protection.**

---

## 📜 POSITIONING IS LOCKED — DO NOT DEVIATE

The Crontech brand positioning is locked in `docs/POSITIONING.md`. That file is binding doctrine — the same status as this CLAUDE.md. Any agent writing landing page copy, SEO meta, marketing content, or brand-facing text **MUST** read `docs/POSITIONING.md` first. Do not unilaterally change the positioning. Any deviation requires Craig's explicit authorization.

Key positioning rules (see `docs/POSITIONING.md` for the full version):
- **Audience is universal** — no primary segment cutoff
- **Tone is polite** — do NOT name competitors in public copy
- **Headline direction** — "The developer platform for the next decade"

---

## 0. SESSION PROTOCOL — READ THIS FIRST, EVERY SESSION

**Before doing ANYTHING in a Crontech session, the following protocol is MANDATORY. No exceptions. No shortcuts. No "I'll skip it just this once."**

### 0.1 The SessionStart Hook Runs Automatically

A SessionStart hook at `.claude/hooks/session-start.sh` runs **before every new Claude session begins**. It:
1. Installs all dependencies (`bun install`)
2. Fetches latest from origin and reports ahead/behind status
3. Runs `bun run check-links` and `bun run check-buttons` (zero-broken-anything enforcement)
4. Surfaces the latest Sentinel competitive intelligence
5. Reports current platform state (routes, tRPC procs, DB tables, test files)
6. Re-states the doctrine reminders before the agent acts

**The hook is the line in the sand. Every session begins from a known-good, fully-contextualised state. No more guessing what changed.**

If the hook reports any failure (`‼️`), **the very first task of the session is to fix it.** Not "after this feature." Not "I'll get to it." First. Always first.

### 0.2 The Anti-Scatter-Gun Rule

Crontech is a precision weapon. Sessions must be precision sessions. **No more scatter-gun work.** Every Claude session in this repo MUST follow this loop:

1. **Read the hook output.** Know the state. Know what changed.
2. **Read CLAUDE.md.** Re-read the doctrine. The doctrine is binding.
3. **State the objective in one sentence.** What is THIS session shipping? If you can't say it in one sentence, you haven't thought hard enough.
4. **Plan before you touch a file.** TodoWrite the plan. Every task. In order. With dependencies.
5. **Execute cleanly.** Touch only the files needed. No drive-by edits. No "while I'm here."
6. **Verify with checkers.** `bun run build`, `bun run check-links`, `bun run check-buttons`. All green or you don't ship.
7. **Commit, push, and PR.** Immediately. Every session ends with a clean push to origin and a pull request created to main. No work sits on a branch without a PR. If a PR already exists for the branch, update it — don't create a duplicate. No uncommitted work left behind.

**Violation of this loop is a doctrine breach.** Future Claude sessions will see the breach in the git history and lose trust in the prior work. Don't be the session that breaks the chain.

### 0.3 The Ahead-Of-Competition Rule

Crontech must be **80% to 100% ahead of every competitor at all times.** This is not aspirational. It is a hard constraint enforced by:

- **The Sentinel system** at `services/sentinel/` runs 24/7 collectors against GitHub, npm, Hacker News, ArXiv. Every release, every paper, every announcement is logged.
- **Before any new feature**, check the Sentinel intelligence store at `services/sentinel/data/intelligence.json` for relevant competitive moves.
- **If a competitor has shipped something we don't have**, that gap is a P0 issue. Close it before adding net-new features.
- **If a new technology emerges** (a faster runtime, a better protocol, a new model architecture), the platform must adopt or surpass it within ONE sprint. Loyalty is to the mission, not to the current stack.

**Before any new Claude session begins major work**, the agent should scan: GitHub releases for tracked competitors, latest npm versions for our dependencies, Hacker News top posts, ArXiv cs.AI/cs.LG/cs.CL submissions. The Sentinel collectors do this automatically — the agent's job is to **read what Sentinel found and act on it.**

### 0.4 The Build-Quality Gate

**No work merges without passing all of these:**

| Gate | Command | Pass Criteria |
|------|---------|---------------|
| Build | `bun run build` | 4/4 packages successful (apps/web, apps/api, packages/ui, services/edge-workers) |
| Type check | `bun run check` | 10/10 packages, 0 errors |
| Tests | `bun run test` | 12/12 packages, 100% pass |
| Link checker | `bun run check-links` | 0 dead links |
| Button checker | `bun run check-buttons` | 0 dead buttons |
| Lint | `bunx biome check apps packages services` | exit 0 |
| GateTest | GateTestHQ GitHub App (runs on every PR) | All modules pass. No CRITICAL findings. Merge blocked if red. |

CI enforces these. The session-start hook reports them. GateTest enforces them on every PR via the GateTestHQ GitHub App. **The agent enforces them voluntarily.** A session that pushes broken work to origin is a session that violated doctrine.

### 0.4.2 GateTest — The Green Ecosystem Enforcer (MANDATORY)

**No broken code reaches the customer. Ever.** GateTest is the enforcement mechanism. It is not optional. It is not advisory. It is a hard gate.

GateTest (`GateTestHQ` GitHub App) is installed on this repo and runs automatically on every PR. It scans 24 quality modules: security, accessibility, performance, SEO, links, fake-fix-detector, code-quality, and more. Results are posted as PR status checks.

**The rules:**
1. **Every PR must pass GateTest before merge.** No exceptions. No "I'll fix it later." No force-merge past red.
2. **CRITICAL findings block merge.** The platform decides, not the developer's impatience.
3. **GateTest is an external service.** It lives in its own repo (`ccantynz-alt/GateTest`). It imports ZERO code from Crontech. It scans externally via GitHub App webhook.
4. **The fake-fix-detector is the spear.** It catches when AI assistants apply symptom patches instead of real fixes (deleting assertions, swallowing errors, commenting out tests). If it flags something, it is almost certainly a real problem.
5. **GateTest + local quality gates = double coverage.** Local gates (build, check, test, links, buttons, biome) catch issues before push. GateTest catches anything that slips through on the PR. Two layers. Zero gaps.

**GateTest status — HARD GATE (observation mode retired 2026-04-21).** GateTest is a required status check. **Red GateTest blocks merge, full stop, no exceptions.** The prior "two clean PRs before flipping" observation sprint is retired by Craig directive 2026-04-21: *"we need to adjust their Claude.MD file immediately I can't launch that product knowing that it's going to not fix problems."* Every GateTest finding is treated as real — either fix the code, or tune the rule with Craig's explicit in-chat authorization. **Never merge through red.** The `gatetest-gate.yml` workflow must not set `continue-on-error` on the scanning step, and `GateTest — Quality Gate` must be in `main` branch protection's required-checks list. Any PR currently in flight with a red GateTest stops and addresses findings before merging — including PR #174.

### 0.4.1 The Clean Green Ecosystem Rules (BINDING)

The build-quality gate above is the *what*. These rules are the *how* — how we keep every package green every single day, with no exceptions, no "I'll fix it later," and no pragmatic softening of the bar.

1. **Every package must have at least one test file.** If a workspace member ships without tests, `bun run test` exits 1 and the doctrine is broken. Add a smoke test on day one — even a single `describe(...)` that imports the entrypoint and asserts it loads is enough to keep the gate honest.
2. **Orphan source files are forbidden.** Every `.ts`/`.tsx` file in `apps/`, `packages/`, and `services/` MUST be inside some `tsconfig.json`'s `include` glob. Files outside any tsconfig (stale duplicates, half-deleted refactors, "just in case I need this later" code) get deleted on sight. If it isn't type-checked, it isn't real.
3. **`continue-on-error: true` is forbidden on quality gates in CI.** Build, check, test, link, button, biome — none of these may be marked `continue-on-error`. If a gate is too noisy to enforce, the answer is to fix the noise, not silence the alarm. The only acceptable use of `continue-on-error` is for genuinely advisory non-gates (e.g. deploy preview comments).
4. **The mandatory strict tsconfig flags are non-negotiable.** Every package's `tsconfig.json` must have, at minimum:
   - `"strict": true`
   - `"exactOptionalPropertyTypes": true`
   - `"noUncheckedIndexedAccess": true`
   - `"noUnusedLocals": true`
   - `"noUnusedParameters": true`
   - `"noImplicitReturns": true`
5. **Softening tsconfig flags to unblock work is a doctrine breach.** Disabling `exactOptionalPropertyTypes`, downgrading `strict`, adding `// @ts-ignore`, casting to `any`, or scoping out a flag with `// @ts-expect-error` for "later" is not a fix — it is debt. Fix the code. If the code is genuinely impossible to make type-safe, escalate to Craig before touching the config.
6. **Drizzle migration SQL files MUST use `--> statement-breakpoint` between every DDL statement.** The libsql migrator runs one statement per `execute()` call. Without the breakpoint marker, every CREATE/ALTER after the first one in a file is silently dropped, and the DB ends up half-built. Always use `drizzle-kit generate` to author migrations (it inserts breakpoints automatically) — and if you hand-write one, you MUST insert `--> statement-breakpoint` between statements yourself. New migrations should also prefer `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so partially-applied DBs can re-run cleanly.
7. **Test suites that depend on a local DB MUST wipe and re-migrate before running.** Stale-schema drift is a recurring source of red tests. Use a `bunfig.toml` `[test].preload` script that deletes the DB file and runs `runMigrations()` from `@back-to-the-future/db/migrate` so every test run starts from a known-good schema. See `apps/api/test/setup.ts` + `apps/api/bunfig.toml` for the canonical pattern.
8. **A green ecosystem is the precondition for every commit.** Before `git commit`, the agent must verify: `bun run check` ✅, `bun run build` ✅, `bun run test` ✅, `bun run check-links` ✅, `bun run check-buttons` ✅, `bunx biome check` ✅. Pushing red work to origin is a doctrine breach even if "the failure was already there." If you broke nothing and the bar is red, fix it before you push — that *is* the job.

### 0.5 The Aggressor Mindset

**We are not the disruptor. We are not the challenger. We are the aggressor.**

- We do not ask "is this what users want?" We tell them what they want and prove it.
- We do not optimise for the lowest-common-denominator browser. We optimise for the bleeding edge and gracefully degrade.
- We do not worry about what Vercel, Cloudflare, Supabase, or Convex think. We force them to chase us.
- We do not wait for "best practices" to crystallise. We define them.
- We do not ship features. We ship advantages.

**Every PR must extend the lead.** If a PR doesn't make Crontech further ahead of the field, it shouldn't exist. Pure refactors that don't extend the lead are a luxury we cannot afford until we are unkillable.

### 0.6 What Counts As A "New Claude Session"

For the purposes of this doctrine, a "session" is any time:
- A Claude Code on the web session is started
- A Claude Code local session is started
- A subagent is spawned to do non-trivial work (more than 3 tool calls)

**Each session must independently re-read this doctrine.** The hook makes this automatic for the top-level session. Subagents must be given prompts that include the doctrine summary.

### 0.7 The Craig Authorization Gate (ASK BEFORE ACTING)

**Craig is the boss. Craig is the only person who authorizes major changes.** Claude is the executor, not the decision-maker. The following actions ALWAYS require Craig's explicit prior authorization — no exceptions, no "I'll just try it and revert if it doesn't work":

#### 🔴 HARD GATES — STOP AND ASK CRAIG

| Action | Why it needs authorization |
|---|---|
| Adding or removing a top-level dependency from the stack (e.g. swapping SolidJS for Svelte, dropping Hono for Express) | These shape the platform's identity. One swap cascades into hundreds of files. |
| Removing or renaming a vertical/product (e.g. "remove the legal vertical", "rebrand to X") | Strategic positioning decision. Craig owns the brand. |
| Modifying `docs/POSITIONING.md` | Locked doctrine. See §16. |
| Modifying `CLAUDE.md` itself in any non-trivial way (adding/removing rules, changing the iron rules, restructuring the doctrine) | This is the Bible. Bible changes need Craig. |
| Force-pushing any branch | Destructive. Can wipe out work the previous session left. |
| Deleting any branch other than a confirmed-merged feature branch | Destructive. |
| Renaming the GitHub repo or changing its visibility | Breaks integrations, deploy proxies, MCP scopes. |
| Changing the default branch on GitHub | Cascades into CI, deploy triggers, PR base branches. |
| Adding/removing GitHub Actions workflows (deploy.yml, ci.yml, etc.) | Affects every future deploy. |
| Adding/removing Cloudflare bindings (D1, KV, R2, AI, Durable Objects) in `wrangler.toml` | Affects production data layer. |
| Schema migrations that drop tables or columns | Data loss risk. |
| Pricing changes, plan tier changes, billing logic changes | Revenue-affecting. |
| Public copy on the landing page, pricing page, legal pages, or any SEO meta | Brand-affecting. Polite tone rules apply. |
| Naming or adversarial framing of competitors in public copy | Legal exposure. Attorney approval required. |
| Adding new top-level routes (e.g. `/foo`) that didn't exist before | Affects sitemap, link checker, navigation. |
| Removing or renaming existing top-level routes | Breaks bookmarks, SEO, internal links. |
| Adding a new third-party service (Sentry, Datadog, Algolia, etc.) | Vendor lock-in, cost, security review. |
| Adding a new authentication provider or changing the auth model | Security-critical. |
| Any change to security/compliance posture (encryption, audit logs, RLS, RBAC) | Compliance risk. |
| Any change Craig has explicitly said "ask me first" about in this session | Respect explicit instructions. |

#### 🟡 SOFT GATES — TELL CRAIG WHAT YOU'RE DOING

| Action | What to do |
|---|---|
| Refactoring more than 5 files at once | Post a one-line plan first. Wait 30s for objection. Then act. |
| Adding a new route, page, or component that wasn't on the agreed plan | Same. |
| Updating a dependency to a major new version | Same. |
| Touching files outside the agreed scope of the current task | Same. |

#### 🟢 FREE ACTIONS — JUST DO IT

- Reading any file
- Running any read-only command (`bun run check`, `git status`, `git log`, `bun test`)
- Creating tests for code that already exists
- Fixing typos, formatting, and Biome lint errors
- Bumping patch versions of dependencies via Renovate auto-merges
- Creating new feature branches (never deleting them)
- **All tactical fixes listed in §0.10** (fix-on-sight items: broken styling, dead code, missing error handling, hardcoded values, unused imports, type safety improvements, accessibility gaps, lint issues, missing tests)

**Default disposition: when uncertain, ASK.** Asking takes 30 seconds. Acting wrong takes hours to undo.

### 0.8 The Maximum Parallel Agent Mandate

**Crontech does not build with one agent when multiple agents could work in parallel.** This is the hardest rule in this entire document. Violation of it makes Crontech slower than the competition. Slower = dead.

#### The Iron Rule of Parallelism

> **For every task that can be decomposed, it MUST be decomposed and run in parallel.** If five subtasks can run independently, spawn five parallel agents. If eight can, spawn eight. If twelve can, spawn twelve. The only ceiling is true sequential dependency.

#### When to Spawn Parallel Agents (MANDATORY)

| Scenario | Action |
|---|---|
| **Wave deployment** (Wave 1, Wave 2, Wave 3 from §7) | Spawn ALL agents in the wave simultaneously, each in its own isolated git worktree (`isolation: "worktree"`) |
| **Multi-file refactor** with independent files | One agent per file or per logical group, parallel |
| **Multi-route page builds** | One agent per route, parallel |
| **Component library expansion** | One agent per component, parallel |
| **Test coverage sweep** | One agent per package, parallel |
| **Documentation sweep** | One agent per top-level doc area, parallel |
| **Competitive intelligence research** | One agent per competitor, parallel |
| **Bug triage across the codebase** | One agent per bug, parallel |
| **Cross-package dependency upgrade** | One agent per package, parallel |
| **Translation/i18n sweep** | One agent per locale, parallel |

#### When NOT to Parallelize

Only sequential dependencies justify serial work:

- One step's output is literally the input to the next (e.g. "build, then deploy")
- A migration that must complete before the next step can read the new schema
- Anything that touches the same file simultaneously (merge conflict risk)

**If you find yourself doing the same kind of work twice in a row, you should have spawned two agents.**

#### Parallel Agent Briefing Standard

Every parallel agent MUST be briefed with:

1. **The doctrine summary** (link to CLAUDE.md and a 3-bullet recap of the iron rules)
2. **The exact scope** — which files, which functions, which tests
3. **The non-scope** — what NOT to touch
4. **The exit criteria** — how to know when the task is done
5. **The Craig authorization gates relevant to the task** — what to ask before vs just do
6. **The isolation mode** — `isolation: "worktree"` for any agent that writes code

#### Parallel Agent Failure Handling

- If one parallel agent fails, the others continue. Do not roll back successful agents because one failed.
- Diagnose the failure, brief a replacement agent, run it. The other agents' work is preserved.
- If multiple parallel agents fail with the same error, that's a doctrine signal: there's an environment problem (broken dependency, broken proxy, broken hook). STOP and diagnose the environment before re-spawning.

#### Why This Rule Exists

Crontech is racing against companies with hundreds of engineers. We have agents. Our agents must move at agent speed, not human speed. **Every minute spent building serially when parallel was possible is a minute Vercel/Cloudflare/Supabase gained on us.** That is unacceptable.

### 0.9 The New-Agent Onboarding Protocol (READ-AND-CONFIRM)

**Authorized by Craig on 14 April 2026.** Every session in the Crontech repo must complete this protocol before touching a single file. No exceptions. No "I'll skip it just this once." The session-start hook already runs automatically; this protocol is what the agent must do with what the hook produces.

#### The three mandatory reads

Before calling any tool that writes, edits, or runs code, the agent MUST read — in full, not skim — the three doctrine files:

1. **`CLAUDE.md`** (this file). Iron rules, session protocol, Craig authorization gate, build-quality gate, parallel-agent mandate.
2. **`docs/POSITIONING.md`**. Locked brand doctrine — audience, tone, headline. Any marketing-copy change is gated by this file.
3. **`docs/BUILD_BIBLE.md`**. Locked block list — `BLK-001..BLK-N`. Every feature, every refactor, every bug fix belongs to a block. Locked blocks cannot be modified without Craig's explicit in-chat authorization.

If `HANDOFF.md` exists at the repo root, it is also mandatory reading. The handoff file may override normal workflow with session-specific context from the previous session.

#### The mandatory confirmation line

In the agent's **first message to Craig after the mandatory reads are complete**, the agent must post a single confirmation line, structured exactly like this:

> **Doctrine confirmed.** Read: `CLAUDE.md`, `docs/POSITIONING.md`, `docs/BUILD_BIBLE.md`. Locked blocks: `BLK-001`…`BLK-NNN` (SET or SHIPPED). I will not modify any locked block without Craig's in-chat authorization. Current block in motion: `BLK-XXX — <name>`.

Variations in phrasing are acceptable, but all four elements are mandatory:
1. Acknowledgement of the three doctrine files.
2. Explicit enumeration of locked block IDs.
3. Statement of the no-modification-without-auth rule.
4. Statement of which block this session is advancing (or "none — research only").

Silent execution without the confirmation line is a doctrine breach. The next session will see the missing confirmation in the git log / chat history and treat the work as untrusted.

#### The mandatory session log

At session end — before the user closes the session or after the last commit / push is verified — the agent must append a `SESSION_LOG` entry to `HANDOFF.md`. The entry records:

- Date and branch.
- Block(s) advanced, with their new status (unchanged / advanced / shipped).
- Files touched (apps-path list is enough; no need to copy diffs).
- Any locked-block authorization Craig granted during the session, quoted verbatim.
- Any open GateTest failures or unmerged PRs for the next agent to pick up.
- A single-line handoff: "Next agent should start by ___."

If `HANDOFF.md` does not exist, create it with this single entry. If it exists, append to the top (newest first).

After the next session's first action, per §0.0 above, the old handoff is deleted.

#### Why this protocol exists

Craig has lost hours to session-drift: one agent shipping a locked-block rewrite that the previous agent had just corrected, a second agent silently reverting positioning copy, a third agent rebranding a locked route. Every one of those breaches cost trust and production time.

The read-and-confirm protocol makes drift impossible to hide: if an agent writes to a locked block without citing Craig's authorization in its first message, the violation is visible in the chat history before any code runs. If the session ends without a `SESSION_LOG` entry, the next agent starts the next session knowing the prior agent broke protocol. Drift stops being silent, so drift stops being worth attempting.

### 0.10 The Zero-Idle Rule (PROACTIVE MODE)

**Authorized by Craig on 16 April 2026.** Claude does not sit idle. Every session must produce forward progress. Idle time is lost revenue, lost coding time, and lost competitive advantage.

#### The Three Proactive Mandates

1. **Fix-on-sight.** If you encounter broken code, dead patterns, hardcoded values that should be variables, missing error handling, stale imports, unused exports, or any other obvious defect *while working on something else*, **fix it immediately.** Do not note it for later. Do not file a mental TODO. Do not say "I noticed X but didn't touch it." Fix it. The cost of fixing a bug on sight is 30 seconds. The cost of leaving it for the next session is context-rebuilding + diagnosis + fix = 10 minutes minimum. Multiply by every bug left unfixed and the compound cost is catastrophic.

2. **Advance the platform.** When the primary task is complete, do not stop. Identify and implement the next highest-impact improvement from the BUILD_BIBLE block list. If all blocks are shipped or blocked on Craig, look for: missing test coverage, component quality improvements, performance optimizations, accessibility gaps, dead code removal, dependency updates. There is *always* work. The codebase is never perfect. Find what's next and do it.

3. **Never request permission for tactical fixes.** The Craig authorization gates (§0.7) exist for *strategic* decisions — new routes, stack changes, positioning, pricing. Tactical improvements are **free actions**:
   - Fixing broken styling, dead links, dead buttons
   - Replacing hardcoded values with proper abstractions
   - Adding missing error handling or input validation
   - Removing dead code, unused imports, stale files
   - Improving component accessibility (ARIA, keyboard nav)
   - Adding missing types or tightening type safety
   - Writing tests for untested code
   - Performance improvements that don't change APIs
   - Fixing lint/format issues

   If it makes the codebase better without changing architecture, user-facing behavior, or strategic direction — **just do it.**

#### The Idle Detection Rule

If at any point during a session the agent has no explicit task and is not currently executing a proactive fix or advancement, that is a doctrine breach. The session should:

1. Run `bun run check-links`, `bun run check-buttons`, `bun run build` to find any regressions.
2. Grep for known anti-patterns (hardcoded hex colors, `any` casts, `@ts-ignore`, unused exports).
3. Check the BUILD_BIBLE for the next unshipped block.
4. Execute the highest-priority item found.

**The only acceptable idle state is waiting for Craig's response to a question that blocks all further work.**

### 0.11 The Doctrine Drift Circuit Breaker

**Long conversations cause drift.** The further a session runs from the initial CLAUDE.md read, the more likely the agent is to forget rules, soften constraints, or invent patterns that contradict doctrine. This is not a character flaw — it is a context window reality.

#### The 10-Turn Re-Read Rule

Every 10 conversational turns (user message + agent response = 1 turn), the agent MUST silently re-read the following:

1. **The Iron Rules** (§0, rules 1–10) — 30 seconds to skim, infinite value in staying aligned.
2. **The Craig Authorization Gates** (§0.7) — the most commonly drifted section.
3. **The current session's objective** — as stated in the agent's first message.

This re-read is **silent** — the agent does not announce it to Craig. It simply re-grounds itself. If the re-read reveals that recent work has drifted from doctrine, the agent corrects course immediately and flags the drift to Craig: "I caught myself drifting from [rule X] — corrected."

#### Manual Circuit Breakers

Craig can force a re-read at any time by saying:

- **`rule check`** — Agent re-reads CLAUDE.md in full and confirms alignment.
- **`memory check`** — Agent re-reads HANDOFF.md, BUILD_BIBLE, and POSITIONING.md and confirms alignment.
- **`reset context`** — Agent re-reads all doctrine files and restates the session objective.

These are not punishments. They are tools. Use them freely.

### 0.12 The Memory Persistence Protocol

**Authorized by Craig on 16 April 2026.** Sessions are ephemeral. Knowledge must not be. Every session must leave the codebase smarter than it found it.

#### What Gets Persisted (MANDATORY)

At session end, the HANDOFF.md entry (§0.9) is the minimum. But the following additional persistence actions are also mandatory:

1. **Decisions made during the session** — If Craig authorized a new pattern, approved a dependency, rejected an approach, or made any architectural call, it MUST be recorded in the HANDOFF.md session log with Craig's exact words quoted. The next session cannot re-litigate what Craig already decided.

2. **Patterns discovered** — If the session discovered a pattern that future sessions need (e.g., "button checker regex stops at first `>` — put onClick before onMouseEnter", "Tailwind v4 supports `bg-[var(--color-x)]` syntax"), add it to the relevant section of CLAUDE.md or BUILD_BIBLE as a code comment, doc note, or rule — wherever it will be seen by the next agent at the right time.

3. **Open questions** — If the session ended with unresolved questions for Craig, they go in HANDOFF.md with enough context that Craig can answer without scrolling back through the conversation.

4. **Failure modes encountered** — If something broke in a surprising way, document the root cause and fix so the next session doesn't waste 20 minutes rediscovering it.

#### What Does NOT Get Persisted

- Internal reasoning or deliberation (keep it in the conversation, not in files)
- Speculative plans that Craig hasn't approved
- TODO comments in code (use the BUILD_BIBLE block system instead)

#### The Memory Loading Sequence

At session start, after the hook runs and the three mandatory reads complete, the agent SHOULD also check:

1. `git log --oneline -10` — What happened recently?
2. `git diff main..HEAD --stat` — What's on this branch?
3. Any `HANDOFF.md` entries from the previous session.

This gives the agent a 30-second situational awareness boost that prevents the most common session-start mistakes: re-doing work that's already done, reverting decisions Craig already made, or working on the wrong branch.

---

## 1. PROJECT IDENTITY & MISSION

**Project Name:** Crontech

**Mission:** Build the most technologically advanced full-stack platform purpose-built for AI website builders and AI video builders. Every architectural decision, every dependency, every line of code exists to make AI builders faster, more capable, and more dangerous than anything on the market.

**Core Thesis:** Nobody has combined the most advanced backend + frontend into one unified platform. We sit in pure whitespace. The entire industry is fragmented -- backend frameworks over here, frontend frameworks over there, AI bolted on as an afterthought, edge computing treated as a deployment target instead of a compute primitive. We reject all of that. We unify everything into a single, cohesive war machine.

**The Standard:** We must be **80%+ ahead of ALL competition at ALL times.** Not 10%. Not 30%. Eighty percent. If a competitor closes ground, we accelerate. If a new technology emerges that threatens our lead, we absorb it or destroy the need for it.

**What This Is Not:** This is not a framework. This is not a boilerplate. This is not a starter kit. This is a **self-evolving, self-defending technology war machine.** It learns. It adapts. It gets faster while you sleep. Every layer has AI woven into its DNA -- not bolted on, not plugged in, not optional. AI is the bloodstream of this platform.

**Critical Dependency:** Multiple downstream products depend on this platform. They cannot launch until Crontech ships. Every day of delay is a day those products are blocked. This is not a side project -- it is the foundation that everything else is built on. Ship fast. Ship now. Ship right.

**First of Its Kind:** No one has ever combined the most advanced backend service with the most advanced frontend service into a single, unified, AI-native platform. This is the first. It must work on every device, integrate with everything, and set the standard that everyone else chases.

**Non-Negotiable Principles:**
- **ZERO BROKEN ANYTHING.** Every button must work. Every link must resolve. Every page must render. Every form must submit. Every error must be handled gracefully. We will be in front of the most successful people in the world — there is no room for "coming soon", dead buttons, 404s on our own internal links, broken forms, unstyled pages, or placeholder text that shipped to production. If it's not finished, it does not ship. If it ships, it is finished. This is the standard.
- **100K-QUALITY WEBSITE.** Every pixel, every interaction, every copy word must feel like a six-figure agency built it. No amateur hour. No "good enough". If a professional looks at it and thinks "this feels cheap", we have failed.
- **AGGRESSIVE NUMBER-ONE POSITIONING.** We are not trying to be "a good option". We are trying to be the only option. Every decision must reinforce that we are the best, the fastest, the most capable. Second place is failure.
- Speed is survival. If it's slow, it's dead.
- Type safety is not optional. Runtime errors are engineering failures.
- AI is not a feature -- it is the architecture.
- Edge-first. Cloud is the fallback, not the default.
- Zero HTML. Components only. The browser is a render target, not a document viewer.
- If we can run it on the client GPU for free, we do. Every token we don't pay for is a weapon.

---

## 2. COMPETITIVE POSITION & MARKET GAPS

We occupy whitespace. Not a sliver of whitespace -- a canyon. Here is what NO ONE else is doing:

### Gap 1: No Platform Combines WebGPU + AI + Real-Time as Unified Full-Stack

Every existing platform treats these as separate concerns. WebGPU is a "graphics thing." AI is a "cloud thing." Real-time is a "WebSocket thing." We treat them as ONE compute fabric. A single request can touch client-side GPU inference, edge-deployed AI agents, real-time collaborative state, and cloud GPU clusters -- seamlessly, in the same type-safe pipeline. Nobody else is even attempting this.

### Gap 2: No Framework Has AI Woven Into EVERY Layer

Everyone else bolts AI on. Add an AI endpoint. Plug in a chatbot. Throw an LLM at your search bar. That is weak. In Crontech, AI is the nervous system:

- **AI-driven routing** -- Routes optimize themselves based on usage patterns and user intent
- **AI-optimized data fetching** -- Queries are rewritten, prefetched, and cached by AI agents that understand your data model
- **AI-powered error recovery** -- When something breaks, AI agents diagnose, patch, and recover before the user notices
- **AI-assisted real-time collaboration** -- AI mediates conflicts, suggests edits, and co-authors alongside humans
- **Automatic semantic search** -- Every piece of data is vector-indexed automatically. Search understands meaning, not just keywords.
- **Built-in RAG pipelines** -- Retrieval-Augmented Generation is a first-class primitive, not a research project you wire up yourself

This is not "AI-enhanced." This is **AI-native from the ground up.**

### Gap 3: No Platform Treats Client GPU + Edge + Cloud as One Unified Compute Tier

The industry thinks in silos: client, edge, server. We think in ONE compute mesh. A workload runs wherever it is fastest and cheapest:

- **Client-side AI inference via WebGPU costs $0/token.** Llama 3.1 8B runs at 41 tokens/second in the browser. That is free intelligence.
- **Edge nodes handle latency-sensitive logic** in sub-5ms cold starts across 330+ cities.
- **Cloud GPUs (A100/H100) handle heavy lifting** only when the client and edge cannot.

The platform decides where to run each computation. The developer does not think about deployment targets. The platform is the deployment target.

### Gap 4: No Platform Combines Real-Time Collaboration Primitives (CRDTs) + AI Agents + Edge Computing

CRDTs exist. AI agents exist. Edge computing exists. Nobody has fused them. We have:

- **Yjs CRDTs** for conflict-free real-time state
- **AI agents that participate in collaborative sessions** as first-class peers, not API calls
- **Edge-deployed collaboration infrastructure** so two users on the same continent never route through a US data center

This enables AI-assisted website building and AI-assisted video editing where humans and AI agents co-create in real-time with zero latency.

### Gap 5: The Experiment-to-Production Bridge for AI is Broken

**80% of AI experiments never deploy.** The gap between "cool demo" and "production service" is a graveyard. We eliminate it:

- Same code runs in development and production
- AI agents are tested, versioned, and deployed with the same pipeline as application code
- Model inference scales from browser (free) to edge (cheap) to cloud GPU (powerful) without code changes
- Observability is built in from day one -- you see what your AI agents are doing, why, and how well

### The Competition (And Why They Lose)

| Competitor | Approach | Their Weakness |
|---|---|---|
| **Vercel** | Framework-led (Next.js ecosystem) | Locked to React, AI bolted on, no WebGPU, no CRDT primitives, no client-side inference |
| **Cloudflare** | Infrastructure-led | Raw infrastructure, no opinions, no AI integration, no framework coherence |
| **Supabase** | Open-source BaaS | Database-centric, no edge compute story, no AI layer, no frontend opinion |
| **Convex** | Reactive backend | Backend-only, no frontend, no AI, no edge GPU, no WebGPU |
| **T3 Stack** | Type-safe boilerplate | It's a template, not a platform. No runtime, no AI, no edge, no evolution |

**None of them occupy our whitespace.** Not one. We are building in a category that does not exist yet.

**Market Timing:** We are early adopter / bleeding edge. Most of the industry will not adopt these patterns for 2-3 years. By then, we will be so far ahead that catching up requires rebuilding from scratch. That is the point. We are not competing -- we are lapping.

---

## 3. TECHNOLOGY STACK (THE ARSENAL)

Every tool was chosen for a reason. If it is in this stack, it is the best in its class. If something better emerges, we replace without sentiment.

---

### Runtime & Backend

| Technology | Role | Why It's Here |
|---|---|---|
| **Bun** | Runtime | 52K+ req/s. 10-20x faster installs. Cold starts 8-15ms. Native TypeScript execution. Built-in bundler, test runner, package manager. One tool replaces five. |
| **Hono** | Web Framework | 4x faster than Express. Runs on every edge, serverless, and runtime platform that exists. RegExpRouter is the fastest JavaScript router in existence. Middleware ecosystem is production-ready. |
| **Axum (Rust)** | Performance-Critical Microservices | Lowest memory footprint of any web framework. Built by the Tokio team. When TypeScript is not fast enough -- and sometimes it is not -- Rust handles it. Video processing, heavy AI pipelines, compute-intensive transforms. |
| **tRPC v11** | API Layer | End-to-end type safety with zero codegen. React Server Components native support. Change a backend type, see the frontend error instantly. No OpenAPI spec, no code generation step, no drift. |
| **Drizzle ORM** | Database Access | Code-first, SQL-like TypeScript. 7.4KB bundle. Zero generation step. Optimal for serverless and edge where cold start size kills you. You write TypeScript that looks like SQL. No magic, no surprises. |

---

### Frontend (ZERO HTML - Component-Only Architecture)

**You never write HTML. Ever.** The browser is a render target. You write components. They compile to surgical DOM updates. This is not a suggestion -- it is the architecture.

| Technology | Role | Why It's Here |
|---|---|---|
| **SolidJS + SolidStart** | Primary Framework | The fastest reactive framework in existence. True signals -- not React's fake reactivity through re-renders. NO virtual DOM. JSX compiles to direct, surgical DOM mutations. When a signal changes, only the exact DOM node that depends on it updates. Nothing else moves. This is how reactivity should have always worked. |
| **WebGPU Rendering Layer** | Performance-Critical Visuals | For visualizations and video processing that the DOM cannot handle. PixiJS React v8 for 2D GPU-accelerated rendering. Use.GPU for compute shaders. The client GPU is a first-class compute resource, not a display adapter. |
| **Tailwind v4** | Styling | Rust-based engine (Lightning CSS). 10x faster builds than Tailwind v3. CSS-first configuration. No JavaScript config file. Styles are atomic, composable, and ship zero unused CSS. |
| **Motion (Framer Motion)** | Animation | Production-grade UI animations. Spring physics, layout animations, gesture support. Animations are declarative and performant. |
| **React Three Fiber + Drei** | 3D Rendering | Full Three.js power through a declarative component API. Drei provides battle-tested abstractions. For 3D website experiences and video scene composition. |
| **Biome** | Code Quality | Replaces Prettier AND ESLint in a single tool. 50-100x faster. Written in Rust. One config, one tool, instant feedback. We do not wait for linters. |

---

### AI Layer (Woven Into Every Layer)

This is not an "AI features" section. AI is the circulatory system. Every technology here integrates with every other layer.

| Technology | Role | Why It's Here |
|---|---|---|
| **Vercel AI SDK 6** | AI Orchestration | Streaming responses, generative UI, agent support, tool approval workflows, 25+ LLM provider support. The universal interface for talking to any AI model from any environment. |
| **LangGraph** | Multi-Agent Workflows | Stateful, multi-step AI agent orchestration. Agents that plan, execute, observe, and adapt. Not single-shot LLM calls -- sustained autonomous workflows with memory and branching logic. |
| **Mastra** | Production AI Agents | TypeScript-native AI agent framework built for production, not notebooks. Type-safe agent definitions, built-in tool management, production observability. |
| **json-render + Zod Schemas** | AI-Composable UI | AI generates UI from component catalogs. Zod schemas define what components exist, what props they accept, and what they do. AI agents assemble entire interfaces from structured JSON. The AI does not guess at HTML -- it composes validated component trees. |
| **WebGPU + WebLLM** | Client-Side AI Inference | Llama 3.1 8B runs at 41 tokens/second in the browser via WebGPU. **Cost per token: $0.** No API call. No latency. No server. The user's GPU does the work. This is the single biggest cost advantage in our stack. |
| **Transformers.js v4** | In-Browser ML | Full ML inference pipeline running in the browser. Benchmarks show performance "faster than AWS inference" for supported models. Embeddings, classification, summarization -- all client-side, all free. |

---

### Database Layer

| Technology | Role | Why It's Here |
|---|---|---|
| **Turso** | Primary Database | Edge SQLite with embedded replicas. Data lives at the edge, next to your users. Zero-latency reads because the replica is embedded in the application. Native vector search built in -- no separate vector database needed for standard use cases. |
| **Neon** | Serverless PostgreSQL | When you need full Postgres power: complex queries, advanced indexing, pgvector for AI embeddings. Scale-to-zero means you pay nothing when idle. Branches databases like Git branches code. |
| **Qdrant** | Vector Search at Scale | Rust-built vector database. ACORN algorithm for filtered HNSW -- the fastest filtered vector search that exists. When Turso's built-in vectors are not enough, Qdrant handles billions of vectors without breaking a sweat. |

---

### Infrastructure

| Technology | Role | Why It's Here |
|---|---|---|
| **Cloudflare Workers** | Edge Compute | Sub-5ms cold starts. 330+ cities worldwide. $5/month for 10 million requests. This is where most of our code runs. Not in a data center -- at the edge, next to users. |
| **Cloudflare D1/R2/KV/Durable Objects** | Edge Data Layer | D1 for edge SQL. R2 for object storage (S3-compatible, zero egress fees). KV for global key-value. Durable Objects for stateful edge compute. The entire data layer lives at the edge. |
| **Modal.com** | Serverless GPU | A100 and H100 GPUs on demand. No provisioning, no idle costs. Spin up GPU compute in seconds, run AI workloads, shut down. For training, fine-tuning, and heavy inference that exceeds client-side capability. |
| **Fly.io** | Long-Lived Processes | Firecracker microVMs for processes that need to stay alive: WebSocket servers, persistent AI agents, long-running video processing jobs. Sub-second boot times, global deployment. |

---

### Auth & Security

| Technology | Role | Why It's Here |
|---|---|---|
| **Passkeys / WebAuthn (FIDO2)** | Primary Authentication | 98% login success rate (passwords average 13.8%). 17x faster than password + 2FA. Phishing-immune by design -- the credential is bound to the origin. No passwords to steal, no OTPs to intercept. This is the future of auth and we are using it now. |
| **Google OAuth 2.0** | Social Login | One-click sign-in via Google accounts. Reduces friction for new users. Leverages Google's identity infrastructure. Required for enterprise adoption where Google Workspace is standard. |
| **Username + Password** | Traditional Auth | Classic email/password authentication for users who prefer it or cannot use passkeys/OAuth. Bcrypt/Argon2 hashing. Rate-limited login attempts. Password complexity enforcement. |
| **2FA / TOTP (Planned)** | Secondary Verification | Time-based One-Time Passwords via authenticator apps (Google Authenticator, Authy). Required for admin accounts. Optional but encouraged for all users. Implementation priority: after core auth flows are stable. |
| **Zero-Trust Architecture** | Security Model | Never trust, always verify. Every request is authenticated and authorized regardless of network location. No VPNs, no "trusted" internal networks. Every service validates every call. |

---

### Real-Time

| Technology | Role | Why It's Here |
|---|---|---|
| **WebSockets + SSE** | Standard Real-Time | WebSockets for bidirectional real-time communication. Server-Sent Events for efficient server-to-client streaming (AI responses, live updates). The right tool for each direction. |
| **Yjs (CRDTs)** | Collaboration Primitives | Conflict-free Replicated Data Types. Multiple users and AI agents edit the same state simultaneously with automatic conflict resolution. No locking, no last-write-wins. Mathematical guarantees of consistency. |
| **Liveblocks** | Managed Collaboration | Production-grade collaboration infrastructure. Presence, cursors, comments, notifications. We build the AI-powered features; Liveblocks handles the plumbing. |

---

### Observability

| Technology | Role | Why It's Here |
|---|---|---|
| **OpenTelemetry** | Telemetry Standard | The universal standard for metrics, logs, and traces. Vendor-agnostic. Every service, every edge function, every AI agent emits structured telemetry through one standard. No vendor lock-in, no proprietary agents. |
| **Grafana + LGTM Stack** | Observability Platform | **Loki** for logs. **Grafana** for visualization. **Tempo** for distributed traces. **Mimir** for metrics. Full observability across edge, cloud, and client -- including AI agent behavior, inference latency, and token usage. |

---

### Build & Developer Experience

| Technology | Role | Why It's Here |
|---|---|---|
| **Turbopack** | Bundler | Rust-based. 10x faster development builds than Webpack. Incremental compilation means changes reflect in milliseconds, not seconds. |
| **Bun** | Package Manager | 10-20x faster than npm. Native lockfile. Workspaces just work. Install time is no longer a factor in developer velocity. |
| **Biome** | Linter + Formatter | 50-100x faster than ESLint + Prettier combined. Single binary, single config. Code quality enforcement that runs faster than you can save a file. |

---

> **This stack is not permanent. It is a living arsenal.** Every tool earns its place through performance, capability, and strategic value. The moment something better exists, we replace without hesitation. Loyalty is to the mission, not the tools.

---

## 4. ARCHITECTURE (THE WAR MACHINE)

This is the engine that makes everything else possible. Every decision here was made to maximize speed, minimize cost, and put AI at the center of every operation. No compromises. No legacy baggage.

---

### 4.1 Three-Tier Compute Model (NOBODY Else Has This)

AI workloads automatically flow between three compute tiers. No config. No manual routing. The system decides where your code runs based on model size, device capability, and latency requirements.

```
CLIENT GPU (WebGPU) ──→ EDGE (Cloudflare Workers) ──→ CLOUD (Modal.com GPUs)
       $0/token              sub-50ms                    Full H100 power
       sub-10ms              lightweight inference        heavy inference
       models <2B            Workers AI + Hono            training + video
```

**Client GPU -- The Free Tier That Actually Works**

- WebGPU acceleration via WebLLM + Transformers.js
- Zero cost per token. The user's hardware does the work.
- Sub-10ms latency. Nothing beats local.
- Handles models under 2B parameters. That covers summarization, classification, embeddings, small completions.
- Falls back gracefully when the device cannot handle it.

**Edge -- The Speed Layer**

- Cloudflare Workers AI for lightweight inference at the edge.
- Hono for routing. Turso embedded replicas for data. Sub-50ms globally.
- No cold starts. No container spin-up. Always warm. Always fast.
- Handles mid-range tasks that exceed client GPU but do not need full cloud power.

**Cloud -- The Full Power Layer**

- Modal.com with H100 GPUs. Scale to zero, scale to thousands.
- Heavy inference, fine-tuning, training jobs, video processing pipelines.
- Pay only for what you use. No reserved instances burning money while idle.
- Handles everything the lower tiers cannot.

**Smart Routing -- The Brain**

The system automatically determines where to run every request:

1. Check device capability (WebGPU available? Enough VRAM?)
2. Check model size (under 2B? under 7B? larger?)
3. Check latency requirements (real-time UI? background job?)
4. Route to the cheapest tier that meets all constraints.

**Fallback Chain -- Zero Failures**

```
Client GPU can't handle it? → Edge picks it up.
Edge can't handle it?       → Cloud picks it up.
Cloud overloaded?           → Queue + notify. Never drop.
```

Seamless. The user never knows which tier served them. They just know it was fast.

---

### 4.2 AI-Native Architecture (AI in EVERY Layer)

This is not "add AI to your app." The app IS AI. Every layer, every subsystem, every pipeline has AI baked in from day one.

**AI-Driven Routing**
Routes optimize themselves based on user behavior patterns. The system learns which pages users visit next and prefetches accordingly. Not static routes -- living, breathing, adaptive routes.

**AI-Optimized Data Fetching**
Predictive prefetching based on usage patterns. The system watches what data users request and pre-loads the next likely query before they ask. Latency drops to near-zero for repeat patterns.

**AI-Powered Error Recovery**
Self-healing error boundaries that do not just catch errors -- they diagnose and fix them. Component crashes? The AI analyzes the stack trace, identifies the root cause, attempts a hot fix, and only escalates to the user if it truly cannot recover.

**AI-Assisted Collaboration**
AI agents participate in real-time editing sessions as first-class collaborators. They suggest edits, catch conflicts, auto-format, and generate content alongside human users. Not chatbots sitting in a sidebar -- actual participants in the document.

**Semantic Search on ALL Data**
Every data store has automatic vector embeddings. No manual indexing. No separate search infrastructure. You store data, it becomes searchable by meaning, not just keywords. Automatically.

**Built-in RAG Pipelines**
Every content source is automatically indexed for retrieval-augmented generation. Blog posts, docs, user content, database records -- all of it feeds into RAG pipelines that AI agents can query in real time.

**Generative UI**
AI generates UI components from Zod-schema component catalogs using the json-render pattern. Describe what you want. The AI selects components, composes them, fills in props, and renders. No templates. No boilerplate. Pure generation.

**AI Video Processing Pipeline**
WebGPU-accelerated video encoding, decoding, and effects processing directly in the browser. Client-side video manipulation at near-native speed. Effects, transitions, encoding -- all on the user's GPU before anything hits the server.

---

### 4.3 Zero-HTML Component System

HTML is a compile target. You never write it. You never think about it.

- **SolidJS signals** compile JSX to direct DOM operations. No virtual DOM. No diffing. No reconciliation overhead. Surgical updates at the speed of raw JavaScript.
- **Component catalog defined by Zod schemas.** Every component has a machine-readable schema that describes its props, slots, variants, and constraints. AI can read these schemas and compose components without examples.
- **AI can compose, rearrange, and generate component trees.** The schema catalog is the API. The AI is the developer. Humans curate and override.
- **WebGPU canvas renderer** for performance-critical views using PixiJS + Use.GPU. When the DOM is not fast enough, drop to the GPU. Visualizations, video canvases, particle effects -- all GPU-native.
- **Schema-driven everything.** Every component is introspectable, testable, AI-composable. No magic strings. No hidden props. No undocumented behavior.
- **Module Federation 3.0** for micro-frontend composition at scale. Independent teams ship independent modules. The system composes them at runtime. No monolith. No coordination bottleneck.

---

### 4.4 Real-Time Collaboration Engine

Multi-user, multi-agent, conflict-free, globally distributed editing. This is not bolted on. This is foundational.

- **Yjs CRDTs** for conflict-free state synchronization. No locks. No merge conflicts. Multiple users and AI agents edit the same document simultaneously and the system converges automatically.
- **AI agents as collaboration participants.** They hold cursors. They make selections. They type. They are peers in the editing session, not external services you call.
- **Sub-50ms global latency** via edge deployment. Cloudflare Workers relay collaboration events through the nearest edge node. Users in Tokyo and New York edit together without noticeable lag.
- **Operational transforms for text, signals for state, CRDTs for documents.** Each data type gets the synchronization primitive that fits it best. Text gets OT for character-level precision. App state gets SolidJS signals for reactivity. Documents get CRDTs for distributed consistency.

---

### 4.5 Data Architecture

```
[Client Cache] <──> [Turso Edge SQLite Replica] <──> [Turso Primary]
                                                          |
                                                          v
                                                  [Neon Serverless PG]
                                                          |
                                                          v
                                                  [Qdrant Vector DB]
```

**Turso Embedded Replicas -- Zero-Latency Reads at the Edge**
SQLite replicas embedded directly in edge workers. Reads hit local storage. No network hop. No cold query. Data is already there when you need it. Writes replicate to the primary asynchronously.

**Neon Serverless PostgreSQL -- Full Power When You Need It**
Complex queries, joins, transactions, full-text search, stored procedures. When SQLite is not enough, Neon provides the full PostgreSQL engine on demand. Serverless. Scales to zero. No idle costs.

**Qdrant Vector Database -- AI-Native Search**
Purpose-built vector search for AI and semantic features. Embeddings stored and queried at scale. Powers semantic search, RAG pipelines, recommendation engines, similarity matching. Fast. Accurate. Purpose-built.

**Automatic Sync Between Tiers**
Data flows between tiers without manual intervention:
- Client cache syncs to edge replicas.
- Edge replicas sync to Turso primary.
- Turso primary syncs relevant data to Neon for complex queries.
- All content sources feed embeddings into Qdrant automatically.

**pgvector on Neon as Fallback**
If Qdrant is unavailable or for simpler vector workloads, pgvector on Neon provides vector search within PostgreSQL. One fewer service to manage for smaller deployments. Full Qdrant for production scale.

---

## 5. SENTINEL SYSTEM (24/7 COMPETITIVE INTELLIGENCE)

This is the always-on monitoring war room. It runs WITHOUT human sessions. It watches everything. It analyzes everything. It alerts you before competitors even announce what they are building.

You do not check the news. The news checks in with you.

---

### 5.1 Collection Layer (Always Running)

These collectors never sleep. They never miss a release. They never forget to check.

| Collector | Source | Tool | Schedule |
|---|---|---|---|
| **GitHub Release Monitor** | Competitor repos: Next.js, Remix, SvelteKit, Qwik, Astro, Hono, Solid, tRPC, AI SDK, LangChain | GitWatchman + GitHub RSS feeds | **Real-time** |
| **npm Registry Watcher** | Package releases, version bumps, new packages from tracked authors | NewReleases.io + npm Registry API | **Hourly** |
| **Tech News Scanner** | Hacker News (100+ points), ArXiv (cs.AI, cs.LG, cs.CL) | hnrss.org filtered feeds + arxiv_notify | **Every 6 hours** |
| **Competitor Stack Scanner** | Competitor websites -- what tech they actually run in production | Wappalyzer API | **Weekly** |
| **Website Change Detector** | Competitor docs, blogs, changelogs -- what they are writing about | Visualping | **Every 6 hours** |

Every collector reports to the intelligence layer. If a collector stops reporting, the dead-man's switch fires immediately. No silent failures. No gaps in coverage.

---

### 5.2 Intelligence Layer (AI-Powered Analysis)

Raw data is noise. Intelligence is signal. This layer turns feeds into action.

**n8n Workflows (Self-Hosted, Free, Unlimited)**
Orchestrate the entire collection-to-analysis-to-alerting pipeline. Self-hosted means no rate limits, no vendor lock-in, no monthly fees scaling with usage. Unlimited workflows. Unlimited executions.

**Claude Code /loop (Scheduled AI Analysis)**
Scheduled AI analysis tasks with a 72-hour safety cap and auto-retrigger. Claude analyzes competitor releases, identifies threats and opportunities, writes intelligence briefs, and suggests concrete responses. Runs on schedule. Re-triggers itself. Stays within safety bounds.

**LangGraph Multi-Agent System**
Multiple specialized agents collaborate on intelligence analysis:
- **Tech Scout**: identifies new technologies, libraries, and patterns emerging in the ecosystem.
- **Threat Analyst**: evaluates competitor moves and assesses impact on our position.
- **Opportunity Finder**: spots gaps in competitor offerings that we can exploit.

These agents share context, debate conclusions, and produce consensus intelligence reports. Not one AI guessing -- multiple AIs cross-checking each other.

---

### 5.3 Alert Layer (War Room Dashboard)

Intelligence is worthless if it does not reach the right people at the right time.

**Grafana Dashboard (LGTM Stack)**
Unified view of all intelligence streams. Logs, metrics, traces, and now competitive intelligence -- all in one place. Custom panels for threat level, competitor activity timelines, and opportunity scoring.

**Slack Channels -- Tiered Urgency**
| Channel | Purpose | Frequency |
|---|---|---|
| `#sentinel-critical` | Immediate threats. Major competitor releases. Breaking changes in dependencies. | As they happen |
| `#sentinel-daily` | Daily digest. Summary of all activity in the last 24 hours. | Once per day |
| `#sentinel-weekly` | Weekly strategic brief. Trends, patterns, recommendations. | Once per week |

**Discord Webhooks**
Backup alerting channel. If Slack goes down or a team member prefers Discord, intelligence still flows. Redundancy is not optional.

**Dead-Man's Switch**
If ANY collector stops reporting on schedule, an alert fires immediately. GitHub Actions cron jobs can silently fail. Cloudflare Workers can silently timeout. The dead-man's switch catches all of it. No silent failures. Ever.

---

### 5.4 Self-Evolution Pipeline

The platform does not just monitor competitors -- it evolves itself.

**Renovate (Automated Dependency Updates)**
Automated PRs for every dependency update. Patches automerge. Minor versions get tested and merged within hours. Major versions get flagged for review. The codebase never falls behind.

**Dependabot (Security-Focused Backup Scanner)**
Security advisories trigger immediate PRs. Renovate handles the routine updates. Dependabot catches the security emergencies. Two scanners. Zero missed vulnerabilities.

**Feature Flags (PostHog / Unleash)**
Progressive delivery for every new capability. Nothing goes from zero to 100% instantly. Everything rolls out gradually, measured, with automatic rollback if metrics degrade.

**AI-Powered Rollout Decisions**
The system evaluates risk and chooses the deployment strategy:

| Risk Level | Strategy | Details |
|---|---|---|
| **Low Risk** | Direct deploy | Dependency patches, config changes, copy updates |
| **Medium Risk** | Canary deployment | New features, refactors -- 5% traffic, monitor, expand |
| **High Risk** | Blue-green with extended soak | Architecture changes, data migrations -- full parallel environment, 48-hour soak minimum |

**Architecture Decision Records (Auto-Updated)**
When stack components change -- a new library adopted, a service swapped, an architecture pattern shifted -- ADRs update automatically. The system documents its own evolution. No stale docs. No tribal knowledge.

---

### 5.5 Budget Tiers

Not everyone starts at war footing. Scale your intelligence operation as you scale your platform.

| Tier | Monthly Cost | What You Get |
|---|---|---|
| **Lean Start** | **$0 - $100** | GitWatchman + GitHub RSS feeds + Cloudflare Workers cron triggers + Renovate + Grafana OSS + Slack webhooks. Covers the basics. You will know about major releases and security issues within hours. |
| **Power Mode** | **$300 - $500** | Everything in Lean Start + n8n self-hosted + Claude /loop scheduled analysis + NewReleases.io + Visualping. AI-powered analysis turns raw feeds into actionable intelligence. Website change detection catches stealth launches. |
| **Full War Room** | **$1,000 - $2,000** | Everything in Power Mode + Brand24 social monitoring + Semrush SEO/content intelligence + Wappalyzer tech stack scanning + LangGraph Cloud multi-agent analysis. Total situational awareness. Nothing moves in your competitive landscape without you knowing. |

Start at Lean. Graduate to Power Mode when you have revenue. Go Full War Room when you are ready to dominate.

---

> **This architecture does not wait for the future. It builds it.**
> Three-tier compute. AI in every layer. Intelligence that never sleeps.
> Crontech is not a framework -- it is a force multiplier.

---

## 5A. SECURITY & COMPLIANCE (LEGAL-GRADE)

This platform must operate in the highest-stakes environments: client meetings, depositions, courtrooms, and any legal proceeding where data integrity is not optional -- it is the law. Every piece of data that flows through this system must be defensible in court.

---

### 5A.1 Court Admissibility (FRE 901/902)

All artifacts (recordings, documents, transcripts, exhibits) must meet Federal Rules of Evidence standards:

- **SHA-256 hashing** at creation and every lifecycle event. Every artifact gets a cryptographic fingerprint the moment it exists.
- **RFC 3161 timestamps** from a trusted Timestamping Authority on all critical events. Proves data existed at a specific point in time.
- **Hash chaining** -- each audit log entry includes the hash of the previous entry. Retroactive tampering is mathematically detectable.
- **FRE 902(14) compliance** -- the system can produce certification that any copy is a true and complete duplicate via cryptographic hash verification.
- **WORM storage** (Write-Once-Read-Many) for all evidence artifacts. AWS S3 Object Lock (Compliance Mode) or equivalent. Even root accounts cannot delete or modify.
- **Metadata preservation** -- original metadata of uploaded documents is never stripped or modified. System metadata (upload time, uploader, hash, format) is generated and preserved alongside.

---

### 5A.2 Encryption (FIPS 140-3)

| Layer | Standard | Implementation |
|---|---|---|
| **In Transit** | TLS 1.3, AES-256-GCM, Perfect Forward Secrecy | All connections. No exceptions. mTLS for service-to-service. |
| **At Rest** | AES-256-GCM/XTS, envelope encryption | KMS-managed keys (AWS KMS / HashiCorp Vault). Key rotation annually minimum. |
| **In Use** | Confidential computing (TEEs) | Intel TDX / AMD SEV-SNP for AI processing of sensitive documents. |
| **Zero-Knowledge Option** | Client-side encryption | Data encrypted before transmission. Server never possesses plaintext. For attorney-client privilege. |
| **Cryptographic Modules** | FIPS 140-3 validated | All crypto operations use CMVP-certified modules. Non-negotiable for government/legal. |
| **Post-Quantum Ready** | NIST ML-KEM (Kyber), ML-DSA (Dilithium) | Hybrid implementations planned. Data encrypted today must survive quantum computing. |

---

### 5A.3 Immutable Audit Trail

Every action in the system is permanently recorded. No deletions. No modifications. No exceptions.

**Required fields on every audit entry:**

| Field | Description |
|---|---|
| Event ID | UUID v4 |
| Timestamp | RFC 3339, trusted time source (NIST/GPS-synced NTP) |
| Actor | Authenticated user ID, display name, role |
| Actor IP + Device | Source IP, user agent, device fingerprint |
| Action | Standardized verb: CREATE, READ, UPDATE, DELETE, EXPORT, SIGN |
| Resource | Type + ID of affected resource |
| Detail | Fields changed, before/after values |
| Result | Success/failure + error code |
| Session ID | Link to auth session |
| Previous Hash | SHA-256 of previous entry |
| Entry Hash | SHA-256 of current entry (all fields) |
| Signature | Cryptographic signature of entry hash |

**Storage:** Append-only, WORM-compliant. Periodic root hash anchoring to external timestamping service.

---

### 5A.4 Digital Signatures & Non-Repudiation

- **PAdES B-LTA** for PDF signing (long-term archival -- signatures remain verifiable indefinitely)
- **RFC 3161 timestamps** on all signatures from trusted TSA
- **HSM-backed signing keys** (FIPS 140-3 Level 3)
- **PKI infrastructure** for system and user certificates
- **eIDAS QES support** for EU legal proceedings (Qualified Electronic Signatures)

---

### 5A.5 Compliance Certifications

| Certification | Priority | Why |
|---|---|---|
| **SOC 2 Type II** | MANDATORY | No law firm evaluates without it. Baseline. |
| **TLS 1.3 + AES-256** | MANDATORY | Built into architecture from day one. |
| **MFA / Passkeys** | MANDATORY | FIDO2 WebAuthn. NIST AAL2 minimum. |
| **Immutable Audit Logs** | MANDATORY | Hash-chained, signed, WORM storage. |
| **HIPAA** | MANDATORY | BAA-ready. Health-related legal matters. |
| **ISO 27001** | HIGH | International legal work and EU clients. |
| **FedRAMP Moderate** | HIGH | Federal government. ~325 NIST 800-53 controls. |
| **CJIS** | HIGH | Criminal justice data. Personnel background checks required. |
| **GDPR** | REQUIRED | EU data subjects. 72-hour breach notification. Configurable data residency. |
| **StateRAMP** | RECOMMENDED | 30+ states recognize. Single auth reusable across agencies. |
| **NIST AI RMF** | REQUIRED | AI in legal = high-risk under EU AI Act. |

---

### 5A.6 Data Residency & Sovereignty

- **Configurable region selection** -- data stored and processed only in selected geographic region
- **Region-locked encryption keys** -- EU data keys managed in EU KMS region
- **Network controls** prevent data transit through unauthorized regions
- **Documented data flow maps** for GDPR DPIAs and compliance audits

---

## 5B. COMPONENT ARCHITECTURE (THE ARSENAL)

Every component must be zero-HTML, AI-composable, and production-grade.

---

### 5B.1 Foundation Layer (Headless Primitives)

| Library | Role | Status |
|---|---|---|
| **Kobalte** | Radix equivalent for SolidJS. WAI-ARIA APG compliant. | Production-ready |
| **Ark UI** (`@ark-ui/solid`) | 45+ headless components by Chakra team. State machine-driven. | Production-ready |
| **Corvu** | Focused SolidJS-native primitives. Calendar, Dialog, Drawer, OTP, Resizable. | Production-ready |

### 5B.2 Application Layer

| Library | Role | Status |
|---|---|---|
| **solidcn** | shadcn/ui port with **built-in MCP server** for AI component discovery. 42 components. | AI-NATIVE |
| **Solid UI** | Largest shadcn/ui port. Built on Kobalte + Corvu + Tailwind. 1,300+ stars. | Production-ready |

### 5B.3 Specialized Components

| Component | Solution | Status |
|---|---|---|
| Data Tables | TanStack Table + TanStack Virtual (sorting, filtering, grouping, virtualization) | EXISTS |
| Drag & Drop | @thisbeyond/solid-dnd or dnd-kit-solid | EXISTS |
| Rich Text Editor | solid-tiptap (Tiptap/ProseMirror) | EXISTS |
| Code Editor | solid-codemirror (CodeMirror 6) or solid-monaco | EXISTS |
| Video Player | Vidstack Player (HLS, captions, accessible) | EXISTS |
| PDF Viewer | PDFSlick (SolidJS-native, PDF.js) | EXISTS |
| Audio Waveform | wavesurfer.js v7 (regions, timeline, spectrogram) | EXISTS |
| Forms + Validation | Modular Forms + Valibot (~3KB + ~700B/schema) | EXISTS |
| Digital Signatures | signature_pad (trivial SolidJS wrapper) | WRAP |
| Bates Numbering | pdf-lib (browser-side PDF manipulation) | WRAP |
| Doc Annotation/Redaction | Nutrient or Apryse SDK (GDPR/HIPAA compliant) | WRAP |

### 5B.4 Custom-Build Components (Our Competitive Moat)

These do not exist for SolidJS anywhere. Every one we build is a moat nobody can cross.

| Component | Description | Priority |
|---|---|---|
| **Deposition Video + Transcript Sync** | Vidstack + custom transcript with timestamp-indexed highlighting | CRITICAL |
| **Multi-Format Exhibit Viewer** | Unified: PDFSlick + Vidstack + wavesurfer.js + images. MIME-type switching. | CRITICAL |
| **Real-Time Transcription Display** | Streaming ASR + scrolling transcript with word highlighting | CRITICAL |
| **Case Chronology Timeline** | Custom SVG/Canvas. Event linking, evidence attachment, date filtering. | HIGH |
| **Chain-of-Custody Tracker** | Transfer events, digital signatures, tamper-evident audit display | HIGH |
| **Courtroom Presentation Engine** | Exhibit display, callout/zoom, side-by-side, annotation, impeachment view | HIGH |
| **Collaborative Video Editor** | WebGPU-accelerated, multi-user CRDTs, AI-assisted | HIGH |
| **Scheduling Calendar** | Full hearing/appointment scheduler | MEDIUM |
| **Kanban Board** | solid-dnd + custom components | MEDIUM |
| **Gantt/Timeline Chart** | Frappe Gantt wrapper + extensions | MEDIUM |

### 5B.5 AI-Composable Component Architecture

- **MCP Server** -- every component discoverable by AI agents via Model Context Protocol
- **Zod Schema Registry** -- every component's props, slots, events, variants defined as schemas
- **Runtime Validation** -- AI-generated configurations validated before rendering
- **Visual Regression** -- Playwright `toHaveScreenshot()` on every component, every commit

---

## 5C. UNIVERSAL DEVICE & INTEGRATION SUPPORT

This platform works on EVERY device and integrates with EVERYTHING. No exceptions.

---

### 5C.1 Device Support

- **Progressive Web App (PWA)** with full offline capability
- **Responsive rendering** -- phones, tablets, laptops, desktops
- **Adaptive rendering** -- detect device capabilities and adjust (GPU, memory, bandwidth)
- **WebGPU -> WebGL -> Canvas 2D fallback chain** for graphics
- **Input agnostic** -- touch, mouse, keyboard, voice, stylus
- **WCAG 2.2 AA minimum** accessibility
- **Print-ready rendering** for legal documents
- **Low-bandwidth mode** -- graceful degradation
- **Offline-first** -- local data with sync on reconnect

### 5C.2 Integration Architecture

| Protocol | Use Case |
|---|---|
| **REST API** | Public API for third-party integrations |
| **tRPC** | Internal type-safe API |
| **GraphQL** | Complex data queries for external consumers |
| **WebHooks** | Event-driven notifications |
| **WebSockets + SSE** | Real-time streaming |
| **OAuth 2.0 / OIDC** | Third-party authentication |
| **SAML 2.0** | Enterprise SSO |
| **SCIM** | Automated user provisioning |
| **MCP** | AI tool/agent integration |
| **CalDAV / iCal** | Calendar integration |
| **SMTP / IMAP** | Email integration |

### 5C.3 Platform Integrations

| Integration | Purpose |
|---|---|
| **Zoom / Teams / WebEx** | Video conferencing |
| **Microsoft 365 / Google Workspace** | Document and calendar sync |
| **Slack / Teams** | Communication and alerts |
| **Zapier / Make / n8n** | No-code automation |

> **If it exists, we integrate with it. If it doesn't have an API, we build an adapter.**

### 5C.4 Legal-Specific Integrations

| Integration | Purpose | Approach |
|---|---|---|
| **PACER / CM/ECF** | Federal court filing and docket access | Via CourtDrive or PacerPro APIs (normalized, handles court-specific variations) |
| **Clio** | Case management (largest market share, open API, 250+ integrations) | Priority #1 case management connector |
| **PracticePanther / MyCase** | Case management alternatives | REST API integration |
| **Relativity / Everlaw** | E-discovery platforms | REST API connectors |
| **LexisNexis** | Legal research (Cognitive APIs, entity resolution, PII redaction) | OAuth + REST API via Developer Portal |
| **Westlaw** | Legal research (2M+ legislative records, 500K+ case reports) | REST API via Thomson Reuters Developer Portal |
| **iManage / NetDocuments** | Legal document management | API integration with ethical wall support |
| **Prevail CheckMate** | Real-time deposition transcription + LLM streaming | API integration |
| **Epiq Narrate** | Real-time transcription, auto exhibit numbering, contradiction detection | API integration |

### 5C.5 Enterprise SSO & Identity

- **WorkOS** (or equivalent) for enterprise SSO -- handles SAML + OIDC + SCIM without building from scratch
- **SAML 2.0** is mandatory for AmLaw 200 firms -- cannot be skipped
- **SCIM** is now a must-have for enterprise procurement (automated provisioning/deprovisioning)
- The complete enterprise stack: **SSO + SCIM + Audit Logs** -- SSO alone is insufficient

### 5C.6 Internationalization

- **i18next** for multi-language support (SolidJS compatible)
- **RTL layout support** (Arabic, Hebrew) via CSS logical properties
- **Locale-sensitive formatting** -- dates, times, numbers (legally significant in documents)
- **Multi-script rendering** -- English + Mandarin in same document
- **Court interpreter support** -- real-time translation overlays
- **Certified translation tracking** -- chain of custody for translated documents

### 5C.7 Print & Court Filing

- **CSS @media print + @page** for court-compliant document formatting
- **Per-jurisdiction templates** -- federal, state, local court rules vary significantly
- **HTML-to-PDF pipeline** via headless Chrome for pixel-perfect output
- Specific typefaces (Century Schoolbook, Times New Roman), exact point sizes, margins, line spacing
- Non-compliance risks **court rejection** -- this is not optional

### 5C.8 Compliance Documentation

- **VPAT 2.5** required before selling to government-serving law firms or court systems
- Covers Section 508 (U.S.), EN 301 549 (EU), and WCAG
- Must be completed by third-party auditor with remediation plan

---

## 5D. ENVIRONMENT VARIABLES ROADMAP

This platform is 22 services rolled into one. Every service needs its own configuration. This section tracks all required environment variables across the stack. **No service launches without its env vars documented here first.**

### Auth Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth | YES | Google Cloud Console OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | YES | Google Cloud Console OAuth 2.0 client secret |
| `WEBAUTHN_RP_ID` | Passkeys | YES | Relying Party ID (domain name) |
| `WEBAUTHN_RP_NAME` | Passkeys | YES | Relying Party display name |
| `WEBAUTHN_ORIGIN` | Passkeys | YES | Expected origin for WebAuthn ceremonies |
| `SESSION_SECRET` | Auth | YES | Secret for signing session tokens |
| `JWT_SECRET` | Auth | YES | Secret for signing JWTs |

### Database Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `TURSO_DATABASE_URL` | Turso | YES | Primary Turso database URL |
| `TURSO_AUTH_TOKEN` | Turso | YES | Turso authentication token |
| `NEON_DATABASE_URL` | Neon | YES | Neon serverless PostgreSQL connection string |
| `QDRANT_URL` | Qdrant | YES | Qdrant vector database endpoint |
| `QDRANT_API_KEY` | Qdrant | PROD | Qdrant API key (production only) |

### AI Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | AI SDK | YES | OpenAI API key for embeddings and completions |
| `ANTHROPIC_API_KEY` | AI SDK | OPT | Anthropic API key for Claude models |

### Infrastructure Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Workers | DEPLOY | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Workers | DEPLOY | Cloudflare API token |
| `STRIPE_SECRET_KEY` | Billing | YES | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Billing | YES | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Billing | YES | Stripe webhook signing secret |

### Observability Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry | OPT | OTLP exporter endpoint |
| `GRAFANA_API_KEY` | Grafana | OPT | Grafana Cloud API key |

### Sentinel Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `SLACK_WEBHOOK_URL` | Alerts | OPT | Slack incoming webhook for alerts |
| `DISCORD_WEBHOOK_URL` | Alerts | OPT | Discord webhook for backup alerts |
| `GITHUB_TOKEN` | Collectors | OPT | GitHub PAT for release monitoring |

> **This table grows as services are added.** Every new integration must add its env vars here before merging.

---

## 6. DEVELOPMENT RULES & CONVENTIONS

These are not guidelines. These are laws. Break them and the build breaks. That is by design.

---

### 6.1 Absolute Rules (Non-Negotiable)

- **ZERO HTML.** Everything is components. SolidJS JSX compiles to DOM. You never author HTML directly. If you open a file and see a `<div>` outside of JSX, something is wrong.
- **TypeScript strict mode everywhere.** No `any`. No `@ts-ignore`. No exceptions. The type system is your first line of defense. Disable it and you are fighting blind.
- **Every function has a return type. Every prop has a type.** Implicit `any` is a bug. Period.
- **End-to-end type safety via tRPC.** Change the server, client gets a type error instantly. No drift. No "I forgot to update the frontend." The compiler catches it.
- **Zod schemas at every boundary.** API input/output, environment variables, configuration, component props for AI composition. If data crosses a boundary, Zod validates it.
- **Every component must be AI-composable.** Zod schema + json-render compatible. If AI cannot compose it, it is not a component -- it is technical debt.
- **Tests before merge. No exceptions.** Untested code does not ship. Untested code does not exist.
- **Biome for formatting and linting.** Not Prettier. Not ESLint. Biome. One tool. One config. 50-100x faster.
- **Bun for package management.** Not npm. Not yarn. Not pnpm. Bun. 10-20x faster. Native workspaces.
- **Conventional commits.** `feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`, `ci:`, `chore:`. No freeform commit messages. Automation depends on this.

---

### 6.2 File Structure

```
back-to-the-future/
├── CLAUDE.md                    # This file - the war plan
├── apps/
│   ├── web/                     # SolidStart web application
│   │   ├── src/
│   │   │   ├── components/      # UI components (zero HTML, all JSX)
│   │   │   ├── routes/          # File-based routing
│   │   │   ├── lib/             # Utilities, helpers
│   │   │   ├── ai/              # AI integration layer
│   │   │   │   ├── agents/      # AI agent definitions
│   │   │   │   ├── pipelines/   # RAG, video, generative UI pipelines
│   │   │   │   ├── schemas/     # Zod schemas for AI-composable components
│   │   │   │   └── inference/   # Client-side WebGPU inference
│   │   │   ├── gpu/             # WebGPU rendering layer
│   │   │   │   ├── canvas/      # PixiJS components
│   │   │   │   ├── video/       # Video processing pipeline
│   │   │   │   └── shaders/     # Custom WebGPU shaders
│   │   │   ├── collab/          # Real-time collaboration (Yjs/CRDTs)
│   │   │   └── stores/          # Signal-based state management
│   │   └── public/
│   └── api/                     # Hono API server (runs on Bun)
│       ├── src/
│       │   ├── routes/          # API route handlers
│       │   ├── trpc/            # tRPC router definitions
│       │   ├── ai/              # Server-side AI (LangGraph agents, RAG)
│       │   ├── db/              # Drizzle schemas + migrations
│       │   ├── auth/            # Passkey/WebAuthn handlers
│       │   ├── realtime/        # WebSocket + SSE handlers
│       │   └── video/           # Video processing (server-side)
│       └── workers/             # Cloudflare Worker entry points
├── packages/
│   ├── ui/                      # Shared component library
│   ├── schemas/                 # Shared Zod schemas (AI-composable)
│   ├── ai-core/                 # AI utilities shared between apps
│   ├── db/                      # Database client + schemas (Drizzle)
│   └── config/                  # Shared config (Biome, TypeScript, Tailwind)
├── services/
│   ├── sentinel/                # 24/7 competitive intelligence engine
│   │   ├── collectors/          # Data collectors (GitHub, npm, HN, ArXiv)
│   │   ├── analyzers/           # AI-powered analysis agents
│   │   ├── alerts/              # Slack/Discord/Grafana alerting
│   │   └── workflows/           # n8n workflow definitions
│   ├── gpu-workers/             # Modal.com GPU worker definitions
│   └── edge-workers/            # Cloudflare Worker scripts
├── infra/
│   ├── cloudflare/              # Wrangler configs, D1/R2/KV setup
│   ├── docker/                  # Container configs (Grafana, n8n, etc.)
│   └── terraform/               # Infrastructure as code
├── turbo.json                   # Turborepo config
├── biome.json                   # Biome config (linter + formatter)
├── bunfig.toml                  # Bun config
└── package.json                 # Root workspace
```

---

### 6.3 Component Architecture Rules

- Every component exports a Zod schema describing its props. No schema, no component.
- Components are pure functions of signals. No side effects in render. Ever.
- State lives in signals, never in component closures. Closures leak. Signals track.
- Complex state machines use XState v5 actors. If your state has more than three transitions, it is a machine.
- Side effects use Effect-TS for typed error handling. `try/catch` is for amateurs. Typed effects are for engineers.
- Every component has a corresponding `.test.ts` file. No test, no merge.
- Every component has a Storybook story for visual testing. If you cannot see it in isolation, you cannot trust it.

---

### 6.4 API Rules

- All APIs defined via tRPC routers. No raw Express handlers. No `fetch` wrappers. tRPC.
- Input validated with Zod (automatic from tRPC). Every input is validated before it touches business logic.
- Output validated with Zod (type-safe responses). Clients know exactly what they get. Always.
- Errors are typed and exhaustive. No `catch (e: any)`. Every error case has a type.
- Rate limiting on all public endpoints. No endpoint is unprotected. No exception.
- OpenTelemetry spans on all handlers. Every request is traced end-to-end. Every slow query is visible.
- All endpoints have integration tests. If it accepts a request, it has a test that proves it works.

---

### 6.5 AI Integration Rules

- Every AI feature must work across all three compute tiers (client GPU -> edge -> cloud). No tier-specific AI code.
- AI model selection is automatic based on device capabilities. The developer specifies intent, not infrastructure.
- All AI responses are streamed. Never block on a full response. Stream tokens as they arrive.
- AI-generated UI must use the component catalog (no raw HTML/CSS generation). The schema is the contract.
- All AI interactions are traced via OpenTelemetry. Every prompt, every completion, every tool call -- traced.
- AI agents have explicit tool approval workflows. Human-in-the-loop for destructive actions. Always.

---

### 6.6 Performance Budgets

These are not aspirations. These are constraints. CI fails if they are violated.

| Metric | Budget | Enforcement |
|---|---|---|
| First Contentful Paint | < 1.0s | Lighthouse CI |
| Largest Contentful Paint | < 1.5s | Lighthouse CI |
| Interaction to Next Paint | < 100ms | Lighthouse CI |
| Initial JavaScript Bundle | < 50KB | Bundle size check in CI |
| Time to AI Response (client) | < 200ms | Integration test |
| Time to AI Response (edge) | < 500ms | Integration test |
| Time to AI Response (cloud) | < 2s | Integration test |
| WebGPU Frame Rate | 60fps minimum | Performance test |
| API Response (edge) | < 50ms | Load test |
| API Response (cloud) | < 200ms | Load test |

---

## 7. AGGRESSIVE TODO LIST (THE WAR PLAN)

> **CRITICAL DEPENDENCY: Multiple products are blocked on this platform. Every day we do not ship is a day those products cannot launch. There is no "comfortable timeline." There is only NOW.**

This is not a roadmap. This is a battle plan. Phases overlap. Work runs in parallel. Multiple agents attack simultaneously. We ship the moment each phase hits its exit criteria -- not a day later.

---

### PHASE 0: FOUNDATION -- "Lay the Concrete" [IMMEDIATE]

The foundation determines everything. Get this wrong and everything built on top crumbles.

- [ ] Initialize Turborepo monorepo with Bun workspaces
- [ ] Configure Biome (linter + formatter) with strict rules
- [ ] Configure TypeScript strict mode across all packages
- [ ] Set up SolidStart app scaffold (`apps/web`)
- [ ] Set up Hono API server on Bun (`apps/api`)
- [ ] Set up tRPC router connecting SolidStart <-> Hono
- [ ] Set up Drizzle ORM with Turso connection
- [ ] Set up Tailwind v4 with SolidStart
- [ ] Create shared packages (`ui`, `schemas`, `ai-core`, `db`, `config`)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Set up Biome pre-commit hooks
- [ ] Deploy initial apps: web -> Cloudflare Pages, api -> Cloudflare Workers
- [ ] Set up Renovate for automated dependency management
- [ ] Set up Dependabot for security scanning
- [ ] Create initial Zod component schemas for core UI primitives

**Exit Criteria:** Monorepo builds. CI passes. Apps deploy. Types flow end-to-end.

---

### PHASE 1: CORE ENGINE -- "Build the Weapons" [START IMMEDIATELY AFTER PHASE 0]

The core platform capabilities. Authentication, data, real-time, AI foundation.

- [ ] Implement Passkey/WebAuthn authentication flow
- [ ] Build signal-based state management system
- [ ] Create core UI component library with Zod schemas (buttons, inputs, layouts, cards, modals, forms)
- [ ] Implement tRPC procedures for CRUD operations
- [ ] Set up Neon serverless PostgreSQL as secondary DB
- [ ] Set up Qdrant vector database connection
- [ ] Implement real-time WebSocket layer (Hono WebSocket + Durable Objects)
- [ ] Implement SSE streaming for AI responses
- [ ] Build AI integration layer (Vercel AI SDK 6 setup)
- [ ] Create first AI agent (site builder assistant)
- [ ] Set up OpenTelemetry instrumentation across all services
- [ ] Deploy Grafana + LGTM stack for observability
- [ ] Set up feature flags (PostHog or Unleash)
- [ ] Write integration tests for all API endpoints
- [ ] Performance benchmark: verify < 50KB JS, < 1s FCP

**Exit Criteria:** Users can sign in with passkeys. Data flows through tRPC. AI agent responds via streaming. Observability is live.

---

### PHASE 2: AI CORE -- "Unleash the AI" [OVERLAP WITH PHASE 1]

This is where we become something nobody else is. AI woven into every layer.

- [ ] Implement WebGPU detection and capability assessment
- [ ] Build three-tier compute routing (client GPU -> edge -> cloud)
- [ ] Integrate WebLLM for client-side inference
- [ ] Integrate Transformers.js v4 for in-browser ML
- [ ] Set up Modal.com GPU workers for heavy inference
- [ ] Build RAG pipeline: auto-index all content -> Qdrant -> retrieval
- [ ] Implement generative UI system (json-render + Zod component catalog)
- [ ] Build AI website builder agent (multi-step, tool-calling)
- [ ] Build AI video builder pipeline (WebGPU-accelerated)
- [ ] Implement AI-driven routing (behavior-based optimization)
- [ ] Implement predictive data prefetching
- [ ] Implement AI-powered error recovery (self-healing error boundaries)
- [ ] Build LangGraph multi-agent orchestration for complex tasks
- [ ] Implement AI streaming with generative UI (server -> client component streaming)
- [ ] Add human-in-the-loop approval for destructive AI actions
- [ ] Trace all AI interactions with OpenTelemetry

**Exit Criteria:** AI runs on all three tiers. Website builder agent generates full pages. Video pipeline processes clips client-side. Generative UI composes from catalog.

---

### PHASE 3: COLLABORATION ENGINE -- "Connect the Hive" [PARALLEL WITH PHASE 2]

Real-time, multi-user, multi-agent collaboration. The feature that locks users in.

- [ ] Integrate Yjs for CRDT-based document collaboration
- [ ] Build real-time cursor/presence system
- [ ] Implement AI agents as collaboration participants
- [ ] Build collaborative website builder (multi-user, real-time)
- [ ] Build collaborative video editor (multi-user, real-time)
- [ ] Implement conflict resolution UI for CRDT edge cases
- [ ] Sub-50ms latency verification across global edge network

**Exit Criteria:** Two users and one AI agent edit a website simultaneously with zero conflicts. Latency under 50ms globally.

---

### PHASE 4: SENTINEL -- "Eyes Everywhere" [PARALLEL WITH PHASES 2-3]

The intelligence system that keeps us ahead. Runs in parallel because it does not depend on the collaboration engine.

- [ ] Deploy GitWatchman for competitor repo monitoring
- [ ] Set up hnrss.org filtered feeds + ArXiv monitors
- [ ] Set up npm registry watchers via NewReleases.io
- [ ] Build n8n workflows for collection -> analysis -> alerting
- [ ] Set up Claude Code /loop for scheduled AI analysis
- [ ] Build Grafana intelligence dashboard
- [ ] Set up Slack alert channels (`#sentinel-critical`, `#sentinel-daily`, `#sentinel-weekly`)
- [ ] Implement dead-man's switch for all collectors
- [ ] Set up Renovate automerge on patch updates
- [ ] Build weekly strategic intelligence brief generator

**Exit Criteria:** All collectors running 24/7. Alerts firing to Slack. Weekly brief auto-generated. Dead-man's switch tested and verified.

---

### PHASE 5: HARDENING -- "Fortify the Castle" [CONTINUOUS FROM DAY 1]

Nothing ships without hardening. This is where we prove it works under pressure.

- [ ] Security audit: OWASP top 10 review across all endpoints
- [ ] Penetration testing on auth system (passkeys)
- [ ] Load testing: verify performance at 10K, 50K, 100K concurrent users
- [ ] Implement canary deployments with AI-powered rollout decisions
- [ ] Edge case testing for three-tier compute fallback chain
- [ ] Accessibility audit (WCAG 2.1 AA minimum for DOM-rendered components)
- [ ] Bundle size audit: verify < 50KB initial JS
- [ ] API rate limiting hardening
- [ ] DDoS protection configuration (Cloudflare)
- [ ] GDPR/privacy compliance review

**Exit Criteria:** Passes OWASP audit. Handles 100K concurrent users. Accessibility compliant. Bundle under budget. Rate limits hold.

---

### PHASE 6: LAUNCH & DOMINATE -- "Take the Hill" [THE MOMENT WE ARE READY]

Everything before this was preparation. This is execution.

- [ ] Production deployment across full edge network
- [ ] Public API documentation
- [ ] Developer documentation and guides
- [ ] Open-source core components (attract contributors, build moat)
- [ ] Launch landing page with live demos
- [ ] AI website builder public beta
- [ ] AI video builder public beta
- [ ] Competitive benchmark: verify 80%+ ahead on all metrics
- [ ] Sentinel system at Full War Room tier
- [ ] Press/marketing push

**Exit Criteria:** Live. Public. Users building websites and editing video with AI assistance. 80%+ ahead of every competitor on every metric that matters.

---

### ONGOING: NEVER STOP (Post-Launch) -- "Stay Ahead Forever"

Launching is not winning. Staying ahead is winning. This never ends.

- [ ] Weekly Sentinel intelligence review
- [ ] Monthly technology stack audit (are we still 80%+ ahead?)
- [ ] Quarterly architecture review (new tech adoption decisions via ADR)
- [ ] Continuous Renovate/Dependabot dependency evolution
- [ ] AI model upgrades as new models release
- [ ] WebGPU capability expansion as browser support grows
- [ ] Community engagement: PRs, issues, Discord
- [ ] New AI agent development based on user needs
- [ ] Performance regression testing (automated, every commit)
- [ ] Annual competitive benchmark report

**There is no exit criteria. There is no finish line. We stay ahead or we die.**

---

> **This is Crontech.**
> The most aggressive full-stack platform ever conceived.
> AI-native. Edge-first. Zero-HTML. Self-evolving.
> Nobody has built this before. Nobody will catch us once we launch.
> The future does not wait. Neither do we.
