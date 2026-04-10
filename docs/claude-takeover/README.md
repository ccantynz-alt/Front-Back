# Claude GitHub Takeover — Staging Drafts

These three workflow files are **staging drafts**, not live. They wait
here under `docs/claude-takeover/` until Craig green-lights the final
move to `.github/workflows/` (HARD GATE per CLAUDE.md §0.7).

## The three workflows

| File | Purpose | Trigger | Scope |
|---|---|---|---|
| `claude.yml` | `@claude` mention responder | Issue comments, PR comments, PR review comments, new issues, new PRs | All repos (baseline) |
| `claude-auto-review.yml` | Auto-review every PR on open against CLAUDE.md doctrine | PR open / synchronize / reopen | Crontech + upgraded Tier A repos |
| `claude-ci-watchdog.yml` | Hourly scheduled CI watchdog. Fixes red runs on main. | `schedule: 0 * * * *` + manual dispatch | Crontech only (platform repo) |

## What they replace

- **GitHub Copilot cloud agents** (`copilot/*` branches) — the thing currently running on `copilot/ensure-green-workflows` and `copilot/fix-vercel-build`. Copilot gets uninstalled from all repos AFTER these workflows are proven on one test PR.

## How to promote to live

1. Craig installs the Claude GitHub App on all repos: `github.com/apps/claude` → Install → All repositories
2. Craig adds `ANTHROPIC_API_KEY` to repo secrets (or org-level secret if `craigs-empire` org exists)
3. Craig eyeballs the three files below and says "go"
4. Claude moves all three files from `docs/claude-takeover/` to `.github/workflows/` in one commit
5. Test on a throwaway issue: open `@claude bump package.json patch versions`
6. If the test PR lands clean, Craig uninstalls GitHub Copilot from all 23 repos

## Portability to other repos

The `claude.yml` responder is identical across every repo — copy-paste unchanged. The `claude-auto-review.yml` is Crontech-specific because it references CLAUDE.md doctrine; other repos get a stripped-down version without the doctrine references. The `claude-ci-watchdog.yml` is Crontech-only until other repos become revenue-critical.

## Secret requirements per workflow

All three workflows require `secrets.ANTHROPIC_API_KEY` to be set at either the repo level or (preferably) the org level once `craigs-empire` exists.

## Cost estimate

- `claude.yml` (responder): ~$0.02–$0.10 per `@claude` mention
- `claude-auto-review.yml`: ~$0.05–$0.20 per PR (proportional to diff size)
- `claude-ci-watchdog.yml`: ~$0.02 per hourly run when nothing's red (exits fast), ~$0.20–$1.00 when a fix is needed

At Crontech's current PR volume (~5 PRs/day, ~24 watchdog runs/day), total daily cost is under $1/day. Weekly under $10. Monthly under $50. Trivial compared to the time saved.
