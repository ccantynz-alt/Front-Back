# The Generational Succession Plan

**Status:** LOCKED direction. This is the north star that shapes every capital-structure and operational decision.
**Authored:** 2026-04-10
**Referenced by:** `docs/doctrine-drafts/CLAUDE-SECTIONS.md` §0.10 (draft for CLAUDE.md integration)

---

## 1. The plan in one sentence

> **Crontech is not built to be sold. It is built to be inherited.**

The long-term horizon of the Canty empire is generational succession from Craig Canty to his daughter, once she is old enough, trained enough, and interested enough to run the business.

## 2. Why this matters for every decision

Exit-oriented startups and inheritance-oriented startups are built differently. Here is how "built to be inherited" changes every layer:

### Capital structure
- **No VC** — dilution makes succession legally and financially messy. See `docs/strategy/ADVANTAGE-LEVERS.md` §5.4.
- **No flip-optimized growth** — growing fast to impress acquirers is the wrong game. Growing steadily to build a durable moat is the right game.
- **Profitable as fast as possible, stay profitable** — inherited businesses must throw off cash, not consume it.
- **No debt that the next generation has to service** — keep the balance sheet clean.

### Operations
- **Documented to the point of boredom** — if it's not in the docs, it doesn't exist. When succession happens, the new owner reads the docs and runs the company. No tribal knowledge. No undocumented heroics.
- **Sustainable cadence** — a business that requires an 80-hour founder cannot survive succession. The Simmer Protocol exists because the next owner has to be able to run it at reasonable hours too.
- **AI-native operations** — Claude as CFO reduces the operational brain load that would otherwise be un-transferable. The next owner inherits both the business AND the AI partnership that runs it.

### Culture
- **Family-friendly, remote-friendly, sustainable-hours** — the company has to be a humane place to work long after Craig is no longer running it day-to-day.
- **Mission-driven employment (NZ, PH, US)** — the mission outlasts the founder. See `docs/doctrine-drafts/CLAUDE-SECTIONS.md` §0.9 Employment Mission draft.
- **Canty family name tied to the brand in the long term** — "Canty empire" is not a joke. It's the succession plan made visible.

### Product
- **Durable moats over growth hacks** — category ownership (compliance-native for AI SaaS per `docs/strategy/WEDGE.md`), deep regulatory expertise, and compounding case-study library are the kind of moats that outlast founders. Growth hacks are not.
- **No vanity features** — every feature must earn its place in a product that might still be running in 30 years.
- **Opinionated and focused** — a product that tries to be everything cannot be inherited. A product with a sharp identity can.

## 3. Timeline (approximate, not a deadline)

This is a multi-decade plan. The years are illustrative, not binding. Craig's daughter's interest and readiness are the real gating factors, not a calendar.

| Phase | Approximate window | Objective |
|---|---|---|
| **Phase 1 — Foundation** | Years 1-3 (2026-2029) | Ship Crontech. Migrate the 9 empire projects. Hit $250K-$1M ARR. Build the team. |
| **Phase 2 — Scale** | Years 3-7 (2029-2033) | $1M-$10M ARR. 10-30 jobs across NZ/PH/US. Crontech and Astra both profitable and category-leading in their wedges. |
| **Phase 3 — Maturity** | Years 7-15 (2033-2041) | $10M-$50M ARR. 30-100 jobs. Full empire of 9 products all cross-integrated, all profitable. Craig transitions from builder to chairman. |
| **Phase 4 — Succession preparation** | Years 10-20 (2036-2046) | Craig's daughter enters the business in whatever role fits her interests. Operational handover begins. |
| **Phase 5 — Full succession** | Years 18-30 (2044-2056) | Craig steps back fully. Daughter (or chosen successor) runs the empire. Craig remains as advisor / board member if wanted. |

**None of these dates are commitments.** The sequence is the point. The dates will adjust based on reality.

## 4. What "ready for succession" means operationally

For Crontech (and each empire product) to be ready for succession, it must have:

1. **Complete operational docs.** Someone who has never run the business can read the docs and understand how it works, what decisions matter, and what the risks are. `docs/` directory must be exhaustive.
2. **Clean financial records.** The NZ chartered accountant has kept books in a tool-agnostic format (or Astra, once Astra is production-ready). No sketchy categorization. No undocumented loans or capital calls.
3. **Documented customer relationships.** Every key customer has a relationship history, contract status, renewal date, and risk notes in a single place.
4. **Documented vendor relationships.** Every bridge tool, every allowed-forever vendor, every contract — all logged with renewal dates and exit options.
5. **Documented doctrine.** `CLAUDE.md` and the strategy docs are the operating doctrine. They survive the founder.
6. **AI-native operations running.** Claude-as-CFO is already documented in `docs/cfo/CHARTER.md`. Any successor inherits not just the company but the CFO function.
7. **A stable team.** Key roles are filled by humans with equity or long-tenure commitments, not contractors who will leave when Craig leaves.
8. **A succession trust structure.** Legal and tax structures that allow clean generational transfer without capital gains destruction or tax liens.

## 5. The succession trust (placeholder — requires legal input)

This section is a placeholder. Before any material value accrues, Craig must engage a NZ estate planning lawyer to structure:

- Trust ownership of Crontech shares (or whatever corporate form Crontech takes)
- Tax-efficient generational transfer
- Legal protection of the business in the event of founder incapacity
- Clear succession rules: who runs the business if Craig is suddenly unavailable
- Insurance: key-person life insurance sized to fund a 12-month runway while succession is arranged

**Action item for Craig:** Engage an NZ estate planning lawyer. Budget: ~$2,000-5,000 for initial structuring. Priority: do this within 12 months of Crontech hitting $50K MRR. Not urgent before revenue, but non-negotiable after.

## 6. What Claude-as-CFO does to protect the succession plan

Every monthly report, quarterly update, and strategic recommendation must be evaluated against:

1. **Does this make the business more or less transferable?** Hiring a generalist CoS = more transferable. Hiring a cheap offshore hack = less transferable.
2. **Does this make the docs more or less complete?** Every new feature must update its docs in the same PR.
3. **Does this make the capital structure cleaner or messier?** Avoid anything that introduces dilution, debt, or opaque obligations.
4. **Does this make Craig more or less replaceable in day-to-day operations?** The goal is that Craig can walk away for a month and the business keeps running.

These questions get asked in every quarterly update (see `docs/cfo/templates/QUARTERLY-UPDATE.md` §12 Succession readiness).

## 7. Why this is strategic, not sentimental

Generational businesses are rare. Most startups exit to acquirers within 7-10 years. The ones that don't usually die. The tiny minority that become multi-generational companies share certain characteristics:

- Profitable from an early stage (or self-funded runway that doesn't require exit)
- Strong brand tied to a person or family (trust compounds over decades)
- Durable moat (network effects, regulatory expertise, category ownership)
- Humane operating cadence (founders don't burn out before succession is ready)
- Clean capital structure (no VC pressure to exit)

Crontech, by deliberate design, has all of these. The generational plan is not a feel-good story. It is a competitive advantage. Competitors who are optimizing for exit in 5 years will make short-term decisions that Crontech, optimizing for continuity in 50 years, will not.

**The 50-year thinker beats the 5-year thinker in every market where the underlying problem still exists after 50 years.** Compliance and legal accountability are such markets. This is why Crontech chose the compliance-native wedge.

## 8. Amendment process

This plan may be amended by Craig at any time, but material changes should be documented in-file and carried forward to the HANDOFF.md for the next session.

The core principle — "built to be inherited, not sold" — is LOCKED. If Craig ever wants to change that principle, it requires an explicit in-session conversation with Claude-as-CFO about the trade-offs, and must be documented as a major strategic pivot.
