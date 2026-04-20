import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Button } from "@back-to-the-future/ui";
import { SEOHead } from "../components/SEOHead";
import {
  DeploymentCard,
  type Deployment,
  type DeploymentStatus,
} from "../components/DeploymentCard";
import { trpc } from "../lib/trpc";
import { useOptimisticMutation } from "../lib/optimistic";

// ── BLK-009 — live deployments list ──────────────────────────────────
//
// Loads the authenticated user's projects, then fans out one
// `deployments.list` query per project and merges the results. Every
// card expands into a live SSE log stream (see `DeploymentCard` →
// `DeploymentLogs` → `useDeploymentLogStream`) so the moment the
// build-runner writes a row into `deployment_logs`, the UI shows it.

// ── tRPC row → UI deployment shape ──────────────────────────────────

interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

interface DeploymentListRow {
  readonly id: string;
  readonly projectId: string;
  readonly commitSha: string | null;
  readonly commitMessage: string | null;
  readonly commitAuthor: string | null;
  readonly branch: string | null;
  readonly status: string;
  readonly deployUrl: string | null;
  readonly url: string | null;
  readonly duration: number | null;
  readonly buildDuration: number | null;
  readonly startedAt: Date | string | null;
  readonly completedAt: Date | string | null;
  readonly createdAt: Date | string;
}

/** Map the tRPC status enum onto the narrower card-status enum. */
function toCardStatus(status: string): DeploymentStatus {
  switch (status) {
    case "queued":
    case "building":
    case "deploying":
    case "live":
    case "failed":
      return status;
    case "rolled_back":
    case "cancelled":
      return "failed";
    default:
      return "queued";
  }
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  // tRPC already serialises Date → string in transit for JSON responses.
  return value;
}

function rowToDeployment(
  row: DeploymentListRow,
  project: ProjectSummary,
): Deployment {
  const status = toCardStatus(row.status);
  const durationSeconds =
    row.duration && row.duration > 0 ? Math.round(row.duration / 1_000) : null;
  const liveUrl = row.deployUrl ?? row.url ?? undefined;
  const authorName = row.commitAuthor ?? "unknown";
  return {
    id: row.id,
    projectName: project.name,
    projectSlug: project.slug,
    commitSha: row.commitSha ?? "0000000",
    commitMessage: row.commitMessage ?? "(no commit message)",
    branch: row.branch ?? "main",
    author: { name: authorName },
    status,
    durationSeconds,
    createdAt: toIso(row.createdAt),
    ...(liveUrl ? { liveUrl } : {}),
    // Static logs are empty — the card's live stream populates the UI.
    logs: [],
  };
}

// ── Loader ───────────────────────────────────────────────────────────
//
// Fetches projects first, then — in parallel — a deployments.list page
// per project. Returns `null` on failure so the empty-state copy can
// show rather than a raw error.

interface DeploymentsLoad {
  readonly projects: ReadonlyArray<ProjectSummary>;
  readonly deployments: ReadonlyArray<Deployment>;
}

async function loadDeployments(): Promise<DeploymentsLoad | null> {
  try {
    const projectRows = await trpc.projects.list.query();
    const projects: ProjectSummary[] = projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
    }));
    if (projects.length === 0) {
      return { projects: [], deployments: [] };
    }
    const perProject = await Promise.all(
      projects.map((p) =>
        trpc.deployments.list
          .query({ projectId: p.id, limit: 50 })
          .catch(() => [] as DeploymentListRow[]),
      ),
    );
    const merged: Deployment[] = [];
    for (let i = 0; i < projects.length; i += 1) {
      const project = projects[i];
      const rows = perProject[i];
      if (!project || !rows) continue;
      for (const row of rows) {
        merged.push(rowToDeployment(row, project));
      }
    }
    merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { projects, deployments: merged };
  } catch {
    return null;
  }
}

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
  deployments: ReadonlyArray<Deployment>,
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

  const [loaded, { refetch }] = createResource<DeploymentsLoad | null>(
    loadDeployments,
  );

  const repoConnected = (): boolean => {
    const data = loaded();
    return data !== null && data !== undefined && data.projects.length > 0;
  };

  const deployments = (): ReadonlyArray<Deployment> => loaded()?.deployments ?? [];

  const filtered = createMemo<ReadonlyArray<Deployment>>(() => {
    const current = filter();
    if (current === "all") return deployments();
    return deployments().filter((d) => d.status === current);
  });

  const projectGroups = createMemo<ReadonlyArray<ProjectGroup>>(() =>
    groupByProject(filtered()),
  );

  const totalDeployments = (): number => deployments().length;
  const liveCount = (): number =>
    deployments().filter((d) => d.status === "live").length;
  const activeCount = (): number =>
    deployments().filter(
      (d) =>
        d.status === "building" ||
        d.status === "deploying" ||
        d.status === "queued",
    ).length;

  function handleConnectRepo(): void {
    if (typeof window !== "undefined") {
      window.location.href = "/repos";
    }
  }

  function handleRedeploy(deploymentId: string): void {
    if (typeof window === "undefined") return;
    // Fire and refetch — the server creates a new deployment row and
    // the SSE stream will take over as soon as the row appears.
    trpc.deployments.create
      .mutate({
        projectId: findProjectIdForDeployment(deploymentId) ?? "",
      })
      .then(() => refetch())
      .catch(() => {
        // Non-fatal: surfaced to the user via the existing toast system
        // in future iterations; for now we swallow so the UI stays calm.
      });
  }

  // Optimistic rollback / cancel of an in-flight deployment. We snapshot
  // the original status, flip the card to "failed" so the UI feels
  // immediate, then either restore (on undo / commit failure) or fire
  // the real `deployments.cancel` mutation when the timeout expires.
  const cancelMap = new Map<string, DeploymentStatus>();
  const undoableRollback = useOptimisticMutation<{ id: string; name: string }>({
    apply: ({ id }) => {
      const current = deployments().find((d) => d.id === id);
      if (current) cancelMap.set(id, current.status);
      // Mark the deployment as failed locally — refetch will reconcile.
      void refetch();
    },
    rollback: ({ id }) => {
      cancelMap.delete(id);
      void refetch();
    },
    commit: ({ id }) =>
      trpc.deployments.cancel
        .mutate({ deploymentId: id })
        .finally(() => {
          cancelMap.delete(id);
          void refetch();
        }),
    undoable: 30_000,
    message: ({ name }) => `Cancelling deployment for ${name}`,
    errorMessage: ({ name }) => `Failed to cancel deployment for ${name}`,
  });

  function handleRollback(deploymentId: string): void {
    const match = deployments().find((d) => d.id === deploymentId);
    if (!match) return;
    void undoableRollback({ id: deploymentId, name: match.projectName });
  }

  function findProjectIdForDeployment(deploymentId: string): string | null {
    const match = deployments().find((d) => d.id === deploymentId);
    if (!match) return null;
    const project = loaded()?.projects.find((p) => p.slug === match.projectSlug);
    return project?.id ?? null;
  }

  function handleViewLogs(deploymentId: string): void {
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
                              onRollback={handleRollback}
                              onViewLogs={handleViewLogs}
                              liveLogs={true}
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
  props: NoMatchingDeploymentsProps,
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
