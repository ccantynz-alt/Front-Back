import type { JSX } from "solid-js";
import { Stack, Text, Card } from "@back-to-the-future/ui";
import { SEOHead } from "../../components/SEOHead";

export default function AcceptableUsePage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Acceptable Use Policy"
        description="Acceptable Use Policy for the Crontech platform. Rules governing prohibited content, prohibited activities, AI usage, resource limits, and enforcement."
        path="/legal/acceptable-use"
      />
      <Stack direction="vertical" gap="lg" class="page-padded legal-page">
        <Stack direction="vertical" gap="sm">
          <Text variant="h1" weight="bold">
            Acceptable Use Policy
          </Text>
          <Text variant="caption" class="text-muted">
            Last Updated: April 8, 2026
          </Text>
        </Stack>

        {/* Introduction */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="body">
              This Acceptable Use Policy ("AUP") governs your use of the
              Crontech platform, including all websites, APIs, AI features,
              collaboration tools, and related services (collectively, the
              "Service"). This AUP is incorporated by reference into the
              Crontech Terms of Service. By accessing or using the Service, you
              agree to comply with this AUP. Crontech reserves the right to
              modify this AUP at any time, with changes effective upon posting
              to this page. Your continued use of the Service after any
              modification constitutes acceptance of the updated AUP.
            </Text>
          </Stack>
        </Card>

        {/* Section 1: Prohibited Content */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              1. Prohibited Content
            </Text>
            <Text variant="body">
              You may not use the Service to create, store, transmit, display,
              distribute, or make available any content that:
            </Text>
            <Text variant="body">
              1.1. Violates any applicable local, state, national, or
              international law or regulation, including but not limited to
              export control laws, sanctions regulations, and consumer
              protection statutes.
            </Text>
            <Text variant="body">
              1.2. Contains, distributes, or facilitates the distribution of
              malware, viruses, trojans, ransomware, spyware, adware, worms,
              or any other malicious or destructive code designed to damage,
              disrupt, or gain unauthorized access to computer systems,
              networks, or data.
            </Text>
            <Text variant="body">
              1.3. Is designed to facilitate phishing, social engineering,
              credential harvesting, identity theft, or any other form of
              fraudulent activity intended to deceive individuals into
              disclosing sensitive information.
            </Text>
            <Text variant="body">
              1.4. Depicts, promotes, or facilitates child sexual abuse material
              ("CSAM") in any form. Crontech maintains a zero-tolerance policy
              for CSAM. Any suspected CSAM will be immediately reported to the
              National Center for Missing & Exploited Children (NCMEC) and
              applicable law enforcement agencies. Accounts associated with
              CSAM will be terminated immediately and permanently without prior
              notice.
            </Text>
            <Text variant="body">
              1.5. Constitutes, promotes, or facilitates harassment, bullying,
              stalking, intimidation, threats of violence, doxxing (publishing
              private information without consent), or any conduct intended to
              cause harm, fear, or distress to any individual or group.
            </Text>
            <Text variant="body">
              1.6. Infringes, misappropriates, or violates any third party's
              intellectual property rights, including copyrights, trademarks,
              patents, trade secrets, or rights of publicity or privacy. This
              includes but is not limited to unauthorized reproduction,
              distribution, or display of copyrighted works; use of trademarks
              in a manner likely to cause confusion; and misappropriation of
              proprietary information.
            </Text>
            <Text variant="body">
              1.7. Promotes terrorism, violent extremism, or incites violence
              against any individual, group, or institution.
            </Text>
            <Text variant="body">
              1.8. Contains unlawful discriminatory content targeting
              individuals or groups based on race, ethnicity, national origin,
              religion, gender, gender identity, sexual orientation, disability,
              age, or any other protected characteristic under applicable law.
            </Text>
          </Stack>
        </Card>

        {/* Section 2: Prohibited Activities */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              2. Prohibited Activities
            </Text>
            <Text variant="body">
              You may not engage in, facilitate, or attempt any of the following
              activities in connection with the Service:
            </Text>
            <Text variant="body">
              2.1. Bypassing, circumventing, disabling, or otherwise
              interfering with any security features, access controls,
              authentication mechanisms, rate limits, content safety filters, or
              usage restrictions of the Service or any connected systems.
            </Text>
            <Text variant="body">
              2.2. Reverse engineering, decompiling, disassembling, or
              otherwise attempting to derive the source code, algorithms, data
              models, or underlying architecture of any portion of the Service,
              except to the extent expressly permitted by applicable law
              notwithstanding this restriction.
            </Text>
            <Text variant="body">
              2.3. Using the Service's compute resources, including but not
              limited to client-side WebGPU inference, edge workers, or cloud
              GPU infrastructure, for cryptocurrency mining, blockchain
              validation, proof-of-work computation, or any computation
              unrelated to the intended functionality of the Service.
            </Text>
            <Text variant="body">
              2.4. Launching, facilitating, or participating in distributed
              denial-of-service (DDoS) attacks, denial-of-service (DoS)
              attacks, network flooding, packet manipulation, or any activity
              designed to degrade, disrupt, or render unavailable the Service or
              any third-party system.
            </Text>
            <Text variant="body">
              2.5. Reselling, sublicensing, redistributing, or otherwise making
              the Service or any portion thereof available to third parties on a
              commercial or non-commercial basis without the express written
              consent of Crontech, except as permitted under a valid reseller
              or partner agreement.
            </Text>
            <Text variant="body">
              2.6. Creating automated, bot-driven, or machine-generated
              accounts; operating multiple accounts for the purpose of evading
              enforcement actions; or using the Service through any automated
              means (including scripts, bots, spiders, scrapers, or crawlers)
              in a manner not expressly authorized by Crontech's published API
              documentation.
            </Text>
            <Text variant="body">
              2.7. Attempting to gain unauthorized access to other users'
              accounts, data, or sessions; intercepting or monitoring
              communications not intended for you; or accessing areas of the
              Service or its infrastructure that you are not authorized to
              access.
            </Text>
            <Text variant="body">
              2.8. Transmitting spam, unsolicited bulk communications, chain
              letters, or deceptive marketing materials through the Service.
            </Text>
          </Stack>
        </Card>

        {/* Section 3: AI-Specific Usage Rules */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              3. AI-Specific Usage Rules
            </Text>
            <Text variant="body">
              The Service provides AI-powered features including but not limited
              to content generation, code generation, image processing, video
              processing, and AI agent capabilities. The following rules apply
              to all AI features:
            </Text>
            <Text variant="body">
              3.1. Human Review Obligation. You are solely responsible for
              reviewing, verifying, and approving all AI-generated output before
              publishing, distributing, submitting to any court or regulatory
              body, or otherwise relying upon such output. AI-generated content
              may contain errors, inaccuracies, biases, or hallucinations.
              Crontech does not warrant the accuracy, completeness, or fitness
              for any particular purpose of any AI-generated output.
            </Text>
            <Text variant="body">
              3.2. No Deepfakes or Impersonation. You may not use the Service's
              AI features to create synthetic media (including but not limited
              to deepfake videos, audio, or images) that impersonates real
              individuals without their explicit written consent, or that is
              intended to deceive viewers into believing it represents real
              events or statements.
            </Text>
            <Text variant="body">
              3.3. No Disinformation Campaigns. You may not use the Service's
              AI features to generate, amplify, or distribute disinformation,
              misinformation, or propaganda intended to manipulate public
              opinion, interfere with democratic processes, or deceive
              individuals about matters of public concern.
            </Text>
            <Text variant="body">
              3.4. No Competitive Model Training. You may not use the Service,
              its AI features, or any output generated by the Service to train,
              fine-tune, distill, or otherwise develop competing AI models, AI
              services, or machine learning systems without the express written
              consent of Crontech.
            </Text>
            <Text variant="body">
              3.5. No Circumvention of Safety Controls. You may not attempt to
              bypass, manipulate, or override content safety filters, guardrails,
              or moderation systems built into the Service's AI features,
              including through prompt injection, jailbreaking, or adversarial
              input techniques.
            </Text>
            <Text variant="body">
              3.6. Disclosure of AI-Generated Content. Where required by
              applicable law or regulation, you must clearly disclose that
              content was generated or substantially assisted by AI when
              publishing or distributing such content.
            </Text>
            <Text variant="body">
              3.7. No High-Risk Autonomous Decision-Making. You may not use AI
              features for fully automated decision-making that produces legal
              effects or similarly significant effects on individuals (including
              but not limited to employment decisions, credit determinations,
              criminal risk assessments, or medical diagnoses) without
              meaningful human oversight.
            </Text>
          </Stack>
        </Card>

        {/* Section 4: Resource Limits and Fair Use */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              4. Resource Limits and Fair Use
            </Text>
            <Text variant="body">
              4.1. Fair Use. The Service is provided for its intended purposes.
              You agree to use the Service's compute, storage, bandwidth, and
              AI inference resources in a reasonable manner consistent with your
              subscription tier. Usage that is disproportionate to legitimate
              use of the Service's features, or that degrades the experience
              for other users, constitutes a violation of this AUP.
            </Text>
            <Text variant="body">
              4.2. Throttling and Rate Limiting. Crontech reserves the right to
              throttle, rate-limit, queue, or temporarily suspend access to any
              Service feature or resource when usage exceeds published limits,
              when necessary to maintain Service stability, or when usage
              patterns indicate abuse. Crontech will make reasonable efforts to
              notify affected users before or promptly after imposing
              restrictions.
            </Text>
            <Text variant="body">
              4.3. Published Limits. Specific resource limits (including API
              request quotas, storage allocations, AI inference token budgets,
              and bandwidth allowances) are documented on the Crontech pricing
              page and in your subscription agreement. These limits may be
              updated from time to time with reasonable notice.
            </Text>
            <Text variant="body">
              4.4. No Resource Abuse. You may not deliberately consume
              excessive resources through inefficient code, recursive loops,
              excessive API polling, storage of redundant data, or any other
              technique designed to exploit or strain the Service's
              infrastructure.
            </Text>
          </Stack>
        </Card>

        {/* Section 5: Enforcement */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              5. Enforcement
            </Text>
            <Text variant="body">
              5.1. Investigation. Crontech reserves the right to investigate
              any suspected violation of this AUP. Investigation may include
              reviewing content, logs, and usage patterns associated with your
              account, and cooperating with law enforcement authorities when
              required by law or when Crontech reasonably believes it is
              necessary to protect the safety of any person or the integrity of
              the Service.
            </Text>
            <Text variant="body">
              5.2. Graduated Enforcement. For violations that Crontech
              determines, in its sole discretion, do not pose an immediate
              threat, the following graduated enforcement process will generally
              apply: (a) Written warning specifying the violation and required
              corrective action; (b) Temporary suspension of the account or
              specific Service features, with notice of the duration and
              conditions for reinstatement; (c) Permanent termination of the
              account and all associated data.
            </Text>
            <Text variant="body">
              5.3. Immediate Action for Severe Violations. Crontech reserves
              the right to immediately suspend or terminate any account, without
              prior warning, for violations that Crontech determines, in its
              sole discretion, pose an immediate threat to the safety of any
              person, the integrity of the Service, or the rights of third
              parties. Severe violations include but are not limited to: CSAM
              (zero tolerance), active distribution of malware, ongoing DDoS
              attacks, credible threats of violence, and law enforcement
              requests.
            </Text>
            <Text variant="body">
              5.4. Content Removal. Crontech may remove, disable access to, or
              modify any content that violates this AUP, with or without notice
              to the content owner. Crontech is not obligated to store,
              maintain, or return any content removed pursuant to this AUP.
            </Text>
            <Text variant="body">
              5.5. Appeals. If your account has been suspended or terminated
              under this AUP, you may submit a written appeal to
              abuse@crontech.dev within thirty (30) calendar days of the
              enforcement action. Your appeal must include: your account
              identifier, the specific enforcement action you are appealing, a
              detailed explanation of why you believe the action was taken in
              error, and any supporting evidence. Crontech will review your
              appeal and respond within fifteen (15) business days. Crontech's
              decision on appeal is final. The appeal process does not apply to
              violations involving CSAM, which are non-appealable.
            </Text>
            <Text variant="body">
              5.6. Reporting by Users. If you become aware of any content or
              activity on the Service that violates this AUP, you may report it
              to abuse@crontech.dev. Crontech will review all reports in a
              timely manner but does not guarantee a specific response time.
            </Text>
            <Text variant="body">
              5.7. Preservation of Rights. Enforcement actions taken under this
              AUP do not limit Crontech's right to pursue any other remedies
              available under the Terms of Service, applicable law, or equity,
              including but not limited to seeking injunctive relief, monetary
              damages, and referral to law enforcement authorities.
            </Text>
          </Stack>
        </Card>

        {/* Section 6: Contact */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              6. Contact Information
            </Text>
            <Text variant="body">
              To report violations of this Acceptable Use Policy, to submit an
              appeal, or to ask questions about this AUP, contact us at:
            </Text>
            <Text variant="body">
              Email: abuse@crontech.dev
            </Text>
            <Text variant="body">
              Please include "AUP Report" or "AUP Appeal" in the subject line
              of your email. We will acknowledge receipt within two (2) business
              days.
            </Text>
          </Stack>
        </Card>

        {/* Section 7: Additional Protections - DRAFT */}
        <Card padding="md">
          <Stack direction="vertical" gap="sm">
            <Text variant="h4" weight="semibold">
              7. Additional Protections (DRAFT &mdash; requires attorney review)
            </Text>
            <Text variant="body">
              DRAFT &mdash; requires attorney review. Nothing in this AUP
              waives, diminishes, or otherwise limits any protection,
              disclaimer, limitation of liability, indemnification,
              class-action waiver, binding-arbitration clause, AS-IS /
              AS-AVAILABLE disclaimer, no-consequential-damages exclusion,
              governing-law choice, export-controls clause, 18+ age
              requirement, or 30-day notice provision set forth in the Terms
              of Service. AUP enforcement actions (including suspension,
              termination, content removal, and referral to law enforcement)
              are in addition to any other remedy available to Crontech,
              and do not create any rights or remedies in favor of the
              user beyond the appeal process described in Section 5.5.
            </Text>
            <Text variant="body">
              Liability Cap. Crontech's total aggregate liability arising
              from any dispute over AUP enforcement, content removal, or
              account suspension is capped per the Terms of Service at the
              greater of (a) fees paid in the twelve (12) months preceding
              the claim or (b) one hundred U.S. dollars ($100), subject to
              the lower $50 cap during any beta or early-access phase per
              the Beta Disclaimer.
            </Text>
            <Text variant="body">
              No Consequential Damages. Crontech is not liable for lost
              profits, lost revenue, lost data, lost goodwill, business
              interruption, or any indirect, incidental, special,
              consequential, exemplary, or punitive damages arising from
              AUP enforcement actions, even if advised of the possibility.
            </Text>
            <Text variant="body">
              AS-IS / AS-AVAILABLE. The Service, including content-moderation
              systems, automated safety filters, and abuse-detection
              tooling, is provided AS-IS and AS-AVAILABLE without warranties
              of any kind.
            </Text>
            <Text variant="body">
              AI Output Disclaimer. AI-based moderation, abuse detection,
              and safety classification may produce incorrect or incomplete
              results. We intend that moderation decisions be reviewed by
              humans where material rights are affected. You remain solely
              responsible for the content you upload and the actions you
              take on the Service.
            </Text>
            <Text variant="body">
              Customer Indemnification. You agree to indemnify, defend, and
              hold harmless Crontech for any claim arising from your
              violation of this AUP, your content, your code, your outputs,
              and any third-party claim based on your use of the Service.
            </Text>
            <Text variant="body">
              Unilateral Suspension and Termination. Reaffirming Section 5:
              Crontech reserves the right to suspend or terminate access to
              the Service, unilaterally, for any reason or no reason,
              with notice where reasonably practicable. For severe
              violations (Section 5.3), no prior notice is required.
            </Text>
            <Text variant="body">
              Reverse Engineering Prohibited. Reaffirming Section 2.2: you
              may not reverse engineer, decompile, disassemble, or otherwise
              attempt to derive the source code, model weights, detection
              rules, or internal architecture of the Service, its
              moderation systems, or its AUP-enforcement infrastructure,
              except where such prohibition is unenforceable under
              applicable law.
            </Text>
            <Text variant="body">
              Force Majeure. Crontech is not liable for failures to
              enforce this AUP caused by events beyond reasonable control,
              including natural disasters, war, pandemics, government
              actions, internet disruptions, or cyberattacks.
            </Text>
            <Text variant="body">
              Severability and Entire Agreement. If any provision of this
              AUP is unenforceable, the remainder remains in full force.
              This AUP, together with the Terms of Service and incorporated
              policies, constitutes the entire agreement with respect to
              acceptable use of the Service.
            </Text>
            <Text variant="body">
              Binding Individual Arbitration and Class-Action Waiver.
              Disputes over AUP enforcement, including appeals under
              Section 5.5, are subject to the binding individual
              arbitration clause and class-action waiver in the Terms of
              Service (AAA or JAMS), including the 30-day opt-out and
              small-claims carve-out.
            </Text>
            <Text variant="body">
              Governing Law: New Zealand. We intend that this AUP be
              governed by the laws of New Zealand, subject to mandatory
              local law and to US-specific carve-outs advised by counsel.
            </Text>
            <Text variant="body">
              Export Controls / US Sanctions. Reaffirming Section 1.1: you
              represent that you are not located in, and will not access
              the Service from, any jurisdiction under comprehensive US
              economic sanctions (Cuba, Iran, North Korea, Syria, Crimea,
              Donetsk, Luhansk), and that you are not on any US government
              restricted-party list (OFAC SDN, BIS Entity List, or
              equivalent).
            </Text>
            <Text variant="body">
              Age Requirement: 18+. You must be at least eighteen (18)
              years of age to use the Service. The age-13 / age-16-EEA
              language in the Terms of Service addresses child-privacy
              statutory obligations and does not authorize under-18 use.
            </Text>
            <Text variant="body">
              30-Day Notice for Terms Changes. We intend to provide at
              least thirty (30) days' notice by email and in-Service
              banner for any material change to this AUP.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </>
  );
}
