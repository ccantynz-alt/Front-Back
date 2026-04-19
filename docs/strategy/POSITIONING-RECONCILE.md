# Positioning Reconciliation — Decision Doc

> Decision owner: Craig. Pick A, B, or C. Do not pick "both."

---

## 1. Context

`docs/POSITIONING.md` is locked (7 April 2026) and says the Crontech headline is **"The developer platform for the next decade"** — universal audience, polite tone, unified-platform framing (hosting, DB, auth, AI, real-time, billing). PR #148 ("feat(landing): compliance-native rewrite for launch") shipped a landing page built around **"The CI/CD that audits itself"** — a sharp compliance-native CI/CD wedge aimed at seed-to-Series-A engineering teams at AI SaaS companies, sourced from `docs/strategy/WEDGE.md`. These positions contradict: one is a universal developer platform, the other is a vertical CI/CD wedge, and the live landing page currently disagrees with the locked doctrine.

---

## 2. Option A — Keep "The developer platform for the next decade"

**Stance:** Honor the lock. Treat PR #148 as out-of-policy.

**Pros**
- Already locked by Craig; no governance backtrack required.
- Broader TAM — every developer, agency, founder, AI builder.
- Not product-specific, so the message survives roadmap pivots.
- Preserves acquirer/partner optionality (universal framing, no niche tie-in).

**Cons**
- Vague. Doesn't differentiate from Vercel / Fly / Railway / Render.
- "Next decade" is aspirational, not a concrete claim buyers can act on.
- Harder to convert — no urgency, no specific pain named.
- Loses the compliance buyer (budget-holder) entirely.

**If chosen — do this:**
- Revert `apps/web/src/routes/index.tsx` on Main back to the universal copy in `docs/POSITIONING.md`.
- Keep `docs/strategy/WEDGE.md` as internal-only material; flag it as not-for-public-copy.
- Post-merge note on PR #148 explaining the revert and pointing to `docs/POSITIONING.md`.
- Add a CI check or CODEOWNERS rule so landing-page changes require POSITIONING.md review.

---

## 3. Option B — Adopt "The CI/CD that audits itself" (compliance-native wedge)

**Stance:** The wedge is sharper than the platform line. Ship it, update doctrine.

**Pros**
- Sharp wedge; one-beat headline with a concrete, testable claim.
- Compliance buyers have real budget (SOC 2 / audit tooling is a funded line item).
- No incumbent owns "CI/CD that emits audit evidence" — blue-ocean positioning.
- Self-qualifies the ICP: engineering leaders at AI SaaS chasing SOC 2.
- Aligned with what PR #148 already shipped — zero marketing-ops cost.

**Cons**
- Narrows audience from "every developer" to "compliance-sensitive SaaS."
- Locks the brand into a CI/CD niche; expanding to hosting/DB/auth later reads as scope creep.
- Abandons the universal platform TAM the locked doc was built around.
- Wedge-first companies that can't expand plateau at the wedge's ceiling.

**If chosen — do this:**
- Update `docs/POSITIONING.md` with Craig's explicit authorization stamp overriding the 7-April lock.
- Replace the homepage/SEO copy in POSITIONING.md with the PR #148 version.
- Keep PR #148 merged; no landing-page change needed.
- Rewrite `What Crontech IS` / `IS NOT` sections to reflect the CI/CD wedge.
- Audit `/pricing`, `/docs`, nav, and OG meta across the site for drift.

---

## 4. Option C — Hybrid: universal brand, wedge-specific landing

**Stance:** Brand stays broad (next-decade platform). Go-to-market wedge is compliance-native CI/CD. Landing page is the wedge; brand doc is the platform.

**Pros**
- Brand retains universal TAM and acquirer optionality.
- Landing converts a specific, funded ICP instead of leaking generic traffic.
- Matches the "start niche, expand horizontally" playbook (Stripe/payments, Shopify/t-shirts, Vercel/Next.js).
- Keeps both `POSITIONING.md` and `WEDGE.md` coherent — each governs a different surface.
- No one has to lose an argument.

**Cons**
- Requires positioning discipline going forward: every public surface needs an explicit "brand layer or wedge layer?" call.
- Risk of message fragmentation if wedge and brand drift apart over time.
- Sales/marketing staff need training on when to lead with which.
- Harder to measure — brand lift and wedge conversion are separate funnels.

**If chosen — do this:**
- Amend `docs/POSITIONING.md` with a new section: "Go-To-Market: Wedge-First" stating that `/` (landing) leads with the CI/CD-audits-itself wedge while the brand umbrella remains "the developer platform for the next decade."
- Keep PR #148 merged; add a follow-up commit linking the landing page's footer/about to the brand umbrella copy.
- Define surface-level rules: landing page + paid ads = wedge; brand page, investor deck, careers, press = platform.
- Create `docs/strategy/SURFACE-MAP.md` listing every public surface and which layer it speaks.
- Add a checkpoint review in 90 days: is the wedge converting? Is the brand still coherent?

---

## 5. Recommendation

**Pick Option C (Hybrid).** The wedge in PR #148 is concrete enough to convert today's compliance-pain ICP — shutting that off to protect a vague brand line wastes the best sales asset Crontech currently has. But the locked universal brand is correct for the long arc (acquirers, horizontal expansion, non-CI/CD surfaces) and shouldn't be thrown out for a single landing page. Option C keeps both, accepts the discipline cost, and matches how every category-defining platform actually went to market.

---

## 6. Action Checklists

### If Craig picks A (Keep universal brand)
1. Open a revert PR on `apps/web/src/routes/index.tsx` restoring the POSITIONING.md copy.
2. Close PR #148 retroactively with a doctrine-violation note; link `docs/POSITIONING.md`.
3. Move `docs/strategy/WEDGE.md` content under an `internal/` prefix or add a "NOT FOR PUBLIC COPY" banner at the top.
4. Add CODEOWNERS entry requiring Craig's review on `apps/web/src/routes/index.tsx` and `docs/POSITIONING.md`.
5. Post an agent-handoff note in `HANDOFF.md` so the next session doesn't re-ship the wedge.

### If Craig picks B (Adopt compliance-native wedge)
1. Edit `docs/POSITIONING.md`: add Craig's explicit override stamp dated today, replace headline/subhead/body/pillars with PR #148 copy.
2. Rewrite "What Crontech IS / IS NOT" to center CI/CD + compliance evidence; retire universal-platform framing.
3. Sweep `/pricing`, `/docs`, `/about`, OG/meta, and nav labels for residual "platform for the next decade" language.
4. Update `README.md` and repo description to match the new wedge.
5. Brief any downstream channels (Twitter bio, LinkedIn, investor deck one-liner) within 48 hours to prevent mixed messaging.

### If Craig picks C (Hybrid — recommended)
1. Edit `docs/POSITIONING.md`: add a new "Go-To-Market: Wedge-First" section authorizing the landing-page wedge while preserving the brand umbrella. Craig signs the amendment.
2. Create `docs/strategy/SURFACE-MAP.md` listing every public surface (landing, pricing, docs, about, ads, press, careers, investor deck) and which layer — wedge or brand — governs it.
3. Add a footer/about link on the landing page pointing to a brand page (`/platform` or `/about`) that carries the universal "developer platform for the next decade" copy.
4. Add a PR-template checkbox: "Does this change a public surface? If yes, which layer (wedge/brand) does it belong to, and does it match SURFACE-MAP.md?"
5. Calendar a 90-day review: measure wedge conversion, check brand coherence, decide whether to collapse to B or rebalance.
