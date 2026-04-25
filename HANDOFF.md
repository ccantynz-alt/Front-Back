# HANDOFF.md — Session Log (newest first)

---

## Session: 2026-04-25 (airport session) | Branch: `claude/debug-crontech-HZTWO`

### What was done this session

1. **Landing page visual architecture fixed** — stats strip flipped from dark
   (`#05060b`) to white. Hero and stats were identical colour so they looked like
   one giant dark blob with dead space. Now: dark hero → crisp white stats strip
   → light page content. Stat values now use indigo brand gradient on white.

2. **WCAG 2.2-AA a11y fix** — all `<A href="…"><button>…</button></A>` patterns
   replaced with `<A href="…" class="landing-hero-btn-*">…</A>`. Nested
   interactive elements are a hard WCAG violation and the real reason GateTest
   was red on PR #194.

3. **GateTest should now pass** — new commit `6e47eb2` pushed to branch.
   GateTest is re-running on PR #194 automatically.

### What Craig needs to do when back from airport

**Step 1 — Watch GateTest on PR #194**
  https://github.com/ccantynz-alt/Crontech/pull/194
  Wait for GateTest — Quality Gate to go green. Should take ~3 minutes.

**Step 2 — Merge PR #194** (once GateTest green)
  Merge button on the PR page. Squash merge is fine.

**Step 3 — Hit Deploy in /admin**
  Go to https://crontech.ai/admin → Deploy panel → click Deploy.
  This pulls Main from GitHub, rebuilds with bun preset, restarts services.
  Takes ~5 minutes. Watch the SSE log stream.

**Step 4 — Cut DNS at registrar**
  Set crontech.ai A record → Vultr server IP.
  Set www.crontech.ai A record → Vultr server IP.
  From this moment Vercel is completely out of the picture.

**Step 5 — Verify env vars on Vultr before DNS cut**
  SSH into Vultr box and check /opt/crontech/.env contains:
  DATABASE_URL, DATABASE_AUTH_TOKEN, STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET, OPENAI_API_KEY, VITE_PUBLIC_API_URL,
  VITE_PUBLIC_URL, DEPLOY_AGENT_SECRET

### Craig's open questions (answered in chat, recorded here)

**"Why is GateTest red?"**
GateTest has `accessibility: error, wcag: 2.2-AA` as a hard gate.
The landing page had `<A><button></button></A>` everywhere — nested interactive
elements are a WCAG hard violation. Fixed in commit `6e47eb2`.

**"Are we going to have our own Fly.io system?"**
Yes — this is a strategic decision Craig needs to authorize. The short answer:
Gluecron can run as a systemd service on the same Vultr box instead of Fly.io,
exactly like crontech-web and crontech-api. No external service needed.
Needs Craig's explicit go-ahead before implementing (§0.7 hard gate:
adding/removing third-party services, architecture changes).

**"Fly.io → self-hosted" — what it would take**
  - Remove Fly.io from Gluecron's deploy target
  - Add `crontech-gluecron.service` systemd unit on Vultr (same pattern as
    crontech-web.service and crontech-api.service)
  - Add `gluecron.crontech.ai` → `localhost:3002` already wired in Caddyfile
  - One command on Vultr: `systemctl enable --now crontech-gluecron`
  One session of work. Fully self-contained.

### Next agent should start by

1. Checking PR #194 GateTest status — if green, tell Craig to merge it.
2. If GateTest still red, read the check run annotations to find what module.
3. Answer Craig's Fly.io authorization question if he gives the go-ahead.
