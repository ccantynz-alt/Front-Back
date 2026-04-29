import { For } from "solid-js";
import type { JSX } from "solid-js";
import { Box, Container, Stack, Text, Card, Separator } from "@back-to-the-future/ui";
import { SEOHead } from "../../components/SEOHead";

interface Section {
  title: string;
  content: string[];
}

const sections: Section[] = [
  {
    title: "1. Early Access / Beta Status",
    content: [
      "The Crontech platform (\"Service\") is currently in an early access / beta phase. By accessing or using the Service during this period, you acknowledge and agree that the Service is under active development and is not yet a generally available, production-stable release.",
      "\"Beta\" and \"Early Access\" refer to any version of the Service that has not been designated as a general availability (GA) release by Crontech Technologies, Inc. (\"Crontech,\" \"we,\" \"us,\" or \"our\"). This includes, but is not limited to, features labeled as \"Beta,\" \"Preview,\" \"Experimental,\" \"Alpha,\" or \"Early Access\" within the Service interface.",
      "This Beta & Early Access Disclaimer (\"Beta Terms\") supplements and is incorporated into the main Terms of Service (/legal/terms). In the event of a conflict between these Beta Terms and the main Terms of Service, these Beta Terms shall control with respect to beta and early access features. All other provisions of the Terms of Service remain in full force and effect.",
    ],
  },
  {
    title: "2. Feature Changes and Availability",
    content: [
      "Features, functionality, interfaces, and APIs available during the beta period may be changed, modified, reclassified, or removed at any time without prior notice. We are under no obligation to maintain, support, or continue offering any specific feature that is available during beta.",
      "Specific capabilities that may be subject to change include, but are not limited to: AI-powered tools and agents, collaboration features, database and storage configurations, deployment workflows, API endpoints and their behavior, user interface layouts and navigation, integration connectors, and performance characteristics.",
      "We will make commercially reasonable efforts to communicate material changes through in-Service notifications, email to registered users, or updates to our changelog. However, during the beta period, changes may occur rapidly and without advance notice as we iterate on the platform.",
    ],
  },
  {
    title: "3. AI Features Disclaimer",
    content: [
      "All artificial intelligence features within the Service \u2014 including but not limited to AI code generation, AI website building, AI video processing, AI content creation, AI-assisted collaboration, client-side inference via WebGPU, edge inference, and cloud inference \u2014 are provided on an \"AS-IS\" and \"AS-AVAILABLE\" basis with no warranty of accuracy, completeness, reliability, or fitness for any particular purpose.",
      "AI-generated output may contain errors, inaccuracies, biases, hallucinations, or content that is factually incorrect, misleading, or inappropriate. AI models are probabilistic systems and do not guarantee deterministic or correct results. The same input may produce different outputs at different times.",
      "AI-generated content is NOT a substitute for professional advice of any kind. Specifically, AI output from the Service does not constitute and should not be relied upon as: legal advice, medical advice, financial or investment advice, engineering or safety-critical advice, tax or accounting advice, or any other form of licensed professional counsel.",
      "You are solely responsible for reviewing, verifying, and validating all AI-generated content before using it for any purpose. Crontech expressly disclaims all liability for any decisions made or actions taken based on AI-generated output.",
    ],
  },
  {
    title: "4. Independent Verification of AI Output",
    content: [
      "Users must independently verify all AI-generated output before relying on it. This obligation applies to all AI features within the Service, including but not limited to: generated source code and configurations, website layouts and content, video edits and compositions, data analysis and summaries, and search results and recommendations.",
      "You should treat AI-generated output as a starting point or draft that requires human review, not as a finished product or authoritative source. Crontech does not guarantee that AI output is free from intellectual property infringement, compliant with any specific law or regulation, or suitable for any particular use case.",
      "For any use case involving legal, financial, medical, or safety-critical decisions, you must consult with appropriately licensed professionals and not rely solely on AI-generated content from the Service.",
    ],
  },
  {
    title: "5. Service Interruptions During Development",
    content: [
      "During the beta period, the Service may experience interruptions, downtime, degraded performance, data processing delays, or temporary unavailability. These interruptions may occur without prior notice and may result from: scheduled and unscheduled maintenance, infrastructure upgrades and migrations, deployment of new features or bug fixes, load testing and performance optimization, security patches and updates, or third-party service provider outages.",
      "The Service Level Agreement (/legal/sla) uptime guarantees, if any, may be reduced or inapplicable during the beta period. We will make reasonable efforts to minimize disruption, but we do not guarantee uninterrupted access to the Service during beta.",
      "We recommend that you maintain independent backups of any critical data and do not use the beta Service as your sole production environment for mission-critical workloads.",
    ],
  },
  {
    title: "6. Data During Beta",
    content: [
      "Data created, uploaded, or generated during the beta period \u2014 including but not limited to projects, files, configurations, databases, AI-generated content, and user settings \u2014 may be migrated to the general availability release, but migration is not guaranteed.",
      "While we will make commercially reasonable efforts to preserve and migrate user data when transitioning from beta to general availability, certain data may be lost, corrupted, or require re-creation due to: schema changes and database migrations, architectural changes to the storage layer, changes in data formats or encoding, feature removals that affect stored data, or security-related data resets.",
      "You are responsible for maintaining your own backups of any data stored within the Service during the beta period. We strongly recommend exporting critical data regularly using the Service's export tools.",
      "We will provide at least fourteen (14) days' notice before any planned action that would result in permanent data loss for beta users.",
    ],
  },
  {
    title: "7. Pricing During Beta",
    content: [
      "Pricing for the Service during the beta period is introductory and subject to change. Current pricing tiers, feature allocations, usage limits, and billing terms may be modified at any time as we refine our pricing model based on usage patterns, cost analysis, and market feedback.",
      "Changes to pricing will not apply retroactively to the current billing period. For any pricing increases, we will provide at least thirty (30) days' advance notice via email to the address associated with your account.",
      "Free tier limits available during beta may be adjusted (increased or decreased) upon general availability. Features currently available in lower tiers may be moved to higher tiers in the GA release.",
      "Any promotional pricing, beta discounts, or introductory offers are valid only for the period specified and are not guaranteed to continue beyond the beta phase.",
    ],
  },
  {
    title: "8. Acceptance of Beta Terms",
    content: [
      "By accessing or using the Service during the beta period, you expressly acknowledge that you have read, understood, and agree to be bound by these Beta Terms in addition to the main Terms of Service (/legal/terms), Privacy Policy (/legal/privacy), Cookie Policy (/legal/cookies), and Acceptable Use Policy (/legal/acceptable-use).",
      "Your continued use of the Service after any modification to these Beta Terms constitutes your acceptance of the modified terms. If you do not agree with any changes, you must discontinue use of the Service.",
      "DRAFT — requires attorney sign-off on enforceability. You acknowledge that you are using the beta Service at your own risk and that Crontech's total liability to you for any claims arising from or related to your use of beta features shall be limited to the greater of (a) the amount you paid for the Service in the twelve (12) months preceding the claim, or (b) fifty U.S. dollars ($50.00). This $50 cap is explicitly set as a pre-launch limit BELOW the $100 cap in the main Terms of Service, reflecting the experimental, unstable, and pre-production nature of the beta phase. See Section 12 for the conflict-resolution rule.",
    ],
  },
  {
    title: "9. Relationship to Terms of Service",
    content: [
      "These Beta Terms supplement the main Terms of Service (/legal/terms) and do not replace them. All provisions of the Terms of Service \u2014 including but not limited to intellectual property rights, indemnification, limitation of liability, dispute resolution, and governing law \u2014 remain in full force and effect during the beta period.",
      "Where the Terms of Service provide for certain rights, remedies, or protections, these Beta Terms may impose additional limitations during the beta period. Upon general availability, the standard Terms of Service will apply without the additional beta limitations unless otherwise specified.",
      "Nothing in these Beta Terms creates any obligation for Crontech to release a general availability version of the Service, to continue operating the Service, or to offer any specific feature or capability in a future release.",
    ],
  },
  {
    title: "10. Feedback and Contributions",
    content: [
      "During the beta period, we may invite you to provide feedback, bug reports, feature requests, or other suggestions regarding the Service (\"Feedback\"). Any Feedback you provide is voluntary and non-confidential.",
      "By providing Feedback, you grant Crontech a worldwide, perpetual, irrevocable, royalty-free, fully sublicensable license to use, reproduce, modify, distribute, and display the Feedback for any purpose, including to improve the Service, without any obligation to you.",
      "We value your input and encourage you to report issues through the in-Service feedback tools, our support channels, or by contacting beta@crontech.dev.",
    ],
  },
  {
    title: "11. Contact Us",
    content: [
      "If you have questions about these Beta Terms, the beta program, or your participation in early access, please contact us at:",
      "Beta Program: beta@crontech.dev",
      "General Support: support@crontech.dev",
      "Legal Inquiries: legal@crontech.dev",
      "We will respond to beta-related inquiries within five (5) business days.",
    ],
  },
  {
    title: "12. Conflict With Main Terms (DRAFT \u2014 requires attorney review)",
    content: [
      "DRAFT \u2014 requires attorney review. In case of conflict between this Beta Disclaimer and the Terms of Service during the pre-launch phase, the Beta Disclaimer's lower liability cap ($50) controls over the main Terms' cap ($100). This is by design: beta use is riskier than GA use, so the cap is intentionally lower. Upon general availability, the main Terms' $100 cap governs and the $50 beta cap retires automatically without further notice.",
      "Cross-reference: the main Terms of Service (Section 10) cap total aggregate liability at the greater of (a) the amount you paid in the twelve (12) months preceding the claim, or (b) one hundred U.S. dollars ($100). During the beta phase, the Beta Disclaimer's $50 floor applies instead. On all other points (class-action waiver, binding arbitration, AS-IS / AS-AVAILABLE disclaimer, no-consequential-damages, customer indemnification, reverse-engineering prohibition, export controls, governing law, age requirement, 30-day notice for terms changes), the main Terms of Service apply with full force during beta.",
    ],
  },
  {
    title: "13. Additional Protections During Beta (DRAFT \u2014 requires attorney review)",
    content: [
      "DRAFT \u2014 requires attorney review. The following protections apply during the beta period in addition to all provisions of the main Terms of Service:",
      "Binding Individual Arbitration and Class-Action Waiver. We intend to require that all disputes arising from beta use be resolved through binding individual arbitration before the American Arbitration Association (AAA) or JAMS. No class, consolidated, or representative actions. You may opt out of arbitration within thirty (30) days of first accepting these Beta Terms by emailing legal@crontech.dev. Small claims court remains available for qualifying individual claims.",
      "No Consequential Damages. We intend that Crontech shall not be liable for any lost profits, lost data, business interruption, goodwill loss, or any indirect, incidental, special, consequential, exemplary, or punitive damages arising from beta use, even if we have been advised of the possibility of such damages.",
      "AS-IS / AS-AVAILABLE. The beta Service is provided AS-IS and AS-AVAILABLE with no warranties of any kind, express, implied, or statutory, including but not limited to merchantability, fitness for a particular purpose, non-infringement, accuracy, or uninterrupted operation.",
      "AI Output Disclaimer. AI features are informational only and are not legal, medical, financial, tax, engineering, or safety-critical advice. You are solely responsible for independent verification before acting on any AI output.",
      "Customer Indemnification. You agree to indemnify, defend, and hold harmless Crontech for any claim arising from your use of the beta Service, your content, your code, your outputs, and your violation of these Beta Terms or applicable law.",
      "Suspension / Termination. We reserve the right to suspend or terminate beta access, unilaterally, for any reason or no reason, with notice where reasonably practicable.",
      "Reverse Engineering Prohibited. You may not reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, model weights, or internal architecture of the Service, except to the extent such restriction is prohibited by applicable law.",
      "Force Majeure. We are not liable for failures caused by events beyond our reasonable control, including natural disasters, war, epidemics, government actions, internet disruptions, cyberattacks, or third-party outages.",
      "Severability and Entire Agreement. If any provision of these Beta Terms is unenforceable, the remainder remains in full force. These Beta Terms, together with the main Terms of Service and incorporated policies, constitute the entire agreement.",
      "Governing Law: New Zealand. We intend that these Beta Terms be governed by the laws of New Zealand, without regard to conflict-of-laws principles. Counsel to confirm enforceability against non-NZ users and to advise on US-specific carve-outs.",
      "Export Controls / US Sanctions. You represent that you are not located in, and will not access or use the Service from, any jurisdiction subject to comprehensive US economic sanctions (including but not limited to Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk, and Luhansk regions), and that you are not on any US government restricted-party list (OFAC SDN, BIS Entity List, or equivalent).",
      "Age Requirement: 18+. You must be at least 18 years of age to access or use the beta Service. Where the main Terms of Service permit use at age 13 (or 16 EEA/UK), the beta phase restricts access to 18+ only. If you are under 18, do not access the beta.",
      "30-Day Notice for Terms Changes. We intend to provide at least 30 days' notice by email and in-Service notification for any material change to these Beta Terms.",
    ],
  },
];

export default function BetaDisclaimerPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Beta & Early Access Disclaimer"
        description="Understand the terms of using Crontech during the beta and early access period. AI features are provided as-is. Features may change without notice."
        path="/legal/beta-disclaimer"
      />
      <Box class="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
        <Container size="full" padding="md" class="max-w-4xl py-16 sm:px-8 lg:py-24">
          <Stack direction="vertical" gap="lg">
            <Stack direction="vertical" gap="sm">
              <Text variant="h1" weight="bold" class="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Beta & Early Access Disclaimer
              </Text>
              <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
                Last updated: April 9, 2026 | Effective: April 9, 2026
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
                        <Text variant="body" class="leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                          {paragraph}
                        </Text>
                      )}
                    </For>
                  </Stack>
                </Card>
              )}
            </For>
          </Stack>
        </Container>
      </Box>
    </>
  );
}
