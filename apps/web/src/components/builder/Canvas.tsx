// ── Builder Canvas ───────────────────────────────────────────────────
// Renders the component tree from the editor store. Supports selection,
// drag-to-reorder, zoom controls, grid overlay, and drop zones.

import { type JSX, For, Show, createSignal, createMemo, createEffect, onCleanup } from "solid-js";
import { useEditor, type ComponentNode } from "../../stores/editor";
import type { ComponentName } from "@cronix/ui";

// ── Zoom Presets ────────────────────────────────────────────────────

const ZOOM_PRESETS = [
  { label: "Fit", value: -1 },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "150%", value: 1.5 },
  { label: "200%", value: 2 },
] as const;

// ── Drop Indicator ──────────────────────────────────────────────────

function DropIndicator(props: { position: "before" | "after" | "inside"; active: boolean }): JSX.Element {
  return (
    <Show when={props.active}>
      <div
        class={`${
          props.position === "inside"
            ? "absolute inset-0 border-2 border-dashed border-blue-400 bg-blue-50/30 rounded-lg pointer-events-none z-10"
            : `h-0.5 bg-blue-500 rounded-full my-0.5 transition-all ${props.active ? "opacity-100" : "opacity-0"}`
        }`}
      />
    </Show>
  );
}

// ── Canvas Node ─────────────────────────────────────────────────────

interface CanvasNodeProps {
  node: ComponentNode;
  depth: number;
}

function CanvasNode(props: CanvasNodeProps): JSX.Element {
  const editor = useEditor();
  const [dropTarget, setDropTarget] = createSignal<"before" | "after" | "inside" | null>(null);

  const isSelected = (): boolean => editor.selectedIds().has(props.node.id);
  const isPrimary = (): boolean => editor.primarySelection()?.id === props.node.id;
  const isContainer = (): boolean => {
    const containers: ComponentName[] = ["Stack", "Card", "Modal", "Alert", "Tooltip"];
    return containers.includes(props.node.type as ComponentName);
  };

  function handleClick(e: MouseEvent): void {
    e.stopPropagation();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      if (isSelected()) {
        editor.removeFromSelection(props.node.id);
      } else {
        editor.addToSelection(props.node.id);
      }
    } else {
      editor.select(props.node.id);
    }
  }

  function handleDragStart(e: DragEvent): void {
    if (!e.dataTransfer || props.node.locked) return;
    e.dataTransfer.setData("application/cronix-node-id", props.node.id);
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
    editor.startDrag("reorder", props.node.id, { x: e.clientX, y: e.clientY });
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const threshold = rect.height / 4;

    if (isContainer() && y > threshold && y < rect.height - threshold) {
      setDropTarget("inside");
      e.dataTransfer.dropEffect = "move";
    } else if (y < rect.height / 2) {
      setDropTarget("before");
      e.dataTransfer.dropEffect = "move";
    } else {
      setDropTarget("after");
      e.dataTransfer.dropEffect = "move";
    }
  }

  function handleDragLeave(): void {
    setDropTarget(null);
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    if (!e.dataTransfer) return;

    const nodeId = e.dataTransfer.getData("application/cronix-node-id");
    const componentType = e.dataTransfer.getData("application/cronix-component");

    if (nodeId && nodeId !== props.node.id) {
      // Reorder existing node
      const target = dropTarget();
      if (target === "inside") {
        editor.moveComponent(nodeId, props.node.id);
      } else {
        editor.moveComponent(nodeId, props.node.parentId, undefined);
      }
    } else if (componentType) {
      // Insert new component from palette
      const newNode: ComponentNode = {
        id: `comp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: componentType,
        props: {},
        children: [],
        parentId: null,
        locked: false,
        visible: true,
        name: componentType,
      };
      const target = dropTarget();
      if (target === "inside") {
        editor.addComponent(newNode, props.node.id);
      } else {
        editor.addComponent(newNode, props.node.parentId ?? undefined);
      }
      editor.select(newNode.id);
    }

    editor.endDrag();
  }

  return (
    <Show when={props.node.visible} fallback={null}>
      <div class="relative">
        <DropIndicator position="before" active={dropTarget() === "before"} />
        <div
          class={`relative rounded-lg border-2 transition-all cursor-pointer min-h-[40px] ${
            isPrimary()
              ? "border-blue-500 ring-2 ring-blue-200 shadow-sm"
              : isSelected()
                ? "border-blue-300 ring-1 ring-blue-100"
                : "border-transparent hover:border-gray-300"
          } ${props.node.locked ? "opacity-60" : ""}`}
          onClick={handleClick}
          draggable={!props.node.locked}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Selection label */}
          <Show when={isSelected()}>
            <div class="absolute -top-5 left-1 z-20 flex items-center gap-1">
              <span class="text-[10px] font-medium text-white bg-blue-500 px-1.5 py-0.5 rounded-t">
                {props.node.name || props.node.type}
              </span>
            </div>
          </Show>

          {/* Component visual representation */}
          <div
            class={`p-3 rounded-lg ${isContainer() ? "bg-gray-50/50 min-h-[60px]" : "bg-white"}`}
          >
            <div class="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <span class="text-xs font-mono text-gray-400">{props.node.type}</span>
              <Show when={props.node.name !== props.node.type}>
                <span class="text-xs text-gray-500">({props.node.name})</span>
              </Show>
              <Show when={props.node.locked}>
                <svg class="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </Show>
            </div>

            {/* Render props summary */}
            <Show when={Object.keys(props.node.props).length > 0}>
              <div class="flex flex-wrap gap-1 mt-1">
                <For each={Object.entries(props.node.props).slice(0, 3)}>
                  {([key, val]) => (
                    <span class="text-[10px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded">
                      {key}={typeof val === "string" ? `"${val}"` : String(val)}
                    </span>
                  )}
                </For>
              </div>
            </Show>

            {/* Children */}
            <Show when={props.node.children.length > 0}>
              <div class="mt-2 ml-2 pl-2 border-l-2 border-gray-200 space-y-1">
                <For each={props.node.children}>
                  {(child) => <CanvasNode node={child} depth={props.depth + 1} />}
                </For>
              </div>
            </Show>

            {/* Empty container placeholder */}
            <Show when={isContainer() && props.node.children.length === 0}>
              <div class="flex items-center justify-center min-h-[40px] border-2 border-dashed border-gray-200 rounded-md mt-2 text-xs text-gray-400">
                Drop components here
              </div>
            </Show>
          </div>

          {/* Resize handles (primary selection only) */}
          <Show when={isPrimary() && !props.node.locked}>
            <div class="absolute -right-1 -bottom-1 w-2.5 h-2.5 bg-blue-500 rounded-sm cursor-se-resize" />
            <div class="absolute -right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-500 rounded-sm cursor-e-resize" />
            <div class="absolute right-1/2 -translate-x-1/2 -bottom-1 w-2.5 h-2.5 bg-blue-500 rounded-sm cursor-s-resize" />
          </Show>
        </div>
        <DropIndicator position="after" active={dropTarget() === "after"} />
        <DropIndicator position="inside" active={dropTarget() === "inside"} />
      </div>
    </Show>
  );
}

// ── Canvas Component ────────────────────────────────────────────────

export function Canvas(): JSX.Element {
  const editor = useEditor();
  const [canvasRef, setCanvasRef] = createSignal<HTMLDivElement | null>(null);

  // Handle canvas-level drop (root level)
  function handleCanvasDrop(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer) return;

    const componentType = e.dataTransfer.getData("application/cronix-component");
    if (componentType) {
      const newNode: ComponentNode = {
        id: `comp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: componentType,
        props: {},
        children: [],
        parentId: null,
        locked: false,
        visible: true,
        name: componentType,
      };
      editor.addComponent(newNode);
      editor.select(newNode.id);
    }

    const nodeId = e.dataTransfer.getData("application/cronix-node-id");
    if (nodeId) {
      editor.moveComponent(nodeId, null);
    }

    editor.endDrag();
  }

  function handleCanvasDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }

  function handleCanvasClick(e: MouseEvent): void {
    if (e.target === canvasRef()) {
      editor.clearSelection();
    }
  }

  // Wheel zoom
  function handleWheel(e: WheelEvent): void {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const current = editor.canvasTransform().zoom;
      editor.setZoom(current + delta);
    } else {
      editor.pan(-e.deltaX, -e.deltaY);
    }
  }

  const zoomPercent = createMemo((): string => `${Math.round(editor.canvasTransform().zoom * 100)}%`);

  return (
    <div class="flex flex-col h-full overflow-hidden bg-gray-100">
      {/* Toolbar */}
      <div class="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-white">
        <div class="flex items-center gap-1">
          <For each={ZOOM_PRESETS}>
            {(preset) => (
              <button
                type="button"
                class={`px-2 py-1 text-xs rounded-md transition-colors ${
                  (preset.value === -1 && editor.canvasTransform().zoom === 1) ||
                  editor.canvasTransform().zoom === preset.value
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                onClick={() => {
                  if (preset.value === -1) {
                    editor.zoomToFit();
                  } else {
                    editor.setZoom(preset.value);
                  }
                }}
              >
                {preset.label}
              </button>
            )}
          </For>
          <span class="ml-2 text-xs text-gray-500 font-mono">{zoomPercent()}</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class={`p-1.5 rounded-md text-xs transition-colors ${
              editor.showGrid() ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
            }`}
            onClick={() => editor.toggleGrid()}
            title="Toggle grid"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={(el) => setCanvasRef(el)}
        class="flex-1 overflow-auto relative"
        onDrop={handleCanvasDrop}
        onDragOver={handleCanvasDragOver}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
      >
        {/* Grid overlay */}
        <Show when={editor.showGrid() && !editor.previewMode()}>
          <div
            class="absolute inset-0 pointer-events-none opacity-[0.08]"
            style={{
              "background-image": "linear-gradient(to right, #6b7280 1px, transparent 1px), linear-gradient(to bottom, #6b7280 1px, transparent 1px)",
              "background-size": `${20 * editor.canvasTransform().zoom}px ${20 * editor.canvasTransform().zoom}px`,
            }}
          />
        </Show>

        {/* Content container with zoom/pan transform */}
        <div
          class="min-h-full p-8"
          style={{
            transform: `scale(${editor.canvasTransform().zoom}) translate(${editor.canvasTransform().panX}px, ${editor.canvasTransform().panY}px)`,
            "transform-origin": "top left",
          }}
        >
          <Show
            when={editor.componentTree().length > 0}
            fallback={
              <div
                class="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-gray-300 rounded-xl bg-white/50"
                onDrop={handleCanvasDrop}
                onDragOver={handleCanvasDragOver}
              >
                <svg class="w-12 h-12 text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <p class="text-sm text-gray-400 font-medium">Drag components here to start building</p>
                <p class="text-xs text-gray-300 mt-1">or double-click a component in the palette</p>
              </div>
            }
          >
            <div class="space-y-2 max-w-[800px] mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <For each={editor.componentTree() as ComponentNode[]}>
                {(node) => <CanvasNode node={node} depth={0} />}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
