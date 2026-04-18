import { createSignal, createMemo, For, Show, Switch, Match } from "solid-js";
import type { JSX } from "solid-js";
import { A, useParams, useNavigate } from "@solidjs/router";
import { Badge, Button, Card, Stack, Text, Spinner } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { SEOHead } from "../../components/SEOHead";
import { EnvVarsPanel } from "../../components/EnvVarsPanel";
import { DomainsPanel } from "../../components/DomainsPanel";
import { trpc } from "../../lib/trpc";
import { useQuery } from "../../lib/use-trpc";

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
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Project Info */}
      <Card padding="lg">
        <Stack direction="vertical" gap="md">
          <Text variant="h4" weight="semibold">Project Info</Text>
          <div class="grid grid-cols-2 gap-4">
            <InfoRow label="Name" value={p().name} />
            <InfoRow label="Slug" value={p().slug} mono />
            <InfoRow label="Framework" value={frameworkLabel(p().framework)} />
            <InfoRow label="Runtime" value={p().runtime ?? "bun"} />
            <InfoRow label="Port" value={String(p().port ?? 3000)} />
            <InfoRow label="Status" value={p().status} />
          </div>
          <Show when={p().description}>
            <div class="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3">
              <Text variant="body" style={{ color: "var(--color-text-muted)" }}>{p().description}</Text>
            </div>
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
          <div class="space-y-3">
            <ConfigRow label="Build Command" value={p().buildCommand ?? "bun run build"} />
            <ConfigRow label="Repo URL" value={p().repoUrl ?? "Not configured"} />
          </div>
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
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <Badge variant={statusVariant(dep().status)} size="sm">
                    {dep().status}
                  </Badge>
                  <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
                    {relativeTime(dep().createdAt)}
                  </Text>
                </div>
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
              </div>
            )}
          </Show>
        </Stack>
      </Card>
    </div>
  );
}

// ── Deployments Tab ────────────────────────────────────────────────────

function DeploymentsTab(props: { project: ProjectData }): JSX.Element {
  return (
    <Stack direction="vertical" gap="lg">
      {/* Deploy Button */}
      <Card padding="lg">
        <Stack direction="horizontal" justify="between" align="center">
          <div>
            <Text variant="h4" weight="semibold">Trigger Deployment</Text>
            <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
              Deploy the latest commit from{" "}
              <span class="font-mono" style={{ color: "var(--color-primary)" }}>
                {props.project.repoUrl ? "your repository" : "configured source"}
              </span>
            </Text>
          </div>
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
            <div class="flex items-center justify-between">
              <Stack direction="horizontal" gap="md" align="center">
                <Badge variant={statusVariant(dep().status)} size="sm">
                  {dep().status}
                </Badge>
                <div>
                  <Text variant="body" class="text-sm" style={{ color: "var(--color-text)" }}>
                    {dep().commitMessage ?? "Manual deployment"}
                  </Text>
                  <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
                    {dep().commitSha?.slice(0, 7) ?? "—"} on {dep().branch ?? "main"}
                  </Text>
                </div>
              </Stack>
              <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
                {relativeTime(dep().createdAt)}
              </Text>
            </div>
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

  return (
    <Stack direction="vertical" gap="lg">
      {/* General Settings */}
      <Card padding="lg">
        <Stack direction="vertical" gap="md">
          <Text variant="h4" weight="semibold">General Settings</Text>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow label="Project ID" value={props.project.id} mono />
            <InfoRow label="Slug" value={props.project.slug} mono />
            <InfoRow label="Created" value={relativeTime(props.project.createdAt)} />
            <InfoRow label="Last Updated" value={relativeTime(props.project.updatedAt)} />
          </div>
        </Stack>
      </Card>

      {/* Danger Zone */}
      <Card padding="lg">
        <Stack direction="vertical" gap="md">
          <Text variant="h4" weight="semibold" class="text-red-400">
            Danger Zone
          </Text>
          <div class="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <Stack direction="horizontal" justify="between" align="center">
              <div>
                <Text variant="body" class="text-sm" style={{ color: "var(--color-text)" }}>
                  Delete this project
                </Text>
                <Text variant="caption" style={{ color: "var(--color-text-faint)" }}>
                  Permanently removes the project, all domains, env vars, and deployments.
                </Text>
              </div>
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
                        try {
                          await trpc.projects.delete.mutate({
                            projectId: props.project.id,
                          });
                          navigate("/projects");
                        } catch {
                          setConfirmDelete(false);
                        }
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
          </div>
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
    <div class="flex flex-col gap-0.5">
      <span class="text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--color-text-faint)" }}>
        {props.label}
      </span>
      <span
        class="text-sm"
        classList={{ "font-mono": props.mono === true }}
        style={{ color: "var(--color-text-secondary)" }}
      >
        {props.value}
      </span>
    </div>
  );
}

function ConfigRow(props: { label: string; value: string }): JSX.Element {
  return (
    <div class="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2">
      <span class="text-xs" style={{ color: "var(--color-text-muted)" }}>{props.label}</span>
      <span class="font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>{props.value}</span>
    </div>
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
  const [activeTab, setActiveTab] = createSignal<Tab>("overview");

  const projectQuery = useQuery(
    () =>
      trpc.projects.getById.query({ projectId: params.id }) as Promise<ProjectData>,
    { key: ["projects", "deployments"], refetchInterval: 15_000 },
  );

  const projectData = createMemo((): ProjectData | undefined => projectQuery.data());

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
          <div class="flex min-h-[60vh] items-center justify-center">
            <Spinner size="lg" />
          </div>
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
              <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex items-center gap-4">
                  <A href="/projects" class="transition-colors hover:text-[var(--color-text)]" style={{ color: "var(--color-text-faint)" }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M12 15L7 10L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </A>
                  <div>
                    <Text variant="h2" weight="bold">{project().name}</Text>
                    <Text variant="caption" class="font-mono" style={{ color: "var(--color-text-faint)" }}>
                      {project().slug}
                    </Text>
                  </div>
                  <Badge variant={statusVariant(project().status)} size="sm">
                    {project().status}
                  </Badge>
                </div>
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
              </div>

              {/* Tab Navigation */}
              <div class="flex gap-1 border-b border-[var(--color-border)] pb-px">
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
                        <div class="absolute bottom-0 left-0 h-[2px] w-full" style={{ background: "var(--color-primary)" }} />
                      </Show>
                    </button>
                  )}
                </For>
              </div>

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
                  <EnvVarsPanel projectId={project().id} />
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
