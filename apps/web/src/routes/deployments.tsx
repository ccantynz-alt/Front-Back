import { For } from "solid-js";
import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { SEOHead } from "../components/SEOHead";

// ── Deployments (BLK-009 preview) ────────────────────────────────────
//
// BLK-009 delivers the actual git-push-to-deploy pipeline. Until it ships,
// this page shows the planned surface area honestly — no mock deploys,
// no fake API keys, no simulated "Deploy Now" button that does nothing.
//
// When BLK-009 lands, this page becomes the live deployments dashboard
// and the stages below are wired to real tRPC procedures.

interface Stage {
  readonly name: string;
  readonly status: "done" | "in_progress" | "planned";
  readonly summary: string;
  readonly detail: string;
}

const PIPELINE_STAGES: ReadonlyArray<Stage> = [
  {
    name: "1 · GitHub App install",
    status: "planned",
    summary: "One-click install on the repos you want Crontech to deploy.",
    detail:
      "Standard GitHub App manifest flow. User picks repos; we store the installation ID and the set of authorised repos per user.",
  },
  {
    name: "2 · Webhook receiver",
    status: "planned",
    summary: "Every push to a configured branch triggers a build.",
    detail:
      "Hono handler verifies the X-Hub-Signature-256 HMAC against the webhook secret, drops the event onto the build queue, and returns 202.",
  },
  {
    name: "3 · Isolated build runner",
    status: "planned",
    summary: "Bun install, bun run build, run in a Cloudflare Container.",
    detail:
      "Each build gets a fresh container with the repo cloned at the commit SHA. Build logs stream to the queue worker via an SSE channel keyed on the build ID.",
  },
  {
    name: "4 · Live build log",
    status: "planned",
    summary: "See every log line in your browser as the build runs.",
    detail:
      "SSE stream from the build runner to the browser. Tailing a build is just opening the page — no refresh, no polling.",
  },
  {
    name: "5 · Wrangler deploy",
    status: "planned",
    summary: "Successful builds publish to Cloudflare Workers + Pages.",
    detail:
      "Per-project subdomain routing on *.crontech.ai with instant rollback to any previous successful deploy.",
  },
  {
    name: "6 · Env + secrets",
    status: "planned",
    summary: "Encrypted at rest, injected only at build and runtime.",
    detail:
      "Secrets never render back in the UI — write-once, write-new-version. Scoped per-environment (preview / production).",
  },
];

function StageCard(props: { stage: Stage }): JSX.Element {
  const badgeColor = (): string => {
    if (props.stage.status === "done") return "#10b981";
    if (props.stage.status === "in_progress") return "#f59e0b";
    return "#6b7280";
  };
  const badgeLabel = (): string => {
    if (props.stage.status === "done") return "shipped";
    if (props.stage.status === "in_progress") return "in build";
    return "planned";
  };

  return (
    <div
      class="rounded-2xl border border-white/[0.06] p-5"
      style={{
        background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)",
      }}
    >
      <div class="flex items-start justify-between gap-4">
        <h3 class="text-sm font-semibold text-white">{props.stage.name}</h3>
        <span
          class="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: `${badgeColor()}18`, color: badgeColor() }}
        >
          {badgeLabel()}
        </span>
      </div>
      <p class="mt-2 text-sm text-gray-300">{props.stage.summary}</p>
      <p class="mt-2 text-xs leading-relaxed text-gray-500">{props.stage.detail}</p>
    </div>
  );
}

export default function DeploymentsPage(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Deployments"
        description="Git-push-to-deploy pipeline. Edge-native builds, streamed logs, instant rollback."
        path="/deployments"
      />
      <div class="min-h-screen bg-[#060606] text-white">
        <div class="mx-auto max-w-5xl px-6 py-12">
          {/* Header */}
          <div class="mb-10">
            <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-3 py-1">
              <span class="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span class="text-[10px] font-semibold uppercase tracking-widest text-amber-400">
                BLK-009 · in active build
              </span>
            </div>
            <h1 class="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
              Deployments
            </h1>
            <p class="mt-3 max-w-2xl text-base text-gray-400">
              Push to a branch. Crontech builds it in an isolated edge container, streams
              the logs to your browser, and publishes the output to the Cloudflare edge
              the moment the build succeeds. No containers to manage. No regions to pick.
              No Dockerfiles.
            </p>
            <p class="mt-4 max-w-2xl text-sm text-gray-500">
              This page currently shows the build plan. When BLK-009 ships, it becomes
              the live deployments dashboard — real projects, real builds, real logs.
              We chose not to fake it in the meantime.
            </p>
          </div>

          {/* Pipeline stages */}
          <div class="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            <For each={PIPELINE_STAGES}>{(stage) => <StageCard stage={stage} />}</For>
          </div>

          {/* What to do right now */}
          <div
            class="rounded-2xl border border-white/[0.06] p-6"
            style={{
              background: "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)",
            }}
          >
            <h2 class="text-lg font-semibold text-white">Until BLK-009 ships</h2>
            <p class="mt-2 text-sm text-gray-400">
              The build side of the platform is still in progress. Everything else —
              auth, database, tRPC, UI kit, AI layer, real-time collab, observability —
              is live and running today.
            </p>
            <div class="mt-5 flex flex-wrap gap-3">
              <A
                href="/builder"
                class="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
              >
                Try the Composer
              </A>
              <A
                href="/docs"
                class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-gray-300 transition hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-white"
              >
                Read the docs
              </A>
              <A
                href="/status"
                class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-gray-300 transition hover:border-white/[0.15] hover:bg-white/[0.06] hover:text-white"
              >
                System status
              </A>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
