// ── /docs/guides/build-a-saas ────────────────────────────────────────
//
// End-to-end walkthrough that stitches together real, already-shipped
// articles from Getting Started, API Reference, and Deployment. Every
// step links out to the underlying reference article — this file
// doesn't re-explain subsystems, it orders them. Honest about billing
// being gated behind the STRIPE_ENABLED flag.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Steps,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function BuildASaasGuide(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Build a SaaS"
        description="End-to-end walkthrough: scaffold a Crontech project, provision a database, wire passkey auth, enable Stripe billing, and ship to the edge. Every step links to the underlying reference article."
        path="/docs/guides/build-a-saas"
      />

      <DocsArticle
        eyebrow="Guides"
        title="Build a SaaS"
        subtitle="The exact sequence to go from nothing to a billed, authenticated, edge-deployed SaaS. Every step points at the reference article that owns the full detail — this guide just names the order."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Integrate Stripe",
          href: "/docs/guides/integrate-stripe",
          description:
            "The next guide zooms in on the billing step — what's wired today, what the STRIPE_ENABLED flag gates, and which procedures are live on the billing router.",
        }}
      >
        <p>
          This guide is a route, not a tutorial. Each step has a real
          article behind it. If a step feels thin here, follow the link
          — the underlying article goes deep on the same topic.
        </p>

        <Callout tone="info">
          Everything below runs in the dashboard. There is no public
          CLI yet, so expect to click through the project UI rather
          than scripting the setup from your terminal.
        </Callout>

        <h2>Step 1 — Create the account and the project</h2>
        <p>
          Start with the account and the first project. The Getting
          Started series covers the full flow — this guide just names
          the two articles you need:
        </p>

        <Steps>
          <li>
            Create your account following{" "}
            <a href="/docs/getting-started/install">
              Create your account and ship your first project
            </a>
            .
          </li>
          <li>
            Spin up the project itself via{" "}
            <a href="/docs/getting-started/new-project">
              Create your first project
            </a>
            . Pick <code>SolidStart + Bun</code> as the preset and
            leave the Turso checkbox ticked so the database is
            provisioned alongside.
          </li>
        </Steps>

        <Callout tone="note">
          If you'd rather import an existing GitHub repo than scaffold
          from a preset, use the{" "}
          <a href="/docs/getting-started/connect-github">
            Connect a GitHub repository
          </a>{" "}
          article instead. Env vars and domains come across with the
          import.
        </Callout>

        <h2>Step 2 — Know the pipeline before you push</h2>
        <p>
          Before you trigger a deploy, skim the deployment pipeline so
          you know what's actually happening when you push. The{" "}
          <a href="/docs/deployment/how-a-deploy-runs">
            How a deploy actually runs
          </a>{" "}
          article walks the full seven-stage pipeline: webhook → clone
          → sandboxed install and build → orchestrator hand-off → live
          URL. You don't have to memorise the stages, but knowing
          which one you're on when the log stream freezes saves you
          twenty minutes of squinting at the dashboard.
        </p>

        <h2>Step 3 — Wire auth</h2>
        <p>
          Every SaaS starts with users. Crontech ships three auth
          paths today: passkeys (fastest, phishing-immune), Google
          OAuth (one-click for Workspace accounts), and email +
          password (classic, rate-limited). The{" "}
          <a href="/docs/security/authentication">Authentication</a>{" "}
          article in the Security category walks what each one does
          on the wire. The{" "}
          <a href="/docs/api-reference/auth">Auth procedures</a>{" "}
          article in the API Reference lists the exact tRPC calls
          you'll make from the client.
        </p>

        <KeyList
          items={[
            {
              term: "Passkey path",
              description:
                "Registration calls auth.getRegistrationOptions then auth.verifyRegistration. Login calls auth.getAuthenticationOptions then auth.verifyAuthentication. All four are live on the appRouter today.",
            },
            {
              term: "Google OAuth path",
              description:
                "Dashboard-configured in the project's auth page. Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars — see the Environment variables article for the exact names.",
            },
            {
              term: "Email + password path",
              description:
                "auth.registerWithPassword and auth.loginWithPassword. argon2id hashing, 5-attempts-per-15-minutes rate limit per email enforced in-process.",
            },
          ]}
        />

        <h2>Step 4 — Turn on billing</h2>
        <p>
          Billing is plumbed but gated. The Stripe client reads the{" "}
          <code>STRIPE_ENABLED</code> flag on every request and refuses
          to phone home until you flip it to <code>true</code>. The{" "}
          <a href="/docs/guides/integrate-stripe">Integrate Stripe</a>{" "}
          guide is the dedicated walkthrough; the{" "}
          <a href="/docs/api-reference/billing">Billing procedures</a>{" "}
          article lists the exact tRPC surface. The short version: set
          your Stripe keys in the project's env vars, flip{" "}
          <code>STRIPE_ENABLED=true</code>, and the billing procedures
          start responding.
        </p>

        <h2>Step 5 — Ship it</h2>
        <p>
          Hit <strong>Deploy</strong> on the project page. The
          webhook-driven pipeline takes over. When the deploy turns
          green, your project is live on a{" "}
          <code>*.crontech.app</code> subdomain. Point a custom domain
          at it via{" "}
          <a href="/docs/deployment/custom-domains">Custom domains</a>{" "}
          when you're ready.
        </p>

        <Callout tone="note">
          Every deploy is one click away from a rollback. The{" "}
          <a href="/docs/deployment">Deployment overview</a> article
          covers the rollback flow, the 10-minute wall-clock timeout,
          and the secret-scrubbing rules for build logs.
        </Callout>

        <h2>You now have a SaaS.</h2>
        <p>
          Account, project, deploy pipeline, auth, billing, live URL.
          Everything after this — real-time collaboration, audit
          trails, custom domains at scale — is additive. The{" "}
          <a href="/docs/collaboration">Collaboration</a> category
          covers the multi-user story; the{" "}
          <a href="/docs/security">Security & Auth</a> category covers
          the compliance posture.
        </p>
      </DocsArticle>
    </>
  );
}
