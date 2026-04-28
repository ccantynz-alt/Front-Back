# HANDOFF — 2026-04-28 (GateTest hook fix + local Main cleanup session)

**Read this first per `CLAUDE.md` §0.0. Delete this file after the first action of the next session.**

---

## 🚀 FIRST ACTION FOR NEXT SESSION

Create the PR for the feature branch. `gh` CLI is not installed on this machine — open this URL in a browser:

**https://github.com/ccantynz-alt/Crontech/pull/new/claude/sovereign-ui-gluecron-ghost-mode-20260428**

If `gh` is now installed, run:
```
gh pr create --base Main --head claude/sovereign-ui-gluecron-ghost-mode-20260428 \
  --title "feat: Sovereign UI + GlueCron M2M + Credits + Ghost Mode + iPad Command Center" \
  --body "See HANDOFF.md for full changelog."
```

Then proceed with normal session protocol.

---

## Branch state

**Branch:** `claude/sovereign-ui-gluecron-ghost-mode-20260428`
**Commits (6 total, all pushed to origin):**

| SHA | Message |
|---|---|
| `d7f0da8` | fix(gatetest): alias Main→main so diff-detector finds correct merge-base |
| `a49b85b` | feat(ux): authenticated users skip landing → /admin/gate redirect |
| `fba057f` | docs: update HANDOFF with complete session log |
| `104bc52` | feat: Universal Credits + /admin/gate + projects.createFromUrl fix |
| `830a339` | feat(admin): Sovereign Pulse iPad command center + metrics.pulse procedure |
| `c6ee0da` | feat: GlueCron API + auth challenge DB + comms router + Ghost Mode + voice morph + constraint solver |

**Local Main:** Cleaned up — reset to match `origin/Main` (stray commit from last session removed).

---

## What shipped this session

1. **GateTest hook fix** (§6 from previous HANDOFF): The pre-push hook now temporarily aliases `refs/heads/main → refs/heads/Main` before invoking gatetest, then removes it via `trap EXIT`. This gives gatetest's `_getChangedFiles()` the correct merge-base instead of falling back to `HEAD~1` + full-repo scan.

2. **Local Main cleanup**: Local `Main` had a stray commit (`f6dd8da`) from last session's `--no-verify` push that never landed on origin/Main. Reset to `origin/Main`.

---

## 🔴 Open items needing Craig's decision

### §1 — Google OAuth credentials (UNCHANGED)
`Continue with Google` returns `401 invalid_client`. Fix: add to GitHub Actions secrets:
- `GOOGLE_CLIENT_ID` — from Google Cloud Console → Credentials
- `GOOGLE_CLIENT_SECRET` — same

### §2 — Post-login redirect (RESOLVED ✅)
Authenticated users now redirect to `/admin/gate` via `createEffect` in `index.tsx`.

### §3 — Admin HUDs (UNCHANGED)
`BuildTrack` ("19/31") and `LaunchChecklist` ("4/23 shipped") visible to admin users. Craig finds them cluttered. Decision: keep / add toggle / remove.

### §4 — Wave 9 HTML primitives sweep (UNCHANGED)
129 files use raw `<div>`/`<span>`/`<p>` instead of `@back-to-the-future/ui`. Needs Craig's authorization to run (touches 100+ files).

### §5 — GLUECRON_SERVICE_KEY secret (UNCHANGED)
Add `GLUECRON_SERVICE_KEY` to GitHub Actions secrets — same flow as `GOOGLE_CLIENT_ID`. This activates the GlueCron M2M auth.

---

## 🟡 Craig authorization grants (this session)

None beyond previous session's authorization (Craig's "FINAL MISSION" autonomous authorization still applies to the feature branch work).

---

## ❌ Manifest items that CANNOT be executed (persistent)

1. **`rm -rf` legacy HTML/CSS/JS** — No legacy files exist. Platform is already SolidJS.
2. **`src/server.ts` WASM-only server** — Wrong path. API server is `apps/api/src/index.ts`.
3. **`src/core/` / `src/adapters/` paths** — Wrong monorepo structure. `comms` lives at `apps/api/src/trpc/procedures/comms.ts`.
4. **`fly.toml` / `fly deploy`** — File doesn't exist. Deployment is Vultr + Caddy + systemd.
5. **Hardcode admin localStorage session** — Refused: session fixation vulnerability. Resolved legitimately via `createEffect` redirect.
6. **`holdenmercer.com` domain** — Unknown domain. Never appeared in codebase. Needs Craig to clarify before any work can be done.

---

## Next agent should start by

1. Create the PR at the URL above
2. Check GateTest results on the PR once it exists
3. Ask Craig about Wave 9 sweep authorization (§4)
4. Ask Craig about the `holdenmercer.com` domain
5. Install `gh` CLI: `! choco install gh -y` (run in Claude Code terminal)
