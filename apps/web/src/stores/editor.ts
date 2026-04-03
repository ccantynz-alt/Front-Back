// ── Editor State Store ───────────────────────────────────────────────
// Reactive editor state for the website builder: selection, canvas
// zoom/pan, undo/redo history, clipboard, drag state, component tree.
// Uses module-level signals for global reactive state.

import { type Accessor, createSignal } from "solid-js";
import { isServer } from "solid-js/web";

// ── Types ────────────────────────────────────────────────────────────

export interface ComponentNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: ComponentNode[];
  parentId: string | null;
  locked: boolean;
  visible: boolean;
  name: string;
}

export interface CanvasTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DragOperation = "move" | "resize" | "reorder" | "insert";

export interface DragState {
  active: boolean;
  operation: DragOperation;
  sourceId: string | null;
  targetId: string | null;
  position: { x: number; y: number };
  offset: { x: number; y: number };
}

export interface HistoryEntry {
  id: string;
  description: string;
  timestamp: number;
  snapshot: ComponentNode[];
}

export interface EditorStore {
  /** Currently selected component ids (supports multi-select) */
  selectedIds: Accessor<ReadonlySet<string>>;
  /** Primary selected component (first in selection) */
  primarySelection: Accessor<ComponentNode | null>;
  /** Canvas zoom and pan transform */
  canvasTransform: Accessor<CanvasTransform>;
  /** Component tree (root nodes) */
  componentTree: Accessor<readonly ComponentNode[]>;
  /** Flat map of all components by id */
  componentMap: Accessor<ReadonlyMap<string, ComponentNode>>;
  /** Undo history stack */
  undoStack: Accessor<readonly HistoryEntry[]>;
  /** Redo history stack */
  redoStack: Accessor<readonly HistoryEntry[]>;
  /** Whether undo is available */
  canUndo: Accessor<boolean>;
  /** Whether redo is available */
  canRedo: Accessor<boolean>;
  /** Clipboard contents */
  clipboard: Accessor<readonly ComponentNode[]>;
  /** Current drag state */
  dragState: Accessor<DragState>;
  /** Whether the editor is in preview mode */
  previewMode: Accessor<boolean>;
  /** Whether the grid/guides are visible */
  showGrid: Accessor<boolean>;
  /** Select a component (replace selection) */
  select: (id: string) => void;
  /** Add a component to the selection */
  addToSelection: (id: string) => void;
  /** Remove a component from the selection */
  removeFromSelection: (id: string) => void;
  /** Clear selection */
  clearSelection: () => void;
  /** Select all components at root level */
  selectAll: () => void;
  /** Set canvas zoom level */
  setZoom: (zoom: number) => void;
  /** Zoom to fit all content */
  zoomToFit: () => void;
  /** Reset zoom to 100% */
  resetZoom: () => void;
  /** Pan canvas by delta */
  pan: (dx: number, dy: number) => void;
  /** Set full canvas transform */
  setCanvasTransform: (transform: CanvasTransform) => void;
  /** Set the component tree */
  setComponentTree: (tree: ComponentNode[]) => void;
  /** Add a component to the tree */
  addComponent: (component: ComponentNode, parentId?: string, index?: number) => void;
  /** Remove a component from the tree */
  removeComponent: (id: string) => void;
  /** Update a component's props */
  updateComponentProps: (id: string, props: Record<string, unknown>) => void;
  /** Move a component to a new parent */
  moveComponent: (id: string, newParentId: string | null, index?: number) => void;
  /** Toggle component visibility */
  toggleComponentVisibility: (id: string) => void;
  /** Toggle component lock */
  toggleComponentLock: (id: string) => void;
  /** Rename a component */
  renameComponent: (id: string, name: string) => void;
  /** Undo last action */
  undo: () => void;
  /** Redo last undone action */
  redo: () => void;
  /** Push current state to history */
  pushHistory: (description: string) => void;
  /** Copy selected components to clipboard */
  copy: () => void;
  /** Cut selected components */
  cut: () => void;
  /** Paste clipboard contents */
  paste: (parentId?: string) => void;
  /** Duplicate selected components */
  duplicate: () => void;
  /** Start a drag operation */
  startDrag: (operation: DragOperation, sourceId: string, position: { x: number; y: number }) => void;
  /** Update drag position */
  updateDrag: (position: { x: number; y: number }, targetId?: string) => void;
  /** End drag operation */
  endDrag: () => void;
  /** Cancel drag operation */
  cancelDrag: () => void;
  /** Toggle preview mode */
  togglePreview: () => void;
  /** Toggle grid visibility */
  toggleGrid: () => void;
}

// ── Constants ────────────────────────────────────────────────────────

const MAX_HISTORY = 100;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;

const INITIAL_DRAG: DragState = {
  active: false,
  operation: "move",
  sourceId: null,
  targetId: null,
  position: { x: 0, y: 0 },
  offset: { x: 0, y: 0 },
};

// ── Helpers ──────────────────────────────────────────────────────────

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function buildComponentMap(tree: readonly ComponentNode[]): Map<string, ComponentNode> {
  const map = new Map<string, ComponentNode>();
  function walk(nodes: readonly ComponentNode[]): void {
    for (const node of nodes) {
      map.set(node.id, node);
      walk(node.children);
    }
  }
  walk(tree);
  return map;
}

function deepCloneNodes(nodes: readonly ComponentNode[]): ComponentNode[] {
  return nodes.map((node) => ({
    ...node,
    id: nextId("comp"),
    children: deepCloneNodes(node.children),
  }));
}

function removeNodeById(tree: readonly ComponentNode[], id: string): ComponentNode[] {
  return tree
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: removeNodeById(node.children, id),
    }));
}

function updateNodeById(
  tree: readonly ComponentNode[],
  id: string,
  updater: (node: ComponentNode) => ComponentNode,
): ComponentNode[] {
  return tree.map((node) => {
    if (node.id === id) return updater(node);
    return {
      ...node,
      children: updateNodeById(node.children, id, updater),
    };
  });
}

function insertNodeIntoParent(
  tree: ComponentNode[],
  parentId: string | null,
  node: ComponentNode,
  index?: number,
): ComponentNode[] {
  if (parentId === null) {
    const idx = index ?? tree.length;
    const result = [...tree];
    result.splice(idx, 0, { ...node, parentId: null });
    return result;
  }

  return tree.map((n) => {
    if (n.id === parentId) {
      const children = [...n.children];
      const idx = index ?? children.length;
      children.splice(idx, 0, { ...node, parentId });
      return { ...n, children };
    }
    return {
      ...n,
      children: insertNodeIntoParent(n.children, parentId, node, index),
    };
  });
}

// ── Signals ──────────────────────────────────────────────────────────

const [selectedIds, setSelectedIds] = createSignal<ReadonlySet<string>>(new Set());
const [canvasTransform, setCanvasTransformSignal] = createSignal<CanvasTransform>({
  zoom: 1,
  panX: 0,
  panY: 0,
});
const [componentTree, setComponentTreeSignal] = createSignal<readonly ComponentNode[]>([]);
const [undoStack, setUndoStack] = createSignal<readonly HistoryEntry[]>([]);
const [redoStack, setRedoStack] = createSignal<readonly HistoryEntry[]>([]);
const [clipboard, setClipboard] = createSignal<readonly ComponentNode[]>([]);
const [dragState, setDragState] = createSignal<DragState>(INITIAL_DRAG);
const [previewMode, setPreviewMode] = createSignal<boolean>(false);
const [showGrid, setShowGrid] = createSignal<boolean>(true);

// ── Derived Signals ──────────────────────────────────────────────────

const componentMap: Accessor<ReadonlyMap<string, ComponentNode>> = (): ReadonlyMap<string, ComponentNode> => {
  return buildComponentMap(componentTree());
};

const primarySelection: Accessor<ComponentNode | null> = (): ComponentNode | null => {
  const ids = selectedIds();
  if (ids.size === 0) return null;
  const firstId = ids.values().next().value as string;
  return componentMap().get(firstId) ?? null;
};

const canUndo: Accessor<boolean> = (): boolean => undoStack().length > 0;
const canRedo: Accessor<boolean> = (): boolean => redoStack().length > 0;

// ── Selection Actions ────────────────────────────────────────────────

function select(id: string): void {
  setSelectedIds(new Set([id]));
}

function addToSelection(id: string): void {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    next.add(id);
    return next;
  });
}

function removeFromSelection(id: string): void {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
}

function clearSelection(): void {
  setSelectedIds(new Set());
}

function selectAll(): void {
  const tree = componentTree();
  const ids = new Set(tree.map((n) => n.id));
  setSelectedIds(ids);
}

// ── Canvas Actions ───────────────────────────────────────────────────

function setZoom(zoom: number): void {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  setCanvasTransformSignal((prev) => ({ ...prev, zoom: clamped }));
}

function zoomToFit(): void {
  // Reset to default view — actual calculation depends on canvas bounds
  setCanvasTransformSignal({ zoom: 1, panX: 0, panY: 0 });
}

function resetZoom(): void {
  setCanvasTransformSignal((prev) => ({ ...prev, zoom: 1 }));
}

function pan(dx: number, dy: number): void {
  setCanvasTransformSignal((prev) => ({
    ...prev,
    panX: prev.panX + dx,
    panY: prev.panY + dy,
  }));
}

function setCanvasTransform(transform: CanvasTransform): void {
  setCanvasTransformSignal({
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, transform.zoom)),
    panX: transform.panX,
    panY: transform.panY,
  });
}

// ── Component Tree Actions ───────────────────────────────────────────

function setComponentTree(tree: ComponentNode[]): void {
  pushHistory("Set component tree");
  setComponentTreeSignal(tree);
}

function addComponent(component: ComponentNode, parentId?: string, index?: number): void {
  pushHistory("Add component");
  setComponentTreeSignal((prev) =>
    insertNodeIntoParent([...prev], parentId ?? null, component, index),
  );
}

function removeComponent(id: string): void {
  pushHistory("Remove component");
  setComponentTreeSignal((prev) => removeNodeById(prev, id));
  setSelectedIds((prev) => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
}

function updateComponentProps(id: string, props: Record<string, unknown>): void {
  setComponentTreeSignal((prev) =>
    updateNodeById(prev, id, (node) => ({
      ...node,
      props: { ...node.props, ...props },
    })),
  );
}

function moveComponent(id: string, newParentId: string | null, index?: number): void {
  pushHistory("Move component");
  const map = componentMap();
  const node = map.get(id);
  if (!node) return;

  setComponentTreeSignal((prev) => {
    const withoutNode = removeNodeById(prev, id);
    return insertNodeIntoParent(withoutNode, newParentId, node, index);
  });
}

function toggleComponentVisibility(id: string): void {
  setComponentTreeSignal((prev) =>
    updateNodeById(prev, id, (node) => ({ ...node, visible: !node.visible })),
  );
}

function toggleComponentLock(id: string): void {
  setComponentTreeSignal((prev) =>
    updateNodeById(prev, id, (node) => ({ ...node, locked: !node.locked })),
  );
}

function renameComponent(id: string, name: string): void {
  setComponentTreeSignal((prev) =>
    updateNodeById(prev, id, (node) => ({ ...node, name })),
  );
}

// ── History Actions ──────────────────────────────────────────────────

function pushHistory(description: string): void {
  const entry: HistoryEntry = {
    id: nextId("hist"),
    description,
    timestamp: Date.now(),
    snapshot: JSON.parse(JSON.stringify(componentTree())) as ComponentNode[],
  };

  setUndoStack((prev) => {
    const next = [...prev, entry];
    if (next.length > MAX_HISTORY) {
      return next.slice(next.length - MAX_HISTORY);
    }
    return next;
  });

  // Clear redo stack on new action
  setRedoStack([]);
}

function undo(): void {
  const stack = undoStack();
  if (stack.length === 0) return;

  const entry = stack[stack.length - 1]!;

  // Push current state to redo
  const currentSnapshot: HistoryEntry = {
    id: nextId("hist"),
    description: "Redo point",
    timestamp: Date.now(),
    snapshot: JSON.parse(JSON.stringify(componentTree())) as ComponentNode[],
  };
  setRedoStack((prev) => [...prev, currentSnapshot]);

  // Restore previous state
  setComponentTreeSignal(entry.snapshot);
  setUndoStack((prev) => prev.slice(0, -1));
}

function redo(): void {
  const stack = redoStack();
  if (stack.length === 0) return;

  const entry = stack[stack.length - 1]!;

  // Push current state to undo
  const currentSnapshot: HistoryEntry = {
    id: nextId("hist"),
    description: "Undo point",
    timestamp: Date.now(),
    snapshot: JSON.parse(JSON.stringify(componentTree())) as ComponentNode[],
  };
  setUndoStack((prev) => [...prev, currentSnapshot]);

  // Restore redo state
  setComponentTreeSignal(entry.snapshot);
  setRedoStack((prev) => prev.slice(0, -1));
}

// ── Clipboard Actions ────────────────────────────────────────────────

function copy(): void {
  const ids = selectedIds();
  const map = componentMap();
  const nodes: ComponentNode[] = [];
  for (const id of ids) {
    const node = map.get(id);
    if (node) nodes.push(JSON.parse(JSON.stringify(node)) as ComponentNode);
  }
  setClipboard(nodes);
}

function cut(): void {
  copy();
  const ids = selectedIds();
  pushHistory("Cut components");
  setComponentTreeSignal((prev) => {
    let tree = [...prev];
    for (const id of ids) {
      tree = removeNodeById(tree, id);
    }
    return tree;
  });
  clearSelection();
}

function paste(parentId?: string): void {
  const nodes = clipboard();
  if (nodes.length === 0) return;

  pushHistory("Paste components");
  const cloned = deepCloneNodes(nodes);
  const newIds = new Set<string>();

  setComponentTreeSignal((prev) => {
    let tree = [...prev];
    for (const node of cloned) {
      newIds.add(node.id);
      tree = insertNodeIntoParent(tree, parentId ?? null, node);
    }
    return tree;
  });

  setSelectedIds(newIds);
}

function duplicate(): void {
  copy();
  paste(primarySelection()?.parentId ?? undefined);
}

// ── Drag Actions ─────────────────────────────────────────────────────

function startDrag(
  operation: DragOperation,
  sourceId: string,
  position: { x: number; y: number },
): void {
  setDragState({
    active: true,
    operation,
    sourceId,
    targetId: null,
    position,
    offset: { x: 0, y: 0 },
  });
}

function updateDrag(position: { x: number; y: number }, targetId?: string): void {
  setDragState((prev) => ({
    ...prev,
    position,
    targetId: targetId ?? prev.targetId,
    offset: {
      x: position.x - prev.position.x,
      y: position.y - prev.position.y,
    },
  }));
}

function endDrag(): void {
  setDragState(INITIAL_DRAG);
}

function cancelDrag(): void {
  setDragState(INITIAL_DRAG);
}

// ── Mode Actions ─────────────────────────────────────────────────────

function togglePreview(): void {
  setPreviewMode((prev) => !prev);
}

function toggleGrid(): void {
  setShowGrid((prev) => !prev);
}

// ── Keyboard Shortcuts (client-side only) ────────────────────────────

if (!isServer) {
  window.addEventListener("keydown", (e: KeyboardEvent): void => {
    // Ignore if in an input field
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      return;
    }

    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if (mod && e.key === "c") {
      e.preventDefault();
      copy();
    } else if (mod && e.key === "x") {
      e.preventDefault();
      cut();
    } else if (mod && e.key === "v") {
      e.preventDefault();
      paste();
    } else if (mod && e.key === "d") {
      e.preventDefault();
      duplicate();
    } else if (mod && e.key === "a") {
      e.preventDefault();
      selectAll();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      const ids = selectedIds();
      if (ids.size > 0) {
        e.preventDefault();
        pushHistory("Delete components");
        setComponentTreeSignal((prev) => {
          let tree = [...prev];
          for (const id of ids) {
            tree = removeNodeById(tree, id);
          }
          return tree;
        });
        clearSelection();
      }
    } else if (e.key === "Escape") {
      if (dragState().active) {
        cancelDrag();
      } else {
        clearSelection();
      }
    }
  });
}

// ── Exported Store ───────────────────────────────────────────────────

export const editorStore: EditorStore = {
  selectedIds,
  primarySelection,
  canvasTransform,
  componentTree,
  componentMap,
  undoStack,
  redoStack,
  canUndo,
  canRedo,
  clipboard,
  dragState,
  previewMode,
  showGrid,
  select,
  addToSelection,
  removeFromSelection,
  clearSelection,
  selectAll,
  setZoom,
  zoomToFit,
  resetZoom,
  pan,
  setCanvasTransform,
  setComponentTree,
  addComponent,
  removeComponent,
  updateComponentProps,
  moveComponent,
  toggleComponentVisibility,
  toggleComponentLock,
  renameComponent,
  undo,
  redo,
  pushHistory,
  copy,
  cut,
  paste,
  duplicate,
  startDrag,
  updateDrag,
  endDrag,
  cancelDrag,
  togglePreview,
  toggleGrid,
};

export function useEditor(): EditorStore {
  return editorStore;
}
