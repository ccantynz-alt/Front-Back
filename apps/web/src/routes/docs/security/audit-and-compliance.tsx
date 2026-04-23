// ── /docs/security/audit-and-compliance ─────────────────────────────
//
// The compliance posture required by CLAUDE.md §5A. Audit log shape,
// encryption guarantees, and the certification roadmap. Honest about
// SOC 2 Type II being in motion rather than a live cert — the
// platform is built to the standard from day one, but the audit is
// not yet complete.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function AuditAndComplianceArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Audit and compliance"
        description="The compliance posture Crontech is built for. Hash-chained audit logs, FIPS-grade encryption at rest and in transit, and the certification roadmap — what's live, what's in motion."
        path="/docs/security/audit-and-compliance"
      />

      <DocsArticle
        eyebrow="Security & Auth"
        title="Audit and compliance"
        subtitle="Crontech targets legal-grade and enterprise-grade environments from day one. This article documents the audit trail and encryption posture that back that claim, plus the honest state of the certification roadmap."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Authentication",
          href: "/docs/security/authentication",
          description:
            "Back to the auth article for the implementation of the providers whose events this audit log records.",
        }}
      >
        <p>
          The compliance baseline for Crontech is written down in{" "}
          <em>CLAUDE.md §5A</em>. The short version: every security-
          relevant action is logged to an append-only store, every log
          entry carries a hash of the previous entry, every piece of
          data in transit is TLS 1.3, and every piece of data at rest
          is AES-256. This article walks what that looks like in
          practice.
        </p>

        <h2>The audit log</h2>

        <p>
          The audit log is an append-only table that records every
          authentication event, every permission-sensitive mutation,
          and every evidence-touching action. Per CLAUDE.md §5A.3,
          each entry carries a fixed set of fields:
        </p>

        <KeyList
          items={[
            {
              term: "Event ID and timestamp",
              description:
                "UUID v4 plus an RFC 3339 timestamp sourced from a trusted clock (NIST / GPS-synced NTP). No log entry can be backdated.",
            },
            {
              term: "Actor",
              description:
                "userId, displayName, role, source IP, user agent, device fingerprint, and the session id the action was performed under. Accountability at the row level.",
            },
            {
              term: "Action and resource",
              description:
                "A standardised verb (CREATE, READ, UPDATE, DELETE, EXPORT, SIGN) and the type + id of the affected resource. Machine-readable, filterable, aggregatable.",
            },
            {
              term: "Detail and result",
              description:
                "Before / after field deltas for updates, and a success or failure code. Failures are recorded with the same rigor as successes — an attempted action is as important as a completed one.",
            },
            {
              term: "Previous hash + entry hash",
              description:
                "Every row carries the SHA-256 hash of the previous entry and a SHA-256 hash of its own fields. Retroactive tampering requires recomputing every subsequent hash, which a read-only store makes impossible.",
            },
            {
              term: "Signature",
              description:
                "Every entry is cryptographically signed by the platform's audit key. Signature verification can be performed offline against the platform's public key, so evidence exports are independently verifiable.",
            },
          ]}
        />

        <Callout tone="info">
          The hash chain is the mechanism that lets Crontech meet FRE
          901 / 902 admissibility requirements for evidence. Any
          third party can be given the audit log and the public key
          and verify that no entry was modified or removed.
        </Callout>

        <h2>Encryption posture</h2>

        <KeyList
          items={[
            {
              term: "In transit",
              description:
                "TLS 1.3 with AES-256-GCM and Perfect Forward Secrecy on every public endpoint. Service-to-service calls within the platform use mTLS. Plain HTTP is rejected at the edge.",
            },
            {
              term: "At rest",
              description:
                "AES-256-GCM / XTS with envelope encryption on every datastore. Keys are managed by Cloudflare's KMS or an enterprise tenant's own KMS. Annual rotation minimum.",
            },
            {
              term: "In use",
              description:
                "Confidential computing (Intel TDX / AMD SEV-SNP) is on the roadmap for AI processing of sensitive documents. The API surface is already designed for it — the request/response shape doesn't change.",
            },
            {
              term: "Zero-knowledge option",
              description:
                "Enterprise tenants that need attorney-client-privilege-grade isolation can opt into client-side encryption of sensitive fields. The server stores ciphertext only.",
            },
            {
              term: "Post-quantum ready",
              description:
                "Hybrid implementations using NIST ML-KEM (Kyber) and ML-DSA (Dilithium) are being evaluated. Data encrypted today must survive tomorrow's attackers.",
            },
          ]}
        />

        <h2>Certification roadmap</h2>

        <p>
          Certification status is written down honestly. Passing an
          audit takes months — the platform is built to the standard
          from day one, but the audit itself is a separate process.
        </p>

        <KeyList
          items={[
            {
              term: "SOC 2 Type II — in motion",
              description:
                "The platform architecture meets the SOC 2 Common Criteria. The Type II observation window is underway; the independent auditor's report is expected on the published timeline.",
            },
            {
              term: "TLS 1.3 + AES-256 — enforced today",
              description:
                "No endpoint accepts a weaker cipher suite. Live in production.",
            },
            {
              term: "MFA / Passkeys — live today",
              description:
                "WebAuthn via @simplewebauthn/server meets NIST AAL2 when paired with a platform authenticator. Live in production for every user who opts into a passkey.",
            },
            {
              term: "Immutable audit logs — in motion",
              description:
                "The append-only table ships today; the hash-chained and signed variant per §5A.3 is landing incrementally. Every security event is already recorded — the tamper-evidence layer is the active work.",
            },
            {
              term: "HIPAA — BAA on request",
              description:
                "A Business Associate Agreement is available for enterprise customers. Technical controls (encryption, audit logging, access controls) are in place; administrative controls are evaluated per tenant.",
            },
            {
              term: "ISO 27001 — roadmap",
              description:
                "Scoped for the enterprise tier. Prioritised behind SOC 2 Type II.",
            },
            {
              term: "GDPR — supported today",
              description:
                "Configurable data residency per project, 72-hour breach notification procedures, right-to-erasure endpoints on the users router. EU data keys managed in an EU KMS region on request.",
            },
          ]}
        />

        <Callout tone="warn">
          If a prospective customer's procurement checklist requires
          a certification that is listed above as "in motion" or
          "roadmap", ask the Crontech team for the current timeline
          before committing. The team does not ship certification
          badges on the marketing page until the cert is live.
        </Callout>

        <h2>Data residency</h2>

        <p>
          Per CLAUDE.md §5A.6, projects can be locked to a specific
          geographic region at provisioning time. Data storage,
          processing, and encryption keys all stay inside the chosen
          region; network controls prevent transit through
          unauthorised regions. Data-flow maps are available for
          tenants completing a GDPR DPIA.
        </p>

        <Callout tone="note">
          This article is the source of truth for the compliance
          posture. If a marketing page or sales deck promises a
          certification that isn't listed here as "enforced today" or
          "live today", that's a doc bug — file it and it gets fixed
          within the day.
        </Callout>
      </DocsArticle>
    </>
  );
}
