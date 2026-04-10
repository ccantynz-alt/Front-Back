# HANDOFF — intelligence.json still stranded

> **First action:** run `bun run sentinel:once` to regenerate
> `services/sentinel/data/intelligence.json`, then commit + push it.

**Date:** 2026-04-10
**Branch:** `claude/fix-tracked-repos-types-LYo16`

---

## Status

Three of the four files from the stuck-push saga are now on origin:

| File | Status | Commit |
|---|---|---|
| `apps/web/tsconfig.json` | ✅ on origin | `2bda6df` |
| `packages/ui/src/components/Text.tsx` | ✅ on origin | `2bda6df` |
| `services/sentinel/data/tracked-repos.json` | ✅ on origin | `2527456` |
| `services/sentinel/data/intelligence.json` | ❌ **stranded** | pending |

All three landed via the **GitHub MCP `push_files` API**, bypassing the
broken git proxy.

## Why the intelligence.json is stranded

The git proxy at `127.0.0.1:60221` partially recovered mid-session:
`GET /info/refs?service=git-receive-pack` returns `HTTP/1.1 200 OK`,
but the pack upload itself fails with `HTTP 503` as soon as the
packfile exceeds some size threshold. The 93KB intelligence.json
trips that threshold.

Request-Ids from the failed pack uploads:
- `req_011CZvbMx1i7JVDPR2g6kMeG`
- `req_011CZvjTmpPJAFKTrB8gSSfp`

The MCP `push_files` API doesn't care about packfile size and accepted
the other three files without issue.

## First action (do this before anything else)

```bash
bun run sentinel:once
```

This regenerates `services/sentinel/data/intelligence.json` with a
fresh snapshot of current competitive intel (~75 items). After it
completes:

```bash
git add services/sentinel/data/intelligence.json services/sentinel/data/tracked-repos.json
git commit -m "feat(sentinel): refresh intelligence store"
git push -u origin claude/fix-tracked-repos-types-LYo16
```

If `git push` still 503s on the pack upload, fall back to chunked
MCP `push_files` — split the JSON into 2-3 commits of ≤30KB each
using a stable sort order, or compress it with a small CLI (the
store reader already handles parsing so content is what matters).

If it succeeds, delete this file and continue.

## Context for Craig

The Sentinel L5 Tier-1 lever was activated in the prior session
(first real collector run populated the store with 75 items). The
store itself didn't land on origin, but the metadata in
`tracked-repos.json` did, so `bun run sentinel:once` can resume from
the correct state instead of doing a cold restart.

The Copilot cloud agents (`copilot/ensure-green-workflows`,
`copilot/fix-vercel-build`) may still be running in parallel. Check
their status before touching `deploy.yml` — racing them creates
merge conflicts.

`crontech.ai` still serves a Vercel 404. Deploy #30 on main at
`17dd97a` has never succeeded; the Copilot agents are supposedly
fixing it.

Craig asked about getting Claude to take over ALL his repositories
(not just this one) — the plan is the Claude Code GitHub App + three
workflow files (`claude.yml`, `claude-auto-review.yml`,
`claude-ci-watchdog.yml`). Requires HARD GATE authorization before
touching `.github/workflows/`.

## Do NOT

- Do NOT force-push. Ever. Especially not on this branch.
- Do NOT create a PR without explicit Craig authorization.
- Do NOT touch `.github/workflows/deploy.yml` until you confirm the
  Copilot agents aren't still working on it.
- Do NOT hand-craft the intelligence.json content. Regenerate it
  with the collector — it's the source of truth.
