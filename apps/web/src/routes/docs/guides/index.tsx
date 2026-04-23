// ── /docs/guides — Category overview ────────────────────────────────
//
// Landing article for the Guides category. Guides are end-to-end
// walkthroughs that stitch together real articles from elsewhere in
// the docs. They are opinionated routes through the platform, not
// reference material. Two articles ship with this landing: Build a
// SaaS and Integrate Stripe. More land one at a time.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function GuidesOverviewArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Guides"
        description="End-to-end walkthroughs for common Crontech setups: ship a SaaS, wire Stripe billing, and more. Each guide stitches together real reference articles into a single route."
        path="/docs/guides"
      />

      <DocsArticle
        eyebrow="Guides"
        title="Guides"
        subtitle="Reference docs tell you what each lever does. Guides tell you which levers to pull, in what order, to ship a specific thing. Each guide is a tested route through the platform."
        readTime="2 min"
        updated="April 2026"
        nextStep={{
          label: "Build a SaaS",
          href: "/docs/guides/build-a-saas",
          description:
            "The end-to-end walkthrough: scaffold the project, provision the database, wire auth, turn on billing, and ship to the edge.",
        }}
      >
        <p>
          Guides are opinionated. Where the API Reference shows every
          procedure and the Deployment category shows every lever, a
          guide picks one goal — "ship a billed SaaS", "wire real-time
          collaboration" — and walks the full path. Every step links
          out to the underlying reference article so you can dig
          deeper when you need to.
        </p>

        <Callout tone="info">
          Guides are written against the dashboard-driven flow that
          ships today. There is no public CLI yet, so every click in
          these walkthroughs is one you'll actually make in the UI.
        </Callout>

        <h2>What's in this category</h2>

        <KeyList
          items={[
            {
              term: "Build a SaaS",
              description:
                "The full route: create a project, provision Turso, enable passkey auth, wire Stripe billing behind the STRIPE_ENABLED flag, and ship to the edge. Cross-links to Getting Started, API Reference, and Deployment at every step.",
            },
            {
              term: "Integrate Stripe",
              description:
                "How Stripe is wired on Crontech today. What the STRIPE_ENABLED flag gates, which procedures are live on the billing router, and how the usage reporter talks to Stripe in production.",
            },
          ]}
        />

        <h2>What counts as a guide</h2>
        <p>
          A guide is not a feature spec and not a marketing page. It
          is the path a real team would walk to ship a real outcome.
          Every guide follows the same shape:
        </p>

        <KeyList
          items={[
            {
              term: "Starts with an outcome",
              description:
                "The opening paragraph names the concrete thing you'll have at the end — not 'here's how our billing works', but 'here's the exact sequence to start charging users this afternoon'.",
            },
            {
              term: "Cites real reference articles",
              description:
                "Every step links to the underlying how-it-works article. Guides don't re-explain the pipeline — they reference it, so there's one canonical source of truth for each subsystem.",
            },
            {
              term: "Honest about gaps",
              description:
                "If a step is gated behind a feature flag, the guide says so. If a step is planned but not shipped, the guide says so. No 'just imagine' sections.",
            },
          ]}
        />

        <h2>Where to start</h2>
        <p>
          If you're evaluating the platform end-to-end, start with{" "}
          <a href="/docs/guides/build-a-saas">Build a SaaS</a>. If
          you're already deployed and just need to wire billing, skip
          to <a href="/docs/guides/integrate-stripe">Integrate Stripe</a>
          . More guides — real-time collaboration, AI-first onboarding,
          multi-tenant setup — land one at a time.
        </p>
      </DocsArticle>
    </>
  );
}
