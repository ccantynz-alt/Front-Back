import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import { For, Show, createMemo, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Badge, Button, Spinner } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { SEOHead } from "../components/SEOHead";
import { registerShortcut } from "../lib/keyboard";
import { trpc } from "../lib/trpc";
import { useUrlState } from "../lib/url-state";
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
        class="relative overflow-hidden rounded-2xl p-5 transition-all duration-300"
        style={{
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
        }}
      >

        <div class="relative z-10 flex flex-col gap-4">
          {/* Header: name + status */}
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <span class="text-xl shrink-0">
                {frameworkIcon(props.framework ?? "")}
              </span>
              <h3 class="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>
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
              <span class="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>
                Framework
              </span>
              <span class="text-xs" style={{ color: "var(--color-text)" }}>{props.framework ?? "Unknown"}</span>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>
                Updated
              </span>
              <span class="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {relativeTime(props.updatedAt)}
              </span>
            </div>
          </div>
        </div>

      </div>
    </A>
  );
}

// ── Empty State ─────────────────────────────────────────────────────

function EmptyState(): JSX.Element {
  return (
    <div class="flex flex-col items-center justify-center gap-6 py-24">
      <div class="flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: "var(--color-bg-subtle)" }}>
        <span class="text-4xl">{"\u{1F680}"}</span>
      </div>
      <div class="flex flex-col items-center gap-2 text-center">
        <h2 class="text-xl font-bold" style={{ color: "var(--color-text)" }}>No projects yet</h2>
        <p class="max-w-sm text-sm" style={{ color: "var(--color-text-secondary)" }}>
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
    { key: "projects", refetchInterval: 30_000 },
  );

  // ── URL-backed filter ─────────────────────────────────────────────
  // The text filter and status filter both round-trip through the
  // query string so a teammate can paste the URL and see exactly the
  // same view: /projects?filter=api&status=active. Browser back/
  // forward also walks through filter changes, which is the deep-
  // linking promise we want to deliver.
  const [filter, setFilter] = useUrlState("filter", "");
  const [statusFilter, setStatusFilter] = useUrlState("status", "all");

  const navigate = useNavigate();

  // ── Page-scoped keyboard shortcuts ────────────────────────────────
  // `c` → create a new project (context-aware: this is the projects
  // page, so "Create" means new project). `n` cycles through the list.
  onMount(() => {
    const offs = [
      registerShortcut({
        keys: "c",
        description: "Create a new project",
        group: "Project view",
        action: () => navigate("/projects/new"),
      }),
      registerShortcut({
        keys: "/",
        description: "Focus the project filter",
        group: "Project view",
        action: () => {
          const el = document.getElementById("projects-filter-input");
          if (el instanceof HTMLInputElement) el.focus();
        },
      }),
    ];
    onCleanup(() => {
      for (const off of offs) off();
    });
  });

  const filtered = createMemo(() => {
    const all = projects.data() ?? [];
    const q = filter().toLowerCase().trim();
    const status = statusFilter();
    return all.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.framework ?? "").toLowerCase().includes(q)
      );
    });
  });

  return (
    <ProtectedRoute>
      <SEOHead
        title="Projects"
        description="Manage and deploy your projects on Crontech."
        path="/projects"
      />
      <Title>Projects — Crontech</Title>

      <div class="min-h-screen" style={{ background: "var(--color-bg)" }}>
        <div class="mx-auto max-w-[1400px] px-6 py-8 lg:px-8">
          {/* ── Header ─────────────────────────────────────────────── */}
          <div class="mb-8 flex items-center justify-between gap-4">
            <div class="flex flex-col gap-1">
              <h1 class="text-3xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>
                Projects
              </h1>
              <p class="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                Your deployed apps and sites on the Crontech edge network.
              </p>
            </div>
            <A href="/projects/new">
              <Button variant="primary" size="md">
                New Project
              </Button>
            </A>
          </div>

          {/* ── Filter bar (URL-state backed) ──────────────────────── */}
          <div class="mb-6 flex flex-wrap items-center gap-3">
            <input
              id="projects-filter-input"
              type="search"
              placeholder="Filter projects… (press / to focus)"
              value={filter()}
              onInput={(e) => setFilter(e.currentTarget.value)}
              aria-label="Filter projects"
              class="flex-1 min-w-[220px] rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            />
            <select
              value={statusFilter()}
              onChange={(e) => setStatusFilter(e.currentTarget.value)}
              aria-label="Filter by status"
              class="rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="building">Building</option>
              <option value="deploying">Deploying</option>
              <option value="creating">Creating</option>
              <option value="stopped">Stopped</option>
              <option value="error">Error</option>
            </select>
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
              when={filtered().length > 0}
              fallback={
                <Show
                  when={(projects.data() ?? []).length > 0}
                  fallback={<EmptyState />}
                >
                  <div
                    class="py-16 text-center text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    No projects match this filter.
                  </div>
                </Show>
              }
            >
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <For each={filtered()}>
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
