# Privacy Policy

**[ATTORNEY DRAFT REQUIRED — NOT LEGAL ADVICE — DO NOT PUBLISH AS-IS]**

This file is a placeholder outline. Every section below marked `[ATTORNEY: ...]` is a brief for your attorney. The attorney should replace each with the actual language that applies to Crontech's jurisdiction (NZ incorporated, global customer base, GDPR + CCPA + NZ Privacy Act 2020 compliance).

---

## 1. Who we are

**[ATTORNEY: insert registered company name, company number, registered address, contact email for privacy queries.]**

Example placeholder: Crontech Limited (NZBN: XXXX), registered in New Zealand, privacy contact: privacy@crontech.ai.

## 2. What data we collect

We collect the following categories of personal data:

- **Account data** — email address, password hash, name (if provided), authentication provider (Google, email/password, passkey), verification timestamps.
- **Usage data** — projects created, deployments made, API requests, dashboard interactions, IP addresses, user agent.
- **Billing data** — Stripe customer ID, subscription tier, invoice history. Card details are held by Stripe, not us.
- **Communication data** — support tickets, emails we've sent or received, delivery + open + click events from AlecRae.
- **Technical logs** — error logs, performance metrics, crash reports, feature-flag evaluations.

**[ATTORNEY: confirm this list is complete and note any data not yet mentioned — e.g. AI prompt history, uploaded files, custom domains, DNS records.]**

## 3. Why we collect it

- To provide the Crontech service (hosting, deployments, AI features, email, billing).
- To detect and prevent fraud, abuse, and security incidents.
- To comply with legal obligations (tax, anti-money-laundering, court orders).
- To communicate with you about the service (transactional + important announcements).
- To improve the product (aggregated usage analytics only).

**[ATTORNEY: frame these under GDPR Article 6 lawful bases — contract, legal obligation, legitimate interest, consent.]**

## 4. Who we share data with (sub-processors)

We share limited data with the following sub-processors, each under a data processing agreement:

- **Stripe** (payment processing) — billing data only
- **AlecRae** (email delivery) — email address, template variables, delivery metadata
- **Cloudflare** (hosting, DDoS protection) — IP address, request metadata
- **Turso / libSQL** (database) — all account + usage data encrypted at rest
- **Upstash** (queue / cache) — transient job metadata
- **Anthropic** (Claude API) — AI prompts you submit + Crontech-generated context
- **OpenAI** (AI fallback) — AI prompts when Claude is unavailable

**[ATTORNEY: confirm current sub-processor list, include addresses, purpose, safeguards. Also note whether Crontech is a separate legal entity from its siblings Gluecron, Gatetest, AlecRae — if so, list those as intra-group transfers.]**

## 5. How long we keep data

**[ATTORNEY: specify retention periods per data category. Typical: account data until deletion request, usage data 12 months, logs 30-90 days, billing records 7 years for tax law.]**

## 6. Your rights

Under GDPR, CCPA, and NZ Privacy Act 2020, you have the right to:

- Access your personal data (Article 15 GDPR)
- Correct inaccurate data (Article 16)
- Delete your data (Article 17 — "right to be forgotten")
- Restrict processing (Article 18)
- Data portability (Article 20)
- Object to processing (Article 21)
- Lodge a complaint with a supervisory authority

To exercise any of these rights, email privacy@crontech.ai. We respond within 30 days.

**[ATTORNEY: confirm CCPA-specific rights (Do Not Sell, opt-out of targeted ads) and NZ Privacy Act rights are all reflected.]**

## 7. International transfers

**[ATTORNEY: describe data transfer mechanism. EU→NZ requires either adequacy decision, SCCs (EU standard contractual clauses), or Binding Corporate Rules. NZ has partial adequacy for some EU data. US (Stripe, Cloudflare, etc.) requires SCCs.]**

## 8. Cookies

See our separate [Cookie Policy](./COOKIE_POLICY.md).

## 9. Security

We apply industry-standard security measures: encryption at rest and in transit, MFA for admin access, regular security audits, SOC 2 Type II certification in progress, incident response procedures. No system is perfectly secure. Report suspected incidents to security@crontech.ai.

**[ATTORNEY: confirm this language doesn't over-promise. Do NOT state SOC 2 Type II is certified until the audit is complete.]**

## 10. Children

Crontech is not intended for use by anyone under 16. If you believe a child has submitted personal data, contact privacy@crontech.ai and we will delete it.

## 11. Changes to this policy

We will post changes at this URL and notify registered users by email at least 30 days before material changes take effect.

## 12. Contact

- Privacy: privacy@crontech.ai
- Legal / DPO: **[ATTORNEY: name the Data Protection Officer or equivalent, or confirm no DPO is required under GDPR Article 37 thresholds]**
- Postal: **[ATTORNEY: registered address]**

---

**Version:** 0.1-draft-placeholder — 2026-04-22
**Jurisdiction governing law:** **[ATTORNEY: NZ, EU, US Delaware? Confirm.]**
**Effective date:** **[ATTORNEY: set after final review]**
