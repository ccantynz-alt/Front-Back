import { For } from "solid-js";
import type { JSX } from "solid-js";
import { Stack, Text, Card } from "@back-to-the-future/ui";
import { SEOHead } from "../../components/SEOHead";

interface Section { title: string; content: string }

const sections: Section[] = [
  { title: "1. Information We Collect", content: "[ATTORNEY REVIEW REQUIRED] We collect: (a) Personal information you provide (name, email, payment info via Stripe); (b) Usage data (pages visited, features used, AI interactions); (c) Device data (browser type, IP address, WebGPU capabilities); (d) Content you create or upload; (e) Collaboration data (edits, cursor positions, session participation)." },
  { title: "2. How We Use Information", content: "[ATTORNEY REVIEW REQUIRED] We use collected information to: provide and maintain the Service; process payments; improve AI features and model performance; send important notifications; detect and prevent fraud; comply with legal obligations." },
  { title: "3. Data Sharing & Third Parties", content: "[ATTORNEY REVIEW REQUIRED] We share data with: Stripe (payment processing); Cloudflare (hosting and CDN); AI model providers (for cloud inference — prompts may be sent to OpenAI or similar providers); Analytics providers. We do not sell personal information." },
  { title: "4. AI Data Processing", content: "[ATTORNEY REVIEW REQUIRED] When using AI features: Client-side inference (WebGPU) keeps data entirely on your device. Edge/cloud inference sends prompts to our servers and potentially to third-party AI providers. AI interaction data may be used to improve the Service. You can opt out of AI data collection in Settings." },
  { title: "5. Data Retention", content: "[ATTORNEY REVIEW REQUIRED] We retain personal data for as long as your account is active. Project data is retained for [PERIOD] after account deletion. Audit logs are retained for [PERIOD] per compliance requirements. You may request deletion at any time." },
  { title: "6. Data Security", content: "[ATTORNEY REVIEW REQUIRED] We implement: AES-256 encryption at rest; TLS 1.3 encryption in transit; Immutable audit trails with SHA-256 hash chaining; Role-based access controls; Regular security assessments. No system is 100% secure." },
  { title: "7. Your Rights (GDPR)", content: "[ATTORNEY REVIEW REQUIRED] If you are in the EEA/UK, you have the right to: Access your data; Rectify inaccurate data; Erase your data (\"right to be forgotten\"); Restrict processing; Data portability; Object to processing; Withdraw consent. Contact our DPO at [DPO EMAIL]." },
  { title: "8. Your Rights (CCPA)", content: "[ATTORNEY REVIEW REQUIRED] California residents have the right to: Know what personal information is collected; Delete personal information; Opt-out of the sale of personal information (we do not sell data); Non-discrimination for exercising rights." },
  { title: "9. Children's Privacy", content: "[ATTORNEY REVIEW REQUIRED] The Service is not intended for children under 13 (or 16 in the EEA). We do not knowingly collect personal information from children. If you believe we have collected data from a child, contact us immediately." },
  { title: "10. International Data Transfers", content: "[ATTORNEY REVIEW REQUIRED] Data may be transferred to and processed in countries outside your country of residence. We use Standard Contractual Clauses (SCCs) and other safeguards for international transfers. Edge computing infrastructure processes data at the nearest Cloudflare location." },
  { title: "11. Cookies", content: "[ATTORNEY REVIEW REQUIRED] We use essential cookies for authentication and session management. See our Cookie Policy for full details. You can manage cookie preferences at any time." },
  { title: "12. Changes to This Policy", content: "[ATTORNEY REVIEW REQUIRED] We will notify you of material changes via email or in-app notification at least 30 days before they take effect." },
  { title: "13. Contact & DPO", content: "[ATTORNEY REVIEW REQUIRED] Data Protection Officer: [NAME], [EMAIL]. Mailing address: [ADDRESS]. Supervisory Authority: [AUTHORITY NAME] (for EEA residents)." },
];

export default function PrivacyPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Privacy Policy"
        description="How Marco Reid collects, uses, and protects your personal data. GDPR, CCPA, and international compliance."
        path="/legal/privacy"
      />
      <Stack direction="vertical" gap="lg" class="page-padded legal-page">
        <Stack direction="vertical" gap="sm">
          <Text variant="h1" weight="bold">Privacy Policy</Text>
          <Text variant="caption" class="text-muted">Last updated: [DATE] | Effective: [DATE]</Text>
        </Stack>
        <For each={sections}>
          {(section) => (
            <Card padding="md">
              <Stack direction="vertical" gap="sm">
                <Text variant="h4" weight="semibold">{section.title}</Text>
                <Text variant="body">{section.content}</Text>
              </Stack>
            </Card>
          )}
        </For>
      </Stack>
    </>
  );
}
