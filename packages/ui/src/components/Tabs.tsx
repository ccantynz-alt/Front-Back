import { z } from "zod";
import { type JSX, For, splitProps, createSignal } from "solid-js";

// ── Zod Schema (AI Composability) ─��──────────────────────────────────
export const TabItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  disabled: z.boolean().optional(),
});

export const TabsPropsSchema = z.object({
  items: z.array(TabItemSchema).min(1),
  defaultTab: z.string().optional(),
});

export type TabsSchemaProps = z.input<typeof TabsPropsSchema>;

export interface TabItem {
  id: string;
  label: string;
  content: JSX.Element;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  defaultTab?: string;
  class?: string;
  onChange?: (tabId: string) => void;
}

export function Tabs(props: TabsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "defaultTab", "class", "onChange"]);

  const [activeTab, setActiveTab] = createSignal(
    local.defaultTab ?? local.items[0]?.id ?? "",
  );

  const handleTabClick = (tabId: string): void => {
    setActiveTab(tabId);
    local.onChange?.(tabId);
  };

  const handleKeyDown = (e: KeyboardEvent, index: number): void => {
    const enabledTabs = local.items.filter((t) => !t.disabled);
    let newIndex = -1;
    if (e.key === "ArrowRight") {
      newIndex = (index + 1) % enabledTabs.length;
    } else if (e.key === "ArrowLeft") {
      newIndex = (index - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (e.key === "Home") {
      newIndex = 0;
    } else if (e.key === "End") {
      newIndex = enabledTabs.length - 1;
    }
    if (newIndex >= 0) {
      const tab = enabledTabs[newIndex];
      if (tab) {
        handleTabClick(tab.id);
        const el = document.getElementById(`tab-${tab.id}`);
        el?.focus();
      }
    }
  };

  return (
    <div class={`flex flex-col ${local.class ?? ""}`} {...rest}>
      <div
        class="flex border-b border-gray-200"
        role="tablist"
        aria-orientation="horizontal"
      >
        <For each={local.items}>
          {(tab, index) => (
            <button
              type="button"
              class={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                activeTab() === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } ${tab.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              role="tab"
              aria-selected={activeTab() === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              tabIndex={activeTab() === tab.id ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => handleTabClick(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, index())}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>
      <For each={local.items}>
        {(tab) => (
          <div
            class="py-4"
            role="tabpanel"
            id={`tabpanel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={activeTab() !== tab.id}
          >
            {tab.content}
          </div>
        )}
      </For>
    </div>
  );
}
