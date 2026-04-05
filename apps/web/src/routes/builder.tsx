import { For, Show, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { SEOHead } from "../components/SEOHead";
import { Button, Card, Input, Stack, Text, Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { CollaborativeBuilder } from "../components/CollaborativeBuilder";
import type { ComponentNode } from "../collab/collaborative-doc";

// ── Chat Message Type ─────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ── Chat Message Component ────────────────────────────────────────────

function ChatBubble(props: { message: ChatMessage }): JSX.Element {
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

function PreviewPanel(): JSX.Element {
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

// ── AI Streaming Helper ──────────────────────────────────────────────

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
    return meta.env?.VITE_PUBLIC_API_URL ?? "http://localhost:3001";
  }
  return "http://localhost:3001";
}

async function streamAIResponse(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  try {
    const response = await fetch(`${getApiUrl()}/api/ai/site-builder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        computeTier: "cloud",
        maxTokens: 4096,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Request failed" }));
      onError((body as { error?: string }).error ?? `HTTP ${response.status}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError("No response stream available");
      return;
    }

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      onToken(chunk);
    }

    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : "Stream failed");
  }
}

// ── Connection Status Indicator ──────────────────────────────────────

function ConnectionStatus(props: { connected: boolean }): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        gap: "6px",
        padding: "4px 10px",
        "border-radius": "12px",
        background: props.connected ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
        border: `1px solid ${props.connected ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
      }}
    >
      <div
        style={{
          width: "8px",
          height: "8px",
          "border-radius": "50%",
          background: props.connected ? "#22c55e" : "#ef4444",
        }}
      />
      <Text variant="caption">
        {props.connected ? "Connected" : "Disconnected"}
      </Text>
    </div>
  );
}

// ── Builder Page ──────────────────────────────────────────────────────

export default function BuilderPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomId = (): string | undefined => searchParams.room as string | undefined;
  const isCollaborative = (): boolean => !!roomId();

  // Generate a user id/name for the session
  const userId = `user-${Math.random().toString(36).slice(2, 9)}`;
  const userName = "Builder User";

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
  const [collabConnected, setCollabConnected] = createSignal(false);
  const [_componentTree, setComponentTree] = createSignal<ComponentNode[]>([]);

  function handleTreeChange(tree: ComponentNode[]): void {
    setComponentTree(tree);
  }

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

    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
    ]);

    const conversationHistory = messages()
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));
    conversationHistory.push({ role: "user", content: text });

    streamAIResponse(
      conversationHistory,
      (token) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + token } : m,
          ),
        );
      },
      () => {
        setIsGenerating(false);
      },
      (error) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${error}. Make sure the API server is running and OPENAI_API_KEY is set.` }
              : m,
          ),
        );
        setIsGenerating(false);
      },
    );
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  function handleShare(): void {
    const newRoomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    navigate(`/builder?room=${newRoomId}`);
  }

  function handleInviteAI(): void {
    // The CollaborativeBuilder handles AI invitation internally
    // This is a placeholder for additional AI invite logic
  }

  function handleCopyLink(): void {
    if (typeof window !== "undefined" && roomId()) {
      const url = `${window.location.origin}/builder?room=${roomId()}`;
      navigator.clipboard.writeText(url).catch(() => {
        // Fallback: do nothing on clipboard failure
      });
    }
  }

  const builderContent = (
    <div class="builder-layout">
      <div class="builder-chat">
        <Stack direction="vertical" gap="none" class="builder-chat-inner">
          <div class="builder-chat-header">
            <Stack direction="horizontal" gap="sm" align="center" justify="between">
              <Text variant="h3" weight="bold">AI Website Builder</Text>
              <Stack direction="horizontal" gap="sm" align="center">
                <Show when={isCollaborative()}>
                  <ConnectionStatus connected={collabConnected()} />
                  <Button variant="ghost" size="sm" onClick={handleCopyLink}>
                    Copy Link
                  </Button>
                </Show>
                <Show when={!isCollaborative()}>
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    Share
                  </Button>
                </Show>
                <Show when={isCollaborative()}>
                  <Badge variant="success" size="sm" label="Collaborative" />
                </Show>
              </Stack>
            </Stack>
          </div>
          <div class="builder-chat-messages">
            <For each={messages()}>
              {(msg) => <ChatBubble message={msg} />}
            </For>
            <Show when={isGenerating() && messages()[messages().length - 1]?.content === ""}>
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
  );

  return (
    <ProtectedRoute>
      <SEOHead
        title="AI Builder"
        description="Build websites with AI in real-time. Describe what you want and watch AI create it using validated component trees and collaborative editing."
        path="/builder"
      />
      <Show
        when={isCollaborative()}
        fallback={builderContent}
      >
        <CollaborativeBuilder
          roomId={roomId()!}
          userId={userId}
          userName={userName}
          onTreeChange={handleTreeChange}
        >
          {builderContent}
        </CollaborativeBuilder>
      </Show>
    </ProtectedRoute>
  );
}
