// ── /docs/getting-started/new-project — article 2 of the series ─────
//
// The second article in the Getting Started series. Walks the user
// through the deploy wizard after they've finished the install
// article. Uses the shared DocsArticle shell so visual grammar stays
// consistent across the docs surface. Honest about what's live today
// vs what's pending per the current dashboard implementation.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Steps,
  Callout,
  KeyList,
  ScreenshotSlot,
} from "../../../components/docs/DocsArticle";

export default function NewProjectArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Create your first project"
        description="Walk through the Crontech deploy wizard: pick a preset, name your project, provision a database, and ship to the edge in minutes."
        path="/docs/getting-started/new-project"
      />

      <DocsArticle
        eyebrow="Getting Started"
        title="Create your first project"
        subtitle="The deploy wizard turns a blank dashboard into a live edge deployment in four clicks. Here's exactly what each step does and what it's wiring up for you behind the scenes."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Connect a GitHub repo",
          href: "/docs/getting-started/connect-github",
          description:
            "Wire the project to a repository so every push to main kicks off a new edge deploy automatically.",
        }}
      >
        <p>
          Once you've signed in and verified your email (see the{" "}
          <a href="/docs/getting-started/install">install article</a> if
          you haven't), the next step is creating a project. A project is
          the top-level unit in Crontech — it owns your code, your
          database, your environment variables, and your deployments. You
          can have as many projects as your plan allows.
        </p>

        <h2>Step 1 — Open the deploy wizard</h2>
        <p>
          From the <a href="/dashboard">dashboard</a>, click the{" "}
          <strong>New project</strong> button in the top-right, or the
          "Create your first project" card if this is your first visit.
          Both lead to the same wizard.
        </p>

        <ScreenshotSlot caption="Dashboard with the New project button highlighted in the top-right." />

        <h2>Step 2 — Pick a starting point</h2>
        <p>
          The wizard offers three paths. Pick the one that matches where
          your code already lives.
        </p>

        <KeyList
          items={[
            {
              term: "Start from a preset",
              description:
                "Scaffold a brand new project from one of our templates (SolidStart + Bun, Hono API, static site, AI agent). Fastest path if you're starting fresh.",
            },
            {
              term: "Import a repo",
              description:
                "Point Crontech at an existing GitHub repository. We detect the framework, wire up the build, and start auto-deploying on push. Covered in the next article.",
            },
            {
              term: "Upload a zip",
              description:
                "Drop a static site or a pre-built artifact directly into the dashboard. Good for one-off landing pages or proof-of-concepts.",
            },
          ]}
        />

        <Callout tone="info">
          If you're following along with the quickstart, pick{" "}
          <strong>Start from a preset</strong> and choose{" "}
          <code>SolidStart + Bun</code>. It's the same stack Crontech
          itself runs on — so every feature we ship works on day one in
          your project.
        </Callout>

        <h2>Step 3 — Name it and configure the stack</h2>
        <p>
          Give the project a short, URL-safe name. This becomes your
          default preview subdomain —{" "}
          <code>my-app.crontech.app</code> — and shows up in every log
          line, every metric, every deploy URL. You can rename it later
          from the project settings page, but the original subdomain
          stays reserved.
        </p>

        <Steps>
          <li>
            Enter a project name. Lowercase letters, numbers, and hyphens
            only. We'll flag the name if it collides with an existing
            subdomain.
          </li>
          <li>
            Confirm the framework preset. For a SolidStart app the build
            command is <code>bun run build</code> and the output
            directory is <code>dist/</code> — the wizard pre-fills both.
          </li>
          <li>
            Leave <strong>Provision a Turso database</strong> checked
            unless you already have one. A free-tier Turso database is
            created alongside the project and wired to the{" "}
            <code>TURSO_DATABASE_URL</code> env var automatically.
          </li>
          <li>
            Optionally add a Neon branch for Postgres workloads or a
            Qdrant collection for vector search. You can also skip both
            and add them later from the project's data page.
          </li>
        </Steps>

        <Callout tone="note">
          Every resource the wizard provisions (database, queue, KV
          namespace) is scoped to the project. If you delete the
          project, everything it owns is deleted with it. If you detach a
          resource instead, it stays alive under your account and can be
          re-attached to another project.
        </Callout>

        <h2>Step 4 — Deploy</h2>
        <p>
          The final wizard screen is a summary card with a single{" "}
          <strong>Create and deploy</strong> button. Clicking it kicks
          off the first build.
        </p>
        <p>
          Logs stream live into the deployment card. You'll see Bun
          install, the SolidStart compiler, the bundle analyser, and the
          upload to Cloudflare Workers — in that order. A typical first
          deploy finishes in under 45 seconds.
        </p>

        <ScreenshotSlot caption="Live build logs streaming from the deployment card as Bun installs, builds, and uploads to the edge." />

        <h2>What you have when it's done</h2>
        <p>
          When the first deploy finishes, the project card on the
          dashboard flips to <strong>Live</strong> and you get a preview
          URL. Click it to see your app running at the edge.
        </p>

        <KeyList
          items={[
            {
              term: "Preview URL",
              description:
                "your-project.crontech.app — HTTPS by default, global Anycast routing, sub-5ms cold starts.",
            },
            {
              term: "Deployments tab",
              description:
                "Every deploy is recorded with its build logs, commit SHA (if connected to Git), duration, and status. Rollback is one click.",
            },
            {
              term: "Environment variables",
              description:
                "Managed on the project's settings page. Scoped per-environment (preview / production). Encrypted at rest.",
            },
            {
              term: "Metrics",
              description:
                "Request count, p50/p95/p99 latency, error rate, and AI token usage are live on the project's metrics page the moment the first request lands.",
            },
          ]}
        />

        <Callout tone="warn">
          The metrics page is live but some of the deeper drill-downs
          (per-route flame graphs, cost-per-request breakdowns) are still
          shipping. The top-line numbers you see on the project card are
          real and updated every minute.
        </Callout>

        <h2>You're live.</h2>
        <p>
          That's the whole wizard. The next step in the series hooks up
          a GitHub repository so your next deploy is a{" "}
          <code>git push</code> away instead of a click.
        </p>
      </DocsArticle>
    </>
  );
}
