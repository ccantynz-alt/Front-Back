import { For, Show, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Input, Stack, Text, Spinner } from "@back-to-the-future/ui";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AIChatProps {
  initialMessages?: ChatMessage[];
  onSend: (
    messages: Array<{ role: string; content: string }>,
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (error: string) => void,
  ) => void;
  placeholder?: string;
  enableGenerativeUI?: boolean;
  onUIGenerated?: (result: unknown) => void;
  class?: string;
}

export function AIChat(props: AIChatProps): JSX.Element {
  const [messages, setMessages] = createSignal<ChatMessage[]>(props.initialMessages ?? []);
  const [input, setInput] = createSignal("");
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [streamContent, setStreamContent] = createSignal("");

  const sendMessage = (): void => {
    const text = input().trim();
    if (!text || isStreaming()) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages([...messages(), userMsg]);
    setInput("");
    setIsStreaming(true);
    setStreamContent("");

    const history = messages().map((m) => ({
      role: m.role,
      content: m.content,
    }));
    history.push({ role: "user", content: text });

    props.onSend(
      history,
      (token) => setStreamContent((prev) => prev + token),
      () => {
        const aiMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: streamContent() || "I generated the UI for you. Check the preview panel.",
          timestamp: Date.now(),
        };
        setMessages([...messages(), aiMsg]);
        setStreamContent("");
        setIsStreaming(false);
      },
      (error) => {
        const errMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: `Error: ${error}`,
          timestamp: Date.now(),
        };
        setMessages([...messages(), errMsg]);
        setStreamContent("");
        setIsStreaming(false);
      },
    );
  };

  return (
    <Card class={`ai-chat ${props.class ?? ""}`} padding="sm">
      <Stack direction="vertical" gap="sm" class="ai-chat-inner">
        <div class="ai-chat-messages">
          <For each={messages()}>
            {(msg) => (
              <div class={`chat-message chat-message-${msg.role}`}>
                <Text variant="caption" weight="semibold" class="chat-role">
                  {msg.role === "user" ? "You" : "AI"}
                </Text>
                <Text variant="body" class="chat-content">{msg.content}</Text>
              </div>
            )}
          </For>
          <Show when={isStreaming() && streamContent()}>
            <div class="chat-message chat-message-assistant">
              <Text variant="caption" weight="semibold" class="chat-role">AI</Text>
              <Text variant="body" class="chat-content">{streamContent()}</Text>
            </div>
          </Show>
          <Show when={isStreaming() && !streamContent()}>
            <div class="chat-message chat-message-assistant">
              <Spinner size="sm" />
            </div>
          </Show>
        </div>

        <Stack direction="horizontal" gap="sm">
          <Input
            placeholder={props.placeholder ?? "Type a message..."}
            aria-label="Type a message"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={isStreaming()}
          />
          <Button
            variant="primary"
            onClick={sendMessage}
            disabled={!input().trim() || isStreaming()}
            loading={isStreaming()}
          >
            Send
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
