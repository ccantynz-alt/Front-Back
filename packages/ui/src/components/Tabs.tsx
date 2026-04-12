import { type JSX, For, splitProps, createSignal } from "solid-js";

export interface TabItem {
  id: string;
  label: string;
  content?: JSX.Element;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  defaultTab?: string;
  class?: string;
  onChange?: (tabId: string) => void;
}

export function Tabs(props: TabsProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "items",
    "defaultTab",
    "class",
    "onChange",
  ]);

  const [activeTab, setActiveTab] = createSignal(
    local.defaultTab ?? local.items[0]?.id ?? "",
  );

  const handleTabClick = (tabId: string): void => {
    setActiveTab(tabId);
    local.onChange?.(tabId);
  };

  const handleKeyDown = (e: KeyboardEvent, index: number): void => {
    const tabs = local.items.filter((t) => !t.disabled);
    let newIndex = -1;

    if (e.key === "ArrowRight") {
      newIndex = (index + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      newIndex = (index - 1 + tabs.length) % tabs.length;
    }

    if (newIndex >= 0) {
      const tab = tabs[newIndex];
      if (tab) {
        handleTabClick(tab.id);
      }
    }
  };

  return (
    <div class={`tabs ${local.class ?? ""}`} {...rest}>
      <div class="tabs-list" role="tablist">
        <For each={local.items}>
          {(tab, index) => (
            <button
              class={`tab-trigger ${activeTab() === tab.id ? "tab-active" : ""}`}
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
            class="tab-panel"
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
