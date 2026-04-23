// ── /docs/getting-started/billing — article 5 of the series ─────────
//
// Final article in the Getting Started series. Honest about billing:
// the Stripe plumbing (checkout, customer portal, webhooks, usage
// reporter) is wired end-to-end, but actual charges stay paused until
// the API's STRIPE_ENABLED flag flips to "true". This article explains
// the plan tiers, the portal, and what the user sees depending on
// which side of that flag they're on.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Steps,
  Callout,
  KeyList,
  ScreenshotSlot,
} from "../../../components/docs/DocsArticle";

export default function BillingArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Pick a plan and manage billing"
        description="Tour the Crontech plan tiers, walk through Stripe Checkout and the customer portal, and understand exactly what's live vs pending on the billing surface today."
        path="/docs/getting-started/billing"
      />

      <DocsArticle
        eyebrow="Getting Started"
        title="Pick a plan and manage billing"
        subtitle="The plans, the Stripe Checkout flow, and the customer portal — plus an honest line on what's actually charging cards today vs what's wired and waiting."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Back to the dashboard",
          href: "/dashboard",
          description:
            "You've finished the Getting Started series. Head back to the dashboard and start shipping — the rest of the docs land category-by-category as each subsystem stabilises.",
        }}
      >
        <p>
          Billing on Crontech is run end-to-end by Stripe. That's a
          deliberate choice: we don't store card numbers, we don't own
          the invoice ledger, and we don't try to rebuild a payment
          processor from scratch. Your subscription, your cards, your
          invoices, your tax IDs, and your billing address all live
          inside Stripe's hosted portal. We link to it.
        </p>

        <Callout tone="warn">
          <strong>Honest status (April 2026):</strong> the Stripe
          integration — Checkout Sessions, the customer portal, usage
          reporting, webhooks — is shipped and tested. Whether it{" "}
          <em>charges cards</em> depends on a server-side flag
          (<code>STRIPE_ENABLED</code>). Until that flag flips on, the
          billing page renders a waitlist surface instead of a Checkout
          button. When it flips on, the exact same UI turns into a real
          upgrade flow. No code change on your side.
        </Callout>

        <h2>The plan tiers</h2>
        <p>
          There are three tiers today. The full, always-current list of
          what each one includes lives on the{" "}
          <a href="/pricing">pricing page</a>; this is the summary.
        </p>

        <KeyList
          items={[
            {
              term: "Free",
              description:
                "One project. Full feature set — edge hosting, database, AI runtime, real-time, auth, custom domains. No credit card required. Good for evaluating the platform or shipping a single small app.",
            },
            {
              term: "Pro — $29 / month",
              description:
                "Unlimited projects, wildcards on custom domains, priority edge routing, and usage-based AI billing. Client-GPU inference is always $0/token regardless of plan.",
            },
            {
              term: "Enterprise",
              description:
                "SSO (SAML, OIDC, SCIM), private data residency, SOC 2 evidence export, dedicated support, and volume pricing. Talk to the team for a quote.",
            },
          ]}
        />

        <Callout tone="info">
          You can use Free forever. There's no trial period that times
          out, no feature gate that surprises you at week two. Pro adds
          scale, not capability — every core feature works on Free.
        </Callout>

        <h2>Step 1 — Open the billing page</h2>
        <p>
          Click the <strong>Billing</strong> link in the sidebar, or go
          to <a href="/billing">crontech.ai/billing</a> directly. The
          page loads your current subscription state from the API in
          real time — not a cached snapshot.
        </p>

        <ScreenshotSlot caption="Billing page showing the current plan, the plan picker, and the Manage subscription button wired to Stripe's hosted portal." />

        <h2>Step 2 — Upgrade to Pro (when billing is live)</h2>
        <p>
          When Stripe is enabled on your environment, clicking{" "}
          <strong>Upgrade to Pro</strong> calls the{" "}
          <code>billing.createCheckoutSession</code> procedure and
          redirects your browser to Stripe Checkout. You enter a card,
          Stripe charges it, and the webhook flips your account to Pro
          the moment the charge settles.
        </p>

        <Steps>
          <li>
            Click <strong>Upgrade to Pro</strong>. The browser redirects
            to checkout.stripe.com — if that URL doesn't appear, the
            environment isn't Stripe-enabled yet and you're on the
            waitlist surface instead.
          </li>
          <li>
            Enter card details on Stripe's hosted page. Crontech never
            sees the card number — Stripe posts a customer ID back to
            our webhook and that's it.
          </li>
          <li>
            Complete the purchase. Stripe redirects you back to{" "}
            <code>/billing</code>, the plan badge flips to <strong>Pro
            </strong>, and the new plan's features unlock immediately.
          </li>
        </Steps>

        <Callout tone="note">
          If you close the Stripe tab before completing, nothing
          happens — no charge, no plan change, no partial state. The
          checkout session expires after 24 hours.
        </Callout>

        <h2>Step 3 — Manage your subscription</h2>
        <p>
          Once you're on Pro or Enterprise, the billing page shows a{" "}
          <strong>Manage subscription</strong> button. That opens
          Stripe's hosted customer portal. Everything subscription-
          related lives there.
        </p>

        <KeyList
          items={[
            {
              term: "Invoices",
              description:
                "Every charge, past and current. Download PDFs, resend receipts, see the exact line-items per billing period.",
            },
            {
              term: "Payment methods",
              description:
                "Add, remove, or switch default card / bank account. Stripe is PCI-DSS Level 1 certified — we defer to them for a reason.",
            },
            {
              term: "Billing address + tax ID",
              description:
                "Required for EU VAT, US sales tax, and any jurisdiction where tax rules apply. Stripe calculates tax server-side and puts it on the invoice.",
            },
            {
              term: "Plan changes",
              description:
                "Downgrade, upgrade, or cancel. Cancellations are effective at the end of the current billing period — you keep access to what you paid for.",
            },
          ]}
        />

        <Callout tone="info">
          There used to be an in-app "Cancel plan" button that set a
          local boolean and didn't tell Stripe anything — the
          subscription kept billing. That button is gone. Cancellations
          happen inside the real portal, where the cancellation is a
          real event.
        </Callout>

        <h2>What usage-based billing looks like</h2>
        <p>
          On Pro, AI inference that's routed to the edge or cloud tier
          is usage-priced. The edge tier (Cloudflare Workers AI) bills
          per million tokens; the cloud tier (Modal H100) bills per
          GPU-second. Client-side WebGPU inference is always{" "}
          <code>$0/token</code> — it runs on your user's hardware and
          never hits our infrastructure.
        </p>
        <p>
          Usage is reported to Stripe on a rolling basis by the API's
          usage reporter. Your portal invoice at the end of the billing
          period shows the subscription line-item plus any usage
          overages.
        </p>

        <Callout tone="warn">
          The usage reporter is shipped and tested. Whether it
          <em>actually posts</em> usage records to Stripe depends on the
          same <code>STRIPE_ENABLED</code> flag — pre-launch, every
          reporter call is a tested no-op. Once the flag flips on, the
          reporter starts sending real records on the exact same
          cadence.
        </Callout>

        <h2>That's the series.</h2>
        <p>
          You've signed up, created a project, connected a repository,
          wired a custom domain, and toured billing. That's the full
          Getting Started track. The rest of the docs — AI SDK, API
          reference, components, deployment deep-dives, collaboration,
          security — land category-by-category as each subsystem
          stabilises. We'd rather ship accurate references slowly than
          inaccurate ones quickly.
        </p>
      </DocsArticle>
    </>
  );
}
