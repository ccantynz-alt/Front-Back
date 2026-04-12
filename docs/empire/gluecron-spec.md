# gluecron — The AI-Native Code Platform

**Status:** SPEC. Not yet built. This document is the build brief for the first session.
**Authored:** 2026-04-12
**Owner:** Craig Canty
**Domains:** TBD (Craig to confirm)

---

## 1. What gluecron IS

gluecron is the AI-native replacement for GitHub. It handles the entire code lifecycle — hosting, review, quality enforcement, and deployment — with AI at every step. Nothing ships to a customer that doesn't pass every gate.

**The one-sentence pitch:**
> gluecron is what GitHub would be if it were built today with AI at its core instead of bolted on.

## 2. Why GitHub needs replacing

| GitHub pain | gluecron answer |
|---|---|
| Sandbox issues in Claude Code web sessions | Native AI agent workspace, no sandbox restrictions |
| Proxy errors (127.0.0.1:32330 failures) | Direct integration, no proxy layer |
| Code ships without quality checks unless you wire up Actions manually | GateTest baked in — nothing merges without 24 quality gates passing |
| PR review is manual or shallow (Copilot reviews miss architecture issues) | Deep AI review powered by GateTest's fake-fix-detector + full security/a11y/perf suite |
| Actions are YAML hell — fragile, hard to debug, slow | AI-native pipelines defined in TypeScript, not YAML |
| No native understanding of your codebase | gluecron reads your CLAUDE.md/doctrine and enforces it automatically |
| Old architecture (Ruby monolith, acquired features bolted on) | Built from scratch, 2026 stack, AI-native from day one |
| Enterprise pricing for basic features (branch protection, CODEOWNERS) | All features available from day one, empire-friendly pricing |

## 3. What gluecron does NOT replace (v1)

- **Git itself** — gluecron uses Git as the version control engine. It's not a new VCS. It hosts Git repos.
- **IDE/editor** — developers still use VS Code, Claude Code, Cursor, whatever. gluecron is the remote.
- **Hosting/runtime** — that's Crontech's job. gluecron deploys TO Crontech (or other targets).

## 4. The empire pipeline (the dream)

```
Developer pushes code
        ↓
    gluecron receives push
        ↓
    GateTest runs 24 quality gates (auto, no config needed)
        ↓
    AI reviews the code (architecture, security, fake-fix detection)
        ↓
    If ALL gates green → auto-deploy to Crontech
    If ANY gate red → block merge, explain why, suggest fix
        ↓
    Customer gets perfect product. Always.
```

**This is the green ecosystem.** No broken code reaches any customer. Ever. GateTest is the immune system. gluecron is the circulatory system. Crontech is the body.

## 5. MVP scope (what ships FIRST)

The smallest useful gluecron that replaces GitHub for the empire:

### 5.1 Git hosting (P0)
- Push/pull/clone repos over HTTPS (SSH later)
- Branch management (create, delete, protect)
- Web UI to browse code, commits, branches, diffs
- Repo settings (name, description, visibility, default branch)

### 5.2 Quality gates (P0) — GateTest integration
- On every push: automatically run GateTest `--suite quick`
- On every PR: run GateTest `--suite full`
- Quality score badge on every commit (0-100)
- Block merge if score below threshold (configurable per repo)
- GateTest connects as an external service via webhook (stays standalone)
- gluecron calls `POST https://gatetest.ia/api/scan/run` with repo URL + branch

### 5.3 AI code review (P0)
- Every PR gets automatic AI review (Claude-powered)
- Reviews check: architecture, security, performance, accessibility, style
- Fake-fix detection (via GateTest's fake-fix-detector module)
- Reviews are inline comments, not just a summary
- Developers can reply to AI comments, AI responds contextually

### 5.4 Pull requests (P0)
- Create, review, merge PRs through web UI
- Status checks (GateTest score, AI review, custom checks)
- Merge only when all checks pass (enforced, not advisory)
- Squash, rebase, or merge commit options
- PR templates

### 5.5 Auto-deploy to Crontech (P1)
- On merge to main: trigger deploy via Crontech's orchestrator API
- Deploy status visible in gluecron UI
- Rollback button in gluecron UI (calls Crontech's rollback)
- Deploy history with links to live URLs

### 5.6 Doctrine enforcement (P1)
- gluecron reads CLAUDE.md from the repo root
- AI review checks code against doctrine rules
- Doctrine violations flagged as blocking review comments
- "Doctrine score" alongside quality score

### 5.7 Dashboard (P1)
- Repos list with quality scores and deploy status
- Per-repo: branches, PRs, commits, quality history
- Empire view: all repos, all scores, all deploy statuses in one screen
- Green/yellow/red indicators per repo

## 6. Architecture

### 6.1 Stack

| Layer | Technology | Why |
|---|---|---|
| **Runtime** | Bun | Same as Crontech/emailed — empire standard |
| **API** | Hono | Same as Crontech/emailed — fast, edge-compatible |
| **Database** | Drizzle + Neon Postgres | Same as empire — proven, serverless |
| **Frontend** | SolidStart (or Next.js — Craig to confirm) | SolidStart matches Crontech; Next.js matches Zoobicon |
| **Git backend** | `git` CLI + bare repos on disk | Simple, proven. No need for libgit2 bindings in v1 |
| **AI** | Anthropic Claude (via Vercel AI SDK) | Empire standard, with OpenAI fallback |
| **Queue** | BullMQ + Redis (Upstash) | Same as emailed — proven durable queue |
| **Auth** | Passkeys + OAuth | Same as Crontech |
| **File storage** | Local disk (git repos) + R2 (artifacts) | Git repos are files; build artifacts go to R2 |

### 6.2 Git hosting architecture

gluecron hosts Git repos as **bare repositories** on the server filesystem:

```
/data/repos/{owner}/{repo-name}.git/    ← bare Git repo
```

**HTTPS Git protocol:**
- `git push https://gluecron.dev/{owner}/{repo}.git` → Hono route receives Git smart HTTP protocol
- Uses `git-http-backend` (Git's built-in CGI) behind Hono
- Auth: Bearer token in HTTPS header (API key or OAuth token)

**Webhooks on push:**
- gluecron fires internal event: `repo.push`
- Event triggers: GateTest scan, AI review (if PR exists), auto-deploy (if main branch)

### 6.3 Data model

```sql
-- Repos
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  default_branch TEXT DEFAULT 'main',
  visibility TEXT DEFAULT 'private',  -- private, internal, public
  quality_threshold INTEGER DEFAULT 70,  -- min GateTest score to merge
  doctrine_path TEXT DEFAULT 'CLAUDE.md',
  auto_deploy BOOLEAN DEFAULT false,
  deploy_target TEXT,  -- Crontech tenant slug
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, name)
);

-- Pull Requests
CREATE TABLE pull_requests (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'open',  -- open, merged, closed
  quality_score INTEGER,
  ai_review_status TEXT DEFAULT 'pending',  -- pending, approved, changes_requested
  created_at TIMESTAMPTZ DEFAULT NOW(),
  merged_at TIMESTAMPTZ,
  UNIQUE(repo_id, number)
);

-- Quality checks (GateTest results)
CREATE TABLE quality_checks (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id),
  commit_sha TEXT NOT NULL,
  pr_id TEXT REFERENCES pull_requests(id),
  score INTEGER NOT NULL,  -- 0-100
  modules_run TEXT[],
  results JSONB,
  passed BOOLEAN NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI review comments
CREATE TABLE review_comments (
  id TEXT PRIMARY KEY,
  pr_id TEXT NOT NULL REFERENCES pull_requests(id),
  file_path TEXT NOT NULL,
  line_number INTEGER,
  body TEXT NOT NULL,
  author TEXT DEFAULT 'gluecron-ai',  -- or user ID for human replies
  severity TEXT DEFAULT 'suggestion',  -- suggestion, warning, blocking
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deploy history
CREATE TABLE deploys (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id),
  commit_sha TEXT NOT NULL,
  target TEXT NOT NULL,  -- Crontech tenant slug or URL
  status TEXT DEFAULT 'pending',  -- pending, building, deploying, live, failed, rolled_back
  url TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Webhooks (outbound, for external integrations)
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id),
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,  -- push, pr.opened, pr.merged, check.completed, deploy.completed
  secret TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.4 GateTest integration flow

```
1. Developer pushes to gluecron
2. gluecron fires post-receive hook
3. Hook calls: POST https://gatetest.ia/api/scan/run
   Body: { repoUrl, branch, commitSha, callbackUrl }
4. GateTest clones, scans 24 modules, returns results to callback
5. gluecron stores results in quality_checks table
6. If PR exists: update PR status check
7. If score >= repo.quality_threshold: allow merge
8. If score < threshold: block merge, show failing modules
```

GateTest stays standalone. It has its own domains (.io for customers, .ia for empire). gluecron is just one of its integration targets, same way GitHub is today.

### 6.5 Crontech deploy integration flow

```
1. PR merged to main (all gates green)
2. gluecron checks repo.auto_deploy flag
3. If true: POST https://crontech.ai/api/trpc/tenant.deploy
   Body: { appName, repoUrl, branch: "main", domain, runtime }
4. Crontech orchestrator builds + deploys
5. gluecron stores deploy record with status
6. Dashboard shows: commit → quality score → deploy status → live URL
```

## 7. What makes gluecron better than GitHub (not just a clone)

| Feature | GitHub | gluecron |
|---|---|---|
| **Quality gates** | Optional, manual setup (Actions YAML) | Mandatory, automatic (GateTest baked in) |
| **AI review** | Copilot (shallow, misses architecture) | Deep review + fake-fix detection + doctrine enforcement |
| **Deploy** | Separate service (Vercel, etc.) | Integrated (Crontech) — one platform |
| **Doctrine** | No concept | Reads CLAUDE.md, enforces rules automatically |
| **CI config** | YAML (fragile, hard to debug) | TypeScript pipeline definitions (type-safe) |
| **Quality score** | No concept | Every commit scored 0-100, visible everywhere |
| **Green ecosystem** | Hope-based ("tests should pass") | Enforced ("nothing merges below threshold") |
| **AI agent workspace** | Sandbox issues, proxy errors | Native integration, no sandbox |
| **Pricing** | Enterprise tax for branch protection | Everything included |

## 8. Pricing (draft — Craig to confirm)

| Tier | Price | Repos | Users | GateTest | Deploy |
|---|---|---|---|---|---|
| **Solo** | Free | 5 private | 1 | Quick scans | Manual |
| **Team** | $19/mo | Unlimited | 5 | Full scans | Auto-deploy |
| **Business** | $49/mo | Unlimited | 20 | Full + AI review | Auto-deploy + rollback |
| **Empire** | $99/mo | Unlimited | Unlimited | Everything | Everything + priority |

**Empire internal:** All Canty empire repos run free on gluecron. Dogfood.

## 9. File structure (MVP)

```
gluecron/
├── apps/
│   ├── web/              # SolidStart/Next.js frontend
│   │   ├── src/
│   │   │   ├── routes/   # Pages: repos, PRs, commits, settings, dashboard
│   │   │   ├── components/
│   │   │   └── lib/
│   │   └── package.json
│   └── api/              # Hono API server
│       ├── src/
│       │   ├── routes/
│       │   │   ├── git.ts       # Git smart HTTP protocol
│       │   │   ├── repos.ts     # CRUD repos
│       │   │   ├── prs.ts       # Pull requests
│       │   │   ├── checks.ts    # Quality checks
│       │   │   ├── reviews.ts   # AI reviews
│       │   │   ├── deploys.ts   # Deploy management
│       │   │   ├── webhooks.ts  # Outbound webhooks
│       │   │   └── auth.ts      # Auth routes
│       │   ├── git/
│       │   │   ├── http-backend.ts  # git-http-backend wrapper
│       │   │   ├── hooks.ts         # post-receive hooks
│       │   │   └── refs.ts          # Branch/tag management
│       │   ├── ai/
│       │   │   ├── reviewer.ts      # AI code review engine
│       │   │   ├── doctrine.ts      # CLAUDE.md parser + enforcer
│       │   │   └── prompts.ts       # Review prompt templates
│       │   ├── integrations/
│       │   │   ├── gatetest.ts      # GateTest API client
│       │   │   └── crontech.ts      # Crontech deploy API client
│       │   └── middleware/
│       └── package.json
├── packages/
│   ├── db/               # Drizzle schemas + migrations
│   ├── ui/               # Shared components
│   └── sdk/              # gluecron SDK (for integrations)
├── CLAUDE.md
├── package.json
└── turbo.json
```

## 10. MVP build order

| Week | Deliverable | Exit criteria |
|---|---|---|
| **1** | Git hosting + web browse | `git push` works, can browse code/commits in web UI |
| **2** | Pull requests + merge | Create PR, view diff, merge — all in web UI |
| **3** | GateTest integration | Every push triggers scan, score shown, merge blocked below threshold |
| **4** | AI code review | Every PR gets AI review with inline comments |
| **5** | Crontech auto-deploy | Merge to main → auto-deploy to Crontech |
| **6** | Dashboard + polish | Empire view, quality history, deploy status |

**6 weeks to MVP.** Each week has a clear deliverable. Each week is independently useful (Week 1 alone replaces GitHub for basic hosting).

## 11. Open questions — TBD Craig to confirm

1. **Frontend stack:** SolidStart (matches Crontech) or Next.js (matches Zoobicon)?
2. **Domain:** gluecron.dev? gluecron.io? gluecron.ai?
3. **SSH Git protocol:** needed for v1 or HTTPS only?
4. **Organizations/teams:** needed for v1 or just single-user?
5. **Issue tracker:** part of gluecron or separate product?
6. **Wiki/docs:** part of gluecron or separate?
7. **Package registry:** (npm/Docker) part of gluecron or separate?
8. **Where does gluecron itself run?** On Crontech (dogfood) or standalone?
9. **WordPress plugin for GateTest:** is this a gluecron feature or separate GateTest distribution?
10. **Pricing confirmed?** See §8 draft above.

## 12. The empire integration map

```
┌─────────────┐     push      ┌─────────────┐
│  Developer   │──────────────→│  gluecron    │
│  (VS Code,   │               │  (code host) │
│   Claude     │               │              │
│   Code)      │               └──────┬───────┘
└──────────────┘                      │
                                      │ webhook
                                      ▼
                               ┌─────────────┐
                               │  GateTest    │
                               │  (24 quality │
                               │   gates)     │
                               └──────┬───────┘
                                      │
                                      │ score + results
                                      ▼
                               ┌─────────────┐
                               │  gluecron    │
                               │  (merge gate)│
                               └──────┬───────┘
                                      │
                                      │ if green → deploy
                                      ▼
                               ┌─────────────┐
                               │  Crontech    │
                               │  (hosting)   │
                               └──────┬───────┘
                                      │
                                      │ live
                                      ▼
                               ┌─────────────┐
                               │  Customer    │
                               │  (perfect    │
                               │   product)   │
                               └──────────────┘
```

**Nothing broken reaches the customer. That's the mandate. That's gluecron.**
