# SELFHOST-CUTOVER — Mirror Crontech into Gluecron

> **Goal:** close the dogfood loop. Gluecron — the git-forge product we
> build — hosts the Crontech source that builds it.
> **Result:** if GitHub disappears tomorrow, Crontech, GateTest, and
> Gluecron keep shipping from our own metal.
> **Safety net:** this is additive. GitHub stays live and current until
> Craig explicitly decommissions it.

This runbook pairs with two scripts:

- `scripts/mirror-to-gluecron.sh` — push a repo into Gluecron (idempotent)
- `scripts/verify-gluecron-mirror.sh` — prove Gluecron's copy equals GitHub's

Both are pure bash + git + curl. No bun, no node, no npm — runs on any
Linux box with `git` and `curl` available.

---

## Prerequisites

Before you start, verify ALL of these. Missing one will waste 20 minutes.

### 1. Gluecron is running and reachable

```bash
# Should return HTTP 200 (or 404, which means "reachable but route n/a")
curl -sS -o /dev/null -w "%{http_code}\n" https://gluecron.crontech.ai/api/v2/version

# From the bare-metal box, check the service is up:
systemctl status gluecron
```

If this fails, go back to `docs/SELF_HOSTED_CUTOVER.md` step 1 and fix
the Gluecron process first. Do NOT continue until the API responds.

### 2. Personal Access Token generated

1. Visit `https://gluecron.crontech.ai` → log in as the admin account
   (`craig`, per `docs/SELF_HOSTED_CUTOVER.md` step 3a).
2. Settings → Access Tokens → Generate new.
3. Scopes required:
   - `repo` — read + write to repositories
   - `admin:org` — if any `TARGET_REPO` lives under an org (e.g.
     `crontech/crontech` requires admin on the `crontech` org)
   - `user` — read profile (some v2 endpoints require this)
4. Copy the token once — Gluecron will never show it again.
5. Save it to `~/.gluecron-pat` with mode 600:

   ```bash
   umask 077
   cat > ~/.gluecron-pat <<'EOF'
   <paste token here>
   EOF
   chmod 600 ~/.gluecron-pat
   ```

   NEVER commit this file, NEVER paste the token into chat, NEVER echo
   it in a terminal that's being screen-shared.

### 3. DATABASE_URL known

The mirror script itself does not read DATABASE_URL, but confirming
Gluecron can write to its own DB is the pre-flight for every operation.
From the Gluecron host:

```bash
# This is the DATABASE_URL that Gluecron uses. Note it somewhere safe.
systemctl show gluecron -p Environment | tr ' ' '\n' | grep DATABASE_URL

# Quick sanity check — should list at least one row
psql "$DATABASE_URL" -c 'SELECT id, full_name FROM repository LIMIT 5;'
```

If `psql` fails, fix Postgres before continuing.

### 4. A working clone of Crontech

```bash
git clone https://github.com/ccantynz-alt/Crontech.git ~/Crontech
cd ~/Crontech
git status    # clean working tree
git branch    # on Main
```

The script mirrors the repo's history into Gluecron — so whatever state
the clone is in is what gets pushed. Ensure `git status` is clean.

---

## Step 1 — Mirror Crontech into Gluecron

```bash
cd ~/Crontech

export GLUECRON_URL=https://gluecron.crontech.ai
export GLUECRON_USER=craig
export GLUECRON_TOKEN=$(cat ~/.gluecron-pat)
export TARGET_REPO=crontech/crontech

bash scripts/mirror-to-gluecron.sh
```

### What this does (in order)

1. **Pre-flight** — `curl`s `$GLUECRON_URL/api/v2/version` to prove the
   API is up and the token is valid. 401/403 here means the PAT is wrong
   or the Gluecron process is down. Exit 3.
2. **Ensure repo exists** — `GET /api/v2/repos/crontech/crontech`. If
   404, `POST /api/v2/user/repos` (or `/api/v2/orgs/crontech/repos` when
   owner is not the authed user) to create. If 409/422 on create,
   assumes race and continues. Exit 4 on hard failure.
3. **Clone + push --mirror** — creates a bare `--mirror` clone of the
   local repo in a temp dir, then `git push --mirror` to Gluecron. This
   pushes ALL branches + ALL tags + prunes any deletions. Exit 5 on
   push failure.
4. **Register `gluecron` remote** — adds or updates a `gluecron` remote
   on the caller's working clone (display URL, no embedded token).
5. **Verify** — clones the Gluecron copy into a fresh temp dir and
   computes a sha256 hash of the file tree (excluding `.git`). Compares
   to the same hash on `SOURCE_DIR`. Exit 7 if they diverge.

### Expected output

```
╔════════════════════════════════════════════════════╗
║  Mirror → Gluecron                                 ║
╚════════════════════════════════════════════════════╝
[mirror] Source:  /home/craig/Crontech
[mirror] Target:  https://gluecron.crontech.ai/crontech/crontech
[mirror] User:    craig

[mirror] [0/4] Pre-flight: reaching Gluecron API
[ ok  ] Gluecron reachable (HTTP 200)
[mirror] [1/4] Ensuring repo exists: crontech/crontech
[mirror] Repo not found — creating via v2 API
[ ok  ] Created crontech/crontech on Gluecron
[mirror] [2/4] Configuring gluecron remote + pushing --mirror
[mirror]     cloning bare --mirror of /home/craig/Crontech into temp dir
[mirror]     pushing --mirror → https://gluecron.crontech.ai/crontech/crontech.git
[ ok  ] push --mirror complete
[mirror]     adding 'gluecron' remote → ...
[mirror] [3/4] Verifying mirror integrity (clone-back + tree hash)
[mirror]     source tree hash: 2f1b...
[mirror]     mirror tree hash: 2f1b...
[ ok  ]     tree hashes match — mirror is byte-identical
[mirror] [4/4] Success banner

╔════════════════════════════════════════════════════╗
║  ✔ MIRROR COMPLETE — dogfood loop closed            ║
╚════════════════════════════════════════════════════╝
```

### If it fails

The script prints the exact check/fix for each exit code. Read the
error, don't guess:

| Exit | What failed | Where to look |
|------|-------------|---------------|
| 1 | Missing env vars | Re-export and re-run |
| 2 | Not a git repo | Run from inside the Crontech clone, or `SOURCE_DIR=...` |
| 3 | Can't reach Gluecron API | `systemctl status gluecron`, DNS, TLS |
| 4 | Can't create repo | PAT scopes — needs `repo` + possibly `admin:org` |
| 5 | `git push --mirror` failed | Check branch protection on Gluecron |
| 6 | Clone-back failed | Usually a race — re-run fixes it |
| 7 | Hash mismatch | `git status` in source dir (uncommitted changes?) |

**Idempotency:** safe to run twice. The second run updates the
Gluecron copy to match the current source, re-verifies, and exits 0.

---

## Step 2 — Verify integrity

Run at any time (doesn't need to be immediately after step 1) to prove
the Gluecron copy is intact and equal to GitHub's:

```bash
export GLUECRON_URL=https://gluecron.crontech.ai
export GLUECRON_USER=craig
export GLUECRON_TOKEN=$(cat ~/.gluecron-pat)
export TARGET_REPO=crontech/crontech
export GITHUB_REPO=ccantynz-alt/Crontech     # triggers the compare

bash scripts/verify-gluecron-mirror.sh
```

Expected tail:

```
[ ok   ]     MATCH — Gluecron mirror is byte-identical to GitHub
✔ verification complete
```

If `GITHUB_REPO` is omitted, the script just clones Gluecron, prints
`git log --oneline | head`, and outputs the hash. Useful as a
standalone "is the mirror alive?" probe in cron.

### Schedule this in cron

On the bare-metal box, add a nightly check so drift is caught fast:

```bash
# /etc/cron.d/gluecron-mirror-verify
0 3 * * * craig GLUECRON_URL=https://gluecron.crontech.ai \
    GLUECRON_USER=craig \
    GLUECRON_TOKEN="$(cat /home/craig/.gluecron-pat)" \
    TARGET_REPO=crontech/crontech \
    GITHUB_REPO=ccantynz-alt/Crontech \
    /opt/crontech/scripts/verify-gluecron-mirror.sh \
    >> /var/log/gluecron-verify.log 2>&1
```

Non-zero exit fires a cron email — wire that into Slack
`#sentinel-critical` per `CLAUDE.md` §5.3.

---

## Step 3 — Point Woodpecker at the Gluecron source

**Cross-reference:** the Woodpecker agent's PR on this sprint —
"feat: woodpecker reads from Gluecron not GitHub" (search
`gh pr list --search "woodpecker gluecron"`).

When that PR lands, `.woodpecker.yml` will clone from
`https://gluecron.crontech.ai/crontech/crontech.git` instead of
`https://github.com/ccantynz-alt/Crontech.git`. The transition plan:

1. Ensure step 1 + 2 above have run successfully for all three repos.
2. Merge the Woodpecker agent's PR.
3. Trigger a fresh Woodpecker build — confirm the clone step pulls
   from `gluecron.crontech.ai` and the build succeeds.
4. Deploy proceeds as normal.

If the Woodpecker agent's PR hasn't landed yet, skip this step — it's
blocked-but-not-breaking. Mirror still works; Woodpecker just hasn't
flipped source yet. That's fine during the transition week.

---

## Step 4 — Mirror GateTest and Gluecron too

Same script, different `TARGET_REPO`:

```bash
# GateTest
export TARGET_REPO=crontech/gatetest
( cd ~/GateTest && bash /home/craig/Crontech/scripts/mirror-to-gluecron.sh )

# Gluecron itself (the recursive dogfood case)
export TARGET_REPO=crontech/gluecron
( cd ~/Gluecron.com && bash /home/craig/Crontech/scripts/mirror-to-gluecron.sh )
```

The Gluecron-hosts-Gluecron case is the ultimate dogfood: the running
Gluecron instance holds the source of its own binary. If Gluecron
bricks a self-update, we reach via `ssh` and `git push gluecron …`
from any checkout that still has the `gluecron` remote configured.

**Verify each:**

```bash
TARGET_REPO=crontech/gatetest  GITHUB_REPO=ccantynz-alt/GateTest \
  bash scripts/verify-gluecron-mirror.sh

TARGET_REPO=crontech/gluecron  GITHUB_REPO=ccantynz-alt/Gluecron.com \
  bash scripts/verify-gluecron-mirror.sh
```

---

## Step 5 — Kill-switch: revert to GitHub

If Gluecron breaks and you need everything back on GitHub within
60 seconds, follow this ordered list. Nothing here depends on
Gluecron being alive — that's the whole point.

### 5.1 Revert Woodpecker to GitHub

```bash
ssh deploy@<bare-metal-box>
cd /opt/crontech
git remote -v                  # confirm 'origin' still points at github
git fetch origin Main
git checkout -B Main origin/Main

# Revert the Woodpecker agent's commit that flipped clone URL
git revert <sha-of-woodpecker-flip> --no-edit
git push origin Main
```

Or simply cherry-pick the `.woodpecker.yml` from before the flip:

```bash
git show <pre-flip-sha>:.woodpecker.yml > .woodpecker.yml
git commit -am "revert: point Woodpecker back at GitHub (Gluecron outage)"
git push origin Main
```

### 5.2 Revert developer workflows

Every developer who ran `git push gluecron …` should fall back to
`git push origin …`. The `origin` remote was never removed — the
mirror script only adds a `gluecron` remote alongside it. No action
needed other than pushing to `origin`.

### 5.3 Disable cron verification

So the nightly `verify-gluecron-mirror.sh` doesn't spam failures into
Slack while Gluecron is down:

```bash
sudo mv /etc/cron.d/gluecron-mirror-verify /etc/cron.d/.disabled-gluecron-mirror-verify
```

Re-enable by reversing the `mv` once Gluecron is back.

### 5.4 When Gluecron returns

Re-run step 1 to catch Gluecron up on whatever GitHub absorbed during
the outage:

```bash
cd ~/Crontech
git fetch origin && git checkout Main && git pull --ff-only
bash scripts/mirror-to-gluecron.sh         # idempotent — re-syncs
```

Then verify (step 2), then re-enable cron (reverse step 5.3), then
re-merge the Woodpecker flip PR (reverse step 5.1).

---

## Gotchas we hit

<!-- Craig fills this in after the first live run. -->
<!-- Keep the format consistent with docs/SELF_HOSTED_CUTOVER.md -->
<!-- so future sessions can cross-reference. -->

*To be populated after the first live run.*

---

## Appendix — Why these specific endpoints

| Gluecron API call | Why |
|---|---|
| `GET /api/v2/version` | Cheapest reachability + auth probe. Returns 200 if alive, 401/403 if token is invalid. |
| `GET /api/v2/repos/:owner/:repo` | Check existence without creating. Idempotent. |
| `POST /api/v2/user/repos` | Create under authed user. Used when `TARGET_OWNER == GLUECRON_USER`. |
| `POST /api/v2/orgs/:owner/repos` | Create under an org. Used when `TARGET_OWNER != GLUECRON_USER`. |
| `git push --mirror` | The only way to replicate every ref (branches + tags + HEAD) and prune deletions in one call. |

## Appendix — Why we clone-back for verification

`git push --mirror` exits 0 when the refs transferred successfully,
but it does NOT prove that the resulting file tree on the server
matches the source. The only byte-level proof is:

1. Clone the pushed copy into a fresh location.
2. Hash every non-`.git` file.
3. Compare to the same hash computed on the source.

This catches server-side corruption, silent rejection of certain
file modes, and the rare case where `git push --mirror` succeeds but
the server's post-receive hooks mutate the working tree.
