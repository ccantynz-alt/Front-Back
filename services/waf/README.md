# @back-to-the-future/waf

Per-route Web Application Firewall + rate limiter + admin API. Sits in front
of customer routes inside `apps/api`, evaluates every request against an
OWASP-style default rule pack plus tenant-defined rules, and emits structured
events for the dashboard.

This is the configurable WAF that hyperscalers either don't ship at all or
hide behind enterprise pricing. We bundle it into the platform.

## Quick start

```ts
import { Hono } from "hono";
import {
  WafEngine,
  RateLimiter,
  InMemoryRuleStore,
  InMemoryEventStore,
  wafMiddleware,
  createAdminApp,
} from "@back-to-the-future/waf";

const rules = new InMemoryRuleStore();
const events = new InMemoryEventStore();
const engine = new WafEngine(rules, new RateLimiter(), {
  defaultRateLimit: { limit: 600, windowMs: 60_000, scope: "ip", algorithm: "token-bucket" },
});

const api = new Hono();
api.use("*", wafMiddleware({
  engine,
  events,
  resolveTenantId: (c) => c.req.header("x-tenant-id"),
}));

const admin = createAdminApp({ rules, events, adminToken: process.env.WAF_ADMIN_TOKEN! });
```

## Rule schema

```ts
{
  id: string,
  tenantId: string,
  pattern: string,             // anchored pathname regex
  methods: HttpMethod[],       // ["*"] for any
  allow?: boolean,             // terminal allow
  deny?: boolean,              // terminal deny
  rateLimit?: {
    limit: number,
    windowMs: number,
    scope: "ip" | "tenant",
    algorithm: "token-bucket" | "sliding-window",
  },
  requireAuth?: boolean,
  ipAllowlist?: string[],      // overrides denies
  ipDenylist?: string[],
  bodyDenyPatterns?: string[], // user regex against pathname + query + body
  priority?: number,           // lower runs first
}
```

## OWASP default pack

The engine ships with three regex sets matched on `pathname + query + body`:

- **SQLi** — `UNION SELECT`, classic `' OR 1=1`, `; DROP TABLE`, `sleep()`,
  `xp_cmdshell`, comment terminators.
- **XSS** — `<script>`, `javascript:`, `on*=` handlers, `<iframe>`, inline
  `<img onerror>`, `document.cookie`, `eval(`.
- **Path traversal** — `../`, `..\\`, percent-encoded variants, `/etc/passwd`,
  `c:\\windows\\system32`.

Plus User-Agent blacklists:

- **Scanner UAs** — terminal deny: `sqlmap`, `nikto`, `zgrab`, `masscan`,
  `nmap`, `acunetix`, `openvas`, `nessus`, `burpsuite`, `wpscan`, `dirbuster`,
  `gobuster`, `wfuzz`, `havij`.
- **Generic bots** — tagged with `bot-ua` reason, never blocked outright.
- **Allowed bots** — bypass rate limits: `googlebot`, `bingbot`, `duckduckbot`,
  `yandexbot`, `baiduspider`, `slackbot`, `twitterbot`, `linkedinbot`,
  `facebookexternalhit`, `applebot`.

Disable the pack per-engine via `new WafEngine(rules, limiter, { enableOwaspDefaults: false })`.

## Rate-limit semantics

Two algorithms:

- **token-bucket** (default) — `limit` tokens, refilled continuously over
  `windowMs`. Smooth bursts allowed up to bucket capacity.
- **sliding-window** — counts hits in a rolling `windowMs`. Strict; no bursts.

`scope: "ip"` (default) keys per `(tenantId, ip)`. `scope: "tenant"` keys per
`tenantId` only — useful for global throughput caps. `Retry-After` is computed
deterministically and returned both as the JSON `retryAfter` field (seconds)
and as the `Retry-After` HTTP header on 429 responses.

## Admin HTTP API

Mount via `app.route("/admin", createAdminApp({ ... }))`. Every request
requires `Authorization: Bearer ${WAF_ADMIN_TOKEN}`.

| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/tenants/:tenantId/rules` | — | List rules sorted by priority |
| `POST` | `/tenants/:tenantId/rules` | `NewRule` | 201 + `{ rule }`; `id` auto-generated if omitted |
| `DELETE` | `/tenants/:tenantId/rules/:ruleId` | — | 200 on hit, 404 on miss |
| `GET` | `/tenants/:tenantId/events?since=<ms>&limit=<n>` | — | Recent allow/deny events (max 10k) |

## Pipeline order

1. IP allowlist (rule-level + global) — terminal `allow`
2. IP denylist — terminal `deny`
3. Scanner UA — terminal `deny`
4. Per-rule allow → deny → method check → body deny patterns
5. OWASP defaults: SQLi → XSS → traversal
6. Bot detection (allowed bots bypass rate limit)
7. `requireAuth` — `auth-required` if not authenticated
8. Rate limit (rule-level wins over `defaultRateLimit`)
9. Default `allow`

Every request returns a single `Outcome` with a `decision`, machine-readable
`reason`, optional `ruleId`, and optional `retryAfter` for the dashboard.

## Environment variables

| Name | Required | Description |
|---|---|---|
| `WAF_ADMIN_TOKEN` | YES | Bearer token for admin API auth |
| `PORT` | NO | Standalone server port (default 8788) |

## Roadmap

- **v2** — swap `InMemoryRuleStore` + `InMemoryEventStore` for Turso-backed
  implementations so rules and events persist across worker restarts. The
  `RuleStore` / `EventStore` interfaces are the migration boundary; nothing
  else changes.
- Geo-IP allow/deny lists.
- ML-driven anomaly detection on the event stream.
- Cloudflare Turnstile / hCaptcha challenge mode (instead of hard deny).

## Tests

`bun test` — 43 unit tests covering OWASP defaults, rate-limit algorithms,
engine pipeline, admin API CRUD + auth, and middleware integration.
