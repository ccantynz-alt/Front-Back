// ── /docs/guides/integrate-stripe ────────────────────────────────────
//
// The Stripe integration path on Crontech today. Honest about the
// STRIPE_ENABLED flag that gates every outbound call to Stripe,
// grounded in the actual billing plumbing in
// `apps/api/src/stripe/client.ts` and `apps/api/src/billing/*`.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Steps,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function IntegrateStripeGuide(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Integrate Stripe"
        description="How Stripe is wired on Crontech today. The STRIPE_ENABLED flag, the billing router, and the usage reporter that ships metered billing to Stripe on production deploys."
        path="/docs/guides/integrate-stripe"
      />

      <DocsArticle
        eyebrow="Guides"
        title="Integrate Stripe"
        subtitle="Stripe is plumbed on Crontech today but gated behind a feature flag. This guide covers the three env vars, the exact tRPC surface, and what the usage reporter sends to Stripe once the flag is flipped."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Billing procedures",
          href: "/docs/api-reference/billing",
          description:
            "The API Reference article for the billing router — every procedure, its Zod input, and its current live-vs-coming-soon status.",
        }}
      >
        <p>
          Stripe billing on Crontech is gated. Every outbound call to
          Stripe — checkout sessions, portal sessions, the metered
          usage reporter — checks <code>STRIPE_ENABLED</code> before
          doing anything. The check lives in{" "}
          <code>apps/api/src/stripe/client.ts</code>:
        </p>

        <Callout tone="info">
          The flag exists so the billing plumbing can ship and be
          tested end-to-end without ever phoning home to Stripe
          before the team is ready. You cannot accidentally charge a
          user on a preview deploy.
        </Callout>

        <h2>Step 1 — Get Stripe keys</h2>
        <p>
          Grab a publishable key, a secret key, and a webhook signing
          secret from the Stripe dashboard. The three env vars are
          listed in <em>CLAUDE.md §5D</em> as the canonical names:
        </p>

        <KeyList
          items={[
            {
              term: "STRIPE_SECRET_KEY",
              description:
                "The sk_* key. Used by apps/api to create checkout sessions, portal sessions, and send usage events. Never ships to the client.",
            },
            {
              term: "STRIPE_PUBLISHABLE_KEY",
              description:
                "The pk_* key. Safe to ship to the browser. Used by the web app to initialise Stripe Elements in case you build a custom checkout.",
            },
            {
              term: "STRIPE_WEBHOOK_SECRET",
              description:
                "The whsec_* key from the Stripe webhook endpoint configuration. The billing webhook verifies every inbound event with this secret before it touches the database.",
            },
          ]}
        />

        <h2>Step 2 — Wire the env vars</h2>
        <p>
          Set the three keys in the project's <strong>Settings →
          Environment variables</strong> page. Mark each one as{" "}
          <strong>production</strong> scope until you're confident
          the integration is stable — previews should stay on test
          keys. The{" "}
          <a href="/docs/deployment/environment-variables">
            Environment variables
          </a>{" "}
          article covers scope rules and the automatic masking Crontech
          applies in the UI and in build logs.
        </p>

        <Callout tone="warn">
          The build-log secret scrubber masks values that match{" "}
          <code>*_KEY</code>, <code>*_SECRET</code>, <code>*_TOKEN</code>
          , and PEM blocks before they land in{" "}
          <code>deployment_logs</code>. A leaked Stripe key from a
          build log is not a class of bug that can exist on this
          platform — but keep previews on test keys anyway.
        </Callout>

        <h2>Step 3 — Flip the flag</h2>
        <p>
          Add one more env var to the project:{" "}
          <code>STRIPE_ENABLED=true</code>. The Stripe client accepts{" "}
          <code>true</code> or <code>1</code>; anything else (or
          unset) keeps the integration dark. On the next deploy, the
          billing router starts returning real data.
        </p>

        <Steps>
          <li>
            Set <code>STRIPE_ENABLED=true</code> in production env
            vars.
          </li>
          <li>
            Re-deploy so the worker picks up the new env (runtime env
            vars are baked at deploy time for now — see the env vars
            article for the full flow).
          </li>
          <li>
            Call <code>billing.createCheckoutSession</code> from the
            client and confirm Stripe returns a session URL.
          </li>
        </Steps>

        <h2>What's live on the billing router</h2>
        <p>
          The{" "}
          <a href="/docs/api-reference/billing">Billing procedures</a>{" "}
          article lists every procedure in full. The short tour:
        </p>

        <KeyList
          items={[
            {
              term: "createCheckoutSession",
              description:
                "Creates a Stripe Checkout session and returns the URL. No-op if STRIPE_ENABLED is not truthy. Mirrors the Pricing page's 'Upgrade' button.",
            },
            {
              term: "createPortalSession",
              description:
                "Creates a Stripe billing portal session so users can update payment methods, download invoices, and cancel plans from your app.",
            },
            {
              term: "getCurrentPlan",
              description:
                "Reads the user's active plan from the database. Works with or without STRIPE_ENABLED — pre-flag traffic falls back to the Free plan.",
            },
            {
              term: "Usage reporter",
              description:
                "Background job in apps/api/src/billing/usage-reporter.ts that ships metered usage (build minutes, AI tokens) to Stripe nightly. Skips the outbound call entirely when STRIPE_ENABLED is dark.",
            },
          ]}
        />

        <h2>Webhooks</h2>
        <p>
          The inbound Stripe webhook lives at{" "}
          <code>/api/stripe/webhook</code> on <code>apps/api</code>.
          Configure the webhook endpoint in the Stripe dashboard to
          point at your deployed API and subscribe to at least:{" "}
          <code>checkout.session.completed</code>,{" "}
          <code>customer.subscription.updated</code>, and{" "}
          <code>customer.subscription.deleted</code>. The webhook
          verifies every event against{" "}
          <code>STRIPE_WEBHOOK_SECRET</code> before writing to the
          database.
        </p>

        <Callout tone="note">
          If the flag is dark and a webhook arrives, the handler logs
          the event and drops it. Stripe keeps retrying for 3 days, so
          flipping the flag on won't strand queued events.
        </Callout>

        <h2>You have billing.</h2>
        <p>
          Keys set, flag flipped, checkout live, portal live, webhook
          verifying. The{" "}
          <a href="/docs/api-reference/billing">
            Billing API Reference
          </a>{" "}
          article covers every procedure in detail if you need the
          full input-output shapes.
        </p>
      </DocsArticle>
    </>
  );
}
