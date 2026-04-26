// ── json-render/solid Generative UI ─────────────────────────────────
// Production-grade generative UI using @json-render/solid.
// AI generates JSON specs → json-render validates & renders → SolidJS components.
// This replaces manual Switch/Match rendering with a catalog-driven renderer.

import { createSignal, For, Show } from "solid-js";
import type { JSX, Component } from "solid-js";
import {
  Renderer,
  useChatUI,
  useUIStream,
  JSONUIProvider,
  StateProvider,
  type ComponentRenderProps,
  type CreateRendererProps,
  type Spec,
} from "@json-render/solid";
import {
  Button, Input, Card, Stack, Text, Modal,
  Badge, Alert, Avatar, Tabs, Select, Textarea,
  Spinner, Tooltip, Separator,
} from "@back-to-the-future/ui";

// ── Component Catalog (json-render format) ──────────────────────────
// Maps component type names to SolidJS render functions.
// Each receives ComponentRenderProps with element, children, emit, on, bindings.

// Note: We define our catalog object for createRenderer.
// json-render's createRenderer takes a catalog schema + component map.
// Since @json-render/solid v0.16 works with any catalog shape,
// we define components as a simple registry for the Renderer.

// AI-generated props arrive as unstructured strings; validate them against the
// component's literal union and fall back to a sane default when the value is
// missing or unknown. Keeps the renderer strict without trusting the model.
const asEnum = <T extends string>(
  value: unknown,
  valid: readonly T[],
  fallback: T,
): T => (typeof value === "string" && (valid as readonly string[]).includes(value) ? (value as T) : fallback);

const BUTTON_VARIANTS = ["default", "primary", "secondary", "destructive", "outline", "ghost", "link"] as const;
const BUTTON_SIZES = ["sm", "md", "lg", "icon"] as const;
const CARD_PADDINGS = ["none", "sm", "md", "lg"] as const;
const STACK_DIRECTIONS = ["horizontal", "vertical"] as const;
const STACK_GAPS = ["none", "xs", "sm", "md", "lg", "xl"] as const;
const TEXT_VARIANTS = ["h1", "h2", "h3", "h4", "body", "caption", "code"] as const;
const TEXT_WEIGHTS = ["normal", "medium", "semibold", "bold"] as const;
const BADGE_VARIANTS = ["default", "success", "warning", "error", "info"] as const;
const ALERT_VARIANTS = ["success", "warning", "error", "info"] as const;
const AVATAR_SIZES = ["sm", "md", "lg"] as const;
const SPINNER_SIZES = ["sm", "md", "lg"] as const;
const SEPARATOR_ORIENTATIONS = ["horizontal", "vertical"] as const;

export const componentRegistry: Record<string, Component<ComponentRenderProps>> = {
  Button: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Button
        variant={asEnum(p.variant, BUTTON_VARIANTS, "default")}
        size={asEnum(p.size, BUTTON_SIZES, "md")}
        disabled={p.disabled as boolean}
        loading={p.loading as boolean}
        onClick={() => props.emit("press")}
      >
        {(p.label as string) ?? "Button"}
      </Button>
    );
  },

  Input: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Input
        type={(p.type as string) ?? "text"}
        placeholder={p.placeholder as string}
        label={p.label as string}
        disabled={p.disabled as boolean}
      />
    );
  },

  Card: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Card
        title={p.title as string}
        padding={asEnum(p.padding, CARD_PADDINGS, "md")}
      >
        {props.children}
      </Card>
    );
  },

  Stack: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Stack
        direction={asEnum(p.direction, STACK_DIRECTIONS, "vertical")}
        gap={asEnum(p.gap, STACK_GAPS, "md")}
      >
        {props.children}
      </Stack>
    );
  },

  Text: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Text
        variant={asEnum(p.variant, TEXT_VARIANTS, "body")}
        weight={asEnum(p.weight, TEXT_WEIGHTS, "normal")}
      >
        {(p.content as string) ?? ""}
      </Text>
    );
  },

  Modal: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Modal
        title={(p.title as string) ?? ""}
        open={(p.open as boolean) ?? false}
      >
        {props.children}
      </Modal>
    );
  },

  Badge: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Badge
        variant={asEnum(p.variant, BADGE_VARIANTS, "default")}
        label={(p.label as string) ?? ""}
      />
    );
  },

  Alert: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Alert
        variant={asEnum(p.variant, ALERT_VARIANTS, "info")}
        title={p.title as string}
      >
        {props.children}
      </Alert>
    );
  },

  Avatar: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Avatar
        initials={p.initials as string}
        size={asEnum(p.size, AVATAR_SIZES, "md")}
      />
    );
  },

  Tabs: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Tabs
        items={(p.items as Array<{ id: string; label: string }>) ?? []}
      />
    );
  },

  Select: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Select
        options={(p.options as Array<{ value: string; label: string }>) ?? []}
        placeholder={p.placeholder as string}
      />
    );
  },

  Textarea: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Textarea
        placeholder={p.placeholder as string}
        rows={(p.rows as number) ?? 3}
      />
    );
  },

  Spinner: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return <Spinner size={asEnum(p.size, SPINNER_SIZES, "md")} />;
  },

  Tooltip: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Tooltip content={(p.content as string) ?? ""}>
        {props.children}
      </Tooltip>
    );
  },

  Separator: (props: ComponentRenderProps) => {
    const p = props.element.props as Record<string, unknown>;
    return (
      <Separator
        orientation={asEnum(p.orientation, SEPARATOR_ORIENTATIONS, "horizontal")}
      />
    );
  },
};

// ── Streaming Generative UI Renderer ────────────────────────────────

interface StreamingGenUIProps {
  /** API endpoint for AI generation */
  api: string;
  /** Initial prompt to send */
  prompt?: string;
  /** Callback when generation completes */
  onComplete?: (spec: Spec) => void;
  /** Additional state for dynamic values */
  state?: Record<string, unknown>;
  /** Action handlers for interactive components */
  onAction?: (actionName: string, params?: Record<string, unknown>) => void;
}

/**
 * Streaming Generative UI component.
 * Connects to an AI endpoint and renders the streamed UI spec in real-time.
 */
export function StreamingGenUI(props: StreamingGenUIProps): JSX.Element {
  const stream = useUIStream({
    api: props.api,
    ...(props.onComplete ? { onComplete: props.onComplete } : {}),
    onError: (err) => console.error("[StreamingGenUI] Error:", err),
  });

  return (
    <Show
      when={stream.spec}
      fallback={
        <Show when={stream.isStreaming}>
          <Stack direction="vertical" align="center" gap="sm">
            <Spinner size="md" />
            <Text variant="caption">Generating UI...</Text>
          </Stack>
        </Show>
      }
    >
      <JSONUIProvider registry={componentRegistry}>
        <Renderer
          spec={stream.spec}
          registry={componentRegistry}
          loading={stream.isStreaming}
        />
      </JSONUIProvider>
    </Show>
  );
}

// ── Chat + Generative UI ────────────────────────────────────────────

interface ChatGenUIProps {
  /** API endpoint for chat + UI generation */
  api: string;
  /** Placeholder text for input */
  placeholder?: string;
}

/**
 * Chat interface with integrated Generative UI.
 * Each assistant message can contain both text and a rendered UI spec.
 */
export function ChatGenUI(props: ChatGenUIProps): JSX.Element {
  const [inputValue, setInputValue] = createSignal("");
  const chat = useChatUI({
    api: props.api,
    onError: (err) => console.error("[ChatGenUI] Error:", err),
  });

  const handleSend = async () => {
    const text = inputValue().trim();
    if (!text || chat.isStreaming) return;
    setInputValue("");
    await chat.send(text);
  };

  return (
    <Stack direction="vertical" gap="md">
      {/* Messages */}
      <Stack direction="vertical" gap="sm">
        <For each={chat.messages}>
          {(msg) => (
            <Card padding="sm">
              <Stack direction="vertical" gap="xs">
                <Badge
                  variant={msg.role === "user" ? "info" : "success"}
                  label={msg.role === "user" ? "You" : "AI"}
                />
                <Show when={msg.text}>
                  <Text variant="body">{msg.text}</Text>
                </Show>
                <Show when={msg.spec}>
                  <JSONUIProvider registry={componentRegistry}>
                    <Renderer
                      spec={msg.spec}
                      registry={componentRegistry}
                    />
                  </JSONUIProvider>
                </Show>
              </Stack>
            </Card>
          )}
        </For>
      </Stack>

      {/* Input */}
      <Stack direction="horizontal" gap="sm">
        <Input
          type="text"
          placeholder={props.placeholder ?? "Describe the UI you want..."}
          value={inputValue()}
          label="Describe UI"
          onInput={(e: Event) =>
            setInputValue((e.target as HTMLInputElement).value)
          }
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") handleSend();
          }}
        />
        <Button
          variant="primary"
          onClick={handleSend}
          loading={chat.isStreaming}
          disabled={chat.isStreaming || !inputValue().trim()}
        >
          Send
        </Button>
      </Stack>

      <Show when={chat.error}>
        <Alert variant="error" title="Error">
          <Text variant="caption">{chat.error?.message}</Text>
        </Alert>
      </Show>
    </Stack>
  );
}

// Re-export for convenience
export { JSONUIProvider, StateProvider, useChatUI, useUIStream, Renderer };
export type { Spec, CreateRendererProps };
