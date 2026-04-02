import { Title } from "@solidjs/meta";
import { For, Show, createEffect, createSignal } from "solid-js";
import { Button, Card, Input, Stack, Text } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useChat, type ChatMessage } from "../stores/chat";

// ── Chat Message Component ────────────────────────────────────────────

function ChatBubble(props: { message: ChatMessage }): ReturnType<typeof Card> {
  const isUser = (): boolean => props.message.role === "user";

  return (
    <div
      class={`chat-bubble ${isUser() ? "chat-bubble-user" : "chat-bubble-assistant"}`}
    >
      <Text variant="caption" weight="semibold" class="chat-role">
        {isUser() ? "You" : "AI Builder"}
      </Text>
      <Text variant="body">{props.message.content}</Text>
    </div>
  );
}

// ── Preview Panel ─────────────────────────────────────────────────────

function PreviewPanel(): ReturnType<typeof Card> {
  const { generatedUI } = useChat();

  return (
    <Card class="preview-panel" padding="none">
      <Stack direction="vertical" gap="none" class="preview-inner">
        <div class="preview-toolbar">
          <Text variant="caption" weight="semibold">
            Live Preview
          </Text>
          <Stack direction="horizontal" gap="xs">
            <Button variant="ghost" size="sm">
              Desktop
            </Button>
            <Button variant="ghost" size="sm">
              Tablet
            </Button>
            <Button variant="ghost" size="sm">
              Mobile
            </Button>
          </Stack>
        </div>
        <div class="preview-canvas">
          <Show
            when={generatedUI()}
            fallback={
              <Stack
                direction="vertical"
                align="center"
                justify="center"
                class="preview-placeholder"
              >
                <Text variant="h3" class="text-muted">
                  Preview Area
                </Text>
                <Text variant="body" class="text-muted">
                  Describe your website in the chat and the AI will build it
                  here.
                </Text>
              </Stack>
            }
          >
            {(ui) => (
              <Stack direction="vertical" gap="md" class="preview-generated">
                <Text variant="caption" class="text-muted">
                  {ui().reasoning}
                </Text>
                <For each={ui().layout}>
                  {(component) => (
                    <Card padding="sm">
                      <Text variant="body">
                        {(component as Record<string, string>).type ??
                          "Component"}{" "}
                        — {JSON.stringify(component)}
                      </Text>
                    </Card>
                  )}
                </For>
              </Stack>
            )}
          </Show>
        </div>
      </Stack>
    </Card>
  );
}

// ── Builder Page ──────────────────────────────────────────────────────

export default function BuilderPage(): ReturnType<typeof ProtectedRoute> {
  const { messages, isStreaming, error, sendMessage, clearMessages } =
    useChat();
  const [input, setInput] = createSignal("");

  let messagesEndRef: HTMLDivElement | undefined;

  // Auto-scroll to bottom when messages change or during streaming
  createEffect((): void => {
    // Track both messages and streaming state to trigger scroll
    messages();
    isStreaming();
    if (messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  const handleSend = (): void => {
    const text = input().trim();
    if (!text || isStreaming()) return;
    sendMessage(text);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <ProtectedRoute>
      <Title>AI Builder - Back to the Future</Title>
      <div class="builder-layout">
        <div class="builder-chat">
          <Stack direction="vertical" gap="none" class="builder-chat-inner">
            <div class="builder-chat-header">
              <Stack direction="horizontal" justify="between" align="center">
                <Text variant="h3" weight="bold">
                  AI Website Builder
                </Text>
                <Button variant="ghost" size="sm" onClick={clearMessages}>
                  Clear
                </Button>
              </Stack>
            </div>
            <div class="builder-chat-messages">
              <For each={messages()}>
                {(msg) => <ChatBubble message={msg} />}
              </For>
              <Show when={isStreaming()}>
                <div class="chat-bubble chat-bubble-assistant chat-bubble-streaming">
                  <Text variant="caption" weight="semibold" class="chat-role">
                    AI Builder
                  </Text>
                  <Text variant="body" class="text-muted">
                    Generating...
                  </Text>
                </div>
              </Show>
              <Show when={error()}>
                {(errMsg) => (
                  <div class="chat-error">
                    <Text variant="caption" class="text-error">
                      Error: {errMsg()}
                    </Text>
                  </div>
                )}
              </Show>
              <div ref={messagesEndRef} />
            </div>
            <div class="builder-chat-input">
              <Stack direction="horizontal" gap="sm" align="end">
                <Input
                  placeholder="Describe your website..."
                  value={input()}
                  onInput={(e) => setInput(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming()}
                  class="builder-input"
                />
                <Button
                  variant="primary"
                  onClick={handleSend}
                  loading={isStreaming()}
                  disabled={!input().trim() || isStreaming()}
                >
                  Send
                </Button>
              </Stack>
            </div>
          </Stack>
        </div>
        <div class="builder-preview">
          <PreviewPanel />
        </div>
      </div>
    </ProtectedRoute>
  );
}
