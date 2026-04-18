# THE EMPIRE — Ecosystem Architecture

> One owner. Zero third-party platform dependencies. Every piece feeds the others.

---

## Legal Isolation (Non-Negotiable)

Crontech and AlecRae are **separate legal entities**. This is by design.
If one gets sued, the other is protected. The separation is enforced at
every level:

| Layer | Separation |
|-------|-----------|
| Legal entity | Separate companies (e.g. Crontech Ltd + AlecRae Ltd) |
| Codebase | Separate git repositories |
| Database | Separate schemas, tenant-isolated data |
| Billing | Separate Stripe accounts |
| Terms of service | Separate legal agreements |
| Privacy policies | Separate data handling |
| API communication | Public API only — no shared internal code |
| User accounts | Separate auth — cross-platform SSO via OAuth, not shared DB |
| Infrastructure | Can share a server (same building, different tenants) |

**They feed each other via public APIs, like any two companies partnering.**
Same box, separate everything else.

---

## The Three Pillars

```
┌─────────────────────────────────────────────────────────────────┐
│                        CRAIG'S EMPIRE                           │
│                                                                  │
│   CRONTECH                ALECRAE                DNS/DOMAIN      │
│   The Platform            The Email              The Glue        │
│   ──────────              ─────────              ────────        │
│   crontech.ai             alecrae.com            PowerDNS        │
│                                                                  │
│   Compute + Hosting       SMTP Send + Receive    Zone management │
│   AI Inference            IMAP / JMAP            Auto-HTTPS      │
│   Website Builder         AI Email Client        DKIM/SPF/DMARC  │
│   Video Builder           Spam Filtering         Domain routing   │
│   Databases               Deliverability         SSL certs        │
│   Object Storage          Voice Profiles         Health checks    │
│   Real-time Collab        Desktop + Mobile       Failover         │
│   Observability           Public API + SDK                        │
│   CI/CD (GlueCron)        White-label                            │
│                                                                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
               ┌──────────▼──────────┐
               │    VULTR METAL      │
               │   (Commodity only)  │
               │   CX32 — €8/month   │
               └─────────────────────┘
```

---

## How They Feed Each Other

| Crontech provides to AlecRae | AlecRae provides to Crontech |
|------------------------------|------------------------------|
| Hosting infrastructure       | Transactional email sending  |
| AI inference (Claude, local) | Inbound email processing     |
| Object storage (MinIO)       | DKIM/SPF/DMARC management   |
| Real-time collab engine      | Email deliverability         |
| Observability (Grafana/LGTM) | Spam filtering               |
| Auth (shared passkeys/SSO)   | DNS service for all domains  |
| Website builder (landing)    | Public API + SDK             |
| CI/CD pipeline               | Email analytics              |

---

## Shared Tech Stack

Both platforms are built on the identical foundation:

| Layer       | Technology                    |
|-------------|-------------------------------|
| Runtime     | Bun                           |
| API         | Hono                          |
| Type Safety | tRPC + Zod                    |
| ORM         | Drizzle                       |
| Language    | TypeScript strict             |
| Monorepo    | Turbo                         |
| Auth        | Passkeys / WebAuthn (FIDO2)   |
| Payments    | Stripe                        |
| Database    | PostgreSQL (Neon → self-host) |
| Cache       | Redis                         |
| Vectors     | Qdrant                        |
| AI          | Claude + WebGPU local         |
| Collab      | Yjs CRDTs                     |
| Observ.     | OpenTelemetry + Grafana       |
| Intel       | Sentinel (both have it)       |

---

## The Vultr Box (Single Server, Both Platforms)

```
Caddy (reverse proxy + auto-HTTPS via Let's Encrypt)
│
├── crontech.ai          → Crontech Web (SolidStart SSR)
├── api.crontech.ai      → Crontech API (Hono + Bun)
├── alecrae.com          → AlecRae Web (Next.js SSR)
├── mail.alecrae.com     → AlecRae Mail App
├── api.alecrae.com      → AlecRae API (Hono + Bun)
├── smtp.alecrae.com     → AlecRae MTA (outbound SMTP)
├── mx1.alecrae.com      → AlecRae Inbound (MX)
├── status.alecrae.com   → AlecRae Status Page
├── docs.alecrae.com     → AlecRae API Docs
│
├── PostgreSQL           (shared, tenant-isolated)
├── Redis                (shared, namespace-isolated)
├── Qdrant               (shared vector DB)
├── MinIO                (shared object storage, S3-compatible)
├── Meilisearch          (AlecRae search, shared if needed)
├── Grafana + LGTM       (shared observability)
└── PowerDNS             (shared DNS for all domains)
```

**Estimated cost at launch: €8-16/month for both platforms.**

---

## User Journey (The Revenue Loop)

```
User signs up for AlecRae ($9/mo)
    → Gets AI email
    → Needs a website for their business
    → Crontech website builder (upsell)

User signs up for Crontech
    → Builds a website
    → Needs email for their domain
    → AlecRae email (upsell)

Either path:
    → Registers domain through our DNS
    → DNS points site → Crontech
    → DNS points email → AlecRae
    → Everything on our infrastructure
    → Zero revenue leaks to competitors
```

---

## External Dependencies (What Remains)

| Dependency | Why it stays | Replaceable? |
|------------|-------------|--------------|
| **Vultr** | Commodity hardware provider, not a competitor | Could use any VPS provider |
| **Stripe** | Payment processing regulatory compliance | Not practically replaceable |
| **Let's Encrypt** | Free SSL certificates (non-profit) | N/A — it's free and open |
| **OpenSRS/eNom** | Domain registration reseller API | Become ICANN registrar long-term |
| **Google/Microsoft OAuth** | Users expect social login | Passkeys are primary auth already |

Everything else is self-hosted. No Vercel. No Cloudflare. No Resend. No Fly.io.
No Upstash. No Modal. No platform competitors anywhere in the stack.

---

## AlecRae Services (Available to Crontech)

| Service | Endpoint | What Crontech uses it for |
|---------|----------|--------------------------|
| `services/mta` | `smtp.alecrae.com` | All outbound email (replaces Resend) |
| `services/inbound` | `mx1.alecrae.com` | Inbound email processing |
| `services/dns` | Internal API | Domain management for users |
| `services/reputation` | Internal API | DKIM/SPF/DMARC for crontech.ai |
| `services/security` | Internal API | Phishing/spam protection |
| `services/ai-engine` | Internal API | Shared AI inference pool |

---

## Crontech Services (Available to AlecRae)

| Service | What AlecRae uses it for |
|---------|--------------------------|
| Vultr Phase-0 | Hosting infrastructure |
| MinIO storage | Attachment and asset storage |
| Grafana/LGTM | Observability dashboards |
| Qdrant vectors | Semantic email search embeddings |
| GPU inference | Voice profile training, AI compose |
| GlueCron (future) | CI/CD pipeline |

---

## The Numbers

| Metric | Crontech | AlecRae | Combined |
|--------|----------|---------|----------|
| Lines of code | ~20,000 | ~35,000 | ~55,000 |
| API endpoints | 33 routes, 21 tRPC | 100+ endpoints | 133+ |
| Features | Platform core | 75 built | Full ecosystem |
| Microservices | 5 packages | 12 services | 17 services |
| Apps | 1 web + 1 API | 8 apps | 10 apps |
| DB tables | 26 | Full email schema | Complete |
| Test files | 21 | Full test suite | Complete |

---

## Build Priority

### Phase 1: Launch (This Week)
- [ ] Deploy both platforms on Vultr CX32
- [ ] Wire Crontech email through AlecRae MTA
- [ ] Point crontech.ai + alecrae.com DNS
- [ ] Shared PostgreSQL + Redis + Qdrant

### Phase 2: Integration (This Month)
- [ ] Domain management UI in Crontech
- [ ] Cross-platform SSO (one login, both platforms)
- [ ] Shared observability dashboards
- [ ] AlecRae SDK available from Crontech

### Phase 3: Independence (This Quarter)
- [ ] Self-hosted GPU inference (Vultr GPU box)
- [ ] GlueCron MVP (replace GitHub)
- [ ] Multi-region Vultr deployment
- [ ] PowerDNS authoritative servers (2+ regions)

### Phase 4: Dominance (Ongoing)
- [ ] Offer hosting to AlecRae enterprise customers
- [ ] Offer email to Crontech enterprise customers
- [ ] Domain registration reseller
- [ ] Full vertical integration

---

> **This is not two products. This is one empire.**
> Every piece makes the others stronger.
> Every user of one becomes a user of both.
> Every dollar stays in the ecosystem.
> Nobody else has this. Nobody is even attempting it.
