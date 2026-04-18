import { createMemo, createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Button } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";
import {
  DeploymentCard,
  type Deployment,
  type DeploymentStatus,
} from "../components/DeploymentCard";
import type { DeploymentLogLine } from "../components/DeploymentLogs";

// ── tRPC (scaffolded — procedures not yet implemented server-side) ───
//
// These imports point to the tRPC client. The concrete procedures
// `trpc.deployments.list` and `trpc.deployments.getById` do not exist
// on the server yet — BLK-009's backend ships them. Once they do, the
// `loadDeployments()` helper below swaps PLACEHOLDER_DEPLOYMENTS for
// `await trpc.deployments.list.query(...)` and the card's expand hook
// switches to `trpc.deployments.getById.query({ id })` for live logs.
import { trpc as _trpc } from "../lib/trpc";
// Intentionally referenced to keep the import alive through Biome.
void _trpc;

// ── Placeholder fixture data ─────────────────────────────────────────
//
// Hand-authored deployments that exercise every status variant so the
// UI is pixel-complete before the backend arrives. Logs are short but
// representative of the real Wrangler build output.

const BASE_TIME = Date.now();

function iso(offsetSec: number): string {
  return new Date(BASE_TIME - offsetSec * 1000).toISOString();
}

function buildLogs(
  kind: "success" | "failure" | "partial"
): ReadonlyArray<DeploymentLogLine> {
  const base: DeploymentLogLine[] = [
    { timestamp: iso(120), stream: "stdout", message: "Cloning repository at commit sha…" },
    { timestamp: iso(118), stream: "stdout", message: "bun install --frozen-lockfile" },
    { timestamp: iso(110), stream: "stdout", message: "Resolved 482 dependencies in 2.4s" },
    { timestamp: iso(108), stream: "stdout", message: "bun run check" },
    { timestamp: iso(104), stream: "stdout", message: "✓ TypeScript 10/10 packages, 0 errors" },
    { timestamp: iso(100), stream: "stdout", message: "bun run build" },
    { timestamp: iso(92), stream: "stdout", message: "▲ Building apps/web with Vinxi…" },
    { timestamp: iso(82), stream: "stdout", message: "▲ Building apps/api with Bun…" },
    { timestamp: iso(74), stream: "stdout", message: "▲ Building packages/ui…" },
    { timestamp: iso(70), stream: "stdout", message: "Bundle size: 47.3 KB (budget 50 KB)" },
  ];
  if (kind === "failure") {
    base.push(
      { timestamp: iso(68), stream: "stderr", message: "error TS2322: Type 'string' is not assignable to type 'number'." },
      { timestamp: iso(67), stream: "stderr", message: "    at apps/web/src/routes/checkout.tsx:42:9" },
      { timestamp: iso(66), stream: "stderr", message: "Build failed in 54s" }
    );
    return base;
  }
  if (kind === "partial") {
    base.push(
      { timestamp: iso(62), stream: "stdout", message: "Uploading bundle to Cloudflare Workers…" },
      { timestamp: iso(55), stream: "stdout", message: "Pushing static assets to R2…" }
    );
    return base;
  }
  base.push(
    { timestamp: iso(60), stream: "stdout", message: "Uploading bundle to Cloudflare Workers…" },
    { timestamp: iso(54), stream: "stdout", message: "Pushing static assets to R2…" },
    { timestamp: iso(48), stream: "stdout", message: "Activating new deployment version…" },
    { timestamp: iso(42), stream: "stdout", message: "✓ Deployment live in 78s" }
  );
  return base;
}

const PLACEHOLDER_DEPLOYMENTS: ReadonlyArray<Deployment> = [
  {
    id: "dpl_01hx9k2m4r",
    projectName: "crontech-web",
    projectSlug: "crontech-web",
    commitSha: "7a3b9f1c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a",
    commitMessage: "feat(deploy): BLK-009 UI — deployments page, live logs, status cards",
    branch: "main",
    author: { name: "craig" },
    status: "building",
    durationSeconds: null,
    createdAt: iso(90),
    logs: buildLogs("partial"),
  },
  {
    id: "dpl_01hx9j8p2q",
    projectName: "crontech-web",
    projectSlug: "crontech-web",
    commitSha: "b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    commitMessage: "fix(auth): passkey challenge timeout on slow devices",
    branch: "main",
    author: { name: "craig" },
    status: "deploying",
    durationSeconds: null,
    createdAt: iso(380),
    logs: buildLogs("success"),
  },
  {
    id: "dpl_01hx9h7n1m",
    projectName: "crontech-api",
    projectSlug: "crontech-api",
    commitSha: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2",
    commitMessage: "perf(trpc): batch auth queries on session hydration",
    branch: "main",
    author: { name: "claude-agent" },
    status: "live",
    durationSeconds: 78,
    createdAt: iso(1900),
    liveUrl: "https://api.crontech.ai",
    logs: buildLogs("success"),
  },
  {
    id: "dpl_01hx9g6k0l",
    projectName: "crontech-web",
    projectSlug: "crontech-web",
    commitSha: "d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1",
    commitMessage: "chore(deps): bump solid-js to 1.9.3",
    branch: "renovate/solid-js",
    author: { name: "renovate-bot" },
    status: "failed",
    durationSeconds: 54,
    createdAt: iso(5400),
    logs: buildLogs("failure"),
  },
  {
    id: "dpl_01hx9f5j9k",
    projectName: "crontech-web",
    projectSlug: "crontech-web",
    commitSha: "e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
    commitMessage: "feat(composer): AI-native component library v2",
    branch: "feature/composer-v2",
    author: { name: "claude-agent" },
    status: "queued",
    durationSeconds: null,
    createdAt: iso(14),
    logs: [],
  },
  {
    id: "dpl_01hx9e4i8j",
    projectName: "crontech-api",
    projectSlug: "crontech-api",
    commitSha: "f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9",
    commitMessage: "feat(sentinel): add npm registry watcher collector",
    branch: "main",
    author: { name: "craig" },
    status: "live",
    durationSeconds: 92,
    createdAt: iso(86400),
    liveUrl: "https://api.crontech.ai",
    logs: buildLogs("success"),
  },
];

// ── Filter / Group Helpers ───────────────────────────────────────────

type StatusFilter = "all" | DeploymentStatus;

const FILTER_OPTIONS: ReadonlyArray<{
  readonly value: StatusFilter;
  readonly label: string;
}> = [
  { value: "all", label: "All" },
  { value: "building", label: "Building" },
  { value: "deploying", label: "Deploying" },
  { value: "live", label: "Live" },
  { value: "failed", label: "Failed" },
  { value: "queued", label: "Queued" },
];

interface ProjectGroup {
  readonly name: string;
  readonly slug: string;
  readonly deployments: ReadonlyArray<Deployment>;
}

function groupByProject(
  deployments: ReadonlyArray<Deployment>
): ReadonlyArray<ProjectGroup> {
  const map = new Map<string, Deployment[]>();
  for (const d of deployments) {
    const bucket = map.get(d.projectSlug);
    if (bucket) bucket.push(d);
    else map.set(d.projectSlug, [d]);
  }
  const groups: ProjectGroup[] = [];
  for (const [slug, list] of map) {
    const first = list[0];
    if (!first) continue;
    groups.push({ name: first.projectName, slug, deployments: list });
  }
  return groups;
}

// ── Page ─────────────────────────────────────────────────────────────

export default function DeploymentsPage(): JSX.Element {
  const [filter, setFilter] = createSignal<StatusFilter>("all");
  const [repoConnected] = createSignal<boolean>(true); // flip to false to see empty state

  const deployments = (): ReadonlyArray<Deployment> =>
    repoConnected() ? PLACEHOLDER_DEPLOYMENTS : [];

  const filtered = createMemo<ReadonlyArray<Deployment>>(() => {
    const current = filter();
    if (current === "all") return deployments();
    return deployments().filter((d) => d.status === current);
  });

  const projectGroups = createMemo<ReadonlyArray<ProjectGroup>>(() =>
    groupByProject(filtered())
  );

  const totalDeployments = (): number => deployments().length;
  const liveCount = (): number =>
    deployments().filter((d) => d.status === "live").length;
  const activeCount = (): number =>
    deployments().filter(
      (d) =>
        d.status === "building" ||
        d.status === "deploying" ||
        d.status === "queued"
    ).length;

  function handleConnectRepo(): void {
    // Future: triggers GitHub App install flow via /api/github/install.
    if (typeof window !== "undefined") {
      window.location.href = "/repos";
    }
  }

  function handleRedeploy(deploymentId: string): void {
    // Future: await trpc.deployments.redeploy.mutate({ id: deploymentId });
    if (typeof window !== "undefined" && typeof console !== "undefined") {
      console.info("[deployments] redeploy requested", deploymentId);
    }
  }

  function handleViewLogs(deploymentId: string): void {
    // Future: subscribe to trpc.deployments.logs.subscribe({ id: deploymentId }).
    if (typeof window !== "undefined" && typeof console !== "undefined") {
      console.info("[deployments] viewing logs", deploymentId);
    }
  }

  return (
    <>
      <SEOHead
        title="Deployments"
        description="Git-push-to-deploy pipeline. Edge-native builds, streamed logs, instant rollback."
        path="/deployments"
      />
      <div
        class="min-h-screen"
        style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <div class="mx-auto max-w-6xl px-6 py-12">
          {/* Header */}
          <div class="mb-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div class="max-w-2xl">
              <div
                class="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1"
                style={{
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-elevated)",
                }}
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "var(--color-success)",
                    "box-shadow": "0 0 8px rgba(74,222,128,0.6)",
                  }}
                />
                <span
                  class="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  BLK-009 · deploy pipeline
                </span>
              </div>
              <h1
                class="text-4xl font-bold tracking-tight"
                style={{ color: "var(--color-text)" }}
              >
                Deployments
              </h1>
              <p
                class="mt-3 text-base"
                style={{ color: "var(--color-text-muted)" }}
              >
                Every push is built in an isolated edge container, streamed to
                your browser as it runs, and published to the Cloudflare edge
                the moment the build succeeds.
              </p>
            </div>

            <div class="flex flex-shrink-0 gap-2">
              <Show when={!repoConnected()}>
                <Button variant="primary" size="lg" onClick={handleConnectRepo}>
                  Connect GitHub repo
                </Button>
              </Show>
              <Show when={repoConnected()}>
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleConnectRepo}
                >
                  Connect another repo
                </Button>
              </Show>
            </div>
          </div>

          {/* Stats row */}
          <Show when={repoConnected() && totalDeployments() > 0}>
            <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatTile
                label="Total deployments"
                value={totalDeployments().toString()}
              />
              <StatTile label="Live now" value={liveCount().toString()} />
              <StatTile label="In progress" value={activeCount().toString()} />
            </div>
          </Show>

          {/* Filter chips */}
          <Show when={repoConnected() && totalDeployments() > 0}>
            <div class="mb-6 flex flex-wrap gap-2">
              <For each={FILTER_OPTIONS}>
                {(opt) => (
                  <FilterChip
                    label={opt.label}
                    active={filter() === opt.value}
                    onActivate={() => setFilter(opt.value)}
                  />
                )}
              </For>
            </div>
          </Show>

          {/* Main content */}
          <Show
            when={repoConnected()}
            fallback={<EmptyState onConnect={handleConnectRepo} />}
          >
            <Show
              when={filtered().length > 0}
              fallback={<NoMatchingDeployments filter={filter()} />}
            >
              <div class="flex flex-col gap-10">
                <For each={projectGroups()}>
                  {(group) => (
                    <section>
                      <div class="mb-4 flex items-baseline justify-between">
                        <h2
                          class="text-lg font-semibold"
                          style={{ color: "var(--color-text)" }}
                        >
                          {group.name}
                        </h2>
                        <span
                          class="text-xs"
                          style={{ color: "var(--color-text-faint)" }}
                        >
                          {group.deployments.length} deployment
                          {group.deployments.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div class="flex flex-col gap-3">
                        <For each={group.deployments}>
                          {(d) => (
                            <DeploymentCard
                              deployment={d}
                              onRedeploy={handleRedeploy}
                              onViewLogs={handleViewLogs}
                            />
                          )}
                        </For>
                      </div>
                    </section>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          {/* Footer helper links */}
          <div
            class="mt-12 rounded-2xl p-5 text-sm"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span>
                Need to manage secrets, preview environments, or custom domains?
              </span>
              <div class="flex gap-2">
                <A
                  href="/settings"
                  class="rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                >
                  Project settings
                </A>
                <A
                  href="/docs"
                  class="rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                >
                  Deploy docs
                </A>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

interface StatTileProps {
  readonly label: string;
  readonly value: string;
}

function StatTile(props: StatTileProps): JSX.Element {
  return (
    <div
      class="rounded-xl p-4"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <span
        class="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-text-muted)" }}
      >
        {props.label}
      </span>
      <div
        class="mt-1 text-2xl font-bold tracking-tight"
        style={{ color: "var(--color-text)" }}
      >
        {props.value}
      </div>
    </div>
  );
}

interface FilterChipProps {
  readonly label: string;
  readonly active: boolean;
  readonly onActivate: () => void;
}

function FilterChip(props: FilterChipProps): JSX.Element {
  return (
    <button
      type="button"
      class="rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors"
      onClick={props.onActivate}
      style={{
        background: props.active
          ? "var(--color-primary-light)"
          : "var(--color-bg-elevated)",
        color: props.active
          ? "var(--color-primary-text)"
          : "var(--color-text-muted)",
        border: `1px solid ${
          props.active ? "var(--color-primary)" : "var(--color-border)"
        }`,
      }}
      aria-pressed={props.active}
    >
      {props.label}
    </button>
  );
}

interface EmptyStateProps {
  readonly onConnect: () => void;
}

function EmptyState(props: EmptyStateProps): JSX.Element {
  return (
    <div
      class="rounded-2xl p-10 text-center"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px dashed var(--color-border-strong)",
      }}
    >
      <div
        class="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background: "var(--color-primary-light)",
          color: "var(--color-primary-text)",
        }}
        aria-hidden="true"
      >
        <span class="text-2xl">▲</span>
      </div>
      <h2
        class="mt-5 text-xl font-semibold"
        style={{ color: "var(--color-text)" }}
      >
        No deployments yet
      </h2>
      <p
        class="mx-auto mt-2 max-w-md text-sm"
        style={{ color: "var(--color-text-muted)" }}
      >
        Connect a repo to start deploying. Every push to a configured branch
        triggers a fresh edge build with streamed logs.
      </p>
      <div class="mt-6 flex justify-center">
        <Button variant="primary" size="lg" onClick={props.onConnect}>
          Connect GitHub repo
        </Button>
      </div>
    </div>
  );
}

interface NoMatchingDeploymentsProps {
  readonly filter: StatusFilter;
}

function NoMatchingDeployments(
  props: NoMatchingDeploymentsProps
): JSX.Element {
  return (
    <div
      class="rounded-2xl p-8 text-center"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <p class="text-sm" style={{ color: "var(--color-text-muted)" }}>
        No deployments match the filter
        {props.filter === "all" ? "" : ` "${props.filter}"`}.
      </p>
    </div>
  );
}
