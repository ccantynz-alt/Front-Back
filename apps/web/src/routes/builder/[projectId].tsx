// ── Builder Page Route ───────────────────────────────────────────────
// SolidStart route that mounts the collaborative website builder.
// Loads project data, initializes collab store, wraps in error boundary.

import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { Show, createSignal, createEffect, onCleanup } from "solid-js";
import { SmartErrorBoundary } from "../../components/ErrorBoundary";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { BuilderLayout } from "../../components/builder";
import { createCollabStore } from "../../stores/collab";
import { useEditor, type ComponentNode } from "../../stores/editor";

// ── Types ────────────────────────────────────────────────────────────

interface ProjectData {
  id: string;
  name: string;
  componentTree: ComponentNode[];
}

// ── Route Component ─────────────────────────────────────────────────

export default function BuilderProjectRoute(): ReturnType<typeof ProtectedRoute> {
  const params = useParams<{ projectId: string }>();
  const editor = useEditor();

  const [project, setProject] = createSignal<ProjectData | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // Initialize collab store
  const wsBaseUrl = typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/collab`
    : "ws://localhost:3001/api/collab";

  const collab = createCollabStore(wsBaseUrl);

  // Load project data
  createEffect((): void => {
    const projectId = params.projectId;
    if (!projectId) return;

    setLoading(true);
    setError(null);

    // Load project via fetch (tRPC would be used in production)
    fetch(`/api/projects/${projectId}`)
      .then(async (res) => {
        if (!res.ok) {
          // For now, use mock data if API not available
          const mockProject: ProjectData = {
            id: projectId,
            name: `Project ${projectId}`,
            componentTree: [],
          };
          setProject(mockProject);
          editor.setComponentTree(mockProject.componentTree);
          return;
        }
        const data = (await res.json()) as ProjectData;
        setProject(data);
        editor.setComponentTree(data.componentTree);
      })
      .catch(() => {
        // Fallback to empty project for development
        const mockProject: ProjectData = {
          id: projectId,
          name: `Project ${projectId}`,
          componentTree: [],
        };
        setProject(mockProject);
        editor.setComponentTree(mockProject.componentTree);
      })
      .finally(() => {
        setLoading(false);
      });
  });

  // Connect to collab room when project loads
  createEffect((): void => {
    const proj = project();
    if (!proj) return;

    collab.setUser({
      userId: `user-${Date.now()}`,
      displayName: "You",
      isAI: false,
    });
    collab.connect(proj.id);
  });

  // Cleanup on unmount
  onCleanup((): void => {
    collab.destroy();
  });

  function handlePublish(): void {
    const proj = project();
    if (!proj) return;
    // Publish would save and deploy
    const tree = editor.componentTree();
    void fetch(`/api/projects/${proj.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentTree: tree }),
    }).catch(() => {
      // Publish endpoint not yet available
    });
  }

  return (
    <ProtectedRoute>
      <Title>{project()?.name ?? "Builder"} - Cronix</Title>
      <SmartErrorBoundary>
        <Show
          when={!loading()}
          fallback={
            <div class="flex items-center justify-center h-screen bg-gray-50">
              <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span class="text-sm text-gray-500">Loading project...</span>
              </div>
            </div>
          }
        >
          <Show
            when={project()}
            fallback={
              <div class="flex items-center justify-center h-screen bg-gray-50">
                <div class="text-center">
                  <p class="text-lg font-semibold text-gray-800">Project not found</p>
                  <p class="text-sm text-gray-500 mt-1">{error() ?? "The requested project could not be loaded."}</p>
                  <a href="/dashboard" class="inline-block mt-4 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
                    Back to Dashboard
                  </a>
                </div>
              </div>
            }
          >
            {(proj) => (
              <BuilderLayout
                projectName={proj().name}
                projectId={proj().id}
                collab={{
                  peers: collab.peers,
                  localUser: collab.localUser,
                  connected: collab.connected,
                }}
                onPublish={handlePublish}
              />
            )}
          </Show>
        </Show>
      </SmartErrorBoundary>
    </ProtectedRoute>
  );
}
