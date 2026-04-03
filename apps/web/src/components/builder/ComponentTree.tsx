// ── Component Tree View ──────────────────────────────────────────────
// Hierarchical tree view of the component structure. Supports drag-to-
// reorder/reparent, click-to-select, right-click context menu.

import { type JSX, For, Show, createSignal, createMemo } from "solid-js";
import { useEditor, type ComponentNode } from "../../stores/editor";

// ── Context Menu ────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

function TreeContextMenu(props: {
  state: ContextMenuState;
  onClose: () => void;
}): JSX.Element {
  const editor = useEditor();

  const node = createMemo((): ComponentNode | undefined =>
    editor.componentMap().get(props.state.nodeId),
  );

  function action(fn: () => void): void {
    fn();
    props.onClose();
  }

  return (
    <div
      class="fixed z-50 min-w-[160px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 text-sm"
      style={{ left: `${props.state.x}px`, top: `${props.state.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        class="w-full px-3 py-1.5 text-left hover:bg-gray-100 text-gray-700"
        onClick={() => action(() => editor.duplicate())}
      >
        Duplicate
      </button>
      <button
        type="button"
        class="w-full px-3 py-1.5 text-left hover:bg-gray-100 text-gray-700"
        onClick={() =>
          action(() => {
            const n = node();
            if (!n) return;
            // Wrap in Stack: create a Stack, move this node into it
            const stackNode: ComponentNode = {
              id: `comp-${Date.now()}-wrap`,
              type: "Stack",
              props: { direction: "vertical", gap: "md" },
              children: [],
              parentId: n.parentId,
              locked: false,
              visible: true,
              name: "Stack",
            };
            editor.addComponent(stackNode, n.parentId ?? undefined);
            editor.moveComponent(n.id, stackNode.id);
          })
        }
      >
        Wrap in Stack
      </button>
      <div class="h-px bg-gray-200 my-1" />
      <button
        type="button"
        class="w-full px-3 py-1.5 text-left hover:bg-gray-100 text-gray-700"
        onClick={() =>
          action(() => {
            const n = node();
            if (!n) return;
            editor.moveComponent(n.id, n.parentId, 0);
          })
        }
      >
        Move Up
      </button>
      <button
        type="button"
        class="w-full px-3 py-1.5 text-left hover:bg-gray-100 text-gray-700"
        onClick={() =>
          action(() => {
            const n = node();
            if (!n) return;
            // Move to end (approximate: just re-insert without index)
            editor.moveComponent(n.id, n.parentId);
          })
        }
      >
        Move Down
      </button>
      <div class="h-px bg-gray-200 my-1" />
      <button
        type="button"
        class="w-full px-3 py-1.5 text-left hover:bg-gray-100 text-gray-700"
        onClick={() =>
          action(() => {
            const n = node();
            if (n) editor.toggleComponentVisibility(n.id);
          })
        }
      >
        {node()?.visible ? "Hide" : "Show"}
      </button>
      <button
        type="button"
        class="w-full px-3 py-1.5 text-left hover:bg-gray-100 text-gray-700"
        onClick={() =>
          action(() => {
            const n = node();
            if (n) editor.toggleComponentLock(n.id);
          })
        }
      >
        {node()?.locked ? "Unlock" : "Lock"}
      </button>
      <div class="h-px bg-gray-200 my-1" />
      <button
        type="button"
        class="w-full px-3 py-1.5 text-left hover:bg-red-50 text-red-600"
        onClick={() =>
          action(() => {
            const n = node();
            if (n) editor.removeComponent(n.id);
          })
        }
      >
        Delete
      </button>
    </div>
  );
}

// ── Tree Node ───────────────────────────────────────────────────────

interface TreeNodeProps {
  node: ComponentNode;
  depth: number;
  onContextMenu: (state: ContextMenuState) => void;
}

function TreeNode(props: TreeNodeProps): JSX.Element {
  const editor = useEditor();
  const [expanded, setExpanded] = createSignal(true);
  const [dragOver, setDragOver] = createSignal(false);

  const isSelected = (): boolean => editor.selectedIds().has(props.node.id);
  const hasChildren = (): boolean => props.node.children.length > 0;

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

  function handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    editor.select(props.node.id);
    props.onContextMenu({ x: e.clientX, y: e.clientY, nodeId: props.node.id });
  }

  function handleDragStart(e: DragEvent): void {
    if (!e.dataTransfer || props.node.locked) return;
    e.dataTransfer.setData("application/cronix-node-id", props.node.id);
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function handleDragLeave(): void {
    setDragOver(false);
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    if (!e.dataTransfer) return;
    const nodeId = e.dataTransfer.getData("application/cronix-node-id");
    if (nodeId && nodeId !== props.node.id) {
      editor.moveComponent(nodeId, props.node.id);
    }
  }

  return (
    <div>
      <div
        class={`flex items-center gap-1 h-7 px-1 rounded-md cursor-pointer transition-colors group ${
          isSelected()
            ? "bg-blue-100 text-blue-800"
            : dragOver()
              ? "bg-blue-50 text-blue-700"
              : "hover:bg-gray-100 text-gray-700"
        }`}
        style={{ "padding-left": `${props.depth * 16 + 4}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable={!props.node.locked}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          class={`w-4 h-4 flex items-center justify-center rounded-sm hover:bg-gray-200 ${hasChildren() ? "visible" : "invisible"}`}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((p) => !p);
          }}
        >
          <svg
            class={`w-3 h-3 transition-transform ${expanded() ? "rotate-90" : ""}`}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>

        {/* Component type icon indicator */}
        <span class="w-4 h-4 flex items-center justify-center">
          <span class="w-2 h-2 rounded-full bg-current opacity-40" />
        </span>

        {/* Name */}
        <span class="text-xs font-medium truncate flex-1">{props.node.name || props.node.type}</span>

        {/* Type badge */}
        <Show when={props.node.name !== props.node.type}>
          <span class="text-[10px] text-gray-400 font-mono mr-1">{props.node.type}</span>
        </Show>

        {/* Status indicators */}
        <Show when={!props.node.visible}>
          <svg class="w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </Show>
        <Show when={props.node.locked}>
          <svg class="w-3 h-3 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </Show>
      </div>

      {/* Children */}
      <Show when={expanded() && hasChildren()}>
        <For each={props.node.children}>
          {(child) => (
            <TreeNode
              node={child}
              depth={props.depth + 1}
              onContextMenu={props.onContextMenu}
            />
          )}
        </For>
      </Show>
    </div>
  );
}

// ── Component Tree ──────────────────────────────────────────────────

export function ComponentTree(): JSX.Element {
  const editor = useEditor();
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState | null>(null);

  function closeContextMenu(): void {
    setContextMenu(null);
  }

  // Close context menu on outside click
  function handleBackgroundClick(): void {
    closeContextMenu();
    editor.clearSelection();
  }

  return (
    <div
      class="flex flex-col h-full overflow-hidden"
      onClick={handleBackgroundClick}
    >
      <div class="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Layers</span>
        <span class="text-[10px] text-gray-400">{editor.componentTree().length} root</span>
      </div>
      <div class="flex-1 overflow-y-auto p-1">
        <Show
          when={editor.componentTree().length > 0}
          fallback={
            <div class="flex items-center justify-center py-8 text-gray-400">
              <span class="text-xs">No components yet</span>
            </div>
          }
        >
          <For each={editor.componentTree() as ComponentNode[]}>
            {(node) => (
              <TreeNode
                node={node}
                depth={0}
                onContextMenu={(state) => setContextMenu(state)}
              />
            )}
          </For>
        </Show>
      </div>

      {/* Context menu */}
      <Show when={contextMenu()}>
        {(menu) => <TreeContextMenu state={menu()} onClose={closeContextMenu} />}
      </Show>
    </div>
  );
}
