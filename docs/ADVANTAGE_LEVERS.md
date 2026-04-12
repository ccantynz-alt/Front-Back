# Advantage Levers

> How Crontech stays 80–100% ahead of every competitor. These are the moats.

A lever is a thing we do that either (a) nobody else does yet or (b) nobody
else can copy cheaply. Every new feature gets ranked on how many levers it
pulls. If a feature pulls zero levers, it does not belong on the roadmap
until the unkillable state is reached.

---

## Tier 1 — Existential Moats

These are the levers that, if Crontech stopped pulling them, would erase
the entire competitive argument.

### L1. Three-tier compute routing (client GPU → edge → cloud)
- **What:** A single request routes automatically to the cheapest tier that
  meets the latency and capability constraints.
- **Why it's a moat:** Competitors treat client, edge, and cloud as separate
  deployment targets. We treat them as one compute mesh. Rebuilding this is
  months of work for anyone chasing.
- **Where it lives:** `packages/ai-core/src/compute-tier.ts` and the
  inference fallback chain in `apps/web/src/lib/inference.ts`.

### L2. Audit-log OSS library (hash-chained, RFC 3161, WORM)
- **What:** `packages/audit-log` — court-admissible audit trail that works
  standalone and ships in the monorepo.
- **Why it's a moat:** Every vertical built ON Crontech (legal, medical,
  financial) needs this. Shipping it as OSS means we become the default
  audit infrastructure for a whole class of startups — they are then one
  dependency away from being Crontech customers. Nobody in the platform
  space is doing this.
- **Where it lives:** `packages/audit-log/`.

### L3. CFO engine (double-entry ledger + audit integration)
- **What:** `packages/cfo-engine` — BigInt-denominated double-entry ledger
  wired into the audit-log so every financial event is both balanced and
  signed at creation time.
- **Why it's a moat:** We own our own books. Every billing event is a
  trustworthy primitive by construction. Competitors bolt Stripe on and
  hope. We treat money as a first-class data type.
- **Where it lives:** `packages/cfo-engine/`.

### L4. Zero-HTML, Zod-schema component catalog
- **What:** Every UI primitive is defined by a Zod schema the AI can read.
  AI composes components from the catalog, never from freeform HTML.
- **Why it's a moat:** Generative UI without schemas is a hallucination
  generator. With schemas it's a production-grade capability. We get this
  because we paid the cost of never writing HTML in the first place.
- **Where it lives:** `packages/schemas/src/components.ts` and
  `packages/ui/`.

### L5. Sentinel (24/7 competitive intelligence)
- **What:** Always-on collectors against GitHub, npm, HN, ArXiv. Feeds an
  intelligence store that the session-start hook surfaces.
- **Why it's a moat:** We literally cannot be surprised. By the time a
  competitor announces something on HN, Sentinel already logged it and the
  next session-start will say so.
- **Where it lives:** `services/sentinel/`.

---

## Tier 2 — Compounding Moats

These are not existential but they compound every week we keep pulling them.

- **L6. Edge-first SolidJS:** fastest reactivity × fastest edge runtime.
- **L7. Bun everywhere:** one toolchain, 10–20× install speed.
- **L8. tRPC end-to-end:** zero drift between server and client types.
- **L9. Biome for lint + format:** one tool, 50–100× faster than ESLint +
  Prettier. No config wars.
- **L10. Founding customer program:** locks in the first wave at 50% off
  for life, which both funds the runway and creates unpaid-but-invested
  evangelists. Replaces fake testimonials.
- **L11. Session-start hook:** every new session begins from a
  known-good state. No more "wait, what was broken?" at the top of a
  session.

---

## Rules for new features

1. **Every PR must name which lever it pulls.** Refactors can pull L7 or L9
   implicitly. Everything else must name a lever explicitly in the commit
   footer or PR body.
2. **If a PR pulls zero levers, it is a luxury.** Luxuries are deferred
   until the platform is unkillable. Right now we cannot afford them.
3. **If a new technology lets us pull a new lever, we adopt or surpass
   within one sprint.** Loyalty is to the mission, not to the current
   stack (CLAUDE.md §0.3).

---

**Scoreboard:** the number of Tier-1 levers shipped to production is the
most important metric in this repo. Ship levers, not features.
