# BUILD_BIBLE.md — The Concrete File

> **This file is CONCRETE.** Once an entry is added here, it does not get
> removed. It does not get softened. It does not get "updated to current
> thinking." It is a tombstone for lessons learned the hard way. If a
> lesson is wrong, we add a new entry that supersedes the old one — we
> never erase history. This is the only way we stop repeating mistakes.
>
> **Read order at session start:** (1) `HANDOFF.md` if it exists, (2) this
> file, (3) `CLAUDE.md`. This file does NOT override `CLAUDE.md` — it
> complements it. `CLAUDE.md` is strategy and doctrine. This file is
> operational truth about THIS sandbox and its failure modes.
>
> **Governance:** Additions are append-only. Each entry has a date and a
> permanent ID. Entries are NEVER deleted. Corrections go in a new entry
> that references the old ID. Craig is the only person who can mark an
> entry as superseded.

---

## 0. WHAT THIS FILE IS FOR

Every Claude session in this sandbox has repeatedly hit the same
environmental walls and made the same mistakes. This file is the
inoculation. If you are a Claude agent reading this at session start,
**these are the things you would otherwise have to rediscover through
trial, error, and Craig's frustration.** Read them once, save hours.

The rules are ordered by "which mistake burned the most time in the
past." #1 is the worst.

---

## 1. MCP IS AVAILABLE — USE IT (E-001, 2026-04-11)

**The GitHub MCP server is attached to every session in this sandbox.**
Its tool names are prefixed `mcp__github__`. It is a first-class tool,
not a fallback. It bypasses the local push proxy entirely.

**Available tools (non-exhaustive — use ToolSearch to list all):**

| Tool | Use it for |
|---|---|
| `mcp__github__push_files` | Commit N files in one shot to a branch — **this is how you push when the local proxy is dead** |
| `mcp__github__get_file_contents` | Read remote file state without pulling |
| `mcp__github__list_commits` | See remote branch history |
| `mcp__github__create_pull_request` | Open PRs (only when Craig asks) |
| `mcp__github__add_issue_comment` | Post on issues |
| `mcp__github__pull_request_read` / `pull_request_review_write` | PR workflow |

**Loading the schemas:** tool schemas are deferred. Call
`ToolSearch({query: "select:mcp__github__push_files,mcp__github__get_file_contents"})`
to make them callable. This takes one tool call. Do it early.

**Scope restriction:** the GitHub MCP tools in this sandbox are allowlisted
to `ccantynz-alt/front-back` only. Other repos cannot be touched from
here — that requires a fresh web session with the other repos selected
in the claude.ai/code picker.

**The rule:** if you ever find yourself saying "the push proxy is 503ing,
I'm stuck" — STOP. You are not stuck. Call `mcp__github__push_files`.

---

## 2. THE SANDBOX PUSH PROXY IS DEAD (E-002, 2026-04-11)

**The local push proxy at `127.0.0.1:32330` returns HTTP 503 persistently
across sessions.** This has been true for at least three sessions running.
Fresh sessions sometimes temporarily resolve it, but assume it is dead.

**Do not:**
- Retry `git push` more than twice against the proxy.
- Generate `.patch` bundles to `/tmp` as "insurance" — `/tmp` is wiped
  between sessions, so the bundle evaporates anyway.
- Declare commits "stuck" or "blocked on network." They are not. They
  are durable in `.git` on the persistent disk.

**Do:**
- Use `mcp__github__push_files` (see E-001).
- If MCP push_files also fails, THEN generate patches and ask Craig for
  direction. Do not silently retry the dead proxy in a loop.

---

## 3. THE RECEIPTS RULE §0.4.2 IS BINDING (E-003, 2026-04-11)

See `CLAUDE.md` §0.4.2 for the full text. The one-line version:
**"Fixed" has a witness or it is not fixed.**

Every claim of resolution must be accompanied by one of four receipt types:

1. **Playwright/E2E test transcript** for UI bugs
2. **curl transcript** (request + response body + exit code) for API bugs
3. **dev-server or test-runner log excerpt** (zero errors, nonzero
   relevant assertions) for build/runtime/type bugs
4. **Before/after diff of user-observable state** for data bugs

**Banned language:** `should work`, `mostly working`, `looks good`,
`I believe this is fixed`, `this should resolve it`, `please verify`.

Unit tests supplement receipts; they do not replace them. Capture gate
output in commit message bodies, not in summaries.

---

## 4. KNOWN GOTCHAS IN THIS CODEBASE (E-004, 2026-04-11)

These have bitten every session. Read once, remember forever.

### 4.1 tRPC error codes

tRPC uses `PRECONDITION_FAILED`, NOT `FAILED_PRECONDITION`. This is the
**opposite word order from gRPC**, which is what most engineers default
to. Using the wrong name produces a type error that is non-obvious
because the message says "not assignable to `TRPC_ERROR_CODE_KEY`"
rather than naming the typo.

### 4.2 `exactOptionalPropertyTypes: true` is enforced

Every package in this monorepo has `exactOptionalPropertyTypes: true`.
Consequences:

- Optional type fields must be `foo?: T | undefined`, NOT `foo?: T`
- Optional property ASSIGNMENTS must use a conditional spread
  (`...(x !== undefined && { foo: x })`) rather than assigning
  `undefined` directly
- **Recursive types** (like `ComponentTreeNode` in `ui.ts`) need
  explicit `| undefined` on every optional field, or the Zod
  inference will not match the hand-written type

### 4.3 Drizzle libsql migrations need `--> statement-breakpoint`

The libsql migrator runs ONE statement per `execute()` call. Without
the `--> statement-breakpoint` marker between every DDL statement,
everything after the first statement is silently dropped and the DB
ends up half-built. Also: every migration MUST have a journal entry
in `packages/db/migrations/meta/_journal.json` — without it, Drizzle
will not run the migration.

### 4.4 Test suites require a wipe-and-remigrate preload

`apps/api/bunfig.toml` preloads `test/setup.ts`, which deletes the DB
file and re-runs `runMigrations()` before every test run. This is
mandatory — without it, schema drift from prior test runs causes
mysterious red tests that "pass on the second run." Any new test suite
that touches the DB must inherit this preload.

### 4.5 `protectedProcedure` vs `publicProcedure`

`protectedProcedure` (from `init.ts`) injects `ctx.userId` after auth
check. If your procedure uses `ctx.userId` and you wired it through
`publicProcedure`, the type will be `string | null` and you will
crash at runtime when it is null. Always use `protectedProcedure` for
anything that writes data.

---

## 5. THE SESSION-START CHECKLIST (E-005, 2026-04-11)

Every session begins with this checklist. If you skip it, you will
repeat mistakes the previous session already paid for.

1. **Read `HANDOFF.md`** if it exists. Do what it says before anything
   else. Delete it once the first action is done.
2. **Read this file (BUILD_BIBLE.md)** in full. Every entry. Every time.
3. **Read `CLAUDE.md`** — at minimum the iron rules in §0.
4. **Check `git status` and `git log origin/<branch>..HEAD`** to see
   what is queued locally but not yet on origin.
5. **If anything is unpushed, push it FIRST** via `mcp__github__push_files`
   before starting new work. Never leave unpushed work at the start of
   a session — it means the previous session's work is at risk.
6. **State the session objective in ONE sentence** before touching a
   file. If you can't, you haven't thought hard enough.
7. **Plan with TodoWrite** before executing. Every task, in order.

---

## 6. STOP-ASKING-START-DOING (E-006, 2026-04-11)

Craig's explicit instruction: **stop asking permission for things that
are plainly within scope. Do them.** Ask permission ONLY for §0.7 hard
gates (dependency swaps, positioning changes, CLAUDE.md edits,
destructive git ops, etc.). Everything else is execute-first.

**Specifically do NOT ask before:**
- Running gates (`bun run check`, `bun run test`, etc.)
- Reading any file
- Pushing work that is already committed locally (use MCP)
- Fixing type errors, lint errors, or broken tests
- Writing new tests for existing code
- Generating receipts

**Specifically DO ask before:**
- Any entry in CLAUDE.md §0.7 hard gates list
- Any change to this file (BUILD_BIBLE.md) — see §7 below
- Any change to `CLAUDE.md` — see CLAUDE.md "Ask-In-Chat Rule"
- Any change to `docs/POSITIONING.md`

---

## 7. HOW TO ADD TO THIS FILE (E-007, 2026-04-11)

This file grows. It never shrinks.

**To add an entry:**
1. Paste the proposed new section in chat first (not `Edit`/`Write`).
2. Wait for Craig's explicit affirmative ("yes", "go ahead", "do it").
3. Only then write the edit. Assign it the next `E-NNN` ID.
4. Include a date stamp.
5. Commit with a message starting `bible(build): add E-NNN — <subject>`.

**To correct an entry:**
1. Do NOT delete or modify the original entry. It stays as written.
2. Add a new entry with a new ID that references the old one
   (`"This supersedes E-004 §4.1 as of <date>"`).
3. Same approval flow as adding a new entry.

**Why:** Craig's explicit ask was "it's concrete. It cannot be changed."
Append-only with reference-based corrections honours that while still
letting truth evolve.

---

## 8. THIS FILE'S RELATIONSHIP WITH CLAUDE.md (E-008, 2026-04-11)

- `CLAUDE.md` = **Strategy and doctrine.** Why we are building this.
  What we are building. Who we are competing against. How we behave.
- `BUILD_BIBLE.md` = **Operational truth.** What has burned us in this
  specific environment. Concrete facts about the sandbox, the stack,
  and the workflow. Append-only.
- `HANDOFF.md` = **Session continuity.** Transient. Deleted after each
  session's first action lands. If it exists, read it FIRST.
- `docs/POSITIONING.md` = **Brand and public copy.** Locked.

**Conflict resolution:** if `CLAUDE.md` and `BUILD_BIBLE.md` ever appear
to conflict, `CLAUDE.md` wins for strategy, `BUILD_BIBLE.md` wins for
operational facts about this sandbox. In practice they should not
conflict — if they do, flag it to Craig immediately and propose an
alignment rather than making a unilateral call.

---

— end of initial bible. entries E-001 through E-008 are concrete. —
