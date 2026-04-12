// ── Page Layout Renderer ─────────────────────────────────────────────
// Takes a validated PageLayout from trpc.ai.siteBuilder.generate and
// renders it recursively using the real @back-to-the-future/ui
// components. Every node was parsed through ComponentSchema (Zod
// discriminated union) on the server before it crossed the tRPC
// boundary, so the AI literally cannot emit a broken component tree
// — the compiler refuses to type it and the server refuses to return
// it. That guarantee is the architectural moat: Lovable and Zoobicon
// hallucinate raw HTML/React and hope it compiles; Crontech composes
// pre-validated Solid components and renders them by construction.

import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import {
  Button,
  Input,
  Card,
  Stack,
  Text,
  Modal,
  Badge,
  Alert,
  Avatar,
  Tabs,
  Select,
  Textarea,
  Spinner,
  Tooltip,
  Separator,
} from "@back-to-the-future/ui";
import type { Component } from "@back-to-the-future/schemas";
import type { PageLayout } from "@back-to-the-future/ai-core";

// ── exactOptionalPropertyTypes helper ────────────────────────────────
// Some UI components declare optional props as `prop?: T` (NOT
// `prop?: T | undefined`). Under exactOptionalPropertyTypes:true we
// cannot pass an explicit `undefined` to those props — we have to
// omit the key entirely. Zod output types for `.optional()` fields
// are `T | undefined`, so we filter them here before spreading.
// The return type strips `undefined` from the value types so that
// the spread result is assignable to strict-optional targets.
type Compact<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

function compact<T extends Record<string, unknown>>(obj: T): Compact<T> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as Compact<T>;
}

// Narrow the `children` field coming out of ComponentSchema. Zod
// erases the recursive type to `unknown[]` via z.lazy, but the
// schema has already validated every node on the server, so casting
// back to Component[] is safe at the tRPC boundary.
function childrenOf(node: { children?: unknown }): Component[] {
  return (node.children ?? []) as Component[];
}

// ── Recursive Node Renderer ──────────────────────────────────────────
// Discriminated switch on `node.component` gives us exhaustive,
// type-safe dispatch. Children render back through this same function
// so arbitrary nesting depth just works. Interaction handlers are
// no-oped in the preview — the AI emits them as strings (action names)
// and the builder attaches behavior separately.

function renderNode(node: Component): JSX.Element {
  switch (node.component) {
    case "Button":
      return (
        <Button
          variant={node.props.variant}
          size={node.props.size}
          disabled={node.props.disabled}
          loading={node.props.loading}
        >
          {node.props.label}
        </Button>
      );

    case "Input":
      return (
        <Input
          type={node.props.type}
          placeholder={node.props.placeholder}
          label={node.props.label}
          required={node.props.required}
          disabled={node.props.disabled}
          error={node.props.error}
          name={node.props.name}
        />
      );

    case "Card":
      return (
        <Card
          title={node.props.title}
          description={node.props.description}
          padding={node.props.padding}
        >
          <For each={childrenOf(node)}>{(child) => renderNode(child)}</For>
        </Card>
      );

    case "Stack":
      return (
        <Stack
          direction={node.props.direction}
          gap={node.props.gap}
          align={node.props.align}
          justify={node.props.justify}
        >
          <For each={childrenOf(node)}>{(child) => renderNode(child)}</For>
        </Stack>
      );

    case "Text":
      return (
        <Text
          variant={node.props.variant}
          weight={node.props.weight}
          align={node.props.align}
          content={node.props.content}
        />
      );

    case "Modal":
      return (
        <Modal
          {...compact({
            title: node.props.title,
            description: node.props.description,
            open: node.props.open,
            size: node.props.size,
          })}
        >
          <For each={childrenOf(node)}>{(child) => renderNode(child)}</For>
        </Modal>
      );

    case "Badge":
      return (
        <Badge
          variant={node.props.variant}
          size={node.props.size}
          label={node.props.label}
        />
      );

    case "Alert":
      return (
        <Alert
          variant={node.props.variant}
          title={node.props.title}
          description={node.props.description}
          dismissible={node.props.dismissible}
        >
          <For each={childrenOf(node)}>{(child) => renderNode(child)}</For>
        </Alert>
      );

    case "Avatar":
      return (
        <Avatar
          src={node.props.src}
          alt={node.props.alt}
          initials={node.props.initials}
          size={node.props.size}
        />
      );

    case "Tabs":
      return (
        <Tabs
          items={node.props.items.map((item) =>
            compact({
              id: item.id,
              label: item.label,
              disabled: item.disabled,
            }),
          ) as Array<{ id: string; label: string; disabled?: boolean }>}
          {...compact({ defaultTab: node.props.defaultTab })}
        />
      );

    case "Select":
      return (
        <Select
          options={node.props.options}
          value={node.props.value}
          placeholder={node.props.placeholder}
          label={node.props.label}
          error={node.props.error}
          disabled={node.props.disabled}
          name={node.props.name}
        />
      );

    case "Textarea":
      return (
        <Textarea
          {...compact({
            label: node.props.label,
            error: node.props.error,
            placeholder: node.props.placeholder,
            rows: node.props.rows,
            resize: node.props.resize,
            required: node.props.required,
            disabled: node.props.disabled,
            name: node.props.name,
          })}
        />
      );

    case "Spinner":
      return <Spinner size={node.props.size} />;

    case "Tooltip":
      return (
        <Tooltip content={node.props.content} position={node.props.position}>
          <For each={childrenOf(node)}>{(child) => renderNode(child)}</For>
        </Tooltip>
      );

    case "Separator":
      return <Separator orientation={node.props.orientation} />;
  }
}

// ── Public Renderer ─────────────────────────────────────────────────
// Top-level component. Takes a PageLayout (or null while we're
// waiting for the first generation) and renders each root component
// in order. A `fallback` prop lets the caller control the empty
// state so the preview pane can show its placeholder text.

export interface PageLayoutRendererProps {
  layout: PageLayout | null;
  fallback?: JSX.Element;
}

export function PageLayoutRenderer(
  props: PageLayoutRendererProps,
): JSX.Element {
  return (
    <Show when={props.layout} fallback={props.fallback}>
      {(layout) => (
        <div class="page-layout-root">
          <For each={layout().components}>{(node) => renderNode(node)}</For>
        </div>
      )}
    </Show>
  );
}
