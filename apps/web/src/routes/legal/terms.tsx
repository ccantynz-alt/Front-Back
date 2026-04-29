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
    title: "1. Acceptance of Terms",
    content: [
      "By accessing or using the Crontech platform, website, APIs, or any related services (collectively, the \"Service\"), you agree to be bound by these Terms of Service (\"Terms\"). If you do not agree to all of these Terms, you may not access or use the Service.",
      "You must be at least 13 years of age to use the Service. If you are located in the European Economic Area (EEA) or the United Kingdom, you must be at least 16 years of age.",
      "If you are using the Service on behalf of an organization, you represent and warrant that you have the authority to bind that organization to these Terms.",
      "These Terms constitute a legally binding agreement between you and Crontech Technologies, Inc. (\"Crontech,\" \"we,\" \"us,\" or \"our\"). By clicking \"I Agree,\" creating an account, or otherwise accessing the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms, our Privacy Policy, our Acceptable Use Policy, and our Cookie Policy, all of which are incorporated herein by reference.",
    ],
  },
  {
    title: "2. Description of Service",
    content: [
      "Crontech is an AI-native full-stack developer platform that provides integrated frontend hosting, backend API services, database management, artificial intelligence tools, and real-time collaboration capabilities. The Service includes, but is not limited to:",
      "\u2022 Frontend application hosting and deployment via global edge network (330+ locations)",
      "\u2022 Backend API infrastructure with serverless compute and edge functions",
      "\u2022 Database services including relational (PostgreSQL via Neon), edge SQLite (via Turso), and vector search (via Qdrant)",
      "\u2022 AI-powered development tools including code generation, website building, video processing, and content creation",
      "\u2022 Three-tier AI compute: client-side inference via WebGPU (runs entirely on your device), edge inference via Cloudflare Workers AI, and cloud inference via GPU clusters",
      "\u2022 Real-time collaborative editing powered by Conflict-free Replicated Data Types (CRDTs)",
      "\u2022 Authentication services including passkeys (WebAuthn/FIDO2), Google OAuth, and email/password",
      "We reserve the right to modify, suspend, or discontinue any part of the Service at any time. We will make commercially reasonable efforts to provide 30 days' notice for material changes.",
    ],
  },
  {
    title: "3. Account Registration and Security",
    content: [
      "To access certain features, you must create an account. When registering, you agree to: (a) provide accurate, current, and complete information; (b) maintain and promptly update your account information; (c) maintain the security and confidentiality of your login credentials; (d) accept responsibility for all activities that occur under your account; and (e) immediately notify us of any unauthorized use.",
      "Passwords are hashed using Argon2id and are never stored in plaintext. We strongly recommend enabling passkey authentication for maximum security.",
      "Each individual may maintain only one (1) account. Creating multiple accounts to circumvent restrictions or abuse free tier limits is grounds for immediate termination.",
      "We reserve the right to suspend or terminate any account that we reasonably believe violates these Terms, has been compromised, or poses a risk to the Service or other users.",
    ],
  },
  {
    title: "4. Subscription Plans, Billing, and Payments",
    content: [
      "The Service is offered in multiple tiers: Free, Pro, Team, and Enterprise. The Free tier is subject to usage limitations and is provided \"as-is\" without uptime guarantees.",
      "Paid subscriptions are billed in advance on either a monthly or annual basis through Stripe, Inc. By subscribing, you authorize Crontech to charge your designated payment method for all applicable fees. All fees are stated in U.S. dollars unless otherwise specified.",
      "Paid subscriptions automatically renew unless you cancel before the renewal date via the Settings page. Cancellation takes effect at the end of the current billing period.",
      "We may change pricing at any time. For existing subscribers, price changes take effect at the start of the next billing period following at least thirty (30) days' written notice via email.",
      "Refunds are available on a prorated basis within fourteen (14) days of the start of a new billing period. Refund requests must be submitted to billing@crontech.dev.",
      "If your payment method fails, we will attempt to charge it again over fourteen (14) days. If payment cannot be collected, your account may be downgraded to the Free tier.",
    ],
  },
  {
    title: "5. Acceptable Use",
    content: [
      "Your use of the Service is subject to our Acceptable Use Policy at /legal/acceptable-use, incorporated into these Terms by reference.",
      "Without limiting the foregoing, you agree not to: (a) use the Service for any unlawful purpose; (b) upload harmful, threatening, or objectionable content; (c) interfere with the integrity or performance of the Service; (d) attempt to gain unauthorized access to other accounts or systems; (e) distribute malware or phishing attempts; or (f) use automated means to circumvent rate limits.",
      "Violation may result in immediate suspension or termination of your account, at our sole discretion.",
    ],
  },
  {
    title: "6. Intellectual Property Rights",
    content: [
      "Platform Ownership. The Service, including all software, algorithms, user interfaces, designs, logos, trademarks, and other materials created by Crontech (\"Crontech IP\"), is our exclusive property, protected by U.S. and international intellectual property laws.",
      "Your Content. You retain all rights, title, and interest in content, code, data, and materials you create, upload, or store using the Service (\"Your Content\"). Crontech does not claim any ownership rights in Your Content.",
      "Limited License to Crontech. You grant Crontech a limited, non-exclusive, worldwide, royalty-free license to host, store, transmit, display, and distribute Your Content solely as necessary to provide the Service. This license terminates when you delete Your Content or close your account.",
      "Feedback. If you provide suggestions or feedback about the Service, you grant Crontech an irrevocable, non-exclusive, worldwide, royalty-free license to use and incorporate such Feedback without obligation to you.",
    ],
  },
  {
    title: "7. AI-Generated Content and AI-Specific Terms",
    content: [
      "Ownership of AI Output. Content generated by AI features based on your prompts and inputs is considered Your Content. You are the owner of AI Output to the fullest extent permitted by applicable law.",
      "No Training on Your Content. Crontech does not use Your Content or AI interactions to train, fine-tune, or improve AI models. Your data is processed solely to generate the requested output.",
      "Client-Side AI Privacy. When you use client-side AI features powered by WebGPU, all processing occurs entirely within your browser on your device. No prompts, inputs, outputs, or intermediate data are transmitted to Crontech's servers or any third party.",
      "Server-Side AI Processing. Edge or cloud AI features transmit prompts to our servers or third-party providers for processing, handled per our Privacy Policy and not retained beyond fulfilling your request.",
      "No Warranty of AI Accuracy. AI Output is provided \"as-is.\" Crontech makes no representations regarding the accuracy, completeness, reliability, or fitness of AI Output. AI may produce incorrect, biased, or misleading results. You are solely responsible for reviewing and validating AI Output.",
      "AI Output is not a substitute for professional advice. Do not rely on AI Output for legal, medical, financial, or other professional decisions without independent human review.",
      "AI Output Liability. CRONTECH SHALL NOT BE LIABLE FOR ANY CLAIMS, DAMAGES, LOSSES, OR EXPENSES ARISING FROM OR RELATED TO AI-GENERATED OUTPUT, INCLUDING BUT NOT LIMITED TO: (A) INACCURATE, INCOMPLETE, OR MISLEADING CONTENT; (B) CONTENT THAT INFRINGES THIRD-PARTY INTELLECTUAL PROPERTY RIGHTS; (C) DECISIONS MADE BASED ON AI OUTPUT; (D) FINANCIAL, LEGAL, MEDICAL, OR OTHER PROFESSIONAL LOSSES RESULTING FROM RELIANCE ON AI OUTPUT. YOU ASSUME ALL RISK ASSOCIATED WITH AI-GENERATED CONTENT.",
      "AI Output and Third-Party IP. You are solely responsible for ensuring that AI-generated content does not infringe any third-party intellectual property rights before publishing, distributing, or commercially using such content. Crontech provides no indemnification for intellectual property claims arising from AI-generated output.",
    ],
  },
  {
    title: "8. Data and Privacy",
    content: [
      "Our collection, use, and disclosure of personal information is governed by our Privacy Policy at /legal/privacy, incorporated into these Terms by reference.",
      "The Service operates on a globally distributed edge network. Your data may be processed at the edge location nearest to you, which may be in a different jurisdiction. By using the Service, you consent to transfer and processing per our Privacy Policy.",
      "GDPR rights (EEA/UK users) and CCPA/CPRA rights (California residents) are preserved and described in our Privacy Policy.",
    ],
  },
  {
    title: "9. Service Level Agreement and Uptime",
    content: [
      "Free tier accounts are provided on a best-effort basis without uptime guarantees.",
      "Paid subscribers are covered by our SLA at /legal/sla, incorporated by reference, providing uptime commitments and service credit calculations.",
      "Crontech is not liable for downtime caused by: (a) scheduled maintenance (48hr advance notice); (b) force majeure; (c) your ISP or equipment; (d) third-party services; (e) your misuse of the Service; or (f) DDoS attacks.",
    ],
  },
  {
    title: "10. Limitation of Liability",
    content: [
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, CRONTECH SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, GOODWILL, OR DATA, WHETHER IN CONTRACT, TORT, STRICT LIABILITY, OR OTHERWISE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.",
      "CRONTECH'S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE GREATER OF: (A) THE AMOUNT YOU PAID IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM; OR (B) ONE HUNDRED U.S. DOLLARS ($100).",
      "THE FREE TIER IS PROVIDED \"AS IS\" AND \"AS AVAILABLE\" WITHOUT WARRANTIES OF ANY KIND, EXPRESS, IMPLIED, OR STATUTORY.",
      "Some jurisdictions do not allow exclusion of certain damages. In such jurisdictions, limitations apply to the fullest extent permitted.",
      "BETA AND EARLY ACCESS DISCLAIMER. DURING ANY BETA, EARLY ACCESS, OR PREVIEW PERIOD, THE SERVICE IS PROVIDED ON AN \"AS-IS\" AND \"AS-AVAILABLE\" BASIS WITHOUT ANY WARRANTIES WHATSOEVER. CRONTECH MAKES NO COMMITMENTS REGARDING UPTIME, DATA PRESERVATION, FEATURE AVAILABILITY, OR SERVICE CONTINUITY DURING BETA PERIODS. USE OF BETA FEATURES IS ENTIRELY AT YOUR OWN RISK.",
    ],
  },
  {
    title: "11. Indemnification",
    content: [
      "You agree to indemnify, defend, and hold harmless Crontech, its affiliates, officers, directors, employees, and agents from any claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising from: (a) your use of the Service; (b) Your Content; (c) your violation of these Terms; (d) your violation of any law or third-party right.",
      "Crontech reserves the right, at your expense, to assume exclusive defense of any matter for which you must indemnify us. You shall not settle any claim without our prior written consent.",
    ],
  },
  {
    title: "12. Dispute Resolution and Arbitration",
    content: [
      "Governing Law. These Terms are governed by the laws of the State of Delaware, without regard to conflict of laws provisions.",
      "Binding Arbitration. Disputes shall be settled by binding arbitration administered by the American Arbitration Association (AAA) under its Commercial Arbitration Rules. Arbitration shall be conducted by a single arbitrator in Wilmington, Delaware, or via videoconference at claimant's election.",
      "CLASS ACTION WAIVER. EACH PARTY MAY BRING CLAIMS ONLY IN INDIVIDUAL CAPACITY, NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION.",
      "Small Claims Exception. Either party may bring an individual action in small claims court.",
      "Opt-Out. You may opt out of arbitration by sending written notice to legal@crontech.dev within thirty (30) days of first accepting these Terms.",
    ],
  },
  {
    title: "13. Termination",
    content: [
      "Termination by You. You may terminate via Settings or by contacting support@crontech.dev. Access to paid features ceases at end of current billing period.",
      "Termination by Crontech. We may suspend or terminate your account: (a) immediately for material breach or AUP violation; (b) immediately if required by law; (c) with thirty (30) days' notice for any other reason.",
      "Data Export. Upon termination, you have thirty (30) days to export Your Content. After this period, we may permanently delete Your Content.",
      "Survival. Sections on Intellectual Property, Limitation of Liability, Indemnification, Dispute Resolution, and any provision that by nature should survive, shall survive termination.",
    ],
  },
  {
    title: "14. Modifications to Terms",
    content: [
      "We may modify these Terms at any time. For material changes, we provide at least thirty (30) days' notice via email and/or prominent in-Service notice.",
      "Non-material changes may be made without advance notice, indicated by an updated \"Last Updated\" date.",
      "Continued use after the effective date of modifications constitutes acceptance. If you disagree, discontinue use and terminate your account.",
    ],
  },
  {
    title: "15. General Provisions",
    content: [
      "Entire Agreement. These Terms, together with the Privacy Policy, AUP, Cookie Policy, SLA, AI Disclosure, and DMCA Policy, constitute the entire agreement and supersede all prior agreements.",
      "Severability. If any provision is unenforceable, it shall be enforced to the maximum extent permissible; remaining provisions remain in full force.",
      "Waiver. Failure to enforce any right shall not constitute a waiver.",
      "Assignment. You may not assign these Terms without our consent. We may assign in connection with a merger, acquisition, or asset sale.",
      "Force Majeure. We are not liable for failures caused by events beyond reasonable control, including natural disasters, war, epidemics, government actions, power failures, internet disruptions, or cyberattacks.",
      "Notices. Notices to Crontech: legal@crontech.dev. Notices to you: email on your account. Deemed given 24 hours after sending.",
      "Independent Contractor. Crontech is an independent technology provider. Nothing in these Terms creates an employment, agency, partnership, or joint venture relationship between you and Crontech.",
      "No Professional Advice. The Service, including all AI features, does not constitute legal, financial, medical, tax, or any other professional advice. Consult qualified professionals before making decisions based on information obtained through the Service.",
    ],
  },
  {
    title: "16. Contact Information",
    content: [
      "Email: legal@crontech.dev",
      "Billing: billing@crontech.dev",
      "Support: support@crontech.dev",
      "Crontech Technologies, Inc. \u2014 Contact: legal@crontech.dev (Physical address available upon written request)",
    ],
  },
  {
    title: "17. Aggressive Protection Clauses (DRAFT \u2014 requires attorney review)",
    content: [
      "DRAFT \u2014 requires attorney review. This section consolidates and strengthens the protections set forth above. Nothing in this Section 17 weakens any existing protection; where duplicative, the stronger protection controls.",
      "17.1 Binding Individual Arbitration. Disputes are resolved by binding individual arbitration before the American Arbitration Association (AAA) or, at Crontech's election, JAMS, under each body's applicable Commercial Arbitration Rules. Arbitration is conducted by a single arbitrator, in English, by videoconference where permitted. The arbitrator, not a court, decides all issues relating to enforceability, arbitrability, and scope of this clause. See also Section 12.",
      "17.2 Class-Action Waiver. Each party may bring claims only in an individual capacity. No class, consolidated, collective, mass, or representative actions. No private attorney general actions. If the class-action waiver is found unenforceable, the entire arbitration clause is severable at Crontech's election.",
      "17.3 30-Day Opt-Out. You may opt out of arbitration (Sections 12 and 17.1) by emailing legal@crontech.dev within thirty (30) days of first accepting these Terms, with subject line \"Arbitration Opt-Out\" and including your account email. Opt-out does not affect the class-action waiver or any other provision.",
      "17.4 Small Claims Carve-Out. Either party may bring a qualifying individual claim in small-claims court in the claimant's jurisdiction of residence.",
      "17.5 Liability Cap. Reaffirming Section 10: total aggregate liability is capped at the GREATER of (a) fees paid in the twelve (12) months preceding the claim or (b) one hundred U.S. dollars ($100). During any beta or early-access phase, the Beta Disclaimer imposes a lower $50 cap that controls per the conflict rule in the Beta Disclaimer.",
      "17.6 No Consequential Damages. Reaffirming Section 10: Crontech is not liable for lost profits, lost revenue, lost data, lost goodwill, business interruption, or any indirect, incidental, special, consequential, exemplary, or punitive damages, even if advised of the possibility.",
      "17.7 AS-IS / AS-AVAILABLE. The Service, including all AI features and all beta features, is provided AS-IS and AS-AVAILABLE, without warranties of any kind \u2014 express, implied, or statutory \u2014 including merchantability, fitness for a particular purpose, non-infringement, accuracy, availability, or uninterrupted operation. Some jurisdictions do not allow exclusion of implied warranties; in those jurisdictions, exclusions apply to the fullest extent permitted.",
      "17.8 AI Output Disclaimer. AI output is informational only. It is not legal, medical, financial, tax, engineering, or safety-critical advice. You are solely responsible for independent verification before acting on any AI output. See also Section 7.",
      "17.9 Customer Indemnification. You agree to indemnify, defend, and hold harmless Crontech, its affiliates, officers, directors, employees, and agents from any claim, liability, damage, loss, cost, or expense (including reasonable attorneys' fees) arising from your use of the Service, your content, your code, your AI outputs, your customer interactions, and your violation of these Terms or applicable law. Reaffirming Section 11.",
      "17.10 Unilateral Suspension and Termination. Crontech reserves the right to suspend or terminate your access to the Service, unilaterally, for any reason or no reason, with notice where reasonably practicable, including for suspected violation of these Terms, risk to the Service or other users, or to comply with applicable law.",
      "17.11 Reverse Engineering Prohibited. You may not reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, model weights, or internal architecture of the Service, except to the extent this prohibition is unenforceable under applicable law.",
      "17.12 Force Majeure. Reaffirming Section 15: Crontech is not liable for delays or failures caused by events beyond reasonable control, including natural disasters, war, terrorism, pandemics, epidemics, government actions, power failures, internet or telecommunications disruptions, third-party service outages, labor disputes, and cyberattacks.",
      "17.13 Severability and Entire Agreement. Reaffirming Section 15: if any provision is unenforceable, it is enforced to the maximum extent permitted and the remainder remains in full force. These Terms, together with the Privacy Policy, AUP, Cookie Policy, SLA, AI Disclosure, DMCA Policy, and Beta Disclaimer, constitute the entire agreement and supersede all prior agreements.",
      "17.14 Governing Law \u2014 New Zealand. We intend that these Terms be governed by the laws of New Zealand, without regard to conflict-of-laws principles, and that New Zealand courts have non-exclusive jurisdiction for claims that fall outside the arbitration clause. This replaces and supersedes the Delaware choice-of-law language in Section 12 for purposes of international enforcement. DRAFT \u2014 attorney to confirm enforceability against US, EU, and UK consumers and to advise on US-specific carve-outs where NZ law cannot validly govern.",
      "17.15 Export Controls / US Sanctions. You represent and warrant that: (a) you are not located in, under the control of, or a resident or national of any country subject to comprehensive US economic sanctions (including Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk, and Luhansk regions of Ukraine); (b) you are not on the US Treasury OFAC Specially Designated Nationals (SDN) list, the US Commerce Bureau of Industry and Security (BIS) Entity List or Denied Persons List, or any equivalent restricted-party list under the law of any other jurisdiction; and (c) you will not use or export the Service in violation of US or any other applicable export-control or sanctions law.",
      "17.16 Age Requirement: 18+. You must be at least eighteen (18) years of age to create an account or use the Service. Where Section 1 references age 13 (or 16 EEA/UK), that language addresses child-privacy statutory obligations and does not authorize under-18 use of the platform. Accounts discovered to belong to users under 18 will be terminated.",
      "17.17 30-Day Notice for Terms Changes. For material changes to these Terms, Crontech provides at least thirty (30) days' notice by email and in-Service banner. Reaffirming Section 14.",
      "17.18 No Weakening of Existing Protections. In the event any provision in this Section 17 is interpreted as weaker than a corresponding provision elsewhere in these Terms or incorporated policies, the stronger provision controls. Section 17 is additive only.",
    ],
  },
];

export default function TermsPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Terms of Service"
        description="Terms of Service for the Crontech platform. Read about usage rights, AI-generated content, payments, and more."
        path="/legal/terms"
      />
      <Box class="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
        <Container size="full" padding="md" class="max-w-4xl py-16 sm:px-8 lg:py-24">
          <Stack direction="vertical" gap="lg">
            <Stack direction="vertical" gap="sm">
              <Text variant="h1" weight="bold" class="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Terms of Service
              </Text>
              <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
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
