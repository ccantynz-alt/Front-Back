// ── Generative UI Renderer ───────────────────────────────────────────
// Renders AI-generated component trees from validated JSON.
// The AI generates → Zod validates → this renders. No raw HTML ever.

import { For, Match, Show, Switch, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import {
  Button, Input, Card, Stack, Text, Modal,
  Badge, Alert, Avatar, Tabs, Select, Textarea,
  Spinner, Tooltip, Separator,
} from "@back-to-the-future/ui";
import type { Component } from "@back-to-the-future/schemas";

// ── Component Renderer ───────────────────────────────────────────────

interface ComponentRendererProps {
  component: Component;
}

/**
 * Recursively renders a validated component tree.
 * Each component is matched by its discriminated "component" field.
 */
function ComponentRenderer(props: ComponentRendererProps): JSX.Element {
  const comp = createMemo(() => props.component);
  const children = createMemo(() => {
    const c = comp();
    if ("children" in c && Array.isArray(c.children)) {
      return c.children as Component[];
    }
    return [];
  });

  return (
    <Switch fallback={<Text variant="caption">Unknown component: {comp().component}</Text>}>
      <Match when={comp().component === "Button"}>
        <Button
          variant={(comp() as { props: { variant?: string } }).props.variant as "primary" | "default" ?? "default"}
          size={(comp() as { props: { size?: string } }).props.size as "sm" | "md" | "lg" ?? "md"}
          disabled={(comp() as { props: { disabled?: boolean } }).props.disabled}
          loading={(comp() as { props: { loading?: boolean } }).props.loading}
        >
          {(comp() as { props: { label: string } }).props.label}
        </Button>
      </Match>

      <Match when={comp().component === "Input"}>
        <Input
          type={(comp() as { props: { type?: string } }).props.type as "text" | "email" ?? "text"}
          placeholder={(comp() as { props: { placeholder?: string } }).props.placeholder}
          label={(comp() as { props: { label?: string } }).props.label}
          disabled={(comp() as { props: { disabled?: boolean } }).props.disabled}
        />
      </Match>

      <Match when={comp().component === "Card"}>
        <Card
          title={(comp() as { props: { title?: string } }).props.title}
          padding={(comp() as { props: { padding?: string } }).props.padding as "none" | "sm" | "md" | "lg" ?? "md"}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} />}
          </For>
        </Card>
      </Match>

      <Match when={comp().component === "Stack"}>
        <Stack
          direction={(comp() as { props: { direction?: string } }).props.direction as "horizontal" | "vertical" ?? "vertical"}
          gap={(comp() as { props: { gap?: string } }).props.gap as "none" | "xs" | "sm" | "md" | "lg" | "xl" ?? "md"}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} />}
          </For>
        </Stack>
      </Match>

      <Match when={comp().component === "Text"}>
        <Text
          variant={(comp() as { props: { variant?: string } }).props.variant as "h1" | "h2" | "body" ?? "body"}
          weight={(comp() as { props: { weight?: string } }).props.weight as "normal" | "bold" ?? "normal"}
        >
          {(comp() as { props: { content: string } }).props.content}
        </Text>
      </Match>

      <Match when={comp().component === "Modal"}>
        <Modal
          title={(comp() as { props: { title: string } }).props.title}
          open={(comp() as { props: { open?: boolean } }).props.open ?? false}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} />}
          </For>
        </Modal>
      </Match>

      <Match when={comp().component === "Badge"}>
        <Badge
          variant={(comp() as { props: { variant?: string } }).props.variant as "default" | "success" ?? "default"}
          label={(comp() as { props: { label: string } }).props.label}
        />
      </Match>

      <Match when={comp().component === "Alert"}>
        <Alert
          variant={(comp() as { props: { variant?: string } }).props.variant as "info" | "error" ?? "info"}
          title={(comp() as { props: { title?: string } }).props.title}
        >
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} />}
          </For>
        </Alert>
      </Match>

      <Match when={comp().component === "Avatar"}>
        <Avatar
          initials={(comp() as { props: { initials?: string } }).props.initials}
          size={(comp() as { props: { size?: string } }).props.size as "sm" | "md" | "lg" ?? "md"}
        />
      </Match>

      <Match when={comp().component === "Tabs"}>
        <Tabs
          items={(comp() as { props: { items: Array<{ id: string; label: string }> } }).props.items}
        />
      </Match>

      <Match when={comp().component === "Select"}>
        <Select
          options={(comp() as { props: { options: Array<{ value: string; label: string }> } }).props.options}
          placeholder={(comp() as { props: { placeholder?: string } }).props.placeholder}
        />
      </Match>

      <Match when={comp().component === "Textarea"}>
        <Textarea
          placeholder={(comp() as { props: { placeholder?: string } }).props.placeholder}
          rows={(comp() as { props: { rows?: number } }).props.rows ?? 3}
        />
      </Match>

      <Match when={comp().component === "Spinner"}>
        <Spinner size={(comp() as { props: { size?: string } }).props.size as "sm" | "md" | "lg" ?? "md"} />
      </Match>

      <Match when={comp().component === "Tooltip"}>
        <Tooltip content={(comp() as { props: { content: string } }).props.content}>
          <For each={children()}>
            {(child) => <ComponentRenderer component={child} />}
          </For>
        </Tooltip>
      </Match>

      <Match when={comp().component === "Separator"}>
        <Separator orientation={(comp() as { props: { orientation?: string } }).props.orientation as "horizontal" | "vertical" ?? "horizontal"} />
      </Match>
    </Switch>
  );
}

// ── Tree Renderer ────────────────────────────────────────────────────

interface GenerativeUIProps {
  /** Validated component tree from AI */
  tree: Component[];
  /** Show empty state when tree is empty */
  emptyMessage?: string;
}

/**
 * Renders a complete AI-generated component tree.
 * Pass the validated output from processGenerativeUIOutput().
 */
export function GenerativeUIRenderer(props: GenerativeUIProps): JSX.Element {
  return (
    <Show
      when={props.tree.length > 0}
      fallback={
        <Stack direction="vertical" align="center" justify="center" gap="md">
          <Text variant="body" class="text-muted">
            {props.emptyMessage ?? "No components generated yet."}
          </Text>
        </Stack>
      }
    >
      <Stack direction="vertical" gap="md">
        <For each={props.tree}>
          {(component) => <ComponentRenderer component={component} />}
        </For>
      </Stack>
    </Show>
  );
}

export { ComponentRenderer };
