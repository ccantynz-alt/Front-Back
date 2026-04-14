import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Badge, Button, Spinner } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { SEOHead } from "../components/SEOHead";
import { trpc } from "../lib/trpc";
import { useQuery } from "../lib/use-trpc";

// ── Status Badge Mapping ────────────────────────────────────────────

type ProjectStatus = "creating" | "active" | "building" | "deploying" | "stopped" | "error";

function statusVariant(
  status: ProjectStatus,
): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "active":
      return "success";
    case "creating":
    case "building":
    case "deploying":
      return "info";
    case "error":
      return "error";
    case "stopped":
      return "warning";
  }
}

function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case "creating":
      return "Creating";
    case "active":
      return "Active";
    case "building":
      return "Building";
    case "deploying":
      return "Deploying";
    case "error":
      return "Error";
    case "stopped":
      return "Stopped";
  }
}

// ── Framework Icon ──────────────────────────────────────────────────

function frameworkIcon(framework: string): string {
  const lower = framework.toLowerCase();
  if (lower.includes("solid")) return "\u269B";
  if (lower.includes("next")) return "\u25B2";
  if (lower.includes("react")) return "\u269B";
  if (lower.includes("svelte")) return "\u{1F525}";
  if (lower.includes("vue")) return "\u{1F49A}";
  if (lower.includes("astro")) return "\u{1F680}";
  if (lower.includes("hono")) return "\u{1F525}";
  if (lower.includes("static")) return "\u{1F4C4}";
  return "\u{1F4E6}";
}

// ── Relative Time ───────────────────────────────────────────────────

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ── Project Card ────────────────────────────────────────────────────

interface ProjectCardProps {
  id: string;
  name: string;
  status: ProjectStatus;
  framework: string | null;
  updatedAt: string;
}

function ProjectCard(props: ProjectCardProps): JSX.Element {
  return (
    <A href={`/projects/${props.id}`} class="block group">
      <div
        class="relative overflow-hidden rounded-2xl border border-white/[0.06] p-5 transition-all duration-300 hover:border-white/[0.12] hover:shadow-xl hover:shadow-black/30"
        style={{
          background:
            "linear-gradient(135deg, rgba(17,17,17,0.9) 0%, rgba(10,10,10,0.95) 100%)",
        }}
      >
        {/* Top glow */}
        <div class="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-violet-500/10 blur-3xl transition-opacity duration-500 group-hover:opacity-60" />

        <div class="relative z-10 flex flex-col gap-4">
          {/* Header: name + status */}
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <span class="text-xl shrink-0">
                {frameworkIcon(props.framework ?? "")}
              </span>
              <h3 class="text-sm font-semibold text-white truncate">
                {props.name}
              </h3>
            </div>
            <Badge
              variant={statusVariant(props.status)}
              size="sm"
            >
              {statusLabel(props.status)}
            </Badge>
          </div>

          {/* Details */}
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                Framework
              </span>
              <span class="text-xs text-gray-300">{props.framework ?? "Unknown"}</span>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                Updated
              </span>
              <span class="text-xs text-gray-400">
                {relativeTime(props.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom shimmer */}
        <div class="absolute bottom-0 left-0 h-[2px] w-full opacity-0 transition-opacity duration-500 group-hover:opacity-60 bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
      </div>
    </A>
  );
}

// ── Empty State ─────────────────────────────────────────────────────

function EmptyState(): JSX.Element {
  return (
    <div class="flex flex-col items-center justify-center gap-6 py-24">
      <div class="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-600/20">
        <span class="text-4xl">{"\u{1F680}"}</span>
      </div>
      <div class="flex flex-col items-center gap-2 text-center">
        <h2 class="text-xl font-bold text-white">No projects yet</h2>
        <p class="max-w-sm text-sm text-gray-500">
          Deploy your first app on Crontech. Connect a repo or start from a
          template and have it live on the edge in under a minute.
        </p>
      </div>
      <A href="/projects/new">
        <Button variant="primary" size="md">
          Create your first project
        </Button>
      </A>
    </div>
  );
}

// ── Projects Page ───────────────────────────────────────────────────

export default function ProjectsPage(): ReturnType<typeof ProtectedRoute> {
  const projects = useQuery(() =>
    trpc.projects.list.query().catch(() => []),
  );

  return (
    <ProtectedRoute>
      <SEOHead
        title="Projects"
        description="Manage and deploy your projects on Crontech."
        path="/projects"
      />
      <Title>Projects — Crontech</Title>

      <div class="min-h-screen bg-[#060606]">
        <div class="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          {/* ── Header ─────────────────────────────────────────────── */}
          <div class="mb-8 flex items-center justify-between gap-4">
            <div class="flex flex-col gap-1">
              <h1 class="text-3xl font-bold tracking-tight text-white">
                Projects
              </h1>
              <p class="text-sm text-gray-500">
                Your deployed apps and sites on the Crontech edge network.
              </p>
            </div>
            <A href="/projects/new">
              <Button variant="primary" size="md">
                New Project
              </Button>
            </A>
          </div>

          {/* ── Content ────────────────────────────────────────────── */}
          <Show
            when={!projects.loading()}
            fallback={
              <div class="flex items-center justify-center py-24">
                <Spinner size="lg" />
              </div>
            }
          >
            <Show
              when={(projects.data() ?? []).length > 0}
              fallback={<EmptyState />}
            >
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <For each={projects.data()}>
                  {(project) => (
                    <ProjectCard
                      id={project.id}
                      name={project.name}
                      status={project.status}
                      framework={project.framework}
                      updatedAt={project.updatedAt}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </ProtectedRoute>
  );
}
