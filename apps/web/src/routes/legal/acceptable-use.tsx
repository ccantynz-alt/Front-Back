import { For } from "solid-js";
import type { JSX } from "solid-js";
import { Stack, Text, Card } from "@back-to-the-future/ui";
import { SEOHead } from "../../components/SEOHead";

interface Section { title: string; content: string }

const sections: Section[] = [
  { title: "1. Prohibited Uses", content: "[ATTORNEY REVIEW REQUIRED] You may not use the Service to: violate any law or regulation; generate harmful, threatening, abusive, or harassing content; impersonate any person or entity; distribute malware or engage in phishing; interfere with or disrupt the Service; attempt to gain unauthorized access to other accounts or systems; mine cryptocurrency; send spam or unsolicited communications." },
  { title: "2. AI Usage Guidelines", content: "[ATTORNEY REVIEW REQUIRED] When using AI features: Do not attempt to extract training data or model weights; Do not use AI to generate content that violates applicable laws; Do not use AI for automated decision-making that materially affects individuals without human oversight; Do not circumvent content safety filters; Report unexpected or harmful AI outputs." },
  { title: "3. Content Restrictions", content: "[ATTORNEY REVIEW REQUIRED] You may not create, upload, or distribute: content that infringes intellectual property rights; sexually explicit content involving minors; content promoting violence or terrorism; content that constitutes harassment or discrimination; personally identifiable information of others without consent; content that violates export control laws." },
  { title: "4. Resource Usage", content: "[ATTORNEY REVIEW REQUIRED] You may not: use the Service in a way that imposes an unreasonable load on our infrastructure; use automated tools to access the Service beyond normal API usage; resell or redistribute Service access without authorization; use client-side GPU inference to mine cryptocurrency or perform non-Service-related computation." },
  { title: "5. Enforcement", content: "[ATTORNEY REVIEW REQUIRED] Violations may result in: content removal, account suspension, account termination, legal action. We reserve the right to investigate and take appropriate action, including reporting violations to law enforcement authorities." },
];

export default function AcceptableUsePage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Acceptable Use Policy"
        description="Acceptable Use Policy for the Back to the Future platform. Guidelines for AI usage, content restrictions, and resource usage."
        path="/legal/acceptable-use"
      />
      <Stack direction="vertical" gap="lg" class="page-padded legal-page">
        <Stack direction="vertical" gap="sm">
          <Text variant="h1" weight="bold">Acceptable Use Policy</Text>
          <Text variant="caption" class="text-muted">Last updated: [DATE]</Text>
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
