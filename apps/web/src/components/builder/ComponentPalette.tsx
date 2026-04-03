// ── Component Palette ─────────────────────────────────────────────────
// Lists all available components from the ComponentRegistry, grouped by
// category. Supports search/filter and drag-to-add to canvas.

import { type JSX, createSignal, For, Show, createMemo } from "solid-js";
import { ComponentRegistry, type ComponentName } from "@cronix/ui";
import { useEditor, type ComponentNode } from "../../stores/editor";

// ── Types ────────────────────────────────────────────────────────────

interface PaletteItem {
  name: ComponentName;
  category: ComponentCategory;
  description: string;
  icon: string;
}

type ComponentCategory = "Layout" | "Input" | "Display" | "Feedback" | "Navigation";

// ── Component → Category + Description Mapping ──────────────────────

const PALETTE_ITEMS: PaletteItem[] = [
  { name: "Stack", category: "Layout", description: "Flex container for arranging children", icon: "layers" },
  { name: "Card", category: "Layout", description: "Contained surface with optional header", icon: "square" },
  { name: "Separator", category: "Layout", description: "Visual divider between content", icon: "minus" },
  { name: "Input", category: "Input", description: "Text input field with label and validation", icon: "type" },
  { name: "Textarea", category: "Input", description: "Multi-line text input", icon: "align-left" },
  { name: "Select", category: "Input", description: "Dropdown selection", icon: "chevron-down" },
  { name: "Toggle", category: "Input", description: "On/off switch", icon: "toggle-left" },
  { name: "Button", category: "Input", description: "Clickable action button", icon: "mouse-pointer" },
  { name: "Text", category: "Display", description: "Typography component for text content", icon: "type" },
  { name: "Badge", category: "Display", description: "Small status indicator", icon: "tag" },
  { name: "Avatar", category: "Display", description: "User avatar image or initials", icon: "user" },
  { name: "Tabs", category: "Navigation", description: "Tabbed content navigation", icon: "columns" },
  { name: "Tooltip", category: "Display", description: "Hover info tooltip", icon: "message-circle" },
  { name: "Alert", category: "Feedback", description: "Contextual feedback message", icon: "alert-circle" },
  { name: "Spinner", category: "Feedback", description: "Loading indicator", icon: "loader" },
  { name: "Modal", category: "Feedback", description: "Dialog overlay", icon: "maximize-2" },
];

const CATEGORIES: ComponentCategory[] = ["Layout", "Input", "Display", "Feedback", "Navigation"];

const CATEGORY_COLORS: Record<ComponentCategory, string> = {
  Layout: "bg-purple-100 text-purple-700",
  Input: "bg-blue-100 text-blue-700",
  Display: "bg-green-100 text-green-700",
  Feedback: "bg-amber-100 text-amber-700",
  Navigation: "bg-teal-100 text-teal-700",
};

// ── Icon Component ──────────────────────────────────────────────────

function PaletteIcon(props: { icon: string; class?: string }): JSX.Element {
  const icons: Record<string, () => JSX.Element> = {
    layers: () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
    square: () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      </svg>
    ),
    minus: () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
    type: () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="9" y1="20" x2="15" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
    "align-left": () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="17" y1="10" x2="3" y2="10" />
        <line x1="21" y1="6" x2="3" y2="6" />
        <line x1="21" y1="14" x2="3" y2="14" />
        <line x1="17" y1="18" x2="3" y2="18" />
      </svg>
    ),
    "chevron-down": () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    ),
    "toggle-left": () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="1" y="5" width="22" height="14" rx="7" ry="7" />
        <circle cx="8" cy="12" r="3" />
      </svg>
    ),
    "mouse-pointer": () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        <path d="M13 13l6 6" />
      </svg>
    ),
    tag: () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
    user: () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    columns: () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="12" y1="3" x2="12" y2="21" />
      </svg>
    ),
    "message-circle": () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    ),
    "alert-circle": () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    loader: () => (
      <svg class={props.class ?? "w-4 h-4 animate-spin"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
      </svg>
    ),
    "maximize-2": () => (
      <svg class={props.class ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </svg>
    ),
  };

  const iconFn = (): (() => JSX.Element) | undefined => icons[props.icon];

  return (
    <Show when={iconFn()} fallback={<span class="w-4 h-4 inline-block bg-gray-300 rounded" />}>
      {(fn) => fn()()}
    </Show>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

let paletteIdCounter = 0;
function nextComponentId(): string {
  paletteIdCounter += 1;
  return `comp-${Date.now()}-${paletteIdCounter}`;
}

function createDefaultNode(componentName: ComponentName): ComponentNode {
  return {
    id: nextComponentId(),
    type: componentName,
    props: {},
    children: [],
    parentId: null,
    locked: false,
    visible: true,
    name: componentName,
  };
}

// ── Component ────────────────────────────────────────────────────────

export function ComponentPalette(): JSX.Element {
  const editor = useEditor();
  const [search, setSearch] = createSignal("");
  const [collapsedCategories, setCollapsedCategories] = createSignal<Set<string>>(new Set());

  const filteredItems = createMemo((): PaletteItem[] => {
    const query = search().toLowerCase().trim();
    if (!query) return PALETTE_ITEMS;
    return PALETTE_ITEMS.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query),
    );
  });

  const groupedItems = createMemo((): Map<ComponentCategory, PaletteItem[]> => {
    const map = new Map<ComponentCategory, PaletteItem[]>();
    for (const cat of CATEGORIES) {
      const items = filteredItems().filter((i) => i.category === cat);
      if (items.length > 0) {
        map.set(cat, items);
      }
    }
    return map;
  });

  function toggleCategory(cat: string): void {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  function handleDragStart(e: DragEvent, item: PaletteItem): void {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("application/cronix-component", item.name);
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleDoubleClick(item: PaletteItem): void {
    const node = createDefaultNode(item.name);
    const primary = editor.primarySelection();
    editor.addComponent(node, primary?.id);
    editor.select(node.id);
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="p-3 border-b border-gray-200">
        <div class="relative">
          <svg
            class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search components..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            class="w-full h-8 pl-8 pr-3 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <For each={CATEGORIES}>
          {(category) => (
            <Show when={groupedItems().has(category)}>
              <div class="mb-3">
                <button
                  type="button"
                  class="flex items-center gap-1.5 w-full px-1 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700"
                  onClick={() => toggleCategory(category)}
                >
                  <svg
                    class={`w-3 h-3 transition-transform ${collapsedCategories().has(category) ? "" : "rotate-90"}`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {category}
                  <span class={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[category]}`}>
                    {groupedItems().get(category)?.length ?? 0}
                  </span>
                </button>
                <Show when={!collapsedCategories().has(category)}>
                  <div class="grid grid-cols-2 gap-1.5 mt-1">
                    <For each={groupedItems().get(category)}>
                      {(item) => (
                        <button
                          type="button"
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, item)}
                          onDblClick={() => handleDoubleClick(item)}
                          class="flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-grab active:cursor-grabbing text-center group"
                          title={item.description}
                        >
                          <div class="text-gray-500 group-hover:text-blue-600 transition-colors">
                            <PaletteIcon icon={item.icon} />
                          </div>
                          <span class="text-[11px] font-medium text-gray-700 group-hover:text-blue-700 leading-tight">
                            {item.name}
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>
          )}
        </For>
        <Show when={filteredItems().length === 0}>
          <div class="flex flex-col items-center justify-center py-8 text-gray-400">
            <svg class="w-8 h-8 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span class="text-sm">No components found</span>
          </div>
        </Show>
      </div>
    </div>
  );
}
