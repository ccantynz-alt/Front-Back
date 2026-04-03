// ── Projects Store ───────────────────────────────────────────────────
// Reactive project state: current project, project list (async loaded),
// active page, unsaved changes tracking, and project settings.
// Uses module-level signals for global reactive state.

import { type Accessor, createEffect, createResource, createSignal } from "solid-js";
import { isServer } from "solid-js/web";

// ── Types ────────────────────────────────────────────────────────────

export interface ProjectSettings {
  name: string;
  description: string;
  favicon?: string;
  customDomain?: string;
  isPublic: boolean;
  seoTitle?: string;
  seoDescription?: string;
  analytics?: {
    enabled: boolean;
    trackingId?: string;
  };
}

export interface ProjectPage {
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  status: "draft" | "published" | "archived";
}

export interface ProjectDetail extends Project {
  pages: ProjectPage[];
  settings: ProjectSettings;
}

export interface ProjectsStore {
  /** List of all user projects (async loaded) */
  projects: Accessor<Project[] | undefined>;
  /** Whether projects are loading */
  projectsLoading: Accessor<boolean>;
  /** Error from loading projects */
  projectsError: Accessor<Error | undefined>;
  /** Currently active project (full detail) */
  currentProject: Accessor<ProjectDetail | null>;
  /** Currently active page within the project */
  activePage: Accessor<ProjectPage | null>;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: Accessor<boolean>;
  /** Map of dirty field paths for granular tracking */
  dirtyFields: Accessor<ReadonlySet<string>>;
  /** Refetch the project list */
  refetchProjects: () => void;
  /** Set the current project */
  setCurrentProject: (project: ProjectDetail | null) => void;
  /** Set the active page by id */
  setActivePage: (pageId: string | null) => void;
  /** Mark a field as dirty (unsaved) */
  markDirty: (fieldPath: string) => void;
  /** Clear all dirty fields (after save) */
  clearDirty: () => void;
  /** Update project settings locally */
  updateSettings: (updates: Partial<ProjectSettings>) => void;
  /** Create a new project (returns the created project) */
  createProject: (name: string, description?: string) => Promise<Project>;
  /** Delete a project */
  deleteProject: (projectId: string) => Promise<void>;
  /** Duplicate a project */
  duplicateProject: (projectId: string) => Promise<Project>;
}

// ── API Fetcher ──────────────────────────────────────────────────────

async function fetchProjects(): Promise<Project[]> {
  // tRPC integration point — will call trpc.projects.list.query()
  // For now, uses fetch as a placeholder until tRPC client is wired
  const response = await fetch("/api/trpc/projects.list");
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }
  const data = (await response.json()) as { result: { data: Project[] } };
  return data.result.data;
}

// ── Signals ──────────────────────────────────────────────────────────

const [currentProject, setCurrentProjectSignal] = createSignal<ProjectDetail | null>(null);
const [activePage, setActivePageSignal] = createSignal<ProjectPage | null>(null);
const [dirtyFields, setDirtyFields] = createSignal<ReadonlySet<string>>(new Set());

// createResource for async project list loading
const [projects, { refetch: refetchProjects }] = createResource<Project[]>(
  () => !isServer,
  fetchProjects,
);

// ── Derived Signals ──────────────────────────────────────────────────

const hasUnsavedChanges: Accessor<boolean> = (): boolean => dirtyFields().size > 0;
const projectsLoading: Accessor<boolean> = (): boolean => projects.loading;
const projectsError: Accessor<Error | undefined> = (): Error | undefined => {
  const err = projects.error;
  return err instanceof Error ? err : err ? new Error(String(err)) : undefined;
};

// ── Actions ──────────────────────────────────────────────────────────

function setCurrentProject(project: ProjectDetail | null): void {
  setCurrentProjectSignal(project);
  // Reset active page to home page or null
  if (project) {
    const homePage = project.pages.find((p) => p.isHome) ?? project.pages[0] ?? null;
    setActivePageSignal(homePage);
  } else {
    setActivePageSignal(null);
  }
  // Clear dirty state when switching projects
  setDirtyFields(new Set());
}

function setActivePage(pageId: string | null): void {
  if (!pageId) {
    setActivePageSignal(null);
    return;
  }
  const project = currentProject();
  if (!project) return;
  const page = project.pages.find((p) => p.id === pageId) ?? null;
  setActivePageSignal(page);
}

function markDirty(fieldPath: string): void {
  setDirtyFields((prev) => {
    const next = new Set(prev);
    next.add(fieldPath);
    return next;
  });
}

function clearDirty(): void {
  setDirtyFields(new Set());
}

function updateSettings(updates: Partial<ProjectSettings>): void {
  const project = currentProject();
  if (!project) return;

  const updatedSettings: ProjectSettings = { ...project.settings, ...updates };
  setCurrentProjectSignal({
    ...project,
    settings: updatedSettings,
    updatedAt: Date.now(),
  });

  // Mark each updated field as dirty
  for (const key of Object.keys(updates)) {
    markDirty(`settings.${key}`);
  }
}

async function createProject(name: string, description?: string): Promise<Project> {
  const response = await fetch("/api/trpc/projects.create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description ?? "" }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create project: ${response.statusText}`);
  }
  const data = (await response.json()) as { result: { data: Project } };
  refetchProjects();
  return data.result.data;
}

async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/trpc/projects.delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: projectId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to delete project: ${response.statusText}`);
  }
  // If we deleted the current project, clear it
  if (currentProject()?.id === projectId) {
    setCurrentProject(null);
  }
  refetchProjects();
}

async function duplicateProject(projectId: string): Promise<Project> {
  const response = await fetch(`/api/trpc/projects.duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: projectId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to duplicate project: ${response.statusText}`);
  }
  const data = (await response.json()) as { result: { data: Project } };
  refetchProjects();
  return data.result.data;
}

// ── Warn on unsaved changes before unload ────────────────────────────

if (!isServer) {
  window.addEventListener("beforeunload", (e: BeforeUnloadEvent): void => {
    if (hasUnsavedChanges()) {
      e.preventDefault();
    }
  });
}

// ── Exported Store ───────────────────────────────────────────────────

export const projectsStore: ProjectsStore = {
  projects: (): Project[] | undefined => projects(),
  projectsLoading,
  projectsError,
  currentProject,
  activePage,
  hasUnsavedChanges,
  dirtyFields,
  refetchProjects,
  setCurrentProject,
  setActivePage,
  markDirty,
  clearDirty,
  updateSettings,
  createProject,
  deleteProject,
  duplicateProject,
};

export function useProjects(): ProjectsStore {
  return projectsStore;
}
