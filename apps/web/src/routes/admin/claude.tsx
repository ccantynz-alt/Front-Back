// ── /admin/claude ────────────────────────────────────────────────────
// Admin-only Claude Console chat UI. Two-pane layout: left sidebar is
// a list of the admin's conversations; right pane renders the active
// thread + composer + model picker. Streaming assistant replies come
// from POST /api/chat/stream as a plain text stream (see
// apps/api/src/ai/chat-stream.ts — the route returns a
// `toTextStreamResponse()` body we read chunk-by-chunk and append to
// the live assistant bubble).
//
// Header shows "Admin › Claude Console" breadcrumb, the monthly-spend
// badge pulled from `chat.getUsageStats` (`monthCostDollars`, rendered
// as $X.XX), and a link to `/admin/claude/settings` for key + default
// model management. If streaming fails with a missing-provider-key
// signal, an inline card surfaces a call-to-action linking to
// Settings.
//
// Zero HTML — SolidJS JSX + shared UI patterns. Polite tone; no
// competitor names. Wrapped in `AdminRoute` the same way admin.tsx
// gates its page content.

import { Title } from "@solidjs/meta";
import {
  createSignal,
  createResource,
  For,
  Show,
  onMount,
  type JSX,
} from "solid-js";
import { A } from "@solidjs/router";
import { Box, Stack, Text } from "@back-to-the-future/ui";
import { AdminRoute } from "../../components/AdminRoute";
import { trpc } from "../../lib/trpc";

// ── Model catalog ────────────────────────────────────────────────────
// Mirror of `@back-to-the-future/ai-core`'s `ANTHROPIC_MODELS`. The
// ai-core package transitively pulls server-only Mastra modules into
// the client bundle, so the admin console carries its own copy keyed
// by the same model IDs. If the shared catalog grows, update both.
//
// Canonical source: `packages/ai-core/src/providers.ts` →
// `ANTHROPIC_MODELS`.

const ANTHROPIC_MODELS = {
  "claude-opus-4-7": { name: "Claude Opus 4.7" },
  "claude-sonnet-4-6": { name: "Claude Sonnet 4.6" },
  "claude-haiku-4-5-20251001": { name: "Claude Haiku 4.5" },
} as const;

type AnthropicModelId = keyof typeof ANTHROPIC_MODELS;

// ── Types ───────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  createdAt: Date;
}

interface ConversationRow {
  id: string;
  title: string;
  model: string;
  totalTokens: number;
  totalCost: number;
  updatedAt: Date;
}

interface ModelOption {
  id: string;
  name: string;
}

// ── Pure helpers (exported for tests) ───────────────────────────────

/**
 * Format a dollar amount (as a floating-point number) into the
 * canonical `$X.XX` form used by the monthly-spend badge. Defensive
 * against NaN / negatives / undefined (shows $0.00 in those cases).
 */
export function formatMonthlySpend(dollars: number | null | undefined): string {
  if (dollars === null || dollars === undefined) return "$0.00";
  if (!Number.isFinite(dollars) || dollars < 0) return "$0.00";
  return `$${dollars.toFixed(2)}`;
}

/**
 * Parse the error payload that `/api/chat/stream` returns when the
 * admin has no Anthropic key configured. The server shape is
 * `{ error: string, hint?: string }` — we treat any response whose
 * error or hint references a missing key / API key hint as the
 * missing-key signal so we can show the inline settings CTA.
 */
export function isMissingKeyError(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  const error = typeof record["error"] === "string" ? (record["error"] as string) : "";
  const hint = typeof record["hint"] === "string" ? (record["hint"] as string) : "";
  const combined = `${error} ${hint}`.toLowerCase();
  if (combined.includes("no anthropic api key")) return true;
  if (combined.includes("provider key")) return true;
  if (combined.includes("ai provider keys")) return true;
  if (combined.includes("add your anthropic api key")) return true;
  return false;
}

/**
 * Build the dropdown model list from the shared ANTHROPIC_MODELS
 * catalog. Kept as a pure function so tests can assert the catalog
 * stays well-formed without needing to render.
 */
export function buildModelOptions(): ModelOption[] {
  return (Object.entries(ANTHROPIC_MODELS) as Array<[
    AnthropicModelId,
    (typeof ANTHROPIC_MODELS)[AnthropicModelId],
  ]>).map(([id, info]) => ({ id, name: info.name }));
}

// ── API URL + session helpers (mirrors chat.tsx) ────────────────────

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const meta = import.meta as unknown as Record<
      string,
      Record<string, string> | undefined
    >;
    const envUrl = meta["env"]?.["VITE_PUBLIC_API_URL"];
    if (envUrl) return envUrl;
    const { protocol, hostname } = window.location;
    if (hostname === "crontech.ai" || hostname === "www.crontech.ai") {
      return "https://api.crontech.ai";
    }
    if (hostname.endsWith(".pages.dev")) {
      return `${protocol}//${hostname}`;
    }
  }
  return "http://localhost:3001";
}

function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("btf_session_token");
  } catch {
    return null;
  }
}

// ── Conversation Sidebar Item ───────────────────────────────────────

function ConversationItem(props: {
  conv: ConversationRow;
  isActive: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150"
      style={{
        background: props.isActive ? "var(--color-bg-elevated)" : "transparent",
        color: props.isActive ? "var(--color-text)" : "var(--color-text-secondary)",
        border: props.isActive
          ? "1px solid var(--color-border)"
          : "1px solid transparent",
      }}
    >
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-xs font-medium">{props.conv.title}</span>
        <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>
          {props.conv.totalTokens.toLocaleString()} tokens
        </span>
      </div>
    </button>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────

function MessageBubble(props: { message: ChatMessage }): JSX.Element {
  const isUser = (): boolean => props.message.role === "user";

  return (
    <div class={`flex gap-3 ${isUser() ? "flex-row-reverse" : ""}`}>
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
        style={{
          background: isUser() ? "var(--color-primary)" : "var(--color-bg-elevated)",
          color: isUser() ? "var(--color-primary-text)" : "var(--color-text)",
        }}
      >
        {isUser() ? "You" : "C"}
      </div>
      <div
        class={`flex max-w-[80%] flex-col gap-1.5 ${isUser() ? "items-end" : ""}`}
      >
        <div
          class="rounded-2xl px-4 py-3 text-sm leading-relaxed"
          style={{
            background: isUser() ? "var(--color-primary)" : "var(--color-bg-muted)",
            border: "1px solid var(--color-border)",
            color: isUser()
              ? "var(--color-primary-text)"
              : "var(--color-text-secondary)",
            "white-space": "pre-wrap",
          }}
        >
          {props.message.content}
        </div>
        <div class="flex items-center gap-2 px-1">
          <Show when={props.message.model}>
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-primary-light)",
              }}
            >
              {props.message.model}
            </span>
          </Show>
          <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>
            {props.message.createdAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Missing-key CTA ─────────────────────────────────────────────────

function MissingKeyCallout(): JSX.Element {
  return (
    <div
      class="mx-auto mt-4 flex max-w-3xl items-center gap-4 rounded-2xl px-5 py-4"
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
        style={{
          background: "color-mix(in oklab, var(--color-primary) 12%, transparent)",
          color: "var(--color-primary-light)",
        }}
      >
        &#128273;
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Add an Anthropic API key to start chatting
        </span>
        <span class="text-xs" style={{ color: "var(--color-text-muted)" }}>
          The Claude Console needs a provider key before it can stream a
          reply. Save yours in Settings to unlock the console.
        </span>
      </div>
      <A
        href="/admin/claude/settings"
        class="shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition-all"
        style={{ background: "var(--color-primary)", color: "var(--color-primary-text)" }}
      >
        Open Settings
      </A>
    </div>
  );
}

// ── Page shell ──────────────────────────────────────────────────────

export default function AdminClaudePage(): JSX.Element {
  return (
    <AdminRoute>
      <AdminClaudeConsole />
    </AdminRoute>
  );
}

// ── Console ─────────────────────────────────────────────────────────

function AdminClaudeConsole(): JSX.Element {
  const [conversations, setConversations] = createSignal<ConversationRow[]>([]);
  const [activeConvId, setActiveConvId] = createSignal<string | null>(null);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [input, setInput] = createSignal("");
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [streamContent, setStreamContent] = createSignal("");
  const [selectedModel, setSelectedModel] = createSignal<string>(
    "claude-sonnet-4-6",
  );
  const [error, setError] = createSignal<string | null>(null);
  const [needsKey, setNeedsKey] = createSignal(false);

  const modelOptions = buildModelOptions();

  const [usage, { refetch: refetchUsage }] = createResource(async () =>
    trpc.chat.getUsageStats.query(),
  );

  let messagesEndRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  const scrollToBottom = (): void => {
    messagesEndRef?.scrollIntoView({ behavior: "smooth" });
  };

  onMount(async () => {
    try {
      const rows = await trpc.chat.listConversations.query();
      setConversations(
        rows.map((c) => ({
          id: c.id,
          title: c.title,
          model: c.model,
          totalTokens: c.totalTokens ?? 0,
          totalCost: c.totalCost ?? 0,
          updatedAt: new Date(c.updatedAt),
        })),
      );
    } catch {
      // Handled by error state — `needsKey` is strictly stream-side.
    }
  });

  const loadConversation = async (id: string): Promise<void> => {
    setActiveConvId(id);
    setError(null);
    try {
      const data = await trpc.chat.getConversation.query({ id });
      setMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          model: m.model ?? undefined,
          inputTokens: m.inputTokens ?? undefined,
          outputTokens: m.outputTokens ?? undefined,
          createdAt: new Date(m.createdAt),
        })),
      );
      if (data.conversation.model) setSelectedModel(data.conversation.model);
      setTimeout(scrollToBottom, 100);
    } catch {
      setError("Unable to load that conversation. Please try again.");
    }
  };

  const ensureConversation = async (seedTitle: string): Promise<string> => {
    const existing = activeConvId();
    if (existing) return existing;
    const result = await trpc.chat.createConversation.mutate({
      title: seedTitle,
      model: selectedModel(),
    });
    const newRow: ConversationRow = {
      id: result.id,
      title: result.title,
      model: selectedModel(),
      totalTokens: 0,
      totalCost: 0,
      updatedAt: new Date(),
    };
    setConversations((prev) => [newRow, ...prev]);
    setActiveConvId(result.id);
    return result.id;
  };

  const handleSend = async (): Promise<void> => {
    const text = input().trim();
    if (!text || isStreaming()) return;
    setError(null);
    setNeedsKey(false);

    const seedTitle = text.slice(0, 60) + (text.length > 60 ? "…" : "");
    const convId = await ensureConversation(seedTitle);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setStreamContent("");

    try {
      await trpc.chat.saveMessage.mutate({
        conversationId: convId,
        role: "user",
        content: text,
      });
    } catch {
      // Saving user message is best-effort; streaming still proceeds.
    }

    const history = messages().map((m) => ({ role: m.role, content: m.content }));

    try {
      const token = getSessionToken();
      const response = await fetch(`${getApiUrl()}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({
          messages: history,
          model: selectedModel(),
          maxTokens: 4096,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        if (isMissingKeyError(payload)) {
          setNeedsKey(true);
          setError(null);
        } else {
          const hint =
            payload && typeof payload === "object" && "hint" in payload
              ? String((payload as Record<string, unknown>)["hint"])
              : null;
          const errText =
            payload && typeof payload === "object" && "error" in payload
              ? String((payload as Record<string, unknown>)["error"])
              : `Stream failed (${response.status}).`;
          setError(hint ?? errText);
        }
        setIsStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream available.");
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setStreamContent(full);
        scrollToBottom();
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        role: "assistant",
        content: full,
        model: selectedModel(),
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamContent("");

      const estimatedInputTokens = Math.ceil(
        history.reduce((acc, m) => acc + m.content.length, 0) / 4,
      );
      const estimatedOutputTokens = Math.ceil(full.length / 4);

      try {
        await trpc.chat.saveMessage.mutate({
          conversationId: convId,
          role: "assistant",
          content: full,
          model: selectedModel(),
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
        });
        await refetchUsage();
      } catch {
        // Non-fatal — UI already shows the streamed reply.
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stream failed.";
      setError(msg);
      setStreamContent("");
    } finally {
      setIsStreaming(false);
      scrollToBottom();
    }
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const monthSpendLabel = (): string =>
    formatMonthlySpend(usage()?.monthCostDollars);

  return (
    <Box class="flex h-screen flex-col" style={{ background: "var(--color-bg)" }}>
      <Title>Claude Console - Crontech Admin</Title>

      {/* ── Header row ─────────────────────────────────────────── */}
      <Box
        class="flex items-center justify-between px-6 py-4"
        style={{
          background: "var(--color-bg-subtle)",
          "border-bottom": "1px solid var(--color-border)",
        }}
      >
        <Box
          as="nav"
          aria-label="Breadcrumb"
          class="flex items-center gap-2 text-xs"
          style={{ color: "var(--color-text-faint)" }}
        >
          <A
            href="/admin"
            class="font-medium transition-colors"
            style={{ color: "var(--color-text-muted)" }}
          >
            Admin
          </A>
          <Text as="span" variant="caption" aria-hidden="true">›</Text>
          <Text as="span" variant="caption" class="font-semibold" style={{ color: "var(--color-text)" }}>
            Claude Console
          </Text>
        </Box>

        <Stack direction="horizontal" gap="sm" align="center">
          <Text
            as="span"
            variant="caption"
            aria-label="Monthly Claude spend"
            class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            <Text
              as="span"
              variant="caption"
              class="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-faint)" }}
            >
              Month
            </Text>
            <Text as="span" variant="caption" style={{ color: "var(--color-primary-light)" }}>
              {monthSpendLabel()}
            </Text>
          </Text>
          <A
            href="/admin/claude/settings"
            class="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            Settings
          </A>
        </Stack>
      </Box>

      {/* ── Two-column body ─────────────────────────────────────── */}
      <Box class="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside
          class="flex w-72 shrink-0 flex-col"
          style={{
            background: "var(--color-bg-subtle)",
            "border-right": "1px solid var(--color-border)",
          }}
        >
          <div
            class="px-5 py-4"
            style={{ "border-bottom": "1px solid var(--color-border)" }}
          >
            <span
              class="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-text-faint)" }}
            >
              Conversations
            </span>
            <div
              class="mt-1 text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              Pick one to load its history, or start a new message below.
            </div>
          </div>
          <div class="flex-1 overflow-y-auto px-3 py-3">
            <Show
              when={conversations().length > 0}
              fallback={
                <div class="flex flex-col items-center gap-2 py-12 text-center">
                  <span
                    class="text-xs"
                    style={{ color: "var(--color-text-faint)" }}
                  >
                    No conversations yet. Send your first message to start one.
                  </span>
                </div>
              }
            >
              <div class="flex flex-col gap-1">
                <For each={conversations()}>
                  {(conv) => (
                    <ConversationItem
                      conv={conv}
                      isActive={activeConvId() === conv.id}
                      onClick={() => void loadConversation(conv.id)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </aside>

        {/* Right pane */}
        <section class="flex flex-1 flex-col overflow-hidden">
          <div
            class="flex items-center justify-between px-6 py-3"
            style={{
              background: "var(--color-bg-subtle)",
              "border-bottom": "1px solid var(--color-border)",
            }}
          >
            <span class="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {activeConvId()
                ? (conversations().find((c) => c.id === activeConvId())?.title ??
                  "Conversation")
                : "New conversation"}
            </span>
            <label class="flex items-center gap-2 text-xs">
              <span style={{ color: "var(--color-text-faint)" }}>Model</span>
              <select
                value={selectedModel()}
                onChange={(e) => setSelectedModel(e.currentTarget.value)}
                class="rounded-lg px-3 py-1.5 text-[11px] font-medium outline-none transition-all"
                style={{
                  background: "var(--color-bg-inset)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <For each={modelOptions}>
                  {(model) => <option value={model.id}>{model.name}</option>}
                </For>
              </select>
            </label>
          </div>

          <Show when={needsKey()}>
            <MissingKeyCallout />
          </Show>

          <Show when={error()}>
            <div
              class="mx-auto mt-4 flex max-w-3xl items-center gap-3 rounded-xl px-4 py-3"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              <span style={{ color: "var(--color-text-secondary)" }}>!</span>
              <span
                class="flex-1 text-xs"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {error()}
              </span>
              <button
                type="button"
                onClick={() => setError(null)}
                class="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                Dismiss
              </button>
            </div>
          </Show>

          <div class="flex-1 overflow-y-auto px-6 py-6">
            <div class="mx-auto flex max-w-3xl flex-col gap-6">
              <Show when={messages().length === 0 && !isStreaming()}>
                <div class="flex flex-col items-center gap-3 py-16 text-center">
                  <span
                    class="text-sm font-semibold"
                    style={{ color: "var(--color-text)" }}
                  >
                    Claude Console
                  </span>
                  <span
                    class="max-w-sm text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Ask a question, review a file, or draft a plan. Replies stream
                    directly from the Anthropic API using the key stored in
                    Settings.
                  </span>
                </div>
              </Show>

              <For each={messages()}>
                {(msg) => <MessageBubble message={msg} />}
              </For>

              <Show when={isStreaming()}>
                <div class="flex gap-3">
                  <div
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                    style={{
                      background: "var(--color-bg-elevated)",
                      color: "var(--color-text)",
                    }}
                  >
                    C
                  </div>
                  <div
                    class="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: "var(--color-bg-muted)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text-secondary)",
                      "white-space": "pre-wrap",
                    }}
                  >
                    <Show
                      when={streamContent()}
                      fallback={
                        <span style={{ color: "var(--color-text-faint)" }}>
                          Thinking…
                        </span>
                      }
                    >
                      {streamContent()}
                    </Show>
                  </div>
                </div>
              </Show>

              <div ref={messagesEndRef} />
            </div>
          </div>

          <div
            class="px-6 py-4"
            style={{
              background: "var(--color-bg-subtle)",
              "border-top": "1px solid var(--color-border)",
            }}
          >
            <div class="mx-auto max-w-3xl">
              <div
                class="flex items-end gap-3 rounded-2xl p-2 transition-all duration-200"
                style={{
                  background: "var(--color-bg-inset)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={input()}
                  onInput={(e) => setInput(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Claude…"
                  rows={1}
                  class="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none"
                  style={{
                    color: "var(--color-text-secondary)",
                    "max-height": "160px",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!input().trim() || isStreaming()}
                  class="flex h-10 shrink-0 items-center justify-center rounded-xl px-4 text-xs font-semibold transition-all duration-200 disabled:opacity-40"
                  style={{
                    background: "var(--color-primary)",
                    color: "var(--color-primary-text)",
                  }}
                >
                  Send
                </button>
              </div>
              <div class="mt-2 flex items-center justify-between px-1">
                <span
                  class="text-[10px]"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Shift+Enter for a new line.
                </span>
                <span
                  class="text-[10px]"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  Streaming through /api/chat/stream.
                </span>
              </div>
            </div>
          </div>
        </section>
      </Box>
    </Box>
  );
}
