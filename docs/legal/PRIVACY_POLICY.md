# Privacy Policy

**Version:** 1.0
**Last updated:** 2026-04-22.
**Effective date:** the date this document was first published on crontech.ai.

---

## 1. Who we are

This Privacy Policy explains how Crontech ("**Crontech**", "**we**", "**us**", "**our**") collects, uses, and protects personal data when you visit `crontech.ai` or use the Crontech platform.

Crontech is a business operated in New Zealand. You can contact us at **privacy@crontech.ai**.

Where we act as a "controller" of your personal data under the GDPR, UK GDPR, or the NZ Privacy Act 2020, the contact address above is the controller's contact point.

## 2. What data we collect

### Account data
- Email address (required)
- Password hash (if you use email + password sign-in) — we never see your plaintext password
- OAuth identifier (if you sign in with Google)
- Public key (if you use a passkey)
- Display name (optional)
- Email verification timestamp
- Account creation and last-login timestamps

### Usage data
- Projects you create (name, description, configuration)
- Deployments (timestamp, status, commit SHA, resulting URL)
- API requests you make (path, method, response status, timing, size)
- Dashboard interactions (pages viewed, actions taken)
- IP address and user-agent string
- Approximate geographic location (derived from IP, city-level only)

### Billing data
- Stripe customer ID
- Subscription tier and history
- Invoice history, amounts, and statuses
- Billing contact email and address if different from account email

We **do not** store your payment card details. Those are held by Stripe under PCI DSS Level 1.

### Communication data
- Support tickets you open
- Emails we send to you (subject, timestamp, template ID)
- Delivery events from our email provider (delivered, bounced, opened, clicked)
- Your responses to our support replies

### Technical logs
- Error logs and stack traces (sanitised to remove obvious PII)
- Performance metrics
- Crash reports
- Feature-flag evaluations for your account

### AI prompt data
- Prompts you submit to our AI Builder or other AI features
- AI-generated content we produce for you
- Context passed to Anthropic (Claude) or OpenAI to generate responses on your behalf

We may use a sample of de-identified, aggregated prompt data to improve our AI features. You can opt out of this by emailing privacy@crontech.ai.

## 3. Why we collect it

We process personal data on the following GDPR Article 6 lawful bases:

- **Contract (6(1)(b))** — to provide the Crontech service, host your workloads, process your payments, and deliver emails you have asked for. Without this data we cannot provide the service.
- **Legitimate interest (6(1)(f))** — to detect and prevent fraud, abuse, and security incidents; to improve the product via aggregated analytics; to enforce our Terms of Service. Our interest is balanced against your privacy; you can object at any time.
- **Legal obligation (6(1)(c))** — to comply with tax law, anti-money-laundering rules, court orders, and law-enforcement requests.
- **Consent (6(1)(a))** — for optional marketing emails, AI-product-improvement data use, and non-essential cookies. You can withdraw consent at any time.

Under the NZ Privacy Act 2020, we comply with the twelve Information Privacy Principles (IPPs).

Under CCPA, we do not "sell" your personal data as that term is defined in California law. We do not share personal data for cross-context behavioural advertising.

## 4. Who we share data with (sub-processors)

We share limited personal data with the following sub-processors, each under a data processing agreement:

| Sub-processor | Purpose | Data shared | Location |
|---|---|---|---|
| **Stripe, Inc.** | Payment processing | Billing contact; card details pass directly to Stripe, not to us | US + EU (SCCs) |
| **AlecRae Ltd** | Transactional email delivery | Email address + template variables | Australasia |
| **Cloudflare, Inc.** | Edge hosting + DDoS protection + DNS | IP address + request metadata | Global (SCCs) |
| **Turso / ChiselStrike, Inc.** | Database hosting | All account + usage data encrypted at rest | US (SCCs) |
| **Upstash, Inc.** | Queue + cache | Transient job metadata | US (SCCs) |
| **Anthropic PBC** | Claude AI API | Your AI prompts + Crontech-generated context | US (SCCs) |
| **OpenAI, L.L.C.** | Fallback AI + Whisper transcription | Your AI prompts when Claude is unavailable | US (SCCs) |

We update this list when we add or change sub-processors. Material changes are notified by email 30 days in advance.

We do **not** sell personal data to advertisers. We do **not** share it with third-party data brokers. We do **not** use it for cross-context behavioural advertising.

We may disclose personal data to law enforcement, courts, or regulators when legally compelled to do so. Where legally permitted, we will notify you before disclosing your data.

## 5. How long we keep data

| Category | Retention period |
|---|---|
| Account data | Until you delete your account + 30 days |
| Usage data | 12 months rolling |
| Billing data | 7 years (NZ tax law requirement) |
| Error logs | 90 days |
| Support tickets | 3 years |
| AI prompts (individual) | 12 months |
| AI prompts (aggregated, de-identified) | Indefinite, for product improvement |
| Backups | 30 days after main deletion |

After these periods, data is permanently deleted or anonymised beyond the point of re-identification.

## 6. Your rights

Under the GDPR, UK GDPR, CCPA, and the NZ Privacy Act 2020, you have the right to:

- **Access** — receive a copy of the personal data we hold about you
- **Correction** — have inaccurate data corrected
- **Deletion** — have your personal data erased ("right to be forgotten"), subject to our legal retention obligations
- **Restriction** — limit how we process your data
- **Portability** — receive your data in a machine-readable format
- **Objection** — object to processing based on legitimate interest
- **Withdraw consent** — at any time for processing based on consent
- **CCPA: Do Not Sell** — (we do not sell data, so this is always honoured)
- **Lodge a complaint** — with a supervisory authority (EU: your national data protection authority; UK: the Information Commissioner's Office; NZ: Office of the Privacy Commissioner; California: CA AG)

To exercise any right, email **privacy@crontech.ai**. We respond within 30 days (GDPR Article 12(3)). If we need longer, we will tell you why.

We do not charge a fee for reasonable requests. For manifestly unfounded or repetitive requests, we may charge a reasonable administrative fee or refuse.

## 7. International transfers

When we transfer personal data outside your country, we rely on one or more of these mechanisms:

- **Standard Contractual Clauses (SCCs)** — European Commission 2021 SCCs for transfers to the US and other countries without an adequacy decision
- **UK International Data Transfer Agreement** — for UK transfers
- **New Zealand Privacy Act 2020** — for transfers into NZ
- **Your explicit consent** — where no other mechanism applies and the transfer is necessary for the service

Data transferred to our US sub-processors (Stripe, Cloudflare, Turso, Upstash, Anthropic, OpenAI) is covered by SCCs.

## 8. Cookies

See our separate [Cookie Policy](./COOKIE_POLICY.md) for the full list of cookies we set and how to control them.

## 9. Security

We apply the following security measures:

- Encryption at rest for all customer data (AES-256)
- TLS 1.3 for all data in transit
- Multi-factor authentication required for all Crontech staff with production access
- Role-based access control with least-privilege defaults
- Audit logs of all production-access actions
- Regular vulnerability scans
- SOC 2 Type II audit in progress
- Incident response procedures with a 72-hour regulator notification target
- Daily encrypted backups

No system is perfectly secure. If you believe your account has been compromised, email **security@crontech.ai** immediately.

## 10. Children

Crontech is not intended for anyone under **16** (or under the age of digital consent in your jurisdiction, whichever is higher). We do not knowingly collect personal data from children. If you believe a child has submitted personal data, email **privacy@crontech.ai** and we will delete it promptly.

## 11. Data breach notification

If a personal data breach occurs that is likely to result in a risk to your rights and freedoms, we will:

- Notify the relevant supervisory authority within **72 hours** of becoming aware (GDPR Article 33)
- Notify affected users without undue delay if the breach poses a high risk (GDPR Article 34)
- Publish a summary of the incident and our remediation on our status page

## 12. Changes to this policy

We may update this Privacy Policy. For material changes:

- We will notify registered users by email at least **30 days** in advance
- We will update the "Last updated" date at the top of this document
- Continued use of the service after the change date means you accept the updated policy

Minor clarifications or corrections may be made without notice.

## 13. Contact

- **Privacy queries:** privacy@crontech.ai
- **Security incidents:** security@crontech.ai
- **Legal:** legal@crontech.ai

For EU residents, you have the right to lodge a complaint with your national data protection authority.
For UK residents, you may contact the Information Commissioner's Office (ICO) at ico.org.uk.
For NZ residents, you may contact the Office of the Privacy Commissioner at privacy.org.nz.
For California residents, you may contact the California Attorney General.
