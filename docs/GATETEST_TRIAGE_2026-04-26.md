# GateTest Triage — 2026-04-26

Snapshot of what GateTest's `--suite full --parallel` reported on
`claude/vendor-parity-docs-22c9D` at the end of the vendor-parity
sprint. **This is the cleanup roadmap for the next "use GateTest
to fix Crontech systematically" session.**

## Headline number is misleading without filtering

Raw output: **11,840 failed checks of 12,890 total (92%).**

After filtering out:

- **~6,090 `typescript-strict` "TS6142 jsx not set" errors** — GateTest
  invokes `tsc` without our `tsconfig.json`'s `jsx` setting, so every
  `.tsx` import fails. **GateTest tool bug, not Crontech bug.**
- **~5,000 errors scoped to `.claude/worktrees/agent-*/` paths** —
  agent worktree scratch dirs that GateTest doesn't honour our
  `.claude/**` ignore in `gatetest.config.json`. **GateTest tool bug,
  not Crontech bug.**

The **real** Crontech-repo signal is:

## 763 real errors across 15 modules

| Module | Real errors | Severity / what to do |
|---|---:|---|
| `codeQuality` | **574** | Mostly file-length violations + `console.log` calls. Mechanical cleanup; split files over 300 lines, swap `console.*` for the OTel logger. |
| `hardcodedUrl` | **62** | Files using literal URLs that should come from env. Architectural — fix as we touch each call site. |
| `errorSwallow` | **41** | `catch` blocks that swallow errors silently. Real bug class — each one needs a judgment call (re-throw, log + fall through, or fix). |
| `crossFileTaint` | **18** | Possible injection sinks. Security review per finding. |
| `secrets` | **14** | **Mostly false positives** — flags strings like `placeholder={"DATABASE_URL=..."}` (UI placeholders) and `autoProbeSecret: "DATABASE_URL"` (config strings naming env vars). Audit each, then tune GateTest secrets module. |
| `nPlusOne` | **12** | DB queries inside loops. Real performance bug class. |
| `envVars` | **11** | Env-var references that don't match `.env.example`. Mechanical sync. |
| `shell` | **8** | `.sh` scripts missing `set -e` or piping `curl ... \| sh` without checksum. Real security/reliability fix. |
| `resourceLeak` | **8** | Bare `setInterval(...)` without clearInterval on shutdown. Real memory leak class. |
| `raceCondition` | **7** | TOCTOU patterns in fs operations (`stat` → `unlink` race). Real bug class. |
| `promptSafety` | **2** | OpenAI calls without `max_tokens` — cost-control issue (attacker can run up bills with long prompts). 30-second fix per call site. |
| `importCycle` | **2** | Circular imports. Refactor each. |
| `moneyFloat` | **1** | Money handled as float (precision loss). **Billing-critical** — fix immediately when found. |
| `typescriptStrictness` | **1** | `tsconfig` setting drift. Quick fix. |
| `lint` | **1** | "No ESLint configuration found" — we use Biome, not ESLint. **GateTest tool false positive.** |

## Recommended cleanup order (by leverage)

1. **`promptSafety` (2 errors)** — fastest wins, real cost-control. Find both `openai.*({ ... })` calls without `max_tokens` and add the cap.
2. **`moneyFloat` (1 error)** — billing-critical, must fix.
3. **`resourceLeak` (8 errors)** — find each bare `setInterval` and add a teardown in the module's shutdown path.
4. **`shell` (8 errors)** — add `set -e` to each `.sh`, add SHA256 checksums for any remote curl-pipe-sh.
5. **`hardcodedUrl` (62 errors)** — extract to env vars, drive from config. Compounds: each fix makes the platform more self-hostable.
6. **`errorSwallow` (41 errors)** — sweep, judgment call per site.
7. **`codeQuality` (574 errors)** — mechanical, can be parallelized across agents (split files / replace console).

## GateTest tool bugs to file in the GateTest repo

Per the 2026-04-26 / 2026-04-27 sprint findings (also captured in
`HANDOFF.md` §2):

1. **`mutation` module silently corrupts source files** — doesn't
   restore mutated files after running tests. Reverted twice today
   (`||` → `&&` in admin script; `=== 0` → `!== 0` in cache).
2. **`--suite full` overrides `gatetest.config.json` per-module
   `enabled: false` flags.** Specifically `mutation` is disabled
   in our config but `--suite full` runs it anyway.
3. **`typescript-strict` doesn't read project's `tsconfig.json`** —
   runs `tsc` with default flags, so `--jsx` is unset, every `.tsx`
   import fails (~6,090 false positives in our scan).
4. **`ignore.paths` doesn't apply to `.claude/worktrees/`** despite
   `.claude/**` being listed. Inflates findings count by ~5,000.
5. **`secrets` module false-positives** on UI placeholder text and
   config strings naming env vars (e.g. `autoProbeSecret: "DATABASE_URL"`).
6. **`lint` module reports "No ESLint configuration found"** — we
   use Biome, GateTest should detect that and skip the check.

When these six are fixed in the GateTest repo, the same scan should
report ~600–700 real findings instead of 11,840 — a 20× signal-to-noise
improvement.
