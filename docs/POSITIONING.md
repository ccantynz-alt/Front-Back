# Crontech Positioning — LOCKED BY CRAIG

> This file is binding. Do not change without Craig's explicit authorization.
> Decisions were made during the session of 7 April 2026.

---

## The Three Positioning Decisions (Final)

### 1. Audience: UNIVERSAL
Crontech targets **everyone**, not a single primary segment. The landing page must work equally well for:

- **Greenfield founders** building brand new projects
- **Existing teams** consolidating their stack away from multiple vendors
- **Agencies** managing many client sites
- **AI builders** specifically

There is **NO primary audience cutoff**. The framing must be universal and future-focused, not narrowly targeted.

### 2. Tone: POLITE
**Do not name competitors in marketing copy.** Specifically:

- ❌ Do NOT say "replaces Vercel"
- ❌ Do NOT say "replaces Render / Supabase / Cloudflare / Stripe"
- ❌ Do NOT pick fights with named brands
- ❌ Do NOT write comparison tables that call out specific companies by name on public pages
- ✅ DO say "one platform" or "the unified developer platform"
- ✅ DO say "replaces many services" or "one product instead of many"
- ✅ DO reference the underlying technology stack (Cloudflare Workers, etc.) where it adds credibility

**Reason:** Craig wants to avoid burning bridges with potential acquirers or partners. Aggressive comparative marketing can create defamation/trademark exposure and damage industry relationships that may never recover. Any shift to direct competitive framing must be reviewed by an attorney first.

**Internal strategic documents** (like this one, or the GAP-ANALYSIS.md) may name competitors — those are for internal planning, not public copy.

### 3. Headline Direction: "The developer platform for the next decade"
Craig picked Option E from the positioning options. Forward-looking, aspirational, does not attack anyone by name.

---

## The Draft Homepage Copy (needs Craig's final approval before shipping to production)

### Headline
**The developer platform for the next decade.**

### Subheadline
One unified product. Every layer your application needs — hosting, database, auth, AI, real-time, billing, video — built on the bleeding edge and ready to ship.

### Body paragraph
Crontech runs on the fastest stack on the web. Sub-5ms cold starts at the edge. Type-safe end to end. AI-native at every layer. Built for builders who refuse to settle for yesterday's tools.

### Call to action
Primary: **Start building** (→ `/register`)
Secondary: **See the docs** (→ `/docs`)

### Feature pillars (3-column, below hero)

**One platform, every layer**
Hosting, database, authentication, AI, real-time collaboration, payments, email, storage — in one product with one dashboard and one bill.

**Built on the bleeding edge**
Cloudflare Workers for sub-5ms cold starts. SolidJS for the fastest reactivity on the web. Bun + Hono for the fastest JavaScript runtime. Type-safe end to end.

**AI-native at every layer**
Not bolted on. AI agents, generative UI, three-tier compute routing (client → edge → cloud), RAG pipelines, and real-time collaboration — all native to the platform.

---

## What Crontech IS

A **developer platform** that unifies hosting, database, authentication, AI, real-time collaboration, billing, email, and storage into one product. Built on Cloudflare Workers at the edge. Type-safe end to end. AI-native at every layer.

Customers of Crontech: developers, agencies, founders, indie hackers, and teams building modern SaaS products.

## What Crontech IS NOT

- **NOT a vertical SaaS product** — no accounting, legal, medical, immigration, or industry-specific product built INTO the platform. Verticals run ON Crontech, not INSIDE it.
- **NOT a website builder for non-developers** (for now) — audience is everyone who builds software, not end users
- **NOT a WordPress plugin** — the WP plugin is a separate distribution channel that may get built later, but it is NOT the platform itself
- **NOT a replacement for any one specific named competitor** in marketing copy — see Tone section

---

## What Changed This Session (context for the next agent)

- The previous "accounting vertical" that was baked into Crontech has been **removed entirely** (commit `4dc4def`). It was scatter-gun work that muddied the platform positioning. Accounting (and any future vertical) is its own separate repo/product that runs ON Crontech.
- Routes dropped from 31 → 24, DB tables from 23 → 14 after accounting cleanup.
- Verticals are no longer mentioned in wrangler.toml, the edge worker's subdomain router, the sitemap generator, or `.env.example`.
- This file (POSITIONING.md) and HANDOFF.md were added to preserve these decisions across the session restart caused by the git proxy outage.

---

## How To Use This File

1. **Any agent editing homepage copy, SEO meta, landing page text, or marketing content MUST read this file first.**
2. **Any agent tempted to write "replaces Vercel" or similar MUST stop and re-read Section 2 (Tone: POLITE).**
3. **Any agent tempted to add a vertical (accounting, legal, medical, etc) inside the Crontech platform MUST stop and re-read "What Crontech IS NOT".**
4. **Any deviation from these decisions requires Craig's explicit authorization.** Do not decide unilaterally.
