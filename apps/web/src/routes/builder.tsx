import { For, Show, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { SEOHead } from "../components/SEOHead";
import { Button, Card, Input, Stack, Text, Badge } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { CollaborativeBuilder } from "../components/CollaborativeBuilder";
import type { ComponentNode } from "../collab/collaborative-doc";
import type { PageLayout } from "@back-to-the-future/ai-core";
import type { ComputeTier } from "@back-to-the-future/ai-core";
import { PageLayoutRenderer } from "../components/PageLayoutRenderer";
import { trpc } from "../lib/trpc";
import { computeTier, tierReason, detectAndSetTier } from "../lib/ai-client";

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
        {isUser() ? "You" : "Composer"}
      </Text>
      <Text variant="body">{props.message.content}</Text>
    </div>
  );
}

// ── Compute Tier Pill ────────────────────────────────────────────────
// Surfaces the three-tier compute router state in the builder header.
// Crontech's architectural moat: small agents run on the user's GPU
// via WebGPU (tier=client, cost=$0), mid-range on the edge, heavy on
// cloud GPU. Every generation shows exactly where it ran and what it
// cost — Lovable and Zoobicon cannot show this because every call
// goes to a paid cloud API.

function tierColor(tier: ComputeTier): { bg: string; border: string; dot: string } {
  switch (tier) {
    case "client":
      return {
        bg: "rgba(34, 197, 94, 0.12)",
        border: "rgba(34, 197, 94, 0.35)",
        dot: "#22c55e",
      };
    case "edge":
      return {
        bg: "rgba(59, 130, 246, 0.12)",
        border: "rgba(59, 130, 246, 0.35)",
        dot: "#3b82f6",
      };
    case "cloud":
      return {
        bg: "rgba(249, 115, 22, 0.12)",
        border: "rgba(249, 115, 22, 0.35)",
        dot: "#f97316",
      };
  }
}

function tierLabel(tier: ComputeTier): string {
  switch (tier) {
    case "client":
      return "Client GPU";
    case "edge":
      return "Edge";
    case "cloud":
      return "Cloud GPU";
  }
}

// Rough cost-per-generation estimate for the preview. Client-side
// inference via WebGPU is literally $0/token (the user's GPU does
// the work). Edge and cloud are order-of-magnitude estimates — good
// enough to make the architectural advantage visible.
function tierCost(tier: ComputeTier, source: "ai" | "stub" | null): string {
  if (source === "stub") return "$0 (stub)";
  switch (tier) {
    case "client":
      return "$0";
    case "edge":
      return "<$0.001";
    case "cloud":
      return "~$0.02";
  }
}

function ComputeTierPill(props: {
  tier: ComputeTier;
  reason: string;
  cost: string;
}): JSX.Element {
  const colors = (): { bg: string; border: string; dot: string } =>
    tierColor(props.tier);
  return (
    <div
      title={props.reason}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "4px 10px",
        "border-radius": "12px",
        background: colors().bg,
        border: `1px solid ${colors().border}`,
      }}
    >
      <div
        style={{
          width: "8px",
          height: "8px",
          "border-radius": "50%",
          background: colors().dot,
        }}
      />
      <Text variant="caption" weight="semibold">
        {tierLabel(props.tier)}
      </Text>
      <Text variant="caption">·</Text>
      <Text variant="caption" weight="semibold">
        {props.cost}
      </Text>
    </div>
  );
}

// ── Preview Panel ─────────────────────────────────────────────────────
// Renders the generated PageLayout through PageLayoutRenderer. The
// preview is the moment Crontech's architecture becomes visible to a
// human being: prompt in, validated component tree out, rendered by
// real SolidJS primitives at ~60fps with zero hallucinated markup.

function PreviewPanel(props: { layout: PageLayout | null }): JSX.Element {
  const [device, setDevice] = createSignal<"desktop" | "tablet" | "mobile">(
    "desktop",
  );
  return (
    <Card class="preview-panel" padding="none">
      <Stack direction="vertical" gap="none" class="preview-inner">
        <div class="preview-toolbar">
          <Text variant="caption" weight="semibold">
            Live Preview ({device()})
          </Text>
          <Stack direction="horizontal" gap="xs">
            <Button variant="ghost" size="sm" onClick={() => setDevice("desktop")}>
              Desktop
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDevice("tablet")}>
              Tablet
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDevice("mobile")}>
              Mobile
            </Button>
          </Stack>
        </div>
        <div class={`preview-canvas preview-canvas-${device()}`}>
          <PageLayoutRenderer
            layout={props.layout}
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
                  Describe the UI you want and the composer will render it
                  here from validated components.
                </Text>
              </Stack>
            }
          />
        </div>
      </Stack>
    </Card>
  );
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
        "Welcome to the Crontech Component Composer. Describe the UI you want to generate and I will compose it from validated SolidJS components in your project's catalog. Every generation shows you exactly which compute tier ran it and what it cost — ready to copy into your Crontech app.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = createSignal("");
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [collabConnected] = createSignal(false);
  const [_componentTree, setComponentTree] = createSignal<ComponentNode[]>([]);
  const [currentLayout, setCurrentLayout] = createSignal<PageLayout | null>(
    null,
  );
  const [lastSource, setLastSource] = createSignal<"ai" | "stub" | null>(null);

  // Detect device capabilities on mount so the tier pill shows the
  // right tier before the user generates anything.
  onMount(() => {
    void detectAndSetTier();
  });

  function handleTreeChange(tree: ComponentNode[]): void {
    setComponentTree(tree);
  }

  const handleSend = async (): Promise<void> => {
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
      {
        id: assistantId,
        role: "assistant",
        content: "Generating layout...",
        timestamp: Date.now(),
      },
    ]);

    try {
      const result = await trpc.ai.siteBuilder.generate.mutate({
        prompt: text,
        tier: computeTier(),
      });

      setCurrentLayout(result.layout);
      setLastSource(result.source);

      const componentCount = result.layout.components.length;
      const sourceLabel =
        result.source === "ai"
          ? `Generated ${componentCount} root component${componentCount === 1 ? "" : "s"} via ${tierLabel(computeTier())} — ${tierCost(computeTier(), result.source)}.`
          : `Preview stub rendered (${componentCount} component${componentCount === 1 ? "" : "s"}). Configure OPENAI_API_KEY for real AI generation.`;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: sourceLabel } : m,
        ),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Site builder request failed";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `Error: ${message}. Make sure the API server is running.`,
              }
            : m,
        ),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

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
              <Text variant="h3" weight="bold">Component Composer</Text>
              <Stack direction="horizontal" gap="sm" align="center">
                <ComputeTierPill
                  tier={computeTier()}
                  reason={tierReason()}
                  cost={tierCost(computeTier(), lastSource())}
                />
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
            <Show when={isGenerating()}>
              <div class="chat-bubble chat-bubble-assistant">
                <Text variant="caption" weight="semibold" class="chat-role">Composer</Text>
                <Text variant="body" class="text-muted">Composing validated components...</Text>
              </div>
            </Show>
          </div>
          <div class="builder-chat-input">
            <Stack direction="horizontal" gap="sm" align="end">
              <Input
                placeholder="Describe the UI you want to generate..."
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                disabled={isGenerating()}
                class="builder-input"
              />
              <Button
                variant="primary"
                onClick={() => {
                  void handleSend();
                }}
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
        <PreviewPanel layout={currentLayout()} />
      </div>
    </div>
  );

  return (
    <ProtectedRoute>
      <SEOHead
        title="Component Composer"
        description="Generate validated SolidJS components from a prompt. Compose with Crontech's three-tier compute fabric — client GPU, edge, or cloud — and copy the result straight into your project."
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
