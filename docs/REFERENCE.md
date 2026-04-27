# REFERENCE — moved out of CLAUDE.md on 2026-04-27

> **Why this file exists.** CLAUDE.md grew to ~1,500 lines, with several
> hundred lines of encyclopedic reference material (security standards,
> component-library catalog, integration matrices, environment-variable
> roadmap) that aren't actionable per-session. Per Craig's directive on
> 2026-04-27 ("I do worry that all these CLAUDE.md files and build
> bibles are really holding us up"), the reference content was
> relocated here so CLAUDE.md stays lean enough to internalise.
>
> **Status:** content below is preserved verbatim from CLAUDE.md
> §5A–5D as of 2026-04-27. Treat as historical / aspirational, not
> as locked doctrine. The actually-binding doctrine lives in CLAUDE.md
> (Iron Rules, Session Protocol, Craig Authorization Gate, Build-Quality
> Gate, Maximum Parallel Agent Mandate, Drift Circuit Breaker, Memory
> Persistence Protocol) and the locked blocks in `docs/BUILD_BIBLE.md`.
>
> Some content here predates current positioning (e.g. legal-vertical
> integrations like PACER / Westlaw / Clio in §5C.4) — Crontech's locked
> positioning per `docs/POSITIONING.md` is now horizontal developer
> platform, not legal vertical. Those sections remain for historical
> context but should NOT be cited as binding architectural requirements.
> A future cleanup pass should remove vertical-specific content; not
> doing it in this trim to avoid scope creep.

---

## 5A. SECURITY & COMPLIANCE (LEGAL-GRADE)

This platform must operate in the highest-stakes environments: client meetings, depositions, courtrooms, and any legal proceeding where data integrity is not optional -- it is the law. Every piece of data that flows through this system must be defensible in court.

---

### 5A.1 Court Admissibility (FRE 901/902)

All artifacts (recordings, documents, transcripts, exhibits) must meet Federal Rules of Evidence standards:

- **SHA-256 hashing** at creation and every lifecycle event. Every artifact gets a cryptographic fingerprint the moment it exists.
- **RFC 3161 timestamps** from a trusted Timestamping Authority on all critical events. Proves data existed at a specific point in time.
- **Hash chaining** -- each audit log entry includes the hash of the previous entry. Retroactive tampering is mathematically detectable.
- **FRE 902(14) compliance** -- the system can produce certification that any copy is a true and complete duplicate via cryptographic hash verification.
- **WORM storage** (Write-Once-Read-Many) for all evidence artifacts. AWS S3 Object Lock (Compliance Mode) or equivalent. Even root accounts cannot delete or modify.
- **Metadata preservation** -- original metadata of uploaded documents is never stripped or modified. System metadata (upload time, uploader, hash, format) is generated and preserved alongside.

---

### 5A.2 Encryption (FIPS 140-3)

| Layer | Standard | Implementation |
|---|---|---|
| **In Transit** | TLS 1.3, AES-256-GCM, Perfect Forward Secrecy | All connections. No exceptions. mTLS for service-to-service. |
| **At Rest** | AES-256-GCM/XTS, envelope encryption | KMS-managed keys (AWS KMS / HashiCorp Vault). Key rotation annually minimum. |
| **In Use** | Confidential computing (TEEs) | Intel TDX / AMD SEV-SNP for AI processing of sensitive documents. |
| **Zero-Knowledge Option** | Client-side encryption | Data encrypted before transmission. Server never possesses plaintext. For attorney-client privilege. |
| **Cryptographic Modules** | FIPS 140-3 validated | All crypto operations use CMVP-certified modules. Non-negotiable for government/legal. |
| **Post-Quantum Ready** | NIST ML-KEM (Kyber), ML-DSA (Dilithium) | Hybrid implementations planned. Data encrypted today must survive quantum computing. |

---

### 5A.3 Immutable Audit Trail

Every action in the system is permanently recorded. No deletions. No modifications. No exceptions.

**Required fields on every audit entry:**

| Field | Description |
|---|---|
| Event ID | UUID v4 |
| Timestamp | RFC 3339, trusted time source (NIST/GPS-synced NTP) |
| Actor | Authenticated user ID, display name, role |
| Actor IP + Device | Source IP, user agent, device fingerprint |
| Action | Standardized verb: CREATE, READ, UPDATE, DELETE, EXPORT, SIGN |
| Resource | Type + ID of affected resource |
| Detail | Fields changed, before/after values |
| Result | Success/failure + error code |
| Session ID | Link to auth session |
| Previous Hash | SHA-256 of previous entry |
| Entry Hash | SHA-256 of current entry (all fields) |
| Signature | Cryptographic signature of entry hash |

**Storage:** Append-only, WORM-compliant. Periodic root hash anchoring to external timestamping service.

---

### 5A.4 Digital Signatures & Non-Repudiation

- **PAdES B-LTA** for PDF signing (long-term archival -- signatures remain verifiable indefinitely)
- **RFC 3161 timestamps** on all signatures from trusted TSA
- **HSM-backed signing keys** (FIPS 140-3 Level 3)
- **PKI infrastructure** for system and user certificates
- **eIDAS QES support** for EU legal proceedings (Qualified Electronic Signatures)

---

### 5A.5 Compliance Certifications

| Certification | Priority | Why |
|---|---|---|
| **SOC 2 Type II** | MANDATORY | No law firm evaluates without it. Baseline. |
| **TLS 1.3 + AES-256** | MANDATORY | Built into architecture from day one. |
| **MFA / Passkeys** | MANDATORY | FIDO2 WebAuthn. NIST AAL2 minimum. |
| **Immutable Audit Logs** | MANDATORY | Hash-chained, signed, WORM storage. |
| **HIPAA** | MANDATORY | BAA-ready. Health-related legal matters. |
| **ISO 27001** | HIGH | International legal work and EU clients. |
| **FedRAMP Moderate** | HIGH | Federal government. ~325 NIST 800-53 controls. |
| **CJIS** | HIGH | Criminal justice data. Personnel background checks required. |
| **GDPR** | REQUIRED | EU data subjects. 72-hour breach notification. Configurable data residency. |
| **StateRAMP** | RECOMMENDED | 30+ states recognize. Single auth reusable across agencies. |
| **NIST AI RMF** | REQUIRED | AI in legal = high-risk under EU AI Act. |

---

### 5A.6 Data Residency & Sovereignty

- **Configurable region selection** -- data stored and processed only in selected geographic region
- **Region-locked encryption keys** -- EU data keys managed in EU KMS region
- **Network controls** prevent data transit through unauthorized regions
- **Documented data flow maps** for GDPR DPIAs and compliance audits

---

## 5B. COMPONENT ARCHITECTURE (THE ARSENAL)

Every component must be zero-HTML, AI-composable, and production-grade.

---

### 5B.1 Foundation Layer (Headless Primitives)

| Library | Role | Status |
|---|---|---|
| **Kobalte** | Radix equivalent for SolidJS. WAI-ARIA APG compliant. | Production-ready |
| **Ark UI** (`@ark-ui/solid`) | 45+ headless components by Chakra team. State machine-driven. | Production-ready |
| **Corvu** | Focused SolidJS-native primitives. Calendar, Dialog, Drawer, OTP, Resizable. | Production-ready |

### 5B.2 Application Layer

| Library | Role | Status |
|---|---|---|
| **solidcn** | shadcn/ui port with **built-in MCP server** for AI component discovery. 42 components. | AI-NATIVE |
| **Solid UI** | Largest shadcn/ui port. Built on Kobalte + Corvu + Tailwind. 1,300+ stars. | Production-ready |

### 5B.3 Specialized Components

| Component | Solution | Status |
|---|---|---|
| Data Tables | TanStack Table + TanStack Virtual (sorting, filtering, grouping, virtualization) | EXISTS |
| Drag & Drop | @thisbeyond/solid-dnd or dnd-kit-solid | EXISTS |
| Rich Text Editor | solid-tiptap (Tiptap/ProseMirror) | EXISTS |
| Code Editor | solid-codemirror (CodeMirror 6) or solid-monaco | EXISTS |
| Video Player | Vidstack Player (HLS, captions, accessible) | EXISTS |
| PDF Viewer | PDFSlick (SolidJS-native, PDF.js) | EXISTS |
| Audio Waveform | wavesurfer.js v7 (regions, timeline, spectrogram) | EXISTS |
| Forms + Validation | Modular Forms + Valibot (~3KB + ~700B/schema) | EXISTS |
| Digital Signatures | signature_pad (trivial SolidJS wrapper) | WRAP |
| Bates Numbering | pdf-lib (browser-side PDF manipulation) | WRAP |
| Doc Annotation/Redaction | Nutrient or Apryse SDK (GDPR/HIPAA compliant) | WRAP |

### 5B.4 Custom-Build Components (Our Competitive Moat)

These do not exist for SolidJS anywhere. Every one we build is a moat nobody can cross.

| Component | Description | Priority |
|---|---|---|
| **Deposition Video + Transcript Sync** | Vidstack + custom transcript with timestamp-indexed highlighting | CRITICAL |
| **Multi-Format Exhibit Viewer** | Unified: PDFSlick + Vidstack + wavesurfer.js + images. MIME-type switching. | CRITICAL |
| **Real-Time Transcription Display** | Streaming ASR + scrolling transcript with word highlighting | CRITICAL |
| **Case Chronology Timeline** | Custom SVG/Canvas. Event linking, evidence attachment, date filtering. | HIGH |
| **Chain-of-Custody Tracker** | Transfer events, digital signatures, tamper-evident audit display | HIGH |
| **Courtroom Presentation Engine** | Exhibit display, callout/zoom, side-by-side, annotation, impeachment view | HIGH |
| **Collaborative Video Editor** | WebGPU-accelerated, multi-user CRDTs, AI-assisted | HIGH |
| **Scheduling Calendar** | Full hearing/appointment scheduler | MEDIUM |
| **Kanban Board** | solid-dnd + custom components | MEDIUM |
| **Gantt/Timeline Chart** | Frappe Gantt wrapper + extensions | MEDIUM |

### 5B.5 AI-Composable Component Architecture

- **MCP Server** -- every component discoverable by AI agents via Model Context Protocol
- **Zod Schema Registry** -- every component's props, slots, events, variants defined as schemas
- **Runtime Validation** -- AI-generated configurations validated before rendering
- **Visual Regression** -- Playwright `toHaveScreenshot()` on every component, every commit

---

## 5C. UNIVERSAL DEVICE & INTEGRATION SUPPORT

This platform works on EVERY device and integrates with EVERYTHING. No exceptions.

---

### 5C.1 Device Support

- **Progressive Web App (PWA)** with full offline capability
- **Responsive rendering** -- phones, tablets, laptops, desktops
- **Adaptive rendering** -- detect device capabilities and adjust (GPU, memory, bandwidth)
- **WebGPU -> WebGL -> Canvas 2D fallback chain** for graphics
- **Input agnostic** -- touch, mouse, keyboard, voice, stylus
- **WCAG 2.2 AA minimum** accessibility
- **Print-ready rendering** for legal documents
- **Low-bandwidth mode** -- graceful degradation
- **Offline-first** -- local data with sync on reconnect

### 5C.2 Integration Architecture

| Protocol | Use Case |
|---|---|
| **REST API** | Public API for third-party integrations |
| **tRPC** | Internal type-safe API |
| **GraphQL** | Complex data queries for external consumers |
| **WebHooks** | Event-driven notifications |
| **WebSockets + SSE** | Real-time streaming |
| **OAuth 2.0 / OIDC** | Third-party authentication |
| **SAML 2.0** | Enterprise SSO |
| **SCIM** | Automated user provisioning |
| **MCP** | AI tool/agent integration |
| **CalDAV / iCal** | Calendar integration |
| **SMTP / IMAP** | Email integration |

### 5C.3 Platform Integrations

| Integration | Purpose |
|---|---|
| **Zoom / Teams / WebEx** | Video conferencing |
| **Microsoft 365 / Google Workspace** | Document and calendar sync |
| **Slack / Teams** | Communication and alerts |
| **Zapier / Make / n8n** | No-code automation |

> **If it exists, we integrate with it. If it doesn't have an API, we build an adapter.**

### 5C.4 Legal-Specific Integrations

| Integration | Purpose | Approach |
|---|---|---|
| **PACER / CM/ECF** | Federal court filing and docket access | Via CourtDrive or PacerPro APIs (normalized, handles court-specific variations) |
| **Clio** | Case management (largest market share, open API, 250+ integrations) | Priority #1 case management connector |
| **PracticePanther / MyCase** | Case management alternatives | REST API integration |
| **Relativity / Everlaw** | E-discovery platforms | REST API connectors |
| **LexisNexis** | Legal research (Cognitive APIs, entity resolution, PII redaction) | OAuth + REST API via Developer Portal |
| **Westlaw** | Legal research (2M+ legislative records, 500K+ case reports) | REST API via Thomson Reuters Developer Portal |
| **iManage / NetDocuments** | Legal document management | API integration with ethical wall support |
| **Prevail CheckMate** | Real-time deposition transcription + LLM streaming | API integration |
| **Epiq Narrate** | Real-time transcription, auto exhibit numbering, contradiction detection | API integration |

### 5C.5 Enterprise SSO & Identity

- **WorkOS** (or equivalent) for enterprise SSO -- handles SAML + OIDC + SCIM without building from scratch
- **SAML 2.0** is mandatory for AmLaw 200 firms -- cannot be skipped
- **SCIM** is now a must-have for enterprise procurement (automated provisioning/deprovisioning)
- The complete enterprise stack: **SSO + SCIM + Audit Logs** -- SSO alone is insufficient

### 5C.6 Internationalization

- **i18next** for multi-language support (SolidJS compatible)
- **RTL layout support** (Arabic, Hebrew) via CSS logical properties
- **Locale-sensitive formatting** -- dates, times, numbers (legally significant in documents)
- **Multi-script rendering** -- English + Mandarin in same document
- **Court interpreter support** -- real-time translation overlays
- **Certified translation tracking** -- chain of custody for translated documents

### 5C.7 Print & Court Filing

- **CSS @media print + @page** for court-compliant document formatting
- **Per-jurisdiction templates** -- federal, state, local court rules vary significantly
- **HTML-to-PDF pipeline** via headless Chrome for pixel-perfect output
- Specific typefaces (Century Schoolbook, Times New Roman), exact point sizes, margins, line spacing
- Non-compliance risks **court rejection** -- this is not optional

### 5C.8 Compliance Documentation

- **VPAT 2.5** required before selling to government-serving law firms or court systems
- Covers Section 508 (U.S.), EN 301 549 (EU), and WCAG
- Must be completed by third-party auditor with remediation plan

---

## 5D. ENVIRONMENT VARIABLES ROADMAP

This platform is 22 services rolled into one. Every service needs its own configuration. This section tracks all required environment variables across the stack. **No service launches without its env vars documented here first.**

### Auth Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth | YES | Google Cloud Console OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | YES | Google Cloud Console OAuth 2.0 client secret |
| `WEBAUTHN_RP_ID` | Passkeys | YES | Relying Party ID (domain name) |
| `WEBAUTHN_RP_NAME` | Passkeys | YES | Relying Party display name |
| `WEBAUTHN_ORIGIN` | Passkeys | YES | Expected origin for WebAuthn ceremonies |
| `SESSION_SECRET` | Auth | YES | Secret for signing session tokens |
| `JWT_SECRET` | Auth | YES | Secret for signing JWTs |

### Database Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `TURSO_DATABASE_URL` | Turso | YES | Primary Turso database URL |
| `TURSO_AUTH_TOKEN` | Turso | YES | Turso authentication token |
| `NEON_DATABASE_URL` | Neon | YES | Neon serverless PostgreSQL connection string |
| `QDRANT_URL` | Qdrant | YES | Qdrant vector database endpoint |
| `QDRANT_API_KEY` | Qdrant | PROD | Qdrant API key (production only) |

### AI Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | AI SDK | YES | OpenAI API key for embeddings and completions |
| `ANTHROPIC_API_KEY` | AI SDK | OPT | Anthropic API key for Claude models |

### Infrastructure Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Workers | DEPLOY | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Workers | DEPLOY | Cloudflare API token |
| `STRIPE_SECRET_KEY` | Billing | YES | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Billing | YES | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Billing | YES | Stripe webhook signing secret |

### Observability Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry | OPT | OTLP exporter endpoint |
| `GRAFANA_API_KEY` | Grafana | OPT | Grafana Cloud API key |

### Sentinel Variables
| Variable | Service | Required | Description |
|---|---|---|---|
| `SLACK_WEBHOOK_URL` | Alerts | OPT | Slack incoming webhook for alerts |
| `DISCORD_WEBHOOK_URL` | Alerts | OPT | Discord webhook for backup alerts |
| `GITHUB_TOKEN` | Collectors | OPT | GitHub PAT for release monitoring |

### Workflow Secrets (GitHub Actions)

These are not application env vars — they are GitHub repo secrets consumed by `.github/workflows/*.yml`. Listed here so the next session can audit at a glance which secrets the deploy pipeline depends on.

| Variable | Workflow | Required | Description |
|---|---|---|---|
| `VULTR_SERVER_IP` | `deploy.yml` | YES | Production server IPv4 |
| `VULTR_SSH_KEY` | `deploy.yml` | YES | Private SSH key for the deploy user |
| `SLACK_DEPLOY_WEBHOOK` | `deploy.yml` | OPT | Slack incoming webhook posted to by the post-deploy public smoke test on failure. If unset, the alert is skipped (deploy still fails on the smoke-test step) |

> **This table grows as services are added.** Every new integration must add its env vars here before merging.

---
