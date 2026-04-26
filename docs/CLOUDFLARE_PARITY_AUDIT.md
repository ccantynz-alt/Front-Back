# Cloudflare Parity Audit — what Crontech must build to replace Cloudflare

> **Doctrine note.** Crontech is positioned to *replace* Cloudflare, not
> consume it. Every product Cloudflare ships that we currently rely on
> is a vendor dependency we have to retire. Every product they ship that
> we have no equivalent for is a product gap.
>
> Authored 2026-04-27 in response to Craig's challenge. Companion
> document: `docs/COMPETITIVE_REALITY.md` (per-vendor parity, including
> Cloudflare summary). This file goes deeper into the Cloudflare surface
> specifically because Cloudflare is the largest single competitor in
> the BUILD_BIBLE BLK-002 stack thesis.

---

## Status legend

- ✅ **Working in production** — Crontech ships this; vendor not needed.
- 🟢 **Working but unsurfaced** — code runs; no UI / marketing yet.
- 🟡 **Code in repo, not running** — file exists, not enabled, or feature
  half-done. Doctrine breach per CLAUDE.md §0.10 Zero-Idle Rule.
- ❌ **Not built** — neither code nor running service exists.

---

## 1. DNS layer

| Cloudflare product | What it does | Crontech equivalent | Status |
|---|---|---|---|
| Authoritative DNS | Hosts the zone, serves NS responses | `services/dns-server/` + `infra/bare-metal/dns-server.service` | 🟡 Code exists, **not running**. |
| 1.1.1.1 Resolver | Public recursive resolver | None | ❌ (low strategic priority — recursive resolvers are commodity) |
| Registrar | Sells / transfers domains directly | None | ❌ Long-term: integrate a wholesale registrar API. |
| DNSSEC | Cryptographic signing of records | tRPC `dns` proc references DNSSEC fields | 🟡 Schema yes; signing/validation not implemented. |

## 2. Edge / CDN

| Cloudflare product | What it does | Crontech equivalent | Status |
|---|---|---|---|
| CDN (cache) | Edge caching of static + dynamic | Caddy on Vultr (single origin) | ❌ Single-origin, no edge. |
| Workers | V8 isolates running at 330+ PoPs | None | ❌ **Largest single gap.** Per BLK-002 stack thesis we should build it. |
| Pages | Static site hosting | SolidStart on Vultr | ✅ Self-hosted. |
| Argo Smart Routing | Optimised origin paths | None | ❌ Build it: Anycast IP per region routing back to nearest Vultr node. |
| Cache Reserve | Persistent edge cache | None | ❌ |
| Image Resizing / Polish | Auto-optimise images | None | ❌ Build it: WebGPU-side image transform on demand. |
| Stream | Video hosting + transcode | None | ❌ Per CLAUDE.md AI Video Pipeline ambition; not started. |

## 3. Security

| Cloudflare product | What it does | Crontech equivalent | Status |
|---|---|---|---|
| WAF | Web Application Firewall rules | Caddy headers (basic) | ❌ Build per-route WAF rules engine. |
| Bot Management | Detect & block bots | None | ❌ |
| DDoS Protection | Network + L7 DDoS mitigation | Vultr basic L3/L4 only | ❌ Build via tunnel + Anycast architecture. |
| Rate Limiting | Per-endpoint throttling | tRPC middleware basics + `apps/api/src/auth/password.ts` login rate-limit | 🟡 Partial. Need centralised dashboard. |
| Zero Trust Access | Auth proxy for internal apps | `requireAdmin` middleware | 🟡 Per-route auth works; no full Zero Trust gateway. |
| API Shield | API-specific WAF + schema validation | tRPC + Zod end-to-end | ✅ **Already better than Cloudflare here.** Surface as a product. |
| Email Security | Phishing / spam filters | None | ❌ |
| Browser Isolation | Sandboxed remote browsing | None | ❌ Long-term moonshot — actually a Crontech-shaped product given AI integration. |
| SSL/TLS | Cert management | Caddy auto-TLS via Let's Encrypt | ✅ Self-hosted, free, automatic. No gap. |

## 4. Storage + data

| Cloudflare product | What it does | Crontech equivalent | Status |
|---|---|---|---|
| R2 | Object storage (S3-compatible) | None — `services/storage/` exists in workspace, content unknown | 🟡 Verify state, then build to fill. |
| Workers KV | Global key-value at edge | None | ❌ |
| D1 | Edge SQLite | Postgres on Vultr (single instance) | ❌ |
| Durable Objects | Stateful edge compute | None | ❌ **Crown-jewel of Cloudflare's compute story.** Build it — required for cheap real-time collab. |
| Hyperdrive | Postgres connection pooler at edge | None | ❌ |
| Queues | Distributed message queue | `services/queue/` | 🟡 Code exists, **not running**. |
| Vectorize | Vector DB | Stack lists Qdrant + pgvector | 🟡 In stack; not yet used. |

## 5. AI

| Cloudflare product | What it does | Crontech equivalent | Status |
|---|---|---|---|
| Workers AI | Hosted inference (Llama, etc.) | Anthropic API + WebGPU client-side per stack | 🟡 Talk to Anthropic; do not host models. Build a hosted inference layer for non-frontier models. |
| AI Gateway | One endpoint that fans out to providers, caches, retries | None | ❌ **Highest leverage** — caches + cost-controls every LLM call. |
| Constellation | Hosted ONNX models | None | ❌ Skippable for now. |
| Llama-as-a-service | Hosted Llama models | WebGPU + WebLLM client-side per stack | 🟡 Client-side plan; server-side ❌. |

## 6. Observability

| Cloudflare product | What it does | Crontech equivalent | Status |
|---|---|---|---|
| Web Analytics | Privacy-first page analytics | None | ❌ Build privacy-first first-party analytics. |
| Real User Monitoring | Live perf data from real visitors | None | ❌ |
| Logpush / Logpull | Stream logs to bucket | None | ❌ |
| Trace | Trace requests through edge | OpenTelemetry instrumentation in stack | 🟡 Library wired; no UI / collector running. |

## 7. Email

| Cloudflare product | What it does | Crontech equivalent | Status |
|---|---|---|---|
| Email Routing | Forward `*@yourdomain.com` to other addresses | `apps/api/src/email/alecrae-webhook.ts` (one customer) | 🟡 One hardcoded customer; no general routing engine. |
| Email Workers | Run code on inbound email | None | ❌ |
| Email Security | Inbound spam / phishing | None | ❌ |

## 8. Network

| Cloudflare product | What it does | Crontech equivalent | Status |
|---|---|---|---|
| Cloudflare Tunnel (cloudflared) | Origin to edge over reverse tunnel | None | ❌ Build it. Origin IP becomes private, eliminates direct attack surface on Vultr. |
| Spectrum | TCP/UDP proxy at edge | None | ❌ |
| Magic Transit / Magic WAN | BGP-level network routing | None | ❌ Skippable for years. |

---

## Honest aggregate

Cloudflare ships ~34 distinct products. Crontech has working equivalents
for **3** of them (Caddy auto-TLS, type-safe API contracts via tRPC,
self-hosted web hosting on Vultr). Another **5** exist as code in this
repo but are **not running**: `dns-server`, `crontech-deploy-agent`,
`crontech-watchdog`, `services/queue`, `services/sentinel`. The
remaining ~26 are unbuilt.

That is the gap. Per CLAUDE.md §1 Mission ("self-evolving,
self-defending technology war machine") and §2 Gap analysis ("80%+
ahead of all competition at all times"), this gap is the single largest
piece of doctrine debt the platform carries today.

## Recommended sequence (highest leverage first, sub-day-of-work each at the top)

1. **Turn on the five dormant services.** Zero new code. ~1 hour total
   on the Vultr box. (`dns-server`, `deploy-agent`, `watchdog`, `queue`,
   `sentinel`).
2. **Smoke test against the public URL in `deploy.yml`** + Slack alert
   on failure. Closes the silent-rollback class of bug forever.
3. **Cloudflare Health Checks** on `crontech.ai` + `api.crontech.ai`.
   Free; 10-minute Cloudflare-console action.
4. **AI Gateway** — own LLM proxy. Single biggest leverage on cost +
   product offering.
5. **R2-equivalent object storage** (self-hosted MinIO on Vultr).
6. **Cloudflare Tunnel equivalent** so origin IP becomes private.
7. **Workers-equivalent edge runtime.** Largest CapEx gap, longest
   build.
8. **Durable Objects equivalent.** Required for real-time collab.
9. **Stream-equivalent video pipeline.** Already in stack ambition.

Each item is a discrete unit of work. The list does not imply a
timeline; it implies an order. Sessions pick from the top down.
