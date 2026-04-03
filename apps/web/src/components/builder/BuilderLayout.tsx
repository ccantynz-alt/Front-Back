// ── Builder Layout ───────────────────────────────────────────────────
// Three-panel layout: left sidebar (component palette + tree), center
// (canvas), right sidebar (properties + AI). Resizable panels via
// CSS flexbox + drag handles. Collapses to single panel on mobile.

import { type JSX, Show, For, createSignal, createEffect, onCleanup } from "solid-js";
import { isServer } from "solid-js/web";
import { useEditor } from "../../stores/editor";
import { ComponentPalette } from "./ComponentPalette";
import { Canvas } from "./Canvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { ComponentTree } from "./ComponentTree";
import { AIAssistant } from "./AIAssistant";
import { CollabCursorsOverlay, CollabAvatars } from "./CollabOverlay";
import type { UserAwareness } from "@cronix/collab";

// ── Types ────────────────────────────────────────────────────────────

export interface BuilderLayoutProps {
  projectName: string;
  projectId: string;
  /** Collab store signals — optional, builder works offline too */
  collab?: {
    peers: () => UserAwareness[];
    localUser: () => UserAwareness | undefined;
    connected: () => boolean;
  };
  onPublish?: () => void;
}

type LeftTab = "palette" | "tree";
type RightTab = "properties" | "ai";

// ── Resize Handle ───────────────────────────────────────────────────

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  direction: "horizontal";
}

function ResizeHandle(props: ResizeHandleProps): JSX.Element {
  const [dragging, setDragging] = createSignal(false);

  function handlePointerDown(e: PointerEvent): void {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent): void {
      const delta = ev.clientX - startX;
      props.onResize(delta);
    }

    function onUp(): void {
      setDragging(false);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  return (
    <div
      class={`w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors flex items-center justify-center group shrink-0 ${
        dragging() ? "bg-blue-500" : "bg-gray-200"
      }`}
      onPointerDown={handlePointerDown}
    >
      <div class="w-0.5 h-8 bg-gray-400 rounded-full group-hover:bg-blue-400 transition-colors" />
    </div>
  );
}

// ── Builder Layout Component ────────────────────────────────────────

export function BuilderLayout(props: BuilderLayoutProps): JSX.Element {
  const editor = useEditor();

  // Panel widths
  const [leftWidth, setLeftWidth] = createSignal(260);
  const [rightWidth, setRightWidth] = createSignal(300);

  // Panel visibility
  const [leftCollapsed, setLeftCollapsed] = createSignal(false);
  const [rightCollapsed, setRightCollapsed] = createSignal(false);

  // Tab state
  const [leftTab, setLeftTab] = createSignal<LeftTab>("palette");
  const [rightTab, setRightTab] = createSignal<RightTab>("properties");

  // Mobile detection
  const [isMobile, setIsMobile] = createSignal(false);

  if (!isServer) {
    function checkMobile(): void {
      setIsMobile(window.innerWidth < 768);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    onCleanup(() => window.removeEventListener("resize", checkMobile));
  }

  // Mobile panel state
  const [mobilePanel, setMobilePanel] = createSignal<"canvas" | "palette" | "properties" | "ai">("canvas");

  // Resize handlers
  function handleLeftResize(delta: number): void {
    setLeftWidth((w) => Math.max(200, Math.min(400, w + delta)));
  }

  function handleRightResize(delta: number): void {
    setRightWidth((w) => Math.max(240, Math.min(450, w - delta)));
  }

  // Auto-switch to properties when selecting
  createEffect((): void => {
    if (editor.primarySelection()) {
      setRightTab("properties");
    }
  });

  return (
    <div class="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────── */}
      <header class="flex items-center justify-between h-12 px-3 bg-white border-b border-gray-200 shrink-0">
        {/* Left: Project name + navigation */}
        <div class="flex items-center gap-3">
          <a href="/dashboard" class="text-gray-400 hover:text-gray-600 transition-colors" title="Back to dashboard">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </a>
          <span class="text-sm font-semibold text-gray-800 truncate max-w-[200px]">{props.projectName}</span>
        </div>

        {/* Center: Undo/Redo + Preview */}
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={!editor.canUndo()}
            onClick={() => editor.undo()}
            title="Undo (Ctrl+Z)"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
          </button>
          <button
            type="button"
            class="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={!editor.canRedo()}
            onClick={() => editor.redo()}
            title="Redo (Ctrl+Shift+Z)"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
          </button>

          <div class="w-px h-5 bg-gray-200 mx-1" />

          <button
            type="button"
            class={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              editor.previewMode()
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            onClick={() => editor.togglePreview()}
          >
            {editor.previewMode() ? "Edit" : "Preview"}
          </button>
        </div>

        {/* Right: Collab avatars + Publish */}
        <div class="flex items-center gap-3">
          <Show when={props.collab}>
            {(collab) => (
              <CollabAvatars
                peers={collab().peers}
                localUser={collab().localUser}
                connected={collab().connected}
              />
            )}
          </Show>

          <button
            type="button"
            class="h-8 px-4 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
            onClick={() => props.onPublish?.()}
          >
            Publish
          </button>
        </div>
      </header>

      {/* ── Mobile Navigation ────────────────────────────────────── */}
      <Show when={isMobile()}>
        <nav class="flex items-center gap-1 px-2 py-1 bg-white border-b border-gray-200 shrink-0">
          <For each={[
            { id: "canvas" as const, label: "Canvas" },
            { id: "palette" as const, label: "Components" },
            { id: "properties" as const, label: "Properties" },
            { id: "ai" as const, label: "AI" },
          ]}>
            {(tab) => (
              <button
                type="button"
                class={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mobilePanel() === tab.id
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                onClick={() => setMobilePanel(tab.id)}
              >
                {tab.label}
              </button>
            )}
          </For>
        </nav>
      </Show>

      {/* ── Main Body ────────────────────────────────────────────── */}
      <Show
        when={!isMobile()}
        fallback={
          /* Mobile: single panel */
          <div class="flex-1 overflow-hidden">
            <Show when={mobilePanel() === "canvas"}><Canvas /></Show>
            <Show when={mobilePanel() === "palette"}><ComponentPalette /></Show>
            <Show when={mobilePanel() === "properties"}><PropertiesPanel /></Show>
            <Show when={mobilePanel() === "ai"}><AIAssistant /></Show>
          </div>
        }
      >
        <div class="flex flex-1 overflow-hidden">
          {/* ── Left Sidebar ─────────────────────────────────────── */}
          <Show when={!leftCollapsed()}>
            <div
              class="flex flex-col bg-white border-r border-gray-200 shrink-0 overflow-hidden"
              style={{ width: `${leftWidth()}px` }}
            >
              {/* Tabs */}
              <div class="flex items-center border-b border-gray-200 shrink-0">
                <button
                  type="button"
                  class={`flex-1 py-2 text-xs font-medium text-center transition-colors ${
                    leftTab() === "palette"
                      ? "text-blue-700 border-b-2 border-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setLeftTab("palette")}
                >
                  Components
                </button>
                <button
                  type="button"
                  class={`flex-1 py-2 text-xs font-medium text-center transition-colors ${
                    leftTab() === "tree"
                      ? "text-blue-700 border-b-2 border-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setLeftTab("tree")}
                >
                  Layers
                </button>
              </div>
              {/* Tab content */}
              <div class="flex-1 overflow-hidden">
                <Show when={leftTab() === "palette"}><ComponentPalette /></Show>
                <Show when={leftTab() === "tree"}><ComponentTree /></Show>
              </div>
            </div>
            <ResizeHandle onResize={handleLeftResize} direction="horizontal" />
          </Show>

          {/* Collapse toggle for left */}
          <button
            type="button"
            class="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-4 h-8 bg-white border border-gray-200 rounded-r flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            style={{ left: leftCollapsed() ? "0px" : `${leftWidth() + 4}px` }}
            onClick={() => setLeftCollapsed((p) => !p)}
          >
            <svg class={`w-3 h-3 ${leftCollapsed() ? "" : "rotate-180"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* ── Center Canvas ────────────────────────────────────── */}
          <div class="flex-1 relative overflow-hidden">
            <Canvas />
            {/* Collab cursors overlay */}
            <Show when={props.collab}>
              {(collab) => (
                <CollabCursorsOverlay
                  peers={collab().peers}
                  localUser={collab().localUser}
                  connected={collab().connected}
                />
              )}
            </Show>
          </div>

          {/* ── Right Sidebar ────────────────────────────────────── */}
          <Show when={!rightCollapsed()}>
            <ResizeHandle onResize={handleRightResize} direction="horizontal" />
            <div
              class="flex flex-col bg-white border-l border-gray-200 shrink-0 overflow-hidden"
              style={{ width: `${rightWidth()}px` }}
            >
              {/* Tabs */}
              <div class="flex items-center border-b border-gray-200 shrink-0">
                <button
                  type="button"
                  class={`flex-1 py-2 text-xs font-medium text-center transition-colors ${
                    rightTab() === "properties"
                      ? "text-blue-700 border-b-2 border-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setRightTab("properties")}
                >
                  Properties
                </button>
                <button
                  type="button"
                  class={`flex-1 py-2 text-xs font-medium text-center transition-colors ${
                    rightTab() === "ai"
                      ? "text-purple-700 border-b-2 border-purple-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setRightTab("ai")}
                >
                  <span class="flex items-center justify-center gap-1">
                    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
                    </svg>
                    AI
                  </span>
                </button>
              </div>
              {/* Tab content */}
              <div class="flex-1 overflow-hidden">
                <Show when={rightTab() === "properties"}><PropertiesPanel /></Show>
                <Show when={rightTab() === "ai"}><AIAssistant /></Show>
              </div>
            </div>
          </Show>

          {/* Collapse toggle for right */}
          <button
            type="button"
            class="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-4 h-8 bg-white border border-gray-200 rounded-l flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            onClick={() => setRightCollapsed((p) => !p)}
          >
            <svg class={`w-3 h-3 ${rightCollapsed() ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </Show>
    </div>
  );
}
