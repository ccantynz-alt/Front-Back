// ── /docs/security — Category overview ──────────────────────────────
//
// Landing article for the Security & Auth category. Names the three
// auth providers shipped on Crontech today, the zero-trust posture
// the platform takes by default, and the compliance guarantees laid
// out in CLAUDE.md §5A. Honest about SOC 2 being the current target
// rather than a live certification.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function SecurityOverviewArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Security & Auth"
        description="How Crontech handles authentication, session management, and audit trails. Passkeys, Google OAuth, email + password, and the hash-chained audit log that backs the platform's compliance posture."
        path="/docs/security"
      />

      <DocsArticle
        eyebrow="Security & Auth"
        title="Security & Auth"
        subtitle="Crontech ships three auth providers, a session layer hardened against the common attacks, and an append-only audit trail designed for SOC 2 and legal-grade evidentiary use. This is the map of each piece."
        readTime="2 min"
        updated="April 2026"
        nextStep={{
          label: "Authentication",
          href: "/docs/security/authentication",
          description:
            "Passkeys, Google OAuth, and email + password. What each one does on the wire, with pointers to the real apps/api/src/auth implementations.",
        }}
      >
        <p>
          Security on Crontech is not an add-on — it's the default
          posture. Every request is authenticated, every session is
          bound to a bearer token, every mutation is a candidate for
          the audit log, and every sensitive value is encrypted in
          transit and at rest. This category documents the pieces
          that make that true.
        </p>

        <h2>What's in this category</h2>

        <KeyList
          items={[
            {
              term: "Authentication",
              description:
                "The three providers shipped today — passkeys (WebAuthn), Google OAuth 2.0, and email + password with argon2id — and how the session layer wraps them into a single Bearer-token protocol.",
            },
            {
              term: "Audit and compliance",
              description:
                "The hash-chained audit log required by CLAUDE.md §5A, the encryption posture the platform defaults to, and the compliance certifications that are in motion vs. the ones that are live.",
            },
          ]}
        />

        <h2>The default posture</h2>

        <KeyList
          items={[
            {
              term: "Zero-trust by default",
              description:
                "Every tRPC procedure and every API route runs through the authMiddleware in apps/api/src/auth/middleware.ts. A request without a valid Bearer token gets userId: null, and every protected procedure rejects null userIds.",
            },
            {
              term: "Passkeys first",
              description:
                "Passkey / WebAuthn via @simplewebauthn/server is the recommended path. Phishing-immune by construction (the credential is bound to the origin), 17x faster than password + 2FA, and supported on every major platform.",
            },
            {
              term: "TLS 1.3 everywhere",
              description:
                "Every Crontech endpoint is TLS 1.3 with AES-256-GCM. Plain HTTP is rejected at the edge — the platform never responds to an unencrypted request.",
            },
            {
              term: "Encryption at rest",
              description:
                "Database contents, build artefacts, and the audit log are encrypted at rest with AES-256-GCM. Envelope encryption is used for anything sensitive enough to need key rotation — the keys are managed by Cloudflare or the tenant's KMS.",
            },
            {
              term: "Append-only audit log",
              description:
                "Every security-relevant action writes a row to the audit log with a SHA-256 hash of the previous entry and a timestamp from a trusted source. Retroactive tampering is mathematically detectable.",
            },
            {
              term: "Secret scrubbing in build logs",
              description:
                "Log lines matching *_KEY / *_SECRET / *_TOKEN / *_PASSWORD, Bearer tokens, and PEM blocks are replaced with KEY=*** before they are persisted. A leaked secret from a build log is not a class of bug that can exist.",
            },
          ]}
        />

        <Callout tone="info">
          The compliance posture described in the next article is the
          target architecture — SOC 2 Type II is in motion, ISO 27001
          is on the roadmap, and HIPAA BAAs are available on request
          for enterprise customers. The Authentication article covers
          the code that's already shipped and enforced today.
        </Callout>

        <h2>Where to start</h2>
        <p>
          If you're wiring login on a new project, start with{" "}
          <a href="/docs/security/authentication">Authentication</a>.
          If you're evaluating the platform for regulated workloads,
          start with{" "}
          <a href="/docs/security/audit-and-compliance">
            Audit and compliance
          </a>
          .
        </p>
      </DocsArticle>
    </>
  );
}
