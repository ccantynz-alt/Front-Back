import { type JSX, For, splitProps } from "solid-js";
import { Tabs as KobalteTabs } from "@kobalte/core/tabs";

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
  const [local, rest] = splitProps(props, [
    "items",
    "defaultTab",
    "class",
    "onChange",
  ]);

  return (
    <KobalteTabs
      defaultValue={local.defaultTab ?? local.items[0]?.id ?? ""}
      onChange={(value) => local.onChange?.(value)}
      class={`tabs ${local.class ?? ""}`}
      {...rest}
    >
      <KobalteTabs.List class="tabs-list">
        <For each={local.items}>
          {(tab) => (
            <KobalteTabs.Trigger
              value={tab.id}
              disabled={tab.disabled}
              class="tab-trigger"
            >
              {tab.label}
            </KobalteTabs.Trigger>
          )}
        </For>
      </KobalteTabs.List>
      <For each={local.items}>
        {(tab) => (
          <KobalteTabs.Content value={tab.id} class="tab-panel">
            {tab.content}
          </KobalteTabs.Content>
        )}
      </For>
    </KobalteTabs>
  );
}
