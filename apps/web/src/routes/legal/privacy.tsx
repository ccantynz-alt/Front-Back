import { For } from "solid-js";
import type { JSX } from "solid-js";
import { Stack, Text, Card, Separator } from "@back-to-the-future/ui";
import { SEOHead } from "../../components/SEOHead";

interface Section {
  title: string;
  content: string[];
}

const sections: Section[] = [
  {
    title: "1. Information We Collect",
    content: [
      "We collect information in the following categories when you use the Crontech platform (\"Service\"):",
      "Account Information. Name, email address, and authentication credentials. Passwords are hashed using Argon2id and never stored in plaintext. Google OAuth provides name, email, and profile picture. Passkey (WebAuthn) private keys never leave your device.",
      "Payment Information. Processed entirely by Stripe, Inc. We never store full card numbers, CVVs, or bank details. We receive only a token, card type, last four digits, and expiration for display.",
      "Usage Data. Pages accessed, feature usage, timestamps, session duration, performance metrics, and error logs. Collected via OpenTelemetry for service improvement.",
      "Device and Technical Data. Browser, OS, screen resolution, IP address, language, time zone, and WebGPU capability. WebGPU data is used solely to determine client-side AI eligibility.",
      "Content Data. Websites, applications, code, videos, and materials you create (\"Your Content\"). Stored solely to provide the Service; remains your property.",
      "AI Interaction Data (Server-Side Only). Prompts and inputs for edge/cloud AI features are temporarily processed on our servers. Client-side AI (WebGPU) interactions never leave your device.",
      "Collaboration Data. Cursor positions, edit operations, and presence information during real-time sessions. Transient and not retained after sessions end.",
    ],
  },
  {
    title: "2. How We Use Your Information",
    content: [
      "Service Delivery. To provide, operate, maintain, and improve the Service, including hosting Your Content and executing AI workloads.",
      "AI Compute Routing. To assess device capabilities (WebGPU, VRAM) and route AI workloads to the optimal compute tier: client-side, edge, or cloud.",
      "Analytics and Performance. To monitor Service performance, fix bugs, and optimize infrastructure via aggregated OpenTelemetry data.",
      "Communication. Account-related notifications (security alerts, billing, service announcements). No unsolicited marketing without explicit opt-in.",
      "Security and Fraud Prevention. Rate limiting, anomaly detection, and audit logging to detect and prevent unauthorized access and abuse.",
      "Legal Compliance. To comply with applicable laws, regulations, and enforceable governmental requests.",
    ],
  },
  {
    title: "3. Client-Side AI: Our Privacy Differentiator",
    content: [
      "This section describes a fundamental privacy advantage of Crontech that no competitor offers.",
      "When you use client-side AI features powered by WebGPU, ALL processing occurs entirely within your browser on your device:",
      "\u2022 Your prompts, inputs, and context are NEVER transmitted to Crontech's servers or any third party",
      "\u2022 AI model outputs are generated locally on your GPU and are NEVER sent to our servers",
      "\u2022 Model weights are downloaded once and cached in browser local storage; subsequent uses require no network communication",
      "\u2022 No telemetry, analytics, or usage data about client-side AI interactions is collected or transmitted",
      "\u2022 Disabling your internet connection after model download does not affect client-side AI functionality",
      "Your client-side AI data has the same privacy as an offline desktop application. We cannot see, access, log, or analyze it because it never reaches us.",
      "Server-side AI (edge and cloud) does transmit prompts to our infrastructure. This data is handled per this Privacy Policy and is not retained for model training.",
    ],
  },
  {
    title: "4. Data Sharing and Third Parties",
    content: [
      "We share data only as necessary to provide the Service:",
      "Infrastructure: Cloudflare, Inc. \u2014 hosting, CDN, edge compute, DDoS protection. Data processed at the nearest edge node.",
      "Databases: Turso (ChiselStrike, Inc.) \u2014 edge SQLite. Neon, Inc. \u2014 serverless PostgreSQL. Qdrant \u2014 vector search. All under data processing agreements.",
      "Payments: Stripe, Inc. \u2014 all payment processing. Governed by Stripe's privacy policy and PCI DSS compliance.",
      "AI Providers: For server-side AI, prompts may be sent to OpenAI, Anthropic, or open-source model endpoints on our GPU infrastructure. All under DPAs; none permitted to use your data for training.",
      "We do not sell, rent, lease, or trade your personal information to any third party. Period. This applies to all tiers, including Free.",
      "Law Enforcement: We may disclose information if required by law, regulation, or legal process, or to protect rights, property, safety, or prevent fraud.",
      "Business Transfers: In a merger, acquisition, or asset sale, your information may transfer with at least thirty (30) days' notice.",
    ],
  },
  {
    title: "5. Data Storage and Security",
    content: [
      "Encryption in Transit. TLS 1.3 with AES-256-GCM and Perfect Forward Secrecy. Mutual TLS (mTLS) for service-to-service communication.",
      "Encryption at Rest. AES-256-GCM with envelope encryption. Keys managed via KMS with automatic annual rotation.",
      "Access Controls. Role-based access (RBAC), principle of least privilege. Production data access requires MFA and is logged in immutable audit trails.",
      "Audit Logging. Cryptographically signed, append-only logs with SHA-256 hash chaining for tamper detection.",
      "Breach Notification. Affected users notified within 72 hours (GDPR). Relevant authorities notified as required by law. California residents notified without unreasonable delay (CCPA).",
      "Infrastructure. Data distributed across global edge network. Enterprise customers may configure data residency to specific geographic regions.",
    ],
  },
  {
    title: "6. Your Rights Under GDPR (EEA and UK Users)",
    content: [
      "If you are in the EEA or UK, you have these rights under GDPR/UK GDPR:",
      "Right of Access (Art. 15) \u2014 Obtain confirmation of processing and receive a copy of your data in machine-readable format.",
      "Right to Rectification (Art. 16) \u2014 Request correction of inaccurate or incomplete data.",
      "Right to Erasure (Art. 17) \u2014 Request deletion (\"right to be forgotten\") when data is no longer necessary, you withdraw consent, or data was unlawfully processed.",
      "Right to Data Portability (Art. 20) \u2014 Receive your data in structured, machine-readable format and transmit to another controller.",
      "Right to Restrict Processing (Art. 18) \u2014 Request restriction when accuracy is contested or processing is objected to.",
      "Right to Object (Art. 21) \u2014 Object to processing based on legitimate interests or for direct marketing.",
      "Right to Withdraw Consent (Art. 7) \u2014 Withdraw consent at any time without affecting prior lawful processing.",
      "Legal Bases: Contract performance (Art. 6(1)(b)), legitimate interest (Art. 6(1)(f)), consent (Art. 6(1)(a)), legal obligation (Art. 6(1)(c)).",
      "Data Protection Officer: dpo@crontech.dev. You may lodge a complaint with your local supervisory authority.",
    ],
  },
  {
    title: "7. Your Rights Under CCPA (California Residents)",
    content: [
      "Right to Know. Request disclosure of categories and specific pieces of personal information collected, sources, purposes, and third-party sharing.",
      "Right to Delete. Request deletion, subject to legal retention exceptions.",
      "Right to Opt-Out of Sale. We do not sell personal information. We have never sold personal information.",
      "Right to Non-Discrimination. We will not discriminate against you for exercising your rights.",
      "Right to Correct. Request correction of inaccurate personal information.",
      "Right to Limit Sensitive Data Use. If applicable, limit use of sensitive personal information to what is necessary for the Service.",
      "To exercise rights: privacy@crontech.dev or account Settings. Response within 45 days.",
    ],
  },
  {
    title: "8. International Data Transfers",
    content: [
      "Crontech operates on a global edge network (330+ locations). Data may be processed in multiple jurisdictions.",
      "For EEA/UK/Switzerland transfers to non-adequate countries, we rely on: Standard Contractual Clauses (SCCs, Decision 2021/914), UK International Data Transfer Addendum, and supplementary measures including encryption.",
      "Enterprise customers may configure data residency restrictions. Contact enterprise@crontech.dev.",
    ],
  },
  {
    title: "9. Cookies and Tracking",
    content: [
      "See our Cookie Policy at /legal/cookies.",
      "Summary: Essential cookies for auth/sessions (no consent needed). Optional analytics cookies (opt-in, EU consent banner). No third-party advertising cookies. No cross-site tracking. No participation in advertising networks.",
    ],
  },
  {
    title: "10. Children's Privacy",
    content: [
      "The Service is not directed to children under 13 (or 16 in EEA/UK). We do not knowingly collect information from children under these ages.",
      "If we discover we have collected data from a child under the applicable age, we will immediately delete it and terminate the account.",
      "Parents/guardians: contact privacy@crontech.dev immediately if you believe your child provided personal information.",
    ],
  },
  {
    title: "11. Data Retention",
    content: [
      "Account Data: Duration of account + 30 days post-deletion for recovery. Then permanently deleted.",
      "Your Content: Until you delete it or close your account. 30-day export window after termination.",
      "Usage/Analytics Logs: 90 days identifiable, then aggregated and anonymized.",
      "Payment Records: 7 years per tax/financial regulations.",
      "Security/Audit Logs: 1 year per security and legal requirements.",
      "Server-Side AI Data: Not retained after request fulfillment unless you enable interaction history.",
      "Deletion method: Cryptographic erasure (key destruction) or secure overwrite.",
    ],
  },
  {
    title: "12. Changes to This Privacy Policy",
    content: [
      "Material changes: at least 30 days' notice via email and in-Service notice.",
      "Non-material changes: indicated by updated \"Last Updated\" date.",
      "Continued use after changes constitutes acceptance. If you disagree, discontinue use.",
    ],
  },
  {
    title: "13. Contact Information",
    content: [
      "General Privacy: privacy@crontech.dev",
      "Data Protection Officer: dpo@crontech.dev",
      "CCPA Requests: privacy@crontech.dev (subject: \"CCPA Request\")",
      "GDPR Requests: dpo@crontech.dev (subject: \"GDPR Request\")",
      "Crontech Technologies, Inc. \u2014 Contact: privacy@crontech.dev (Physical address available upon written request)",
      "We acknowledge privacy requests within 5 business days and respond within applicable legal timeframes (30 days GDPR, 45 days CCPA).",
    ],
  },
];

export default function PrivacyPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Privacy Policy"
        description="How Crontech collects, uses, and protects your personal data. GDPR, CCPA, and international compliance."
        path="/legal/privacy"
      />
      <div class="min-h-screen bg-[#0a0a0a] text-white">
        <div class="mx-auto max-w-4xl px-6 py-16 sm:px-8 lg:py-24">
          <Stack direction="vertical" gap="lg">
            <Stack direction="vertical" gap="sm">
              <Text variant="h1" weight="bold" class="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Privacy Policy
              </Text>
              <Text variant="caption" class="text-gray-500">
                Last updated: April 8, 2026 | Effective: April 8, 2026
              </Text>
            </Stack>
            <Separator />
            <For each={sections}>
              {(section) => (
                <Card padding="md" class="border border-white/[0.06] bg-white/[0.02]">
                  <Stack direction="vertical" gap="sm">
                    <Text variant="h4" weight="semibold" class="text-gray-100">
                      {section.title}
                    </Text>
                    <For each={section.content}>
                      {(paragraph) => (
                        <Text variant="body" class="text-gray-400 leading-relaxed">
                          {paragraph}
                        </Text>
                      )}
                    </For>
                  </Stack>
                </Card>
              )}
            </For>
          </Stack>
        </div>
      </div>
    </>
  );
}
