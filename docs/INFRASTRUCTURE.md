# INFRASTRUCTURE — Crontech Self-Hosted Stack

> **Doctrine. Locked by Craig on 18 April 2026.**
> This file has the same binding authority as `CLAUDE.md` and
> `docs/BUILD_BIBLE.md`. Every block below is a contract. Locked
> blocks cannot be modified, undone, reverted, or "migrated back"
> without Craig's explicit in-chat authorization.
>
> **Any Claude session that reverts, replaces, or undermines the
> self-hosted infrastructure defined here is in doctrine breach.**
> The next session will see it in git log and revert.
>
> This file is mandatory reading at the start of **every** Claude
> session in the Crontech repo.

---

## Why this file exists

Craig has spent multiple sessions getting Crontech self-hosted on
his own VPS, free from GitHub Actions, Cloudflare Workers/Pages,
Vercel, and any other third-party hosting dependency. Previous
Claude sessions repeatedly tried to push the stack back toward
Cloudflare Workers, Vercel deployments, or GitHub-dependent CI/CD.
Every time that happened, Craig lost hours of work.

**This stops now.** The infrastructure below is set in concrete.
No future session may change the hosting model, deployment target,
reverse proxy, process manager, or database location without
Craig's explicit authorization.

---

## The Iron Infrastructure Rules

1. **Crontech is self-hosted on Craig's Vultr VPS.** Not Cloudflare.
   Not Vercel. Not Netlify. Not AWS. Not Fly.io. Vultr. Period.

2. **No CI/CD dependency on GitHub Actions for deployment.** GitHub
   is a code host and nothing more. Deployment happens on the VPS
   via git pull + systemd restart. When Gitea + Woodpecker CI are
   set up (INF-005/INF-006), even GitHub as a code host becomes
   optional.

3. **No Cloudflare proxy, Workers, Pages, D1, R2, KV, or Durable
   Objects in the deployment path.** DNS is Cloudflare DNS-only
   (grey cloud, no proxy). TLS termination is Caddy on the VPS,
   not Cloudflare's edge. If a file references Cloudflare Workers
   as a deployment target, that is legacy code — do not activate it.

4. **No `wrangler deploy`, no `wrangler publish`, no Cloudflare
   API tokens in production.** The `wrangler.toml` in `apps/api/`
   is legacy from the pre-self-hosting era. Do not use it for
   deployment.

5. **The database is local SQLite on the VPS.** Not Turso cloud.
   Not Neon. Not any remote database service. The `file:local.db`
   path in the database client is correct and intentional. Remote
   database services may be added later for replication, but the
   primary database lives on the VPS.

6. **Caddy is the reverse proxy and TLS terminator.** Not nginx.
   Not Cloudflare. Not Traefik. Caddy handles auto-HTTPS via
   Let's Encrypt and reverse-proxies to the application services.

7. **Systemd manages all services.** Not Docker. Not PM2. Not
   screen/tmux. Systemd unit files define how services start,
   restart, and log.

8. **Bun is the runtime.** Not Node.js. Not Deno. Bun runs both
   the API and the web application.

---

## Locked infrastructure blocks

### INF-001 — VPS Host 🟢 LOCKED

| Property | Value |
|---|---|
| **Provider** | Vultr |
| **IP** | 45.76.21.235 |
| **Spec** | 2 vCPU, 8 GB RAM, Ubuntu |
| **Location** | Craig's choice |
| **Access** | SSH as root |

**Lock clause.** Do not migrate to another provider, change the
IP, or recommend "upgrading" to a managed platform. If Craig wants
to move, Craig will say so.

---

### INF-002 — Reverse Proxy (Caddy) 🟢 LOCKED

**Config location:** `/etc/caddy/Caddyfile`

```
crontech.ai {
    reverse_proxy localhost:3000
}
api.crontech.ai {
    reverse_proxy localhost:3001
}
git.crontech.ai {
    reverse_proxy localhost:3002
}
ci.crontech.ai {
    reverse_proxy localhost:3003
}
```

**TLS:** Automatic via Let's Encrypt production certificates.
Caddy handles ACME challenge, renewal, and HTTPS termination.

**Lock clause.** Do not replace Caddy with nginx, Traefik, or
any other reverse proxy. Do not add Cloudflare proxy (orange cloud)
in front of Caddy. Do not modify the Caddyfile without Craig's
auth unless adding a new subdomain that Craig has approved.

---

### INF-003 — Application Services (systemd) 🟢 LOCKED

#### crontech-web.service
| Property | Value |
|---|---|
| **Port** | 3000 |
| **Working dir** | /opt/crontech/apps/web |
| **Command** | `bun .output/server/index.mjs` |
| **Runtime** | Bun |
| **Framework** | SolidStart / Vinxi / Nitro (bun preset) |

#### crontech-api.service
| Property | Value |
|---|---|
| **Port** | 3001 |
| **Working dir** | /opt/crontech |
| **Command** | `bun /opt/crontech/apps/api/src/index.ts` |
| **Runtime** | Bun |
| **Framework** | Hono + tRPC |
| **Env file** | /opt/crontech/.env |

**Critical note on Bun auto-serve:** The API entry point
(`apps/api/src/index.ts`) must NOT have a `default export` that
exposes a `fetch` property. Bun's auto-serve detects such exports
and tries to serve on port 3000, conflicting with the explicit
`Bun.serve()` call on port 3001. The Cloudflare Workers
`workerHandler` default export was removed for this reason
(commit `75eb0b5`). **Do not re-add it.**

**Lock clause.** Do not change ports. Do not switch to Docker,
PM2, or any other process manager. Do not change the working
directories. Do not add `export default` to the API entry point.

---

### INF-004 — DNS 🟢 LOCKED

| Record | Type | Value | Proxy |
|---|---|---|---|
| crontech.ai | A | 45.76.21.235 | DNS only (grey cloud) |
| www.crontech.ai | A | 45.76.21.235 | DNS only (grey cloud) |
| api.crontech.ai | A | 45.76.21.235 | DNS only (grey cloud) |
| git.crontech.ai | A | 45.76.21.235 | DNS only (grey cloud) |
| ci.crontech.ai | A | 45.76.21.235 | DNS only (grey cloud) |

**Registrar:** Cloudflare (DNS only — no proxy, no Workers routes,
no Page Rules, no WAF, no caching). Cloudflare is used purely as
a DNS nameserver.

**Lock clause.** Do not enable Cloudflare proxy (orange cloud).
Do not add Cloudflare Workers routes. Do not add Page Rules or
redirect rules. DNS only. If Craig wants CDN caching later, Craig
will say so.

---

### INF-005 — Self-Hosted Git (Gitea) 🔵 PLANNED

| Property | Value |
|---|---|
| **Port** | 3002 |
| **Domain** | git.crontech.ai |
| **Purpose** | Replace GitHub as code host |

Caddy entry already exists. Service not yet deployed. When ready,
this replaces GitHub as the source of truth for the Crontech repo.

---

### INF-006 — Self-Hosted CI/CD (Woodpecker) 🔵 PLANNED

| Property | Value |
|---|---|
| **Port** | 3003 |
| **Domain** | ci.crontech.ai |
| **Purpose** | Replace GitHub Actions |

Caddy entry already exists. Service not yet deployed. When ready,
this replaces GitHub Actions for build/test/deploy automation.

---

### INF-007 — Database (Local SQLite) 🟢 LOCKED

| Property | Value |
|---|---|
| **Engine** | SQLite via libsql |
| **Location** | /opt/crontech/local.db (on VPS) |
| **ORM** | Drizzle |
| **Migrations** | drizzle-kit generate + runMigrations() |

**Lock clause.** Do not migrate to Turso cloud, Neon, PlanetScale,
or any remote database as the primary store without Craig's auth.
The database lives on the VPS alongside the application.

---

### INF-008 — Firewall 🟢 LOCKED

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH |
| 80 | TCP | HTTP (Caddy ACME + redirect) |
| 443 | TCP + UDP | HTTPS (Caddy) |

All other ports are closed. Application ports (3000-3003) are
internal only — Caddy reverse-proxies to them. They are NOT
exposed to the internet.

**Lock clause.** Do not open additional ports without Craig's auth.
Do not disable the firewall.

---

## Deployment procedure

This is how code gets to production. No GitHub Actions. No
Cloudflare Workers. No CI/CD platform. Direct.

```
# On the VPS (as root):
cd /opt/crontech
git pull origin main
bun install
bun run build
systemctl restart crontech-api
systemctl restart crontech-web
```

When Gitea (INF-005) and Woodpecker (INF-006) are deployed, this
procedure will be automated via webhooks. Until then, it is manual.

---

## What future sessions MUST NOT do

This list exists because previous sessions have done every one of
these things, wasting Craig's time:

1. **Do not add `wrangler deploy` to any workflow or script.**
2. **Do not create or modify GitHub Actions deploy workflows.**
3. **Do not reference Cloudflare Workers/Pages as a deploy target.**
4. **Do not add `export default` to `apps/api/src/index.ts`.**
5. **Do not suggest migrating to Docker, Kubernetes, or any
   container orchestration.**
6. **Do not suggest migrating to Vercel, Netlify, Render, Railway,
   or any managed hosting platform.**
7. **Do not enable Cloudflare proxy (orange cloud) on DNS records.**
8. **Do not change application ports (3000, 3001, 3002, 3003).**
9. **Do not replace Caddy with nginx, Traefik, or HAProxy.**
10. **Do not replace systemd with PM2, forever, or Docker Compose.**
11. **Do not migrate the local SQLite database to a cloud database
    service as the primary store.**

**If you find yourself wanting to do any of the above, STOP and
ask Craig first.** The answer is almost certainly no.

---

## External service dependencies (approved)

These are the ONLY external services Crontech depends on in
production:

| Service | Purpose | Approved by |
|---|---|---|
| **Stripe** | Payment processing | Craig |
| **Anthropic API** | AI model access (Claude) | Craig |
| **OpenAI API** | AI model access (GPT, embeddings) | Craig |
| **AlecRae API** | Email sending | Craig |
| **Cloudflare DNS** | DNS nameserver only (no proxy) | Craig |
| **Let's Encrypt** | TLS certificates (via Caddy) | Craig |

Adding any new external service dependency requires Craig's
explicit authorization per `CLAUDE.md` §0.7.

---

## Amending this file

Same protocol as `docs/BUILD_BIBLE.md`:

1. Agent proposes the change in chat (literal diff or new wording).
2. Craig replies with an explicit affirmative.
3. Agent writes the edit with rationale in the commit message.
4. CODEOWNERS blocks merge without Craig's review.
