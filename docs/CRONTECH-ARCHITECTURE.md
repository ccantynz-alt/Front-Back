# CRONTECH — Platform Architecture & Features Summary

## What Crontech IS
The developer platform for the next decade. One unified product replacing 22+ services: hosting, database, auth, AI, real-time collaboration, billing, email, storage. Self-hosted on Vultr. Deployed via GitHub Actions (interim) then GlueCron (future).

## Live URL
https://crontech.ai

## Tech Stack
- Runtime: Bun v1.3.9 (52K+ req/s, native TypeScript)
- Frontend: SolidJS + SolidStart (signals, zero vDOM, fastest reactivity)
- Backend: Hono (4x faster than Express) + tRPC v11 (end-to-end type safety)
- Database: Turso (edge SQLite) + Neon (serverless Postgres) + Qdrant (vectors)
- ORM: Drizzle (7.4KB, zero codegen)
- CSS: Tailwind v4 (Rust-based, 10x faster)
- AI: Anthropic SDK + OpenAI SDK, three-tier compute (client GPU, edge, cloud)
- Auth: Passkeys/WebAuthn + Google OAuth + email/password (Argon2id)
- Real-time: WebSockets + SSE + Yjs CRDTs
- Billing: Stripe (subscriptions, usage metering, webhooks)
- Email: AlecRae MTA (primary) + Resend (fallback)
- Observability: OpenTelemetry + Grafana LGTM stack
- Linter: Biome (100x faster than ESLint + Prettier)
- CI: GitHub Actions + GateTest quality gates
- Hosting: Vultr VPS + Caddy (TLS) + systemd

## Architecture
```
Monorepo (Bun workspaces + Turborepo)
├── apps/web        — SolidStart frontend (43 routes)
├── apps/api        — Hono API server (34 tRPC procedures)
├── packages/db     — Drizzle ORM + 42 DB tables + 20 migrations
├── packages/ui     — 15 SolidJS components (Button, Card, Modal, etc.)
├── packages/schemas — Zod validation schemas
├── packages/ai-core — AI inference, agents, RAG, vector search
├── packages/queue   — BullMQ task queue
├── packages/storage — S3-compatible storage
├── packages/audit-log — Hash-chained tamper-evident audit log
├── services/sentinel    — 24/7 competitive intelligence
├── services/orchestrator — Deploy orchestrator
├── services/edge-workers — Cloudflare Workers
└── services/gpu-workers  — Modal.com H100 inference
```

## Routes (43 total)
Public: / (landing), /about, /pricing, /docs, /templates, /status, /support, /founding
Auth: /login, /register
App: /dashboard, /projects, /projects/new, /projects/[id], /projects/[id]/metrics, /projects/import, /builder, /chat, /repos, /collab, /video, /ai-playground, /database, /deployments, /billing, /settings, /ops, /flywheel
Admin: /admin, /admin/progress, /admin/support, /admin/claude, /admin/claude/settings
Legal: /legal/terms, /legal/privacy, /legal/acceptable-use, /legal/dmca, /legal/cookies, /legal/sla, /legal/ai-disclosure, /legal/beta-disclaimer

## tRPC Procedures (34 total)
auth — register (passkey + password + Google OAuth), login, logout, me, csrf
projects — list, create, update, delete, getById, addDomain, removeDomain, verifyDomain, setEnvVar, deleteEnvVar, listEnvVars, deploy
deployments — create, list, getById, getStatus, cancel
billing — getStatus, getPlans, getSubscription, createCheckoutSession, createPortalSession, joinWaitlist, reportUsage
usage — getMonthly, getLimits, history
analytics — getUsageStats, getDailyPageViews, getDeploymentHistory, getAiTokenUsage
chat — conversations CRUD, messages, provider keys, usage stats, streaming
notifications — getUnread, markRead
support — createTicket, listTickets
admin — users, system health
tenant — provision, deploy, health
collab — rooms, presence
repos — tracked repos, provider config
webhooks — Stripe, GlueCron push

## Database (42 tables)
users, sessions, passkeys, oauthAccounts, tenants, projects, projectDomains, projectEnvVars, deployments, deploymentLogs, plans, subscriptions, usageEvents, usageReports, conversations, chatMessages, userProviderKeys, notifications, supportTickets, auditEvents, featureFlags, emailPreferences, products, productTenants, apiKeys, webhookEndpoints, webhookDeliveries, tenantGitRepos, sites, siteVersions, analytics, uiComponents, aiCache, flywheel tables, build theatre tables

## GlueCron Integration (ALREADY BUILT ON CRONTECH SIDE)
- Webhook receiver: POST /api/hooks/gluecron/push
- Auth: Authorization: Bearer ${GLUECRON_WEBHOOK_SECRET}
- Payload: { repository, sha, branch, ref, source: "gluecron" }
- Response: { ok: true, deploymentId, status: "queued" }
- Lookup: matches repository field against tenantGitRepos table
- Auto-deploy: triggers orchestrator build pipeline
- Event emission: deploy success/failure events sent back to GlueCron
- File: apps/api/src/webhooks/gluecron-push.ts (257 lines, fully tested)
- Orchestrator client: apps/api/src/deploy/orchestrator-client.ts

## Deploy Pipeline (BLK-009)
- GitHub webhook receiver with HMAC-SHA256 verification
- GlueCron webhook receiver with Bearer token auth (timing-safe)
- Build runner: git clone, bun install, bun run build, orchestrator handoff
- Live log SSE streaming: GET /api/deployments/:id/logs/stream
- Docker sandbox: 14 security guarantees (cap-drop, no-new-privileges, resource limits)
- Deployments UI with status badges (queued/building/deploying/live/failed)
- DeploymentCard + DeploymentLogs terminal viewer

## Onboarding Flow (end-to-end)
1. User signs up (passkey/Google/password) — auto-provisioning fires
2. Workspace + DB provisioned, welcome email sent, sample template created
3. Onboarding wizard: What are you building? Stack preferences? Get started
4. Dashboard shows real project cards with skeleton loaders
5. Create project from 6 starter templates (SolidJS, Hono API, AI Chat, Python, Astro, Blank)
6. Env vars panel (Vercel-grade: mask/reveal, bulk .env import, copy-as-.env)
7. Custom domain management with DNS verification flow
8. Deploy via push webhook
9. Stripe billing (env-gated with PreLaunchBilling waitlist UI)

## Customer Onboarding for Products (AlecRae, etc.)
1. Register tenant in tenantGitRepos table (appName, repoUrl, branch, domain, port, runtime, envVars, autoDeploy)
2. Set GLUECRON_WEBHOOK_SECRET shared secret on both sides
3. Configure GlueCron to POST push events to https://api.crontech.ai/api/hooks/gluecron/push
4. On push: Crontech receives webhook, clones repo, installs, builds, deploys, live
5. Caddy reverse-proxies the domain to the running process

## Self-Hosting Setup
- Server: Vultr VPS
- Reverse proxy: Caddy (auto TLS via Let's Encrypt)
- Process manager: systemd (crontech-web on port 3000, crontech-api on port 3001)
- Deploy: GitHub Actions SSHs into Vultr as root, pulls, builds, restarts services
- DNS: crontech.ai and api.crontech.ai both point to Vultr IP
- SSH key: ed25519 key pair, private key stored in GitHub secret VULTR_SSH_KEY

## Quality Gates (all enforced)
- bun run build — 5/5 packages
- bun run check — 16/16 packages, 0 type errors
- bun run test — 32 test files, all passing
- bun run check-links — 45 routes, 0 dead links
- bun run check-buttons — 0 dead buttons
- bunx biome check — exit 0
- GateTest — 24-module quality scan on every PR

## Positioning (LOCKED)
- Audience: Universal (devs, agencies, founders, AI builders)
- Tone: Polite — never name competitors in public copy
- Headline: The developer platform for the next decade
- Not: a vertical SaaS, a website builder for non-devs, a WordPress plugin

## Key Files for Integration
- GlueCron webhook: apps/api/src/webhooks/gluecron-push.ts
- Orchestrator client: apps/api/src/deploy/orchestrator-client.ts
- Deploy event emitter: apps/api/src/events/deploy-event-emitter.ts
- Build runner: apps/api/src/automation/build-runner.ts
- Tenant git repos schema: packages/db/src/schema.ts (tenantGitRepos table)
- Deploy workflow: .github/workflows/deploy.yml
- tRPC router: apps/api/src/trpc/router.ts
- Main API entry: apps/api/src/index.ts
