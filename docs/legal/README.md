# Legal docs — READ THIS FIRST

**NOT LEGAL ADVICE.** These files are placeholder templates drafted by Claude for Craig's attorney to edit into finalised legal documents. They exist so the attorney has a starting point, not so Crontech can ship them as-is.

**Do not publish any of these files on crontech.ai without attorney review first.**

---

## What needs to exist before Crontech takes its first paying customer

1. **Privacy Policy** (`PRIVACY_POLICY.md`) — what data is collected, why, who it's shared with, how to delete it. GDPR + CCPA compliant. Must link from every page footer.
2. **Terms of Service** (`TERMS_OF_SERVICE.md`) — the contract between Crontech and the customer. Liability limits, indemnity, termination, governing law, dispute resolution.
3. **Cookie Policy** (`COOKIE_POLICY.md`) — what cookies are set, why, and how users can control them. Needs a consent banner on the site that reads from this.
4. **Data Processing Addendum** (`DPA.md`) — for B2B customers. How Crontech processes their customer data as a sub-processor. Needed before any B2B sale.
5. **Acceptable Use Policy** (`AUP.md` — not yet stubbed) — what customers may not run on Crontech. Anti-spam, anti-abuse, anti-malware, sanctions compliance.

## What Craig needs from the attorney

- Review and finalise all four above.
- Confirm jurisdiction: where is the company incorporated, and what governing law applies to the ToS?
- Confirm the ToS liability cap is reasonable for the pricing tiers we're selling at ($29/mo Pro, $99/mo Enterprise).
- Draft IP assignment agreements for any contractor or agent who has touched the code (including Craig himself → the company).
- Trademark filings: Crontech, Gluecron, Gatetest, AlecRae.
- Incorporation (or confirm existing LLC/Ltd is appropriate).
- DPA standard contractual clauses (SCCs) for EU data transfers.
- Sub-processor list — AlecRae, Stripe, Cloudflare, Turso, Upstash, Anthropic, OpenAI.

## What the accountant needs

- Company bank account (separate from personal).
- Books handed over monthly, not yearly.
- Stripe account connected to company books.
- US + NZ + other relevant tax positions — where are customers, where are we, how does GST / VAT / sales tax apply?

## Jurisdiction note

Craig is New Zealand based (`.co.nz` implied, but confirm). Default assumption in the stubs: **New Zealand incorporated, NZ governing law, global customer base**. Attorney to correct if wrong. Consider a Delaware C-corp wrapper for later fundraising.

## Stub order (tackle these with attorney in order)

1. Privacy Policy — can draft from industry-standard templates (Iubenda, Termly, PrivacyPolicies.com) and customise.
2. Cookie Policy — pairs with Privacy Policy, often same document in EU jurisdictions.
3. Terms of Service — more custom, bigger block of attorney time.
4. DPA — only needed once first B2B customer signs.
5. AUP — can be posted after launch; low priority for Phase 1.

---

**Files in this folder:**

- `PRIVACY_POLICY.md` — placeholder
- `TERMS_OF_SERVICE.md` — placeholder
- `COOKIE_POLICY.md` — placeholder
- `DPA.md` — placeholder
- `README.md` — this file

Each stub is marked at the top with `[ATTORNEY DRAFT REQUIRED]` so it's obvious they're not finalised.

Last updated: 2026-04-22.
