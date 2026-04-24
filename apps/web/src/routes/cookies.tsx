/**
 * /cookies — public Cookie Policy route.
 *
 * Mirror of docs/legal/COOKIE_POLICY.md (the attorney-review copy).
 * Keep both in sync when updating. Single source of truth: the MD file
 * in docs/legal/ is canonical for attorney review; this route is the
 * rendered public copy.
 */

import { SEOHead } from "../components/SEOHead";
import LegalPage, { type LegalSection } from "../components/LegalPage";

const sections: LegalSection[] = [
  {
    level: 2,
    heading: "1. What cookies are",
    blocks: [
      {
        type: "p",
        text:
          "Cookies are small text files stored on your device by the websites you visit. They let sites remember you between visits (sign-in state, preferences, analytics).",
      },
    ],
  },
  {
    level: 2,
    heading: "2. Cookies we set",
    blocks: [
      { type: "p", text: "**Strictly necessary** (no consent required):" },
      {
        type: "table",
        headers: ["Cookie", "Purpose", "Duration"],
        rows: [
          ["crontech_session", "Keeps you signed in", "Session"],
          ["crontech_csrf", "Prevents cross-site request forgery", "Session"],
          ["cookie_consent", "Remembers your consent choice", "12 months"],
        ],
      },
      { type: "p", text: "**Functional** (consent required under GDPR):" },
      {
        type: "table",
        headers: ["Cookie", "Purpose", "Duration"],
        rows: [
          ["crontech_theme", "Remembers your dark/light mode choice", "12 months"],
          ["crontech_onboarding", "Tracks whether you've completed onboarding", "12 months"],
        ],
      },
      { type: "p", text: "**Analytics** (consent required):" },
      {
        type: "p",
        text:
          "We use first-party, IP-anonymised analytics to understand aggregate traffic patterns. No cross-site tracking and no data sold to third parties.",
      },
      { type: "p", text: "**Marketing:**" },
      {
        type: "p",
        text:
          "We do not currently set marketing or retargeting cookies on this site.",
      },
    ],
  },
  {
    level: 2,
    heading: "3. Third-party cookies",
    blocks: [
      {
        type: "p",
        text:
          "These cookies are set by third parties we embed for essential functionality:",
      },
      {
        type: "table",
        headers: ["Origin", "Purpose"],
        rows: [
          ["js.stripe.com", "Stripe checkout + fraud prevention"],
          ["challenges.cloudflare.com", "Bot protection and DDoS mitigation"],
        ],
      },
      {
        type: "p",
        text:
          "These third parties process data under their own policies. We only embed them where necessary for the service to function.",
      },
    ],
  },
  {
    level: 2,
    heading: "4. How to control cookies",
    blocks: [
      {
        type: "ul",
        items: [
          "**Our consent banner** (shown on first visit) lets you accept or reject non-essential categories.",
          "**Your browser settings** can block or delete cookies at any time. See instructions for Chrome, Firefox, Safari, and Edge.",
          "**Withdraw consent** by visiting crontech.ai/cookie-settings (link in the footer).",
        ],
      },
      { type: "p", text: "Blocking strictly necessary cookies will break the service." },
    ],
  },
  {
    level: 2,
    heading: "5. Do Not Track",
    blocks: [
      {
        type: "p",
        text:
          "We respect the browser Do Not Track (DNT) signal. When DNT is on, we do not set analytics cookies.",
      },
    ],
  },
  {
    level: 2,
    heading: "6. Changes",
    blocks: [
      {
        type: "p",
        text:
          "We may update this policy. Material changes are announced via the consent banner's re-prompt and a notice at the \"Last updated\" date above.",
      },
    ],
  },
  {
    level: 2,
    heading: "7. Contact",
    blocks: [{ type: "p", text: "privacy@crontech.ai" }],
  },
];

export default function Cookies() {
  return (
    <>
      <SEOHead
        title="Cookie Policy — Crontech"
        description="How Crontech uses cookies. First-party analytics, no cross-site tracking, no data sold."
        path="/cookies"
      />
      <LegalPage
        title="Cookie Policy"
        version="1.0"
        updated="2026-04-22"
        sections={sections}
      />
    </>
  );
}
