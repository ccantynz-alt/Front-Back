import { Title } from "@solidjs/meta";
import { For, Show, createSignal, createEffect } from "solid-js";
import type { JSX } from "solid-js";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { Button, Card, Input, Stack, Text, Badge, Alert, Spinner } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { CollaborativeBuilder } from "../components/CollaborativeBuilder";
import { GenerativeUIRenderer } from "../components/GenerativeUI";
import type { ComponentNode } from "../collab/collaborative-doc";
import type { Component } from "@back-to-the-future/schemas";

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

function PreviewPanel(props: {
  componentTree: Component[];
  isGenerating: boolean;
  demoMode: boolean;
}): JSX.Element {
  return (
    <Card class="preview-panel" padding="none">
      <Stack direction="vertical" gap="none" class="preview-inner">
        <div class="preview-toolbar">
          <Stack direction="horizontal" gap="sm" align="center" justify="between">
            <Text variant="caption" weight="semibold">Live Preview</Text>
            <Stack direction="horizontal" gap="xs" align="center">
              <Show when={props.demoMode}>
                <Badge variant="warning" size="sm" label="Demo Mode" />
              </Show>
              <Button variant="ghost" size="sm">Desktop</Button>
              <Button variant="ghost" size="sm">Tablet</Button>
              <Button variant="ghost" size="sm">Mobile</Button>
            </Stack>
          </Stack>
        </div>
        <div class="preview-canvas" style={{ padding: "16px", "min-height": "400px" }}>
          <Show when={props.isGenerating && props.componentTree.length === 0}>
            <Stack direction="vertical" align="center" justify="center" gap="md">
              <Spinner size="lg" />
              <Text variant="body" class="text-muted">Generating layout...</Text>
            </Stack>
          </Show>
          <Show when={props.componentTree.length > 0}>
            <GenerativeUIRenderer
              tree={props.componentTree}
              emptyMessage="Describe your website in the chat to generate a preview."
            />
          </Show>
          <Show when={!props.isGenerating && props.componentTree.length === 0}>
            <Stack direction="vertical" align="center" justify="center" class="preview-placeholder">
              <Text variant="h3" class="text-muted">Preview Area</Text>
              <Text variant="body" class="text-muted">
                Describe your website in the chat, or use Quick Generate below.
              </Text>
            </Stack>
          </Show>
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

/**
 * Calls the generate-ui endpoint to produce a validated component tree.
 */
async function generateUI(
  description: string,
  mode: "ai" | "demo" = "ai",
): Promise<{
  success: boolean;
  demoMode: boolean;
  layout: Component[];
  reasoning: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${getApiUrl()}/api/ai/generate-ui`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, computeTier: "cloud", mode }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Request failed" }));
      return {
        success: false,
        demoMode: false,
        layout: [],
        reasoning: "",
        error: (body as { error?: string }).error ?? `HTTP ${response.status}`,
      };
    }

    const data = await response.json() as {
      success: boolean;
      demoMode?: boolean;
      ui?: { layout: Component[]; reasoning: string };
      error?: string;
    };

    if (data.success && data.ui) {
      return {
        success: true,
        demoMode: data.demoMode ?? false,
        layout: data.ui.layout,
        reasoning: data.ui.reasoning,
      };
    }

    return {
      success: false,
      demoMode: false,
      layout: [],
      reasoning: "",
      error: data.error ?? "Unknown error",
    };
  } catch (err) {
    return {
      success: false,
      demoMode: false,
      layout: [],
      reasoning: "",
      error: err instanceof Error ? err.message : "Generate UI request failed",
    };
  }
}

/**
 * Try to extract a JSON component tree from an AI chat response.
 * Looks for ```json ... ``` blocks containing component arrays.
 */
function extractComponentTreeFromResponse(content: string): Component[] | null {
  // Look for JSON code blocks
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch?.[1]) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1].trim()) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as Component[];
    }
    return null;
  } catch {
    return null;
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

// ── Quick Generate Templates ─────────────────────────────────────────

const QUICK_TEMPLATES = [
  { label: "Landing Page", description: "Build a landing page with hero section, features, and call-to-action" },
  { label: "Contact Form", description: "Create a contact form with name, email, and message fields" },
  { label: "Dashboard", description: "Design a dashboard with stat cards and activity feed" },
  { label: "Blog Post", description: "Create a blog post layout with title, content, and sidebar" },
];

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
        "Welcome to the AI Website Builder. Describe the website you want to create, and I will build it for you in real time. You can also use the Quick Generate buttons for common layouts.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = createSignal("");
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [collabConnected, setCollabConnected] = createSignal(false);
  const [_componentTree, setComponentTree] = createSignal<ComponentNode[]>([]);
  const [previewTree, setPreviewTree] = createSignal<Component[]>([]);
  const [demoMode, setDemoMode] = createSignal(false);
  const [previewGenerating, setPreviewGenerating] = createSignal(false);

  function handleTreeChange(tree: ComponentNode[]): void {
    setComponentTree(tree);
  }

  // Check AI status on load
  if (typeof window !== "undefined") {
    fetch(`${getApiUrl()}/api/ai/status`)
      .then((r) => r.json())
      .then((data: unknown) => {
        const status = data as { demoMode?: boolean };
        if (status.demoMode) {
          setDemoMode(true);
        }
      })
      .catch(() => {
        // API not reachable, assume demo mode
        setDemoMode(true);
      });
  }

  // Watch chat messages for component JSON and update preview
  createEffect(() => {
    const msgs = messages();
    const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant" && m.id !== "welcome");
    if (!lastAssistant) return;

    const tree = extractComponentTreeFromResponse(lastAssistant.content);
    if (tree && tree.length > 0) {
      setPreviewTree(tree);
    }
  });

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
      .filter((m) => m.id !== "welcome" && m.id !== assistantId)
      .map((m) => ({ role: m.role, content: m.content }));

    // Also trigger generate-ui for the preview panel
    setPreviewGenerating(true);
    generateUI(text, demoMode() ? "demo" : "ai").then((result) => {
      if (result.success && result.layout.length > 0) {
        setPreviewTree(result.layout);
        if (result.demoMode) setDemoMode(true);
      }
      setPreviewGenerating(false);
    });

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
              ? { ...m, content: `Error: ${error}. The AI builder is running in demo mode. Try using the Quick Generate buttons for sample layouts.` }
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

  /**
   * Quick Generate: directly calls generate-ui endpoint and updates preview.
   */
  function handleQuickGenerate(description: string): void {
    if (isGenerating() || previewGenerating()) return;

    // Add user message to chat
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: description,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Generate UI
    setPreviewGenerating(true);
    setIsGenerating(true);

    generateUI(description, demoMode() ? "demo" : "ai").then((result) => {
      if (result.success && result.layout.length > 0) {
        setPreviewTree(result.layout);
        if (result.demoMode) setDemoMode(true);

        // Add assistant message confirming generation
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: `Generated a layout with ${result.layout.length} component(s). ${result.reasoning}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const errorMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: `Failed to generate layout: ${result.error ?? "Unknown error"}. Try a different description.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
      setPreviewGenerating(false);
      setIsGenerating(false);
    });
  }

  function handleShare(): void {
    const newRoomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    navigate(`/builder?room=${newRoomId}`);
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
              <Stack direction="horizontal" gap="sm" align="center">
                <Text variant="h3" weight="bold">AI Website Builder</Text>
                <Show when={demoMode()}>
                  <Badge variant="warning" size="sm" label="Demo" />
                </Show>
              </Stack>
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

          {/* Quick Generate Buttons */}
          <div style={{ padding: "8px 12px", "border-bottom": "1px solid rgba(255,255,255,0.1)" }}>
            <Stack direction="horizontal" gap="xs">
              <Text variant="caption" weight="semibold" class="text-muted" style={{ "white-space": "nowrap", "padding-top": "4px" }}>
                Quick:
              </Text>
              <For each={QUICK_TEMPLATES}>
                {(template) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuickGenerate(template.description)}
                    disabled={isGenerating() || previewGenerating()}
                  >
                    {template.label}
                  </Button>
                )}
              </For>
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
        <PreviewPanel
          componentTree={previewTree()}
          isGenerating={previewGenerating()}
          demoMode={demoMode()}
        />
      </div>
    </div>
  );

  return (
    <ProtectedRoute>
      <Title>AI Builder - Back to the Future</Title>
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
