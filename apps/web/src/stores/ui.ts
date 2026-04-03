// ── UI State Store ───────────────────────────────────────────────────
// Global UI state: theme preference, sidebar, modal stack, toasts,
// command palette, and responsive breakpoints.
// Uses module-level signals for global reactive state.

import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import { isServer } from "solid-js/web";

// ── Types ────────────────────────────────────────────────────────────

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type Breakpoint = "mobile" | "tablet" | "desktop";

export interface ModalEntry {
  id: string;
  component: string;
  props: Record<string, unknown>;
  onClose?: () => void;
}

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration: number;
  createdAt: number;
}

export interface UIStore {
  /** Theme preference: light, dark, or system */
  themePreference: Accessor<ThemePreference>;
  /** Resolved theme after applying system preference */
  resolvedTheme: Accessor<ResolvedTheme>;
  /** Whether sidebar is open */
  sidebarOpen: Accessor<boolean>;
  /** Whether sidebar is collapsed (icon-only) */
  sidebarCollapsed: Accessor<boolean>;
  /** Stack of open modals (supports nesting) */
  modalStack: Accessor<readonly ModalEntry[]>;
  /** Current toast/notification queue */
  toasts: Accessor<readonly Toast[]>;
  /** Whether command palette is open */
  commandPaletteOpen: Accessor<boolean>;
  /** Current responsive breakpoint */
  breakpoint: Accessor<Breakpoint>;
  /** Set theme preference */
  setThemePreference: (pref: ThemePreference) => void;
  /** Toggle sidebar open/closed */
  toggleSidebar: () => void;
  /** Set sidebar open state */
  setSidebarOpen: (open: boolean) => void;
  /** Toggle sidebar collapsed state */
  toggleSidebarCollapsed: () => void;
  /** Push a modal onto the stack */
  pushModal: (modal: Omit<ModalEntry, "id">) => string;
  /** Pop the top modal from the stack */
  popModal: () => void;
  /** Close a specific modal by id */
  closeModal: (id: string) => void;
  /** Close all modals */
  closeAllModals: () => void;
  /** Show a toast notification */
  showToast: (toast: Omit<Toast, "id" | "createdAt" | "duration"> & { duration?: number }) => string;
  /** Dismiss a toast by id */
  dismissToast: (id: string) => void;
  /** Toggle command palette */
  toggleCommandPalette: () => void;
  /** Set command palette open state */
  setCommandPaletteOpen: (open: boolean) => void;
}

// ── Constants ────────────────────────────────────────────────────────

const THEME_PREF_KEY = "cronix_theme_pref";
const SIDEBAR_KEY = "cronix_sidebar";
const DEFAULT_TOAST_DURATION = 5000;

const BREAKPOINT_MOBILE = 768;
const BREAKPOINT_TABLET = 1024;

// ── Helpers ──────────────────────────────────────────────────────────

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function getSystemTheme(): ResolvedTheme {
  if (isServer) return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredThemePref(): ThemePreference {
  if (isServer) return "system";
  try {
    const stored = localStorage.getItem(THEME_PREF_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage unavailable
  }
  return "system";
}

function getStoredSidebar(): { open: boolean; collapsed: boolean } {
  if (isServer) return { open: true, collapsed: false };
  try {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored) return JSON.parse(stored) as { open: boolean; collapsed: boolean };
  } catch {
    // Storage unavailable
  }
  return { open: true, collapsed: false };
}

function resolveBreakpoint(): Breakpoint {
  if (isServer) return "desktop";
  const width = window.innerWidth;
  if (width < BREAKPOINT_MOBILE) return "mobile";
  if (width < BREAKPOINT_TABLET) return "tablet";
  return "desktop";
}

// ── Signals ──────────────────────────────────────────────────────────

const [themePreference, setThemePreferenceSignal] = createSignal<ThemePreference>(getStoredThemePref());
const [resolvedTheme, setResolvedTheme] = createSignal<ResolvedTheme>(
  getStoredThemePref() === "system" ? getSystemTheme() : (getStoredThemePref() as ResolvedTheme),
);

const sidebarInit = getStoredSidebar();
const [sidebarOpen, setSidebarOpenSignal] = createSignal<boolean>(sidebarInit.open);
const [sidebarCollapsed, setSidebarCollapsed] = createSignal<boolean>(sidebarInit.collapsed);

const [modalStack, setModalStack] = createSignal<readonly ModalEntry[]>([]);
const [toasts, setToasts] = createSignal<readonly Toast[]>([]);
const [commandPaletteOpen, setCommandPaletteOpenSignal] = createSignal<boolean>(false);
const [breakpoint, setBreakpoint] = createSignal<Breakpoint>(resolveBreakpoint());

// ── Effects (client-side only) ───────────────────────────────────────

if (!isServer) {
  // Listen to system theme changes
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleMediaChange = (): void => {
    if (themePreference() === "system") {
      setResolvedTheme(getSystemTheme());
    }
  };
  mediaQuery.addEventListener("change", handleMediaChange);

  // Listen to resize for breakpoint detection
  const handleResize = (): void => {
    setBreakpoint(resolveBreakpoint());
  };
  window.addEventListener("resize", handleResize);

  // Auto-dismiss toasts
  const toastInterval = setInterval((): void => {
    const now = Date.now();
    setToasts((prev) => prev.filter((t) => now - t.createdAt < t.duration));
  }, 1000);

  // Keyboard shortcut for command palette (Cmd/Ctrl + K)
  const handleKeydown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCommandPaletteOpenSignal((prev) => !prev);
    }
    // Escape closes command palette and top modal
    if (e.key === "Escape") {
      if (commandPaletteOpen()) {
        setCommandPaletteOpenSignal(false);
      } else if (modalStack().length > 0) {
        popModal();
      }
    }
  };
  window.addEventListener("keydown", handleKeydown);
}

// ── Actions ──────────────────────────────────────────────────────────

function setThemePreference(pref: ThemePreference): void {
  setThemePreferenceSignal(pref);
  const resolved = pref === "system" ? getSystemTheme() : pref;
  setResolvedTheme(resolved);

  if (!isServer) {
    try {
      localStorage.setItem(THEME_PREF_KEY, pref);
    } catch {
      // Storage unavailable
    }
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.setAttribute("data-theme", resolved);
  }
}

function toggleSidebar(): void {
  setSidebarOpenSignal((prev) => !prev);
  persistSidebar();
}

function setSidebarOpen(open: boolean): void {
  setSidebarOpenSignal(open);
  persistSidebar();
}

function toggleSidebarCollapsed(): void {
  setSidebarCollapsed((prev) => !prev);
  persistSidebar();
}

function persistSidebar(): void {
  if (isServer) return;
  try {
    localStorage.setItem(
      SIDEBAR_KEY,
      JSON.stringify({ open: sidebarOpen(), collapsed: sidebarCollapsed() }),
    );
  } catch {
    // Storage unavailable
  }
}

function pushModal(modal: Omit<ModalEntry, "id">): string {
  const id = nextId("modal");
  const entry: ModalEntry = { ...modal, id };
  setModalStack((prev) => [...prev, entry]);
  return id;
}

function popModal(): void {
  setModalStack((prev) => {
    if (prev.length === 0) return prev;
    const top = prev[prev.length - 1];
    top?.onClose?.();
    return prev.slice(0, -1);
  });
}

function closeModal(id: string): void {
  setModalStack((prev) => {
    const entry = prev.find((m) => m.id === id);
    entry?.onClose?.();
    return prev.filter((m) => m.id !== id);
  });
}

function closeAllModals(): void {
  const current = modalStack();
  for (const modal of current) {
    modal.onClose?.();
  }
  setModalStack([]);
}

function showToast(
  toast: Omit<Toast, "id" | "createdAt" | "duration"> & { duration?: number },
): string {
  const id = nextId("toast");
  const entry: Toast = {
    ...toast,
    id,
    duration: toast.duration ?? DEFAULT_TOAST_DURATION,
    createdAt: Date.now(),
  };
  setToasts((prev) => [...prev, entry]);
  return id;
}

function dismissToast(id: string): void {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

function toggleCommandPalette(): void {
  setCommandPaletteOpenSignal((prev) => !prev);
}

function setCommandPaletteOpen(open: boolean): void {
  setCommandPaletteOpenSignal(open);
}

// ── Exported Store ───────────────────────────────────────────────────

export const uiStore: UIStore = {
  themePreference,
  resolvedTheme,
  sidebarOpen,
  sidebarCollapsed,
  modalStack,
  toasts,
  commandPaletteOpen,
  breakpoint,
  setThemePreference,
  toggleSidebar,
  setSidebarOpen,
  toggleSidebarCollapsed,
  pushModal,
  popModal,
  closeModal,
  closeAllModals,
  showToast,
  dismissToast,
  toggleCommandPalette,
  setCommandPaletteOpen,
};

export function useUI(): UIStore {
  return uiStore;
}
