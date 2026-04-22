# Data Processing Addendum (DPA)

**[ATTORNEY DRAFT REQUIRED — NOT LEGAL ADVICE — DO NOT EXECUTE AS-IS]**

Placeholder outline for B2B customers. Attorney finalises to GDPR Article 28 and UK + NZ + CCPA standards.

---

## 1. Parties

- **Controller** (customer): the business entity signing the Crontech ToS with Crontech.
- **Processor**: Crontech **[ATTORNEY: full registered company name]**.

This DPA forms part of the Crontech Terms of Service and governs the processing of personal data by Crontech on the Controller's behalf.

## 2. Scope

Crontech processes personal data only as necessary to provide the Crontech service (hosting, database, auth, AI, billing, email) and only on the Controller's documented instructions (the Terms of Service and the Controller's account configuration).

## 3. Data categories and subjects

**[ATTORNEY: attach Schedule 1 listing categories of data processed (typically: end-user contact data, authentication credentials, usage events, billing data) and categories of data subjects (typically: Controller's end users, Controller's employees, prospects).]**

## 4. Duration of processing

For the term of the Controller's Crontech subscription, plus the 30-day data export window after termination.

## 5. Crontech's obligations (Processor)

Crontech will:

1. Process personal data only on documented instructions from the Controller.
2. Ensure personnel are bound by confidentiality.
3. Implement appropriate technical and organisational security measures (see §10).
4. Use sub-processors only as listed in §8 below, with prior notice of material changes.
5. Assist the Controller with data subject rights requests (access, deletion, portability) within reasonable time.
6. Notify the Controller without undue delay after becoming aware of a personal data breach.
7. Delete or return personal data at the end of the subscription.
8. Make available all information necessary to demonstrate compliance, and allow for audits.

## 6. Controller's obligations

The Controller is responsible for:

- The legal basis under GDPR Article 6 for the processing it directs.
- Obtaining any necessary consents from its own end users.
- Not instructing Crontech to process data in a way that would violate applicable law.

## 7. International transfers

**[ATTORNEY: specify transfer mechanism. EU→NZ transfers may rely on adequacy (partial NZ adequacy decision exists) or SCCs. Transfers to US sub-processors (Stripe, Cloudflare, Anthropic, OpenAI) require SCCs or equivalent. Confirm current mechanism.]**

## 8. Sub-processors

Crontech engages the following sub-processors:

| Sub-processor | Purpose | Location |
|---|---|---|
| **Stripe, Inc.** | Payment processing | US |
| **AlecRae Ltd** | Transactional email | **[ATTORNEY: confirm]** |
| **Cloudflare, Inc.** | Edge hosting + DDoS | US + global |
| **Turso Corp / ChiselStrike** | libSQL hosting | US |
| **Upstash, Inc.** | Redis cache + queue | US |
| **Anthropic PBC** | Claude AI API | US |
| **OpenAI, L.L.C.** | Fallback AI + Whisper transcription | US |

The Controller is deemed to have authorised use of these sub-processors upon signing. Crontech will notify the Controller of material changes at least 30 days in advance.

**[ATTORNEY: confirm Controller's right to object to new sub-processors and consequences — typical: right to terminate with refund of unused prepaid fees.]**

## 9. Data subject rights

When an end user (or the Controller on their behalf) exercises a GDPR/CCPA/NZ right (access, deletion, portability, rectification, objection), Crontech will:

- For data in the Controller's account: provide tooling for the Controller to respond directly (Admin > Users > Export / Delete).
- For requests that come directly to Crontech: forward to the Controller without delay.

## 10. Security measures

- Encryption at rest for customer data (Turso native AES-256).
- TLS 1.3 in transit.
- MFA enforced for all Crontech staff with production access.
- Access to production systems is role-based, audited, and time-limited.
- SOC 2 Type II certification in progress. **[ATTORNEY: do NOT claim certified until audit is complete.]**
- Incident response procedures, including a 72-hour breach notification window.
- Regular penetration tests and vulnerability scans.

**[ATTORNEY: confirm all listed controls are actually implemented. Remove anything aspirational.]**

## 11. Breach notification

Upon becoming aware of a personal data breach, Crontech will notify the Controller within 72 hours with all reasonably available information.

## 12. Audit rights

Once per 12 months, the Controller may request a copy of Crontech's most recent third-party security audit report (e.g. SOC 2). In addition, the Controller may conduct on-site audits at its own expense, with 30 days' notice, subject to confidentiality.

## 13. Deletion / return of data

Upon termination of the Controller's subscription, Crontech will make data available for export for 30 days and then delete it within a further 30 days, subject to legal retention obligations (tax records, logs of abuse investigations).

## 14. Liability

Liability under this DPA is subject to the overall liability cap in the Terms of Service.

## 15. Changes

Crontech may update this DPA to reflect changes in law or sub-processor arrangements. Material changes will be notified 30 days in advance.

## 16. Signatures

**Controller:**
Name: ____________________
Company: ____________________
Role: ____________________
Date: ____________________
Signature: ____________________

**Processor (Crontech):**
**[ATTORNEY: insert default signatory block]**

---

**Version:** 0.1-draft-placeholder — 2026-04-22
**Governing law:** **[ATTORNEY: confirm — matches the ToS]**
