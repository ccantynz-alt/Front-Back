import { For } from "solid-js";
import type { JSX } from "solid-js";
import { Stack, Text, Card } from "@back-to-the-future/ui";
import { SEOHead } from "../../components/SEOHead";

interface Section { title: string; content: string }

const sections: Section[] = [
  { title: "1. What Are Cookies", content: "[ATTORNEY REVIEW REQUIRED] Cookies are small text files stored on your device when you visit our website. They help us provide, protect, and improve the Service." },
  { title: "2. Essential Cookies", content: "[ATTORNEY REVIEW REQUIRED] Required for the Service to function. Include: authentication tokens, session management, CSRF protection, user preferences (theme). These cannot be disabled." },
  { title: "3. Analytics Cookies", content: "[ATTORNEY REVIEW REQUIRED] Help us understand how users interact with the Service. Include: page views, feature usage, performance metrics. Can be disabled via cookie preferences." },
  { title: "4. Functional Cookies", content: "[ATTORNEY REVIEW REQUIRED] Enable enhanced functionality such as: AI model preferences, collaboration settings, editor configurations. Can be disabled but may reduce functionality." },
  { title: "5. Third-Party Cookies", content: "[ATTORNEY REVIEW REQUIRED] Our Service may include cookies from: Stripe (payment processing), Cloudflare (security and performance). These are governed by the respective third party's cookie policies." },
  { title: "6. Managing Cookies", content: "[ATTORNEY REVIEW REQUIRED] You can manage cookie preferences through: our cookie consent banner, your browser settings, the Settings page in your account. Note that disabling certain cookies may impact Service functionality." },
  { title: "7. Changes", content: "[ATTORNEY REVIEW REQUIRED] We may update this Cookie Policy from time to time. Changes will be reflected on this page with an updated date." },
];

export default function CookiesPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Cookie Policy"
        description="Learn how Marco Reid uses cookies to provide, protect, and improve our service."
        path="/legal/cookies"
      />
      <Stack direction="vertical" gap="lg" class="page-padded legal-page">
        <Stack direction="vertical" gap="sm">
          <Text variant="h1" weight="bold">Cookie Policy</Text>
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
