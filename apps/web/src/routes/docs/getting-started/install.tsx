// ── /docs/getting-started/install — the first real Crontech doc ─────
//
// This is the single article the /docs landing currently links to as
// "ready". The rest of the getting-started series lands one PR at a
// time — we'd rather ship one honest article than eight half-written
// ones. Uses the shared DocsArticle shell (Steps / Callout / KeyList /
// ScreenshotSlot) so visual grammar stays consistent across the
// docs surface once more articles land.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Steps,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function InstallArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Create your account and ship your first project"
        description="A 3-minute quickstart for Crontech: create your account, verify your email, pick a plan, and ship your first project to the edge."
        path="/docs/getting-started/install"
      />

      <DocsArticle
        eyebrow="Getting Started"
        title="Create your account and ship your first project"
        subtitle="You can be signed in, verified, and looking at a live edge deployment in under five minutes. Here's the exact path."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Wire a custom domain",
          href: "/docs/getting-started/install#custom-domain",
          description:
            "Point crontech.your-domain.com at your project and let us handle DNS + SSL. (Article landing soon.)",
        }}
      >
        <p>
          Crontech runs every project on the same stack we run ourselves:
          Bun + Hono behind a Cloudflare edge network, Turso for edge
          SQLite, tRPC end-to-end types, and a three-tier AI router that
          chooses between client GPU, edge Workers AI, and cloud H100s
          per-request. You don't have to think about any of that yet —
          the goal of this article is to get you from <em>nothing</em> to
          a deployed project as fast as possible.
        </p>

        <h2>Step 1 — Create your account</h2>
        <p>
          Head to the sign-up page and pick the method that fits how you
          work. All three get you to the same place.
        </p>

        <Steps>
          <li>
            Go to <a href="/register">crontech.ai/register</a>.
          </li>
          <li>
            Pick <strong>Passkey</strong> (fastest, phishing-immune),{" "}
            <strong>Google</strong> (one-click for Workspace accounts), or{" "}
            <strong>Email + password</strong> (classic).
          </li>
          <li>
            If you picked email, check your inbox for a verification
            link. The link is good for 24 hours.
          </li>
        </Steps>

        <Callout tone="info">
          Passkeys are the fastest path and don't need a password to
          remember. On iOS Safari the browser will offer to store it in
          iCloud Keychain; on Chrome it'll sync via Google Password
          Manager. Either is fine.
        </Callout>

        <h2>Step 2 — Pick a plan (or stay on Free)</h2>
        <p>
          The Free plan covers a single project with the full feature set
          — edge hosting, database, AI runtime, real-time, auth. You can
          stay on Free indefinitely. If you need more than one project or
          a team workspace, Pro is $29/mo and Enterprise is custom.
        </p>

        <KeyList
          items={[
            {
              term: "Free",
              description:
                "One project. Full feature set. No credit card. Good for evaluating the platform or shipping a single small app.",
            },
            {
              term: "Pro — $29/mo",
              description:
                "Unlimited projects, priority edge routing, and usage-based AI billing (client-GPU inference is always free).",
            },
            {
              term: "Enterprise",
              description:
                "SSO, SAML/SCIM, private data residency, SOC 2 evidence export. Talk to the team.",
            },
          ]}
        />

        <h2>Step 3 — Create your first project</h2>
        <p>
          From the dashboard, click <strong>New project</strong>. You'll
          pick a name, a framework preset (we'll use{" "}
          <code>SolidStart + Bun</code> for this example), and whether to
          provision a Turso database alongside.
        </p>

        <Steps>
          <li>
            Click <strong>Create your first project</strong> on the
            dashboard's get-started card (Step 1 of the onboarding list).
          </li>
          <li>
            Name the project <code>my-app</code> and keep the{" "}
            <code>SolidStart + Bun</code> preset.
          </li>
          <li>
            Leave "Provision a Turso DB" checked. You can always add Neon
            or Qdrant later from the project's data page.
          </li>
          <li>
            Click <strong>Create</strong>. The project is provisioned
            immediately — no build queue, no waiting room.
          </li>
        </Steps>

        <Callout tone="note">
          If you'd rather connect a GitHub repo than scaffold from a
          preset, use <strong>Import</strong> instead of{" "}
          <strong>Create</strong>. Vercel and Netlify projects can also
          be imported — env vars and domains come across with them.
        </Callout>

        <h2>Step 4 — Ship it</h2>
        <p>
          The project page has a <strong>Deploy</strong> button in the
          top-right. Click it and the build starts immediately. Logs
          stream live into the deployment card — not a spinner with a
          "done when done" badge, the actual compiler output.
        </p>
        <p>
          When the build finishes, your project is live on a
          <code> *.crontech.app </code> subdomain. Point a custom domain
          at it any time from the project's DNS page.
        </p>

        <Callout tone="note">
          Every project gets free HTTPS and automatic Cloudflare Workers
          routing. There is no "deploy to production" step separate from
          this — the first deploy is production. Preview environments
          live on PR-scoped URLs and are a separate flow.
        </Callout>

        <h2>What you get for free, always</h2>
        <p>
          Once you're live, the platform keeps working without you
          thinking about it:
        </p>
        <KeyList
          items={[
            {
              term: "Edge hosting",
              description:
                "Your code runs in Cloudflare Workers worldwide. Sub-5ms cold starts, no capacity planning.",
            },
            {
              term: "Database on the edge",
              description:
                "Turso replicas live inside the edge worker. Reads don't make a network hop.",
            },
            {
              term: "Three-tier AI",
              description:
                "Client GPU (free, $0/token), edge Workers AI (cheap), or cloud H100 (powerful) — routed automatically per request.",
            },
            {
              term: "Auth + RBAC",
              description:
                "Passkeys, Google, and email/password all work out of the box. Role guards on every tRPC procedure.",
            },
            {
              term: "Observability",
              description:
                "Every request is traced. A Grafana LGTM dashboard shows you what's happening across the fleet.",
            },
          ]}
        />

        <h2>You're done.</h2>
        <p>
          That's it for the first article. The next one in this series
          walks through connecting a GitHub repo so every push triggers
          a new deploy — landing soon.
        </p>
      </DocsArticle>
    </>
  );
}
