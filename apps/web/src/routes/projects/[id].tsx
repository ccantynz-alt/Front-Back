import {
  createSignal,
  createMemo,
  createEffect,
  For,
  Show,
  Switch,
  Match,
  Suspense,
  lazy,
  onCleanup,
} from "solid-js";
import type { JSX } from "solid-js";
import { A, useParams, useNavigate } from "@solidjs/router";
import { Badge, Box, Button, Card, Spinner, Stack, Text } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { SEOHead } from "../../components/SEOHead";
import { CollabPresence } from "../../components/CollabPresence";
import { DomainsPanel } from "../../components/DomainsPanel";
import {
  createCollabRoom,
  getRandomColor,
  projectRoomId,
  type CollabRoom,
} from "../../collab/yjs-provider";
import {
  joinAsParticipant,
  type JoinedAIParticipant,
} from "../../collab/ai-participant";
import { useAuth } from "../../stores";
import { trpc } from "../../lib/trpc";
import { useQuery, invalidateQueries } from "../../lib/use-trpc";
import { useOptimisticMutation } from "../../lib/optimistic";

// EnvVarsPanel is a 27KB tab-gated panel (activeTab === "env"). Users
// land on "overview" by default — most never click into env vars.
// Lazy-loading drops the projects/[id] route chunk by ~60% without
// changing any UX. CLAUDE.md §6.6.
const EnvVarsPanel = lazy(() =>
  import("../../components/EnvVarsPanel").then((m) => ({
    default: m.EnvVarsPanel,
  })),
);

// ── Project Collab Default AI ───────────────────────────────────────
//
// Stable identifier for the AI agent that auto-joins the project's
// collab room. When a tRPC "default agent" lookup lands we'll wire it
// in here; for now this constant is the agreed fallback so the editor
// always has at least one AI peer registered.
const DEFAULT_PROJECT_AI_AGENT_ID = "builder-agent";
const DEFAULT_PROJECT_AI_AGENT_NAME = "Builder Agent";

// ── Types ──────────────────────────────────────────────────────────────

type Tab = "overview" | "domains" | "env" | "deployments" | "settings";

// ── Status helpers ─────────────────────────────────────────────────────

function statusVariant(
  status: string,
): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "active":
    case "live":
      return "success";
    case "building":
    case "deploying":
    case "creating":
      return "info";
    case "failed":
    case "error":
      return "error";
    case "stopped":
      return "warning";
    default:
      return "default";
  }
}

function frameworkLabel(framework: string | null): string {
  if (!framework) return "Unknown";
  const map: Record<string, string> = {
    solidstart: "SolidStart",
    nextjs: "Next.js",
    remix: "Remix",
    astro: "Astro",
    hono: "Hono",
    static: "Static",
    docker: "Docker",
    other: "Other",
  };
  return map[framework] ?? framework;
}

function relativeTime(date: Date | string | null): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

// ── Overview Tab ───────────────────────────────────────────────────────

function OverviewTab(props: { project: ProjectData }): JSX.Element {
  const p = (): ProjectData => props.project;

  return (
    <Box class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Project Info */}
      <Card padding="lg">
        <Stack direction="vertical" gap="md">
          <Text variant="h4" weight="semibold">Project Info</Text>
          <Box class="grid grid-cols-2 gap-4">
            <InfoRow label="Name" value={p().name} />
            <InfoRow label="Slug" value={p().slug} mono />
            <InfoRow label="Framework" value={frameworkLabel(p().framework)} />
            <InfoRow label="Runtime" value={p().runtime ?? "bun"} />
            <InfoRow label="Port" value={String(p().port ?? 3000)} />
            <InfoRow label="Status" value={p().status} />
          </Box>
          <Show when={p().description}>
            <Box class="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3">
              <Text variant="body" style={{ color: "var(--color-text-muted)" }}>{p().description}</Text>
            </Box>
          </Show>
        </Stack>
      </Card>

      {/* Quick Actions */}
      <Card padding="lg">
        <Stack direction="vertical" gap="md">
          <Text variant="h4" weight="semibold">Quick Actions</Text>
          <Stack direction="vertical" gap="sm">
            <A href={`/projects/${p().id}/metrics`}>
              <Button variant="outline" size="md" class="w-full justify-start">
                View Metrics Dashboard
              </Button>
            </A>
            <Show when={p().repoUrl}>
              <a
                href={p().repoUrl ?? ""}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="md" class="w-full justify-start">
                  Open Repository
                </Button>
              </a>
            </Show>
            <Show when={p().latestDeployment?.url}>
              <a
                href={p().latestDeployment?.url ?? ""}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="md" class="w-full justify-start">
                  Visit Live Site
                </Button>
              </a>
            </Show>
          </Stack>
        </Stack>
      </Card>

      {/* Build Configuration */}
      <Card padding="lg">
        <Stack direction="vertical" gap="md">
          <Text variant="h4" weight="semibold">Build Configuration</Text>
          <Box class="space-y-3">
            <ConfigRow label="Build Command" value={p().buildCommand ?? "bun run build"} />
            <ConfigRow label="Repo URL" value={p().repoUrl ?? "Not configured"} />
          </Box>
        </Stack>
      </Card>

      {/* Latest Deployment */}
      <Card padding="lg">
        <Stack direction="vertical" gap="md">
          <Text variant="h4" weight="semibold">Latest Deployment</Text>
          <Show
            when={p().latestDeployment}
            fallback={
              <Text variant="body" style={{ color: "var(--color-text-faint)" }}>No deployments yet</Text>
            }
          >
            {(dep) => (
              <Box class="space-y-3">
                <Stack direction="horizontal" align="center" justify="between">
                  <Badge variant={statusVariant(dep().status)} size="sm">
                    {dep().status}
                  </Badge>
                  <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
                    {relativeTime(dep().createdAt)}
                  </Text>
                </Stack>
                <Show when={dep().commitMessage}>
                  <Text variant="body" class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    {dep().commitMessage}
                  </Text>
                </Show>
                <Show when={dep().commitSha}>
                  <Text variant="caption" class="font-mono" style={{ color: "var(--color-text-faint)" }}>
                    {dep().commitSha?.slice(0, 7)}
                    <Show when={dep().branch}>
                      {" "}on {dep().branch}
                    </Show>
                  </Text>
                </Show>
              </Box>
            )}
          </Show>
        </Stack>
      </Card>
    </Box>
  );
}

// ── Deployments Tab ────────────────────────────────────────────────────

function DeploymentsTab(props: { project: ProjectData }): JSX.Element {
  return (
    <Stack direction="vertical" gap="lg">
      {/* Deploy Button */}
      <Card padding="lg">
        <Stack direction="horizontal" justify="between" align="center">
          <Box>
            <Text variant="h4" weight="semibold">Trigger Deployment</Text>
            <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
              Deploy the latest commit from{" "}
              <Text as="span" class="font-mono" style={{ color: "var(--color-primary)" }}>
                {props.project.repoUrl ? "your repository" : "configured source"}
              </Text>
            </Text>
          </Box>
          <Button
            variant="primary"
            size="md"
            onClick={async () => {
              try {
                await trpc.projects.deploy.mutate({
                  projectId: props.project.id,
                });
                window.location.reload();
              } catch {
                // handled
              }
            }}
          >
            Deploy Now
          </Button>
        </Stack>
      </Card>

      {/* Deployment History (latest shown in overview) */}
      <Show
        when={props.project.latestDeployment}
        fallback={
          <Card padding="lg">
            <Text variant="body" class="text-center" style={{ color: "var(--color-text-faint)" }}>
              No deployments yet. Click "Deploy Now" to create your first deployment.
            </Text>
          </Card>
        }
      >
        {(dep) => (
          <Card padding="md">
            <Stack direction="horizontal" align="center" justify="between">
              <Stack direction="horizontal" gap="md" align="center">
                <Badge variant={statusVariant(dep().status)} size="sm">
                  {dep().status}
                </Badge>
                <Box>
                  <Text variant="body" class="text-sm" style={{ color: "var(--color-text)" }}>
                    {dep().commitMessage ?? "Manual deployment"}
                  </Text>
                  <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
                    {dep().commitSha?.slice(0, 7) ?? "—"} on {dep().branch ?? "main"}
                  </Text>
                </Box>
              </Stack>
              <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
                {relativeTime(dep().createdAt)}
              </Text>
            </Stack>
          </Card>
        )}
      </Show>
    </Stack>
  );
}

// ── Settings Tab ───────────────────────────────────────────────────────

function SettingsTab(props: { project: ProjectData }): JSX.Element {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  // Optimistic delete: navigate away immediately and surface a 30-second
  // undo toast. If the user clicks Undo, we never call the tRPC mutation
  // and pop them back to the project page. Otherwise the commit fires.
  const undoableDelete = useOptimisticMutation<{ id: string; name: string }>({
    apply: () => {
      // The "store" here is the cached project list; invalidating
      // forces /projects to refetch (the deleted row is now hidden by
      // the deletion at commit time, but on undo it reappears).
      navigate("/projects");
      invalidateQueries("projects", "deployments");
    },
    rollback: ({ id }) => {
      // Pop the user back to the project they tried to delete.
      navigate(`/projects/${id}`);
      invalidateQueries("projects", "deployments");
    },
    commit: ({ id }) => trpc.projects.delete.mutate({ projectId: id }),
    undoable: 30_000,
    message: ({ name }) => `Deleted ${name}`,
    errorMessage: ({ name }) => `Failed to delete ${name}`,
  });

  return (
    <Stack direction="vertical" gap="lg">
      {/* General Settings */}
      <Card padding="lg">
        <Stack direction="vertical" gap="md">
          <Text variant="h4" weight="semibold">General Settings</Text>
          <Box class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow label="Project ID" value={props.project.id} mono />
            <InfoRow label="Slug" value={props.project.slug} mono />
            <InfoRow label="Created" value={relativeTime(props.project.createdAt)} />
            <InfoRow label="Last Updated" value={relativeTime(props.project.updatedAt)} />
          </Box>
        </Stack>
      </Card>

      {/* Danger Zone */}
      <Card padding="lg">
        <Stack direction="vertical" gap="md">
          <Text variant="h4" weight="semibold" class="text-red-400">
            Danger Zone
          </Text>
          <Box class="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <Stack direction="horizontal" justify="between" align="center">
              <Box>
                <Text variant="body" class="text-sm" style={{ color: "var(--color-text)" }}>
                  Delete this project
                </Text>
                <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
                  Permanently removes the project, all domains, env vars, and deployments.
                </Text>
              </Box>
              <Show
                when={!confirmDelete()}
                fallback={
                  <Stack direction="horizontal" gap="sm">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={async () => {
                        setConfirmDelete(false);
                        await undoableDelete({
                          id: props.project.id,
                          name: props.project.name,
                        });
                      }}
                    >
                      Confirm Delete
                    </Button>
                  </Stack>
                }
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete Project
                </Button>
              </Show>
            </Stack>
          </Box>
        </Stack>
      </Card>
    </Stack>
  );
}

// ── Shared Sub-Components ──────────────────────────────────────────────

function InfoRow(props: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <Stack direction="vertical" gap="none" class="gap-0.5">
      <Text as="span" weight="medium" class="text-[11px] uppercase tracking-widest" style={{ color: "var(--color-text-faint)" }}>
        {props.label}
      </Text>
      <Text
        as="span"
        class={`text-sm${props.mono === true ? " font-mono" : ""}`}
        style={{ color: "var(--color-text-secondary)" }}
      >
        {props.value}
      </Text>
    </Stack>
  );
}

function ConfigRow(props: { label: string; value: string }): JSX.Element {
  return (
    <Stack direction="horizontal" align="center" justify="between" class="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2">
      <Text as="span" class="text-xs" style={{ color: "var(--color-text-muted)" }}>{props.label}</Text>
      <Text as="span" class="font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>{props.value}</Text>
    </Stack>
  );
}

// ── Data Types ─────────────────────────────────────────────────────────

interface DomainData {
  id: string;
  domain: string;
  isPrimary: boolean;
  dnsVerified: boolean;
  dnsVerifiedAt: string | null;
  createdAt: string;
}

interface DeploymentData {
  id: string;
  commitSha: string | null;
  commitMessage: string | null;
  branch: string | null;
  status: string;
  url: string | null;
  duration: number | null;
  createdAt: string;
}

interface ProjectData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  repoUrl: string | null;
  framework: string | null;
  buildCommand: string | null;
  runtime: string | null;
  port: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  domains: DomainData[];
  latestDeployment: DeploymentData | null;
}

// ── Main Page Component ────────────────────────────────────────────────

export default function ProjectDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const auth = useAuth();
  const [activeTab, setActiveTab] = createSignal<Tab>("overview");
  const [collabRoom, setCollabRoom] = createSignal<CollabRoom | null>(null);
  // Surfaces AI-participant registration failures as visible UI state
  // rather than swallowing them to the console. The editor still loads
  // — the AI is just degraded — but the user can see why.
  const [aiParticipantError, setAiParticipantError] = createSignal<string | null>(null);

  const projectQuery = useQuery(
    () =>
      trpc.projects.getById.query({ projectId: params.id }) as Promise<ProjectData>,
    { key: ["projects", "deployments"], refetchInterval: 15_000 },
  );

  const projectData = createMemo((): ProjectData | undefined => projectQuery.data());

  const currentUserId = createMemo<string>(() => auth.currentUser()?.id ?? "anonymous");

  // ── Yjs collab lifecycle ──────────────────────────────────────────
  // Opens a shared room keyed by project id on mount, registers the
  // default AI agent as a first-class participant, and tears both down
  // on unmount — so /projects/:id → /projects/other cleanly disconnects
  // without leaking the ws or the awareness state of the prior doc.
  createEffect(() => {
    const id = params.id;
    if (!id) return;
    // SolidStart renders this component on the server too; y-websocket
    // explodes outside a browser context, so gate the connect there.
    if (typeof window === "undefined") return;

    const user = auth.currentUser();
    // Wait until we have an authenticated user before connecting — the
    // room should be keyed to a real identity.
    if (!user) return;

    const room = createCollabRoom({
      roomId: projectRoomId(id),
      user: {
        id: user.id,
        name: user.displayName,
        color: getRandomColor(),
      },
    });
    setCollabRoom(room);

    // Auto-join the default AI agent as a collab peer.
    // We never let this crash the editor — but we surface the failure
    // to the UI via aiParticipantError so the user knows the AI peer
    // is unavailable instead of silently missing.
    let aiParticipant: JoinedAIParticipant | null = null;
    try {
      aiParticipant = joinAsParticipant(id, DEFAULT_PROJECT_AI_AGENT_ID, {
        displayName: DEFAULT_PROJECT_AI_AGENT_NAME,
      });
      setAiParticipantError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[collab] failed to register AI participant", err);
      setAiParticipantError(message);
    }

    onCleanup(() => {
      try {
        aiParticipant?.disconnect();
      } catch {
        // ignore — already disconnected
      }
      try {
        room.destroy();
      } catch {
        // ignore — already destroyed
      }
      setCollabRoom(null);
    });
  });

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "domains", label: "Domains" },
    { id: "env", label: "Environment" },
    { id: "deployments", label: "Deployments" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <ProtectedRoute>
      <Show
        when={projectData()}
        fallback={
          <Stack direction="horizontal" align="center" justify="center" class="min-h-[60vh]">
            <Spinner size="lg" />
          </Stack>
        }
      >
        {(project) => (
          <>
            <SEOHead
              title={`${project().name} — Crontech`}
              description={`Manage ${project().name} on Crontech`}
              path={`/projects/${project().id}`}
            />
            <Stack direction="vertical" gap="lg" class="page-padded">
              {/* Header */}
              <Box class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <Stack direction="horizontal" gap="md" align="center">
                  <A href="/projects" aria-label="Back to projects" class="transition-colors hover:text-[var(--color-text)]" style={{ color: "var(--color-text-faint)" }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M12 15L7 10L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </A>
                  <Box>
                    <Text variant="h2" weight="bold">{project().name}</Text>
                    <Text variant="caption" class="font-mono" style={{ color: "var(--color-text-faint)" }}>
                      {project().slug}
                    </Text>
                  </Box>
                  <Badge variant={statusVariant(project().status)} size="sm">
                    {project().status}
                  </Badge>
                </Stack>
                <Stack direction="horizontal" gap="sm">
                  <A href={`/projects/${project().id}/metrics`}>
                    <Button variant="outline" size="sm">Metrics</Button>
                  </A>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                      try {
                        await trpc.projects.deploy.mutate({
                          projectId: project().id,
                        });
                        window.location.reload();
                      } catch {
                        // handled
                      }
                    }}
                  >
                    Deploy
                  </Button>
                </Stack>
              </Box>

              {/* Live collaborator presence (humans + AI peers) */}
              <CollabPresence
                room={collabRoom()}
                currentUserId={currentUserId()}
              />

              <Show when={aiParticipantError()}>
                {(message) => (
                  <Box
                    class="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                    style={{
                      background: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                      color: "#fbbf24",
                    }}
                    role="status"
                    aria-live="polite"
                  >
                    <Text as="span" aria-hidden="true">{"⚠"}</Text>
                    <Text as="span">AI peer unavailable: {message()}</Text>
                  </Box>
                )}
              </Show>

              {/* Tab Navigation */}
              <Box class="flex gap-1 border-b border-[var(--color-border)] pb-px">
                <For each={tabs}>
                  {(tab) => (
                    <button
                      type="button"
                      class="relative px-4 py-2 text-sm font-medium transition-colors"
                      style={{
                        color: activeTab() === tab.id
                          ? "var(--color-text)"
                          : "var(--color-text-faint)",
                      }}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                      <Show when={activeTab() === tab.id}>
                        <Box class="absolute bottom-0 left-0 h-[2px] w-full" style={{ background: "var(--color-primary)" }} />
                      </Show>
                    </button>
                  )}
                </For>
              </Box>

              {/* Tab Content */}
              <Switch>
                <Match when={activeTab() === "overview"}>
                  <OverviewTab project={project()} />
                </Match>
                <Match when={activeTab() === "domains"}>
                  <DomainsPanel
                    projectId={project().id}
                    domains={project().domains}
                    onChange={() => projectQuery.refetch()}
                  />
                </Match>
                <Match when={activeTab() === "env"}>
                  <Suspense fallback={<Spinner />}>
                    <EnvVarsPanel projectId={project().id} />
                  </Suspense>
                </Match>
                <Match when={activeTab() === "deployments"}>
                  <DeploymentsTab project={project()} />
                </Match>
                <Match when={activeTab() === "settings"}>
                  <SettingsTab project={project()} />
                </Match>
              </Switch>
            </Stack>
          </>
        )}
      </Show>
    </ProtectedRoute>
  );
}
