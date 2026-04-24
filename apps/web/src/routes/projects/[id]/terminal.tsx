import { Title } from "@solidjs/meta";
import { A, useParams, useNavigate } from "@solidjs/router";
import { Show, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../../../components/ProtectedRoute";
import { Terminal } from "../../../components/Terminal";
import { SEOHead } from "../../../components/SEOHead";
import { trpc } from "../../../lib/trpc";
import { useQuery } from "../../../lib/use-trpc";

// ── Types ────────────────────────────────────────────────────────────

interface ProjectMeta {
  name: string;
  framework: string | null;
  runtime: string | null;
}

// ── Terminal Page ───────────────────────────────────────────────────

function TerminalPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = createSignal(false);

  const projectId = (): string => params.id;

  // Fetch real project metadata from the API. Falls back gracefully if
  // the ID is invalid or the network is unavailable — the terminal
  // itself still works, we just show a degraded header.
  const projectQuery = useQuery(
    () =>
      trpc.projects.getById
        .query({ projectId: projectId() })
        .catch(() => null) as Promise<ProjectMeta | null>,
    { key: ["projects"] },
  );

  const project = (): ProjectMeta => {
    const data = projectQuery.data();
    if (data) return data;
    // Derive a display name from the raw ID while loading or on error.
    const id = projectId();
    return {
      name: id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      framework: null,
      runtime: null,
    };
  };

  // Toggle fullscreen mode
  function toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen not available
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {
        // Exit fullscreen failed
      });
      setIsFullscreen(false);
    }
  }

  // Listen for fullscreen change events
  onMount(() => {
    function handleFullscreenChange(): void {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    // Cleanup handled by SolidJS reactivity lifecycle naturally on page leave
    return (): void => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  });

  return (
    <ProtectedRoute>
      <SEOHead
        title={`Terminal - ${project().name}`}
        description={`Web terminal for ${project().name}`}
        path={`/projects/${projectId()}/terminal`}
      />
      <Title>{`Terminal - ${project().name} | Crontech`}</Title>

      <div class="flex flex-col h-screen" style={{ background: "var(--color-bg)" }}>
        {/* Header */}
        <header
          class="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] shrink-0"
          style={{ background: "var(--color-bg-subtle)" }}
        >
          {/* Left section */}
          <div class="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              aria-label="Go back"
            >
              <span class="mr-1">&larr;</span>
              Back
            </Button>

            <div class="h-5 w-px bg-[var(--color-border)]" />

            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{project().name}</span>
              <Show when={project().framework}>
                <Badge variant="default">{project().framework}</Badge>
              </Show>
              <Show when={project().runtime}>
                <Badge variant="default">{project().runtime}</Badge>
              </Show>
            </div>
          </div>

          {/* Right section */}
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              aria-label={isFullscreen() ? "Exit fullscreen" : "Enter fullscreen"}
            >
              <Show when={!isFullscreen()} fallback={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 1H1v4M15 1h-4M1 11v4h4M11 15h4v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              }>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </Show>
            </Button>

            <A href={`/dashboard`}>
              <Button variant="ghost" size="sm">
                Dashboard
              </Button>
            </A>
          </div>
        </header>

        {/* Terminal fills remaining space */}
        <div class="flex-1 min-h-0">
          <Terminal projectId={projectId()} />
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default TerminalPage;
