# Succession

> How to hand off from one Claude session to the next without losing
> context or relitigating decisions.

Every session ends. The next session starts without the prior session's
working memory. This file is the protocol that keeps the chain unbroken.

---

## The Handoff Contract

A session hands off by producing exactly three artifacts:

1. **A clean git state on the active branch.** No uncommitted changes, no
   unpushed commits. `git status` returns `nothing to commit, working tree
   clean`. `git log @{u}..` is empty.
2. **(Optional) a `HANDOFF.md` at the repo root** if there is session-
   specific context the next session must read before doing anything
   else. If the next action is obvious from the commit history, skip it.
3. **A todo list** reflecting what is done, what is in progress, and what
   is next. The todo list survives via the Claude Code continuation
   layer — not as a committed file.

That is the entire contract. Everything else is in the git history.

---

## When to write `HANDOFF.md`

Write it when **any** of the following is true:

- A commit is stuck locally due to a network/proxy outage and the next
  session must retry the push.
- A positioning or doctrine decision was just made and has not yet been
  encoded into `CLAUDE.md` / `POSITIONING.md` / `STACK_RULES.md`.
- The current objective spans multiple sessions and the next session
  needs to pick up mid-flight.
- A hard gate (CLAUDE.md §0.7) was requested from Craig and is still
  pending his answer.

Do **not** write `HANDOFF.md` for routine progress updates. The commit
log is the routine progress update. `HANDOFF.md` is for anomalies only.

---

## What a good HANDOFF.md looks like

```markdown
# HANDOFF — <short context>

## First action (do this before anything else)
<one concrete command or decision>

## Context
<3-5 bullets of why this handoff exists>

## What to do after the first action
1. ...
2. ...

## Do NOT
- <things the next session might be tempted to do that would break
  something>
```

Keep it under 50 lines. Delete it the moment the first action is
complete (CLAUDE.md §0 says so).

---

## Reading the chain

The next session's first reading order:

1. **Session-start hook output** — already at the top of the transcript.
   Reports ahead/behind, link/button checker status, Sentinel intel.
2. **`HANDOFF.md` if it exists** — read it, do the first action, delete
   it.
3. **`CLAUDE.md`** — the Bible. Re-read it. Every session. No excuses.
4. **`docs/POSITIONING.md`** — if touching any user-facing copy.
5. **`docs/STACK_RULES.md`** — if touching any type or schema.
6. **`docs/ADVANTAGE_LEVERS.md`** — if scoping the next objective.
7. **`docs/SIMMER_PROTOCOL.md`** — if there is no active objective.
8. **`git log --oneline -20`** — see what the last few sessions shipped.

Only then pick up work.

---

## The "no silent scope creep" rule

Every session inherits the prior session's objective and finishes it
before starting anything new. A session that abandons the prior
objective without an explicit Craig-authorized reason is a doctrine
breach (CLAUDE.md §0.2). If the prior objective is truly blocked,
document the block in a todo and start the next piece of useful work
from `SIMMER_PROTOCOL.md` — do not invent a new objective.

---

**Hand off the same way a relay runner hands off a baton: in motion,
without breaking stride, and without dropping anything on the track.**
