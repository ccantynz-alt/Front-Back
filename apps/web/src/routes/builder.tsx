import { Title } from "@solidjs/meta";
import { For, Show, createSignal } from "solid-js";
import { Button, Card, Input, Stack, Text } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";

// ── Chat Message Type ─────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ── Chat Message Component ────────────────────────────────────────────

function ChatBubble(props: { message: ChatMessage }): ReturnType<typeof Card> {
  const isUser = (): boolean => props.message.role === "user";

  return (
    <div class={`chat-bubble ${isUser() ? "chat-bubble-user" : "chat-bubble-assistant"}`}>
      <Text variant="caption" weight="semibold" class="chat-role">
        {isUser() ? "You" : "AI Builder"}
      </Text>
      <Text variant="body">{props.message.content}</Text>
    </div>
  );
}

// ── Preview Panel ─────────────────────────────────────────────────────

function PreviewPanel(): ReturnType<typeof Card> {
  return (
    <Card class="preview-panel" padding="none">
      <Stack direction="vertical" gap="none" class="preview-inner">
        <div class="preview-toolbar">
          <Text variant="caption" weight="semibold">Live Preview</Text>
          <Stack direction="horizontal" gap="xs">
            <Button variant="ghost" size="sm">Desktop</Button>
            <Button variant="ghost" size="sm">Tablet</Button>
            <Button variant="ghost" size="sm">Mobile</Button>
          </Stack>
        </div>
        <div class="preview-canvas">
          <Stack direction="vertical" align="center" justify="center" class="preview-placeholder">
            <Text variant="h3" class="text-muted">Preview Area</Text>
            <Text variant="body" class="text-muted">
              Describe your website in the chat and the AI will build it here.
            </Text>
          </Stack>
        </div>
      </Stack>
    </Card>
  );
}

// ── Builder Page ──────────────────────────────────────────────────────

export default function BuilderPage(): ReturnType<typeof ProtectedRoute> {
  const [messages, setMessages] = createSignal<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome to the AI Website Builder. Describe the website you want to create, and I will build it for you in real time. You can ask for changes, add pages, or adjust styling at any point.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = createSignal("");
  const [isGenerating, setIsGenerating] = createSignal(false);

  const handleSend = (): void => {
    const text = input().trim();
    if (!text || isGenerating()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsGenerating(true);

    // Simulate AI response -- will be replaced with real AI SDK streaming
    setTimeout((): void => {
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: `I understand you want: "${text}". The AI builder pipeline is being connected. Once the Vercel AI SDK streaming integration is live, I will generate and preview components in real time.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsGenerating(false);
    }, 1500);
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
              <Text variant="h3" weight="bold">AI Website Builder</Text>
            </div>
            <div class="builder-chat-messages">
              <For each={messages()}>
                {(msg) => <ChatBubble message={msg} />}
              </For>
              <Show when={isGenerating()}>
                <div class="chat-bubble chat-bubble-assistant">
                  <Text variant="caption" weight="semibold" class="chat-role">AI Builder</Text>
                  <Text variant="body" class="text-muted">Generating...</Text>
                </div>
              </Show>
            </div>
            <div class="builder-chat-input">
              <Stack direction="horizontal" gap="sm" align="end">
                <Input
                  placeholder="Describe your website..."
                  value={input()}
                  onInput={(e) => setInput(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isGenerating()}
                  class="builder-input"
                />
                <Button
                  variant="primary"
                  onClick={handleSend}
                  loading={isGenerating()}
                  disabled={!input().trim()}
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
