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
    title: "1. What Are Cookies",
    content: [
      "Cookies are small text files that are placed on your device (computer, tablet, or mobile phone) when you visit a website. They are widely used to make websites work more efficiently, provide a better user experience, and supply information to site operators.",
      "Crontech Technologies, Inc. (\"Crontech,\" \"we,\" \"us,\" or \"our\") uses cookies and similar technologies on the Crontech platform (\"Service\") as described in this Cookie Policy. This policy explains what cookies we use, why we use them, and how you can control them.",
      "This Cookie Policy should be read alongside our Privacy Policy (/legal/privacy) and our Terms of Service (/legal/terms).",
    ],
  },
  {
    title: "2. Essential Cookies (Strictly Necessary)",
    content: [
      "Essential cookies are required for the Service to function. They enable core capabilities such as authentication, security, and session management. These cookies cannot be disabled without breaking fundamental Service functionality. Under GDPR and ePrivacy Directive, these cookies do not require consent because the Service cannot operate without them.",
      "\u2022 Authentication Session Token (ct_session) \u2014 An httpOnly, Secure, SameSite=Lax cookie that identifies your authenticated session after login. Without it, you would need to sign in on every page load. Duration: session (expires on browser close) or up to 30 days if \"Remember Me\" is selected. Type: first-party.",
      "\u2022 CSRF Protection Token (ct_csrf) \u2014 An httpOnly, Secure, SameSite=Strict cookie that protects against Cross-Site Request Forgery attacks. It ensures that form submissions and state-changing requests originate from our Service, not from a malicious third-party site. Duration: session. Type: first-party.",
      "\u2022 Load Balancing Identifier (ct_lb) \u2014 A cookie used by our edge infrastructure to route your requests to the same server during a session for consistent performance. Contains no personal information. Duration: session. Type: first-party.",
      "\u2022 Cookie Consent State (ct_consent) \u2014 Stores your cookie consent preferences so we do not re-prompt you on every visit. Duration: 365 days. Type: first-party.",
    ],
  },
  {
    title: "3. Functional Cookies (Preference Cookies)",
    content: [
      "Functional cookies enhance your experience by remembering choices you make and providing personalized features. They are not strictly necessary for the Service to operate, but disabling them may result in a less tailored experience. These cookies are set only after you interact with the relevant feature.",
      "\u2022 Theme Preference (ct_theme) \u2014 Stores your selected appearance mode (dark or light). Prevents a flash of the wrong theme on page load. Duration: 365 days. Type: first-party.",
      "\u2022 Language Preference (ct_lang) \u2014 Stores your selected display language so the interface renders in your preferred language across sessions. Duration: 365 days. Type: first-party.",
      "\u2022 Feature Flag State (ct_features) \u2014 Stores your opt-in or opt-out preferences for beta and experimental features. Used by our feature flag system to deliver the correct experience. Duration: 90 days. Type: first-party.",
      "\u2022 UI Preferences (ct_ui) \u2014 Stores layout and interface preferences such as sidebar collapsed state, default editor view, and dashboard layout configuration. Duration: 365 days. Type: first-party.",
      "You can manage functional cookies through the cookie consent banner, your account Settings page, or your browser settings. Disabling functional cookies will reset your preferences to defaults on each visit but will not prevent you from using the Service.",
    ],
  },
  {
    title: "4. Analytics Cookies (Opt-In Only)",
    content: [
      "Analytics cookies help us understand how users interact with the Service so we can improve performance, identify issues, and prioritize features. These cookies are OPT-IN ONLY. They are never set unless you have explicitly granted consent via our cookie consent banner.",
      "\u2022 Performance Metrics (ct_perf) \u2014 Collects anonymized performance data via OpenTelemetry, including page load times, API response times, and client-side rendering performance. Used solely to identify and fix performance regressions. Duration: 30 days. Type: first-party.",
      "\u2022 Page View Counter (ct_pv) \u2014 Records which pages you visit and how long you spend on them. Used to understand which features are popular and which may need improvement. All data is aggregated before analysis. Duration: 30 days. Type: first-party.",
      "\u2022 Feature Usage (ct_usage) \u2014 Tracks which Service features you use (e.g., AI builder, video editor, collaboration sessions) to help us prioritize development. Contains no content data \u2014 only feature identifiers and interaction counts. Duration: 30 days. Type: first-party.",
      "All analytics data is processed by Crontech's own infrastructure. Analytics data is NEVER sent to third-party analytics services, advertising networks, or data brokers. For users in the European Economic Area (EEA) and United Kingdom (UK), analytics cookies require explicit opt-in consent before they are set. You may withdraw consent at any time via the cookie consent banner or your account Settings page.",
    ],
  },
  {
    title: "5. What We Do NOT Use",
    content: [
      "Crontech is committed to a privacy-first approach. The following types of cookies and tracking technologies are NOT used on our Service and will never be used:",
      "\u2022 No third-party advertising cookies \u2014 We do not display ads and do not set cookies for advertising purposes.",
      "\u2022 No tracking pixels or web beacons \u2014 We do not embed invisible images or pixels that report your behavior to third parties.",
      "\u2022 No cross-site tracking \u2014 We do not track your activity across other websites or build cross-site behavioral profiles.",
      "\u2022 No Facebook Pixel \u2014 We do not use Meta/Facebook tracking technology.",
      "\u2022 No Google Ads or Google Analytics cookies \u2014 We do not participate in any Google advertising or analytics programs.",
      "\u2022 No retargeting or remarketing cookies \u2014 We do not follow you around the internet with ads after you visit our Service.",
      "\u2022 No data broker partnerships \u2014 We do not share cookie data or behavioral data with data brokers or data aggregators.",
      "This is a core part of our platform philosophy. Your data exists to serve you, not to serve advertisers.",
    ],
  },
  {
    title: "6. Third-Party Cookies",
    content: [
      "The Service integrates with a limited number of third-party services that may set their own cookies. We minimize third-party cookie usage and only integrate services that are essential to core functionality.",
      "\u2022 Stripe (Payment Processing) \u2014 When you access payment pages or complete a transaction, Stripe, Inc. may set cookies necessary for fraud prevention, payment authentication (including 3D Secure), and PCI DSS compliance. These cookies are governed by Stripe's Cookie Policy (https://stripe.com/cookies-policy/legal). We do not control Stripe's cookies, but they are used solely for payment processing and fraud detection \u2014 never for advertising.",
      "No other third-party services set cookies through our Service. Our edge infrastructure (Cloudflare) operates at the network level and does not set browser cookies on our domain.",
    ],
  },
  {
    title: "7. Cookie Table Summary",
    content: [
      "ESSENTIAL COOKIES (No consent required):",
      "\u2022 ct_session | Authentication session | Session or 30 days | First-party, httpOnly, Secure",
      "\u2022 ct_csrf | CSRF protection | Session | First-party, httpOnly, Secure, SameSite=Strict",
      "\u2022 ct_lb | Load balancing | Session | First-party",
      "\u2022 ct_consent | Consent preferences | 365 days | First-party",
      "FUNCTIONAL COOKIES (Consent required in EU/UK):",
      "\u2022 ct_theme | Theme preference (dark/light) | 365 days | First-party",
      "\u2022 ct_lang | Language preference | 365 days | First-party",
      "\u2022 ct_features | Feature flag state | 90 days | First-party",
      "\u2022 ct_ui | UI layout preferences | 365 days | First-party",
      "ANALYTICS COOKIES (Opt-in only, never third-party):",
      "\u2022 ct_perf | Performance metrics | 30 days | First-party",
      "\u2022 ct_pv | Page view counts | 30 days | First-party",
      "\u2022 ct_usage | Feature usage counts | 30 days | First-party",
      "THIRD-PARTY COOKIES:",
      "\u2022 Stripe cookies | Payment processing and fraud prevention | Varies | Third-party (Stripe, Inc.)",
    ],
  },
  {
    title: "8. How to Manage Cookies",
    content: [
      "You have several options for managing cookies on the Service:",
      "Cookie Consent Banner. When you first visit the Service (and periodically thereafter), a consent banner allows you to accept or reject non-essential cookie categories. You can change your preferences at any time by clicking the cookie settings link in the footer of any page.",
      "Account Settings. Logged-in users can manage cookie preferences from the Settings page within their account dashboard.",
      "Browser Settings. All modern browsers allow you to view, manage, and delete cookies. You can configure your browser to block all cookies, block third-party cookies, or prompt you before accepting cookies. Instructions vary by browser:",
      "\u2022 Chrome: Settings > Privacy and Security > Cookies and Other Site Data",
      "\u2022 Firefox: Settings > Privacy & Security > Cookies and Site Data",
      "\u2022 Safari: Preferences > Privacy > Manage Website Data",
      "\u2022 Edge: Settings > Cookies and Site Permissions > Manage and Delete Cookies and Site Data",
      "Important: Removing essential cookies (ct_session, ct_csrf) will sign you out and require re-authentication. Core functionality including authentication and cross-site request forgery prevention relies on these cookies.",
    ],
  },
  {
    title: "9. EU/GDPR Cookie Consent",
    content: [
      "For users in the European Economic Area (EEA), United Kingdom (UK), and other jurisdictions that require cookie consent under the ePrivacy Directive or equivalent local law:",
      "\u2022 Opt-In Model. Non-essential cookies (functional and analytics) are NOT set until you provide explicit, affirmative consent via our cookie consent banner. No pre-checked boxes. No implied consent from continued browsing.",
      "\u2022 Granular Control. You can consent to functional cookies independently of analytics cookies. You are never forced to accept all or nothing.",
      "\u2022 Easy Withdrawal. You can withdraw consent at any time by revisiting the cookie consent banner (accessible from the footer), adjusting preferences in your account Settings, or deleting cookies from your browser. Withdrawal is as easy as giving consent.",
      "\u2022 No Cookie Walls. Access to the Service is not conditional on accepting non-essential cookies. You can use the Service with only essential cookies enabled.",
      "\u2022 Consent Records. We maintain a record of when and how you provided consent, including the timestamp, categories consented to, and consent mechanism used. These records are retained for the duration required by applicable law.",
    ],
  },
  {
    title: "10. Changes to This Cookie Policy",
    content: [
      "We may update this Cookie Policy from time to time to reflect changes in our practices, technology, legal requirements, or for other operational reasons.",
      "Material Changes. For material changes (new cookie categories, new third-party integrations, changes to consent mechanisms), we will provide at least 30 days' advance notice via email to registered users and an in-Service notification banner. Your consent preferences will be reset so you can make an informed choice under the updated policy.",
      "Non-Material Changes. For minor updates (wording clarifications, formatting, cookie name changes that do not affect functionality), we will update the \"Last Updated\" date at the top of this page.",
      "We encourage you to review this Cookie Policy periodically. Continued use of the Service after changes take effect constitutes acceptance of the updated policy.",
    ],
  },
  {
    title: "11. Contact Us",
    content: [
      "If you have questions about this Cookie Policy, our use of cookies, or your cookie preferences, please contact us at:",
      "Cookie Inquiries: cookies@crontech.dev",
      "General Privacy: privacy@crontech.dev",
      "Data Protection Officer: dpo@crontech.dev",
      "We will respond to cookie-related inquiries within 10 business days.",
    ],
  },
  {
    title: "12. Additional Protections (DRAFT \u2014 requires attorney review)",
    content: [
      "DRAFT \u2014 requires attorney review. Nothing in this Cookie Policy waives, diminishes, or otherwise limits any protection, disclaimer, limitation of liability, indemnification, class-action waiver, binding-arbitration clause, AS-IS / AS-AVAILABLE disclaimer, no-consequential-damages exclusion, governing-law choice, export-controls clause, 18+ age requirement, or 30-day notice provision set forth in the Terms of Service. All such Terms of Service provisions apply in full force to any dispute relating to cookies or similar technologies.",
      "Liability Cap. Any claim arising from cookie usage is capped per the main Terms of Service (greater of fees paid in the prior 12 months or $100), subject to the $50 beta-phase cap while beta is in effect.",
      "AS-IS / AS-AVAILABLE. Cookie-based functionality is provided AS-IS and AS-AVAILABLE with no warranties of any kind.",
      "Customer Indemnification. You agree to indemnify Crontech for any claim arising from your interaction with cookie consent flows, your misrepresentation of consent on behalf of other users, or your configuration of browser or device settings that conflict with your stated preferences.",
      "Suspension / Termination. We reserve the right to suspend or terminate access, unilaterally, with notice where reasonably practicable, including where cookie-consent-bypass attempts are detected.",
      "Reverse Engineering Prohibited. You may not reverse engineer the cookie-consent infrastructure, consent-record cryptography, or related systems, except where such prohibition is unenforceable under applicable law.",
      "Export Controls / US Sanctions. Use of the Service, including the cookie consent flow, is subject to the export-controls and US-sanctions representation in the Terms of Service.",
      "Governing Law: New Zealand. We intend that this Cookie Policy be governed by the laws of New Zealand, subject to mandatory local law (including GDPR and ePrivacy Directive) that grants rights that cannot be contracted away. Counsel to confirm.",
      "Force Majeure, Severability, Entire Agreement. Force majeure, severability, and entire-agreement provisions of the Terms of Service apply.",
      "Age Requirement: 18+. You must be at least 18 years of age to use the Service and to grant or withdraw cookie consent.",
      "30-Day Notice for Terms Changes. We intend to provide at least 30 days' notice for any material change to this Cookie Policy.",
      "Binding Individual Arbitration and Class-Action Waiver. Disputes relating to cookies are subject to the binding individual arbitration clause and class-action waiver in the Terms of Service, including the 30-day opt-out and small-claims carve-out.",
    ],
  },
];

export default function CookiesPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Cookie Policy"
        description="Learn how Crontech uses cookies to provide, protect, and improve our service. No third-party advertising. No cross-site tracking. Privacy-first."
        path="/legal/cookies"
      />
      <Box class="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
        <Container size="full" padding="md" class="max-w-4xl py-16 sm:px-8 lg:py-24">
          <Stack direction="vertical" gap="lg">
            <Stack direction="vertical" gap="sm">
              <Text variant="h1" weight="bold" class="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Cookie Policy
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
