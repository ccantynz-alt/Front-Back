# Dependency Updates — Renovate + Dependabot split

**Status:** Active as of April 2026
**Owner:** Craig (authorization gate per CLAUDE.md §0.7)

## TL;DR

- **Renovate** handles all **npm** dependency updates (it regenerates `bun.lock`).
- **Dependabot** handles only **GitHub Actions** updates (no lockfile involved).
- Dependabot's npm ecosystem is **disabled** in `.github/dependabot.yml` — do not re-enable it.

## Why this split

Crontech is a bun-only monorepo. CLAUDE.md §3 is binding:

> Bun for package management. Not npm. Not yarn. Not pnpm.

CI runs `bun install --frozen-lockfile`. If `package.json` changes but `bun.lock`
does not, CI fails with:

```
lockfile had changes, but lockfile is frozen
```

**Dependabot (as of April 2026) does not understand bun lockfiles.** It only
updates `package.json`, which leaves `bun.lock` stale on every PR. This caused
recurring manual work — every Dependabot npm PR required a human to run
`bun install`, regenerate the lockfile, and commit the fix.

**Renovate added native bun support in 2024.** Via the `postUpdateOptions: ["bunlock"]`
setting, Renovate regenerates `bun.lock` automatically when it bumps a dependency.
No manual intervention. CI stays green.

## What each bot does now

| Bot | Ecosystem | Schedule | Lockfile handling |
|---|---|---|---|
| Dependabot | `github-actions` | weekly | N/A (no lockfile) |
| Renovate | `npm` | Monday before 6am ET | Regenerates `bun.lock` automatically |

## Renovate grouping strategy

- **Patch + minor** updates → grouped into one weekly PR ("non-major dependencies"), auto-merged.
- **Major** updates → individual PR per package, requires human review.
- Workspace-internal packages (`@back-to-the-future/*`) are ignored — they're
  resolved via bun workspaces, not npm.

## Prerequisites

Renovate is a GitHub App and must be installed on the repo. If it is not
already installed at `https://github.com/apps/renovate`:

1. Install the Renovate GitHub App on `ccantynz-alt/crontech`.
2. Grant it read access to the repo contents and write access to PRs + checks.
3. After install, Renovate runs an onboarding PR — approve it to activate the config.

If you receive a config validation warning after install, run `npx --yes
renovate-config-validator .github/renovate.json` locally to confirm the config
is syntactically valid, then re-check the app's permissions.

## Re-enabling Dependabot npm (NOT RECOMMENDED)

If — for some emergency reason — someone wants to re-enable Dependabot's npm
ecosystem, they must:

1. Get Craig's explicit authorization (CLAUDE.md §0.7 hard gate: adding/removing
   GitHub Actions workflows / config ecosystems).
2. Coordinate with Renovate config to avoid both bots opening PRs on the same
   packages (race condition = CI thrash).
3. Accept that every Dependabot npm PR will require manual `bun install` +
   commit until Dependabot adds bun lockfile support upstream.

## References

- [Renovate bun support docs](https://docs.renovatebot.com/modules/manager/bun/)
- [Dependabot bun support tracking issue (upstream)](https://github.com/dependabot/dependabot-core/issues) — search "bun"
- CLAUDE.md §3 (the stack) and §0.7 (authorization gates)
