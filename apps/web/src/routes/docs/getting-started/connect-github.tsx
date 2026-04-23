// ── /docs/getting-started/connect-github — article 3 of the series ──
//
// Third article in the Getting Started series. Covers the GitHub
// import + auto-deploy flow so users go from "manual deploys from the
// dashboard" to "git push triggers a new edge deploy". Honest about
// the dashboard flow since the CLI isn't shipped yet — describes
// dashboard UI rather than inventing CLI commands.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Steps,
  Callout,
  KeyList,
  ScreenshotSlot,
} from "../../../components/docs/DocsArticle";

export default function ConnectGithubArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Connect a GitHub repository"
        description="Wire a Crontech project to a GitHub repo. Auto-deploy on push to main, preview URLs on every pull request, production rollbacks in one click."
        path="/docs/getting-started/connect-github"
      />

      <DocsArticle
        eyebrow="Getting Started"
        title="Connect a GitHub repository"
        subtitle="Once a project is wired to a repo, every push to main triggers a new production deploy and every pull request gets its own preview URL. Here's how to hook it up."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Wire a custom domain",
          href: "/docs/getting-started/custom-domain",
          description:
            "Swap the *.crontech.app preview URL for a domain you own. DNS records, SSL provisioning, and the cutover explained.",
        }}
      >
        <p>
          Manual deploys from the dashboard are fine for a one-off
          experiment, but they don't scale past day two. Connecting a
          GitHub repository turns your project into a continuous
          deployment pipeline: every push to the default branch ships to
          production, every pull request gets a live preview URL, and
          every deploy is tagged with its commit SHA for one-click
          rollback.
        </p>

        <h2>Step 1 — Install the GitHub App</h2>
        <p>
          Crontech connects to GitHub through a GitHub App, not a
          personal access token. That means you grant access on a
          per-repository basis, you can revoke it at any time from
          GitHub's UI, and rotating credentials is a non-event.
        </p>

        <Steps>
          <li>
            Open the project's <a href="/repos">Repositories</a> page
            from the project sidebar.
          </li>
          <li>
            Click <strong>Install GitHub App</strong>. You'll be
            redirected to github.com to pick which account or
            organisation to install under.
          </li>
          <li>
            Choose <strong>All repositories</strong> if you want new
            repos to be available automatically, or{" "}
            <strong>Only select repositories</strong> if you'd rather
            grant access one-by-one.
          </li>
          <li>
            Click <strong>Install</strong>. GitHub redirects you back to
            Crontech with the install token already exchanged.
          </li>
        </Steps>

        <Callout tone="info">
          The GitHub App requests read access to code and metadata plus
          write access to commit statuses, deployments, and pull request
          comments. Those writes are how your PRs get the "preview
          ready" status check and the deployment comment.
        </Callout>

        <h2>Step 2 — Pick a repository</h2>
        <p>
          Back on the project's repositories page, the dropdown now
          lists every repo the GitHub App can see. Pick one and choose
          the branch you want to deploy from — usually{" "}
          <code>main</code>.
        </p>

        <ScreenshotSlot caption="Repository picker with the GitHub App installed. Each row shows the repo name, default branch, and last push time." />

        <Steps>
          <li>
            Select the repository from the dropdown.
          </li>
          <li>
            Confirm the default branch. This is the branch that
            triggers production deploys. Any other branch pushes to a
            preview environment instead.
          </li>
          <li>
            Confirm the build command and output directory. If the
            project already had these set from the deploy wizard, the
            existing values carry over.
          </li>
          <li>
            Click <strong>Connect</strong>. The first deploy fires
            immediately using the current state of the default branch.
          </li>
        </Steps>

        <h2>Step 3 — Push something</h2>
        <p>
          This is the satisfying part. From your local checkout, commit
          a change and push it to the default branch. Within a few
          seconds the deployments tab on Crontech shows a new build in
          progress, the commit SHA and message already populated from
          the GitHub webhook.
        </p>
        <p>
          When the build finishes, the new version is live on your
          project's URL. The previous deployment is kept around — you
          can roll back to it from the deployments tab if the new one
          misbehaves.
        </p>

        <Callout tone="note">
          If a push doesn't trigger a deploy within 30 seconds, check
          the project's <strong>Webhooks</strong> panel. GitHub retries
          failed webhooks for up to 24 hours and the panel shows the
          most recent attempts with their response codes.
        </Callout>

        <h2>What happens on pull requests</h2>
        <p>
          Once the repo is connected, every pull request gets the full
          preview-URL treatment:
        </p>

        <KeyList
          items={[
            {
              term: "Dedicated preview URL",
              description:
                "pr-42.your-project.crontech.app — isolated from production, its own env vars, its own database branch if you've got Neon wired up.",
            },
            {
              term: "Deployment comment",
              description:
                "The GitHub App posts (and updates) a single comment on the PR with the preview URL, build duration, and a link to the deployment logs.",
            },
            {
              term: "Commit status checks",
              description:
                "Every commit gets a Crontech status check. Red while the build is running or broken; green the moment the preview is live.",
            },
            {
              term: "Auto-teardown",
              description:
                "When the PR is merged or closed, its preview environment is torn down and its resources released. You don't pay for zombie previews.",
            },
          ]}
        />

        <h2>Rolling back</h2>
        <p>
          Every deployment on the <a href="/deployments">deployments
          page</a> has a <strong>Promote to production</strong> button.
          Clicking it on any past deployment flips traffic back to that
          version in under a second — no rebuild, no redeploy. The
          artifact is still warm in the edge cache.
        </p>
        <p>
          Rollbacks don't touch your database, your env vars, or your
          connected repo. They just re-route the preview URL to a
          previously-built artifact until you promote something else.
        </p>

        <Callout tone="warn">
          If your new deployment ran a database migration, rolling back
          the code does not roll back the schema. Schema rollbacks live
          in Drizzle migrations and are a separate workflow — covered
          later in the deployment docs series.
        </Callout>

        <h2>Disconnecting a repo</h2>
        <p>
          From the project's repositories page, click{" "}
          <strong>Disconnect</strong>. The connection is severed
          immediately, future pushes stop triggering deploys, and the
          GitHub App's access to the specific repo can be revoked from
          github.com at your leisure. Your deployed artifacts are
          preserved.
        </p>

        <h2>You've got CI.</h2>
        <p>
          That's the whole GitHub integration. The next step is making
          the URL look like something you own — wiring up a custom
          domain so your project answers on{" "}
          <code>app.your-domain.com</code> instead of{" "}
          <code>your-project.crontech.app</code>.
        </p>
      </DocsArticle>
    </>
  );
}
