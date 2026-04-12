# Simmer Protocol

> What to do when the active TODO is finished and the next big push is not
> yet scoped. The opposite of scatter-gun. A disciplined idle loop.

Between big battles the platform still needs to stay sharp. "Simmer" is the
name for the work that happens while waiting for Craig to set the next
objective or while a parallel track is blocked on him. It is **not** an
excuse to invent new features — it is maintenance, hardening, and prep.

---

## The Simmer Checklist

When a session finishes its main task early, walk this list in order:

### 1. Intelligence sweep (5 min)
- Read `services/sentinel/data/intelligence.json` — any new items since
  the last session-start hook ran?
- Any competitor releases that name-match a Tier-1 lever from
  `docs/ADVANTAGE_LEVERS.md`?
- If yes, file the finding as a `pending` todo and surface it next session.

### 2. Build-quality gate sweep (5 min)
Run these four and fix any regression on the spot:

```bash
bunx tsc --noEmit -p apps/web/tsconfig.json
bunx tsc --noEmit -p apps/api/tsconfig.json
bun test
bun run build
```

A red build during a "quiet" session is worse than a red build during
active work. Nobody is watching for it.

### 3. Link checker + button checker (2 min)
```bash
bun run check-links || true
bun run check-buttons || true
```

If either script is missing, add a TODO to recreate it — they are mentioned
in the session-start hook and not having them is a doctrine breach.

### 4. Zod-first drift check (5 min)
Grep for `^export type \w+ = ['\"]` across `packages/`, `apps/api/src/`, and
`services/`. Any raw string-union enum that appeared since the last sweep
is a regression. Convert it to a Zod schema (see `STACK_RULES.md` §1) and
commit as a `refactor:` change.

### 5. Test coverage sweep (10 min)
Pick the lowest-coverage file in the Tier-1 packages (`cfo-engine`,
`audit-log`, `sentinel`, `ai-core`) and add one test for one uncovered
branch. One test, not a rewrite.

### 6. Doctrine doc audit (5 min)
Are `CLAUDE.md`, `POSITIONING.md`, `STACK_RULES.md`, and this file still
consistent with the shipped code? If a rule has drifted, flag it in a
pending todo for Craig — do **not** silently update doctrine.

### 7. Sentinel collector health (2 min)
Check that every collector ran in the last 24h. A silent collector is the
dead-man's-switch scenario CLAUDE.md §5.3 warns about.

### 8. Push any uncommitted work (1 min)
No session ends with uncommitted or unpushed changes. Ever.

---

## What Simmer is NOT

- **NOT a license to add new features.** Every new feature requires a named
  lever from `ADVANTAGE_LEVERS.md`.
- **NOT a license to refactor Tier-1 packages for taste.** Refactors that
  touch more than 5 files are a SOFT GATE (CLAUDE.md §0.7).
- **NOT a license to update dependencies to majors.** Patch/minor auto-merge
  via Renovate is fine. Majors are a SOFT GATE.
- **NOT a license to write new doctrine.** Doctrine changes are a HARD GATE
  and require the PIN.

---

## Exit criteria

Simmer ends the moment either:

1. Craig sets a new active objective.
2. The session hits its natural context budget and needs to push + stop.

On exit, the session leaves behind:

- Zero red tests
- Zero new TS errors
- Zero unpushed commits
- A one-line summary in the commit log of whatever simmer work was done

That is the bar. Nothing fancier. No drift, no scatter-gun, no surprises.
