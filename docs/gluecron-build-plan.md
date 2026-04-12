# CLAUDE.md — GlueCron

> **AI-native code intelligence platform. Git hosting, automated CI, green ecosystem enforcement.**
> Built to make GitHub obsolete. Internal dogfood for 3–12 months, then public release.
> Owner: Craig Canty (@ccantynz-alt)

---

## IDENTITY & MISSION

**Product Name:** GlueCron
**Domains:** gluecron.com, gluecron.ai, gluecron.io, gluecron.app
**Repo:** github.com/ccantynz-alt/gluecron (temporary home — ironic, yes)

**Mission:** Build the most advanced code intelligence platform ever created. Every push scanned. Every merge gated. Every deployment verified. Nothing broken ever reaches a customer. AI agents that understand your codebase, not just your diffs.

**Why This Exists:** Code rot is an industry-wide disease. Lovable and Bolt generate code that rots within weeks. GitHub's CI is optional and ignorable. The industry has accepted broken deployments as normal. GlueCron enforces quality at the platform level — if it's not green, it doesn't ship. Period.

**Relationship to Crontech:** GlueCron is a standalone product in the Crontech ecosystem. Crontech (github.com/ccantynz-alt/Crontech) is the substrate platform — AI, hosting, database, auth, billing, email. GlueCron is the code intelligence layer. Together they form the **green ecosystem**: nothing broken ever reaches a customer.

**Timeline:** Internal dogfood on Craig's 24+ products for 3–12 months. Public release only when it's an absolute killer. No rushing. No shortcuts. Battle-hardened or it doesn't ship.

---

## TECH STACK (Aligned with Crontech)

Same foundation as Crontech so the two products share DNA and can eventually share packages.

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Bun | 52K+ req/s, native TypeScript, built-in test runner, package manager |
| **Backend Framework** | Hono | 4x faster than Express, runs on every edge/serverless platform |
| **Frontend Framework** | SolidJS + SolidStart | True signals, zero virtual DOM, surgical DOM updates |
| **API Layer** | tRPC v11 | End-to-end type safety, zero codegen |
| **Database** | Turso (LibSQL) + Drizzle ORM | Edge SQLite with embedded replicas, code-first schemas |
| **Styling** | Tailwind v4 | Rust-based engine, 10x faster builds |
| **AI Provider** | Anthropic Claude (via @ai-sdk/anthropic) | Direct API, pay-per-token, no subscription tax |
| **Auth** | Passkeys (WebAuthn) + Password + Google OAuth | Same auth model as Crontech |
| **Git Backend** | isomorphic-git + bare repos on R2/disk | Pure JS git implementation, no shelling out to `git` |
| **Diff Engine** | diff2html + custom | Rich diffs with syntax highlighting |
| **Code Search** | Qdrant vectors + ripgrep-wasm | Semantic + literal code search |
| **Real-time** | WebSockets + SSE (Hono) | Live updates for CI status, PR activity |
| **Object Storage** | Cloudflare R2 | Git pack files, artifacts, attachments |
| **Linter/Formatter** | Biome | 50-100x faster than ESLint + Prettier |
| **Monorepo** | Turborepo + Bun workspaces | Same pattern as Crontech |
| **Type Safety** | TypeScript strict mode everywhere | No `any`. No `@ts-ignore`. No exceptions. |

---

## ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                     GlueCron Platform                        │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│  Git     │  Code    │  CI/CD   │  AI      │  Green          │
│  Hosting │  Review  │  Engine  │  Agents  │  Ecosystem      │
├──────────┴──────────┴──────────┴──────────┴─────────────────┤
│                    Hono + tRPC API Layer                     │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│  Turso   │  R2      │  Qdrant  │  Anthropic│  WebSockets    │
│  (meta)  │  (blobs) │  (search)│  (AI)    │  (realtime)     │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘
```

### Three-Layer Storage

1. **Turso (metadata)** — repos, users, PRs, issues, comments, CI runs, permissions. Relational data.
2. **R2 (blobs)** — Git pack files, loose objects, CI artifacts, file attachments. Object storage.
3. **Qdrant (vectors)** — Code embeddings for semantic search. Every file, every function, every commit message indexed.

### The Green Pipeline

```
Push → Receive → Parse → AI Scan → Test Run → Lint → Type Check → Gate → Merge/Reject
                           │           │         │        │           │
                           ▼           ▼         ▼        ▼           ▼
                       Agent Memory: every result feeds the flywheel
```

Every gate is mandatory. No `continue-on-error`. No "skip CI". No force-merge past red. The platform decides, not the developer's impatience.

---

## MONOREPO STRUCTURE

```
gluecron/
├── CLAUDE.md                    # This file
├── apps/
│   ├── web/                     # SolidStart frontend
│   │   ├── src/
│   │   │   ├── routes/          # File-based routing
│   │   │   ├── components/      # UI components
│   │   │   ├── lib/             # Client utilities
│   │   │   └── stores/          # Signal-based state
│   │   └── app.config.ts
│   └── api/                     # Hono API server (runs on Bun)
│       ├── src/
│       │   ├── git/             # Git protocol handlers (push/pull/clone)
│       │   ├── trpc/            # tRPC router + procedures
│       │   ├── ci/              # CI/CD pipeline engine
│       │   ├── ai/              # AI code review + agents
│       │   ├── auth/            # Passkeys + password + OAuth
│       │   ├── realtime/        # WebSocket + SSE handlers
│       │   └── middleware/      # Auth, rate limiting, CORS
│       └── test/
├── packages/
│   ├── db/                      # Drizzle schemas + migrations (Turso)
│   ├── ui/                      # Shared component library
│   ├── git-core/                # Git operations (isomorphic-git wrapper)
│   ├── diff/                    # Diff rendering engine
│   ├── ci-runner/               # CI job execution engine
│   └── config/                  # Shared TypeScript/Biome config
├── turbo.json
├── biome.json
├── package.json
└── bunfig.toml
```

---

## DATABASE SCHEMA (Phase 1)

All tables in Turso via Drizzle ORM. Same patterns as Crontech.

### Core Tables

```
users { id, email, displayName, role, passwordHash, passkeyCredentialId, authProvider, avatarUrl, createdAt, updatedAt }

sessions { id, userId, token, expiresAt, createdAt }

organizations { id, name, slug, avatarUrl, createdAt }

orgMembers { id, orgId, userId, role[owner|admin|member|viewer], createdAt }

repositories { id, orgId, name, slug, description, defaultBranch, isPrivate, storagePrefix, language, stars, forks, createdAt, updatedAt }

branches { id, repoId, name, sha, isProtected, isDefault, updatedAt }

commits { id, repoId, sha, message, authorName, authorEmail, authorDate, committerName, committerEmail, parentShas, treeSha, createdAt }

pullRequests { id, repoId, number, title, body, state[open|closed|merged], authorId, sourceBranch, targetBranch, isDraft, mergedAt, mergedBy, createdAt, updatedAt }

prReviews { id, prId, reviewerId, state[approved|changes_requested|commented], body, createdAt }

prComments { id, prId, reviewId, authorId, body, path, line, side, createdAt, updatedAt }

issues { id, repoId, number, title, body, state[open|closed], authorId, assigneeId, createdAt, updatedAt, closedAt }

issueLabels { id, repoId, name, color, description }

issueToLabel { issueId, labelId }

ciPipelines { id, repoId, name, triggerOn[push|pr|manual], configYaml, isActive, createdAt }

ciRuns { id, pipelineId, repoId, commitSha, branch, status[queued|running|passed|failed|cancelled], startedAt, finishedAt, durationMs, triggeredBy, createdAt }

ciSteps { id, runId, name, command, status[pending|running|passed|failed|skipped], output, startedAt, finishedAt }

aiReviews { id, prId, commitSha, model, findings, severity[info|warning|error|critical], tokensUsed, createdAt }

agentMemory { id, repoId, eventType, eventData, embedding, createdAt }
```

---

## BUILD PHASES

### PHASE 0: Foundation [IMMEDIATE — First Session]

Initialize the monorepo. Get the skeleton running. Everything builds. Everything type-checks.

- [ ] Initialize Turborepo + Bun workspaces
- [ ] Configure Biome (strict linting + formatting)
- [ ] Configure TypeScript strict mode across all packages
- [ ] Set up SolidStart app (apps/web)
- [ ] Set up Hono API server on Bun (apps/api)
- [ ] Set up tRPC connecting SolidStart ↔ Hono
- [ ] Set up Drizzle ORM with Turso connection
- [ ] Set up Tailwind v4 with SolidStart
- [ ] Create shared packages (db, ui, git-core, diff, ci-runner, config)
- [ ] Deploy initial CI pipeline (GitHub Actions — yes, ironic)
- [ ] Auth: passkeys + password + Google OAuth (port from Crontech patterns)
- [ ] Users + sessions + organizations tables + migrations

**Exit Criteria:** Monorepo builds. CI passes. Auth works. Types flow end-to-end.

### PHASE 1: Git Hosting [Core — The Foundation of Everything]

Without git hosting, nothing else matters. This is THE feature.

- [ ] packages/git-core: isomorphic-git wrapper for server-side operations
- [ ] Git smart HTTP protocol: push (receive-pack) and pull (upload-pack)
- [ ] Bare repository storage on R2 (or local disk for dev)
- [ ] Repository CRUD (create, list, get, delete, transfer)
- [ ] Branch management (create, delete, protect, set default)
- [ ] Commit history browsing (log, show, tree)
- [ ] File browser (tree view, file content, blame)
- [ ] Clone URLs (HTTPS with token auth)
- [ ] Repository settings (name, description, visibility, default branch)

**Exit Criteria:** Can create a repo, push code, browse files, view commits, clone. Full git workflow.

### PHASE 2: Code Review — Pull Requests [The Collaboration Layer]

- [ ] PR creation (source branch → target branch)
- [ ] Rich diff view (side-by-side + unified, syntax highlighting)
- [ ] Inline comments on diffs (line-level, range-level)
- [ ] PR reviews (approve, request changes, comment)
- [ ] PR merge (merge commit, squash, rebase)
- [ ] PR status checks (linked to CI runs)
- [ ] Conflict detection and display
- [ ] Draft PRs
- [ ] PR templates

**Exit Criteria:** Full PR workflow — create, review, comment, merge. Rich diffs.

### PHASE 3: CI/CD — The Green Gate [The Quality Enforcer]

- [ ] Pipeline configuration (YAML or code-first)
- [ ] Job runner: execute shell commands in isolated environments
- [ ] Step-by-step execution with output capture
- [ ] Status reporting (queued → running → passed/failed)
- [ ] Required status checks on branches (no merge if red)
- [ ] CI badge generation
- [ ] Artifact storage (test reports, coverage, build outputs)
- [ ] Parallel step execution
- [ ] Auto-cancel superseded runs

**Exit Criteria:** Push triggers CI. CI runs tests. Red blocks merge. Green allows merge. No exceptions.

### PHASE 4: AI Code Intelligence [The Brain]

- [ ] AI-powered PR review (Anthropic Claude via @ai-sdk/anthropic)
- [ ] Architectural regression detection (not just syntax — understands patterns)
- [ ] Security vulnerability scanning
- [ ] Code quality scoring per commit
- [ ] Agent memory: every review, every fix, every pattern stored in Qdrant
- [ ] Flywheel: agents get smarter with every commit across all repos
- [ ] Suggested fixes (not just "this is wrong" but "here's the fix")
- [ ] Custom review rules per repository

**Exit Criteria:** Every PR gets an AI review. Agent memory accumulates. The system is visibly smarter after 100 PRs than after 10.

### PHASE 5: Issues & Project Management [Track Everything]

- [ ] Issue CRUD with markdown body
- [ ] Labels (custom colors, descriptions)
- [ ] Assignees
- [ ] Milestones
- [ ] Issue references in commits and PRs (closes #123)
- [ ] Kanban board view
- [ ] Timeline view

**Exit Criteria:** Full issue tracking. Issues link to PRs and commits.

### PHASE 6: Search [Find Anything Instantly]

- [ ] Full-text code search (ripgrep-wasm)
- [ ] Semantic code search (Qdrant vectors — "find functions that handle auth")
- [ ] Repository search
- [ ] Issue/PR search
- [ ] Commit message search
- [ ] Cross-repo search

**Exit Criteria:** Can find any code, any issue, any PR, any commit in under 500ms.

---

## DESIGN PRINCIPLES

1. **ZERO BROKEN ANYTHING.** Every button works. Every link resolves. Every page renders.
2. **110% AGGRESSIVE DESIGN.** No 1980s GitHub clone. This is AI-native. Dark mode. Glass morphism. Animations. The future.
3. **GREEN ECOSYSTEM.** Nothing ships unless every gate passes. This is the entire point of the product.
4. **AI IS THE BLOODSTREAM.** Not bolted on. Not a sidebar. AI understands every commit, every file, every pattern.
5. **SPEED IS SURVIVAL.** Sub-100ms page loads. Sub-500ms search. Sub-5s CI cold start.
6. **TYPE SAFETY EVERYWHERE.** TypeScript strict mode. Zod at every boundary. tRPC end-to-end.

---

## QUALITY GATES (Same as Crontech)

| Gate | Command | Pass Criteria |
|------|---------|---------------|
| Build | `bun run build` | All packages successful |
| Type check | `bun run check` | All packages, 0 errors |
| Tests | `bun run test` | All packages, 100% pass |
| Lint | `bunx biome check` | exit 0 |

Every session ends with all gates green. No exceptions.

---

## RULES

1. **Read this file before every session.** Not skim. READ.
2. **No major changes without Craig's authorization.** Ask first.
3. **Maximum parallel agent usage.** Five agents when five can run. Always.
4. **Conventional commits.** `feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`, `ci:`, `chore:`.
5. **TypeScript strict mode.** No `any`. No `@ts-ignore`.
6. **Zod at every boundary.** API input/output, env vars, config.
7. **Tests before merge.** Untested code does not ship.
8. **Biome for formatting and linting.** Not Prettier. Not ESLint. Biome.
9. **Bun for everything.** Runtime, package manager, test runner, bundler.
10. **HAVE FUN.** We're building something that has never existed before.

---

*Built by Craig Canty. GlueCron — the glue that holds the green ecosystem together.*
