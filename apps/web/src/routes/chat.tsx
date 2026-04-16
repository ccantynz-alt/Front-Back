import { Title } from "@solidjs/meta";
import { createSignal, For, Show, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { trpc } from "../lib/trpc";

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  createdAt: Date;
}

interface Conversation {
  id: string;
  title: string;
  model: string;
  totalTokens: number;
  totalCost: number;
  updatedAt: Date;
}

interface ModelInfo {
  id: string;
  name: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

const MODELS: ModelInfo[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", inputCostPer1M: 3, outputCostPer1M: 15 },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", inputCostPer1M: 15, outputCostPer1M: 75 },
  { id: "claude-haiku-4-20250506", name: "Claude Haiku 4", inputCostPer1M: 0.80, outputCostPer1M: 4 },
];

// ── Helpers ──────────────────────────────────────────────────────────

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
    return meta.env?.VITE_PUBLIC_API_URL ?? "http://localhost:3001";
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

// ── Markdown-like rendering ─────────────────────────────────────────

function renderContent(content: string): string {
  return content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="my-3 overflow-x-auto rounded-xl p-4" style="background:var(--color-bg-inset);border:1px solid var(--color-border)"><code class="text-xs leading-relaxed" style="color:var(--color-primary-light)">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="rounded px-1.5 py-0.5 text-xs" style="background:var(--color-bg-muted);color:var(--color-primary-light)">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold" style="color:var(--color-text)">$1</strong>')
    .replace(/\n/g, "<br/>");
}

// ── Conversation Sidebar Item ───────────────────────────────────────

function ConversationItem(props: {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}): JSX.Element {
  const [showDelete, setShowDelete] = createSignal(false);

  return (
    <button
      type="button"
      onClick={props.onClick}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
      class="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150"
      style={{
        background: props.isActive ? "var(--color-bg-elevated)" : "transparent",
        color: props.isActive ? "var(--color-text)" : "var(--color-text-secondary)",
        border: props.isActive ? "1px solid var(--color-border)" : "1px solid transparent",
      }}
    >
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-xs font-medium">{props.conv.title}</span>
        <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>
          {props.conv.totalTokens.toLocaleString()} tokens
        </span>
      </div>
      <Show when={showDelete()}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.onDelete();
          }}
          class="shrink-0 rounded-md p-1 transition-colors hover:bg-red-500/10 hover:text-red-400"
          style={{ color: "var(--color-text-faint)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </Show>
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
          background: isUser()
            ? "var(--color-primary)"
            : "var(--color-bg-elevated)",
          color: isUser() ? "var(--color-primary-text)" : "var(--color-text)",
        }}
      >
        {isUser() ? "You" : "C"}
      </div>

      <div class={`flex max-w-[80%] flex-col gap-1.5 ${isUser() ? "items-end" : ""}`}>
        <Show when={isUser()} fallback={
          <div
            class="chat-content rounded-2xl px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "var(--color-bg-muted)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
            innerHTML={renderContent(props.message.content)}
          />
        }>
          <div
            class="chat-content rounded-2xl px-4 py-3 text-sm leading-relaxed"
            style={{
              background: "var(--color-primary)",
              border: "1px solid var(--color-border)",
              color: "var(--color-primary-text)",
            }}
          >
            <span style={{ "white-space": "pre-wrap" }}>{props.message.content}</span>
          </div>
        </Show>
        <div class="flex items-center gap-2 px-1">
          <Show when={props.message.model}>
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: "var(--color-bg-elevated)", color: "var(--color-primary-light)" }}
            >
              {props.message.model}
            </span>
          </Show>
          <Show when={props.message.outputTokens}>
            <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>{props.message.outputTokens} tokens</span>
          </Show>
          <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>
            {props.message.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Chat Page ──────────────────────────────────────────────────

export default function ChatPage(): JSX.Element {
  const [conversations, setConversations] = createSignal<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = createSignal<string | null>(null);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [input, setInput] = createSignal("");
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [streamContent, setStreamContent] = createSignal("");
  const [selectedModel, setSelectedModel] = createSignal("claude-sonnet-4-20250514");
  const [systemPrompt, setSystemPrompt] = createSignal("");
  const [showSettings, setShowSettings] = createSignal(false);
  const [hasApiKey, setHasApiKey] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Stats
  const [sessionTokens, setSessionTokens] = createSignal(0);

  let messagesEndRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  const scrollToBottom = (): void => {
    messagesEndRef?.scrollIntoView({ behavior: "smooth" });
  };

  // Load conversations on mount
  onMount(async () => {
    try {
      const convs = await trpc.chat.listConversations.query();
      setConversations(
        convs.map((c) => ({
          ...c,
          updatedAt: new Date(c.updatedAt),
        })) as Conversation[],
      );

      // Check if API key is configured
      const status = await fetch(`${getApiUrl()}/api/chat/status`, {
        headers: { Authorization: `Bearer ${getSessionToken() ?? ""}` },
      });
      if (status.ok) {
        const data = await status.json() as { configured: boolean };
        setHasApiKey(data.configured);
      }
    } catch {
      // Not logged in or network error — handled by UI state
    }
  });

  const loadConversation = async (id: string): Promise<void> => {
    setActiveConvId(id);
    try {
      const data = await trpc.chat.getConversation.query({ id });
      setMessages(
        data.messages.map((m) => ({
          ...m,
          createdAt: new Date(m.createdAt),
          inputTokens: m.inputTokens ?? undefined,
          outputTokens: m.outputTokens ?? undefined,
          model: m.model ?? undefined,
        })) as ChatMessage[],
      );
      if (data.conversation.model) {
        setSelectedModel(data.conversation.model);
      }
      if (data.conversation.systemPrompt) {
        setSystemPrompt(data.conversation.systemPrompt);
      }
      setTimeout(scrollToBottom, 100);
    } catch {
      setError("Failed to load conversation");
    }
  };

  const createConversation = async (): Promise<string> => {
    const result = await trpc.chat.createConversation.mutate({
      title: "New conversation",
      model: selectedModel(),
      systemPrompt: systemPrompt() || undefined,
    });
    const newConv: Conversation = {
      id: result.id,
      title: result.title,
      model: selectedModel(),
      totalTokens: 0,
      totalCost: 0,
      updatedAt: new Date(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(result.id);
    setMessages([]);
    return result.id;
  };

  const deleteConversation = async (id: string): Promise<void> => {
    await trpc.chat.deleteConversation.mutate({ id });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId() === id) {
      setActiveConvId(null);
      setMessages([]);
    }
  };

  const handleSend = async (): Promise<void> => {
    const text = input().trim();
    if (!text || isStreaming()) return;

    setError(null);

    // Ensure we have a conversation
    let convId = activeConvId();
    if (!convId) {
      convId = await createConversation();
      // Auto-title from first message
      const title = text.slice(0, 60) + (text.length > 60 ? "..." : "");
      await trpc.chat.updateConversation.mutate({ id: convId, title });
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title } : c)),
      );
    }

    // Add user message
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

    // Save user message to DB
    await trpc.chat.saveMessage.mutate({
      conversationId: convId,
      role: "user",
      content: text,
    });

    // Build message history for the API
    const history = messages().map((m) => ({
      role: m.role,
      content: m.content,
    }));

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
          systemPrompt: systemPrompt() || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json() as { error: string; hint?: string };
        throw new Error(err.hint ?? err.error);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        setStreamContent(fullContent);
        scrollToBottom();
      }

      // Streaming complete — save assistant message
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: fullContent,
        model: selectedModel(),
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamContent("");

      // Rough token estimate (4 chars ~ 1 token)
      const estimatedInputTokens = Math.ceil(history.reduce((acc, m) => acc + m.content.length, 0) / 4);
      const estimatedOutputTokens = Math.ceil(fullContent.length / 4);
      setSessionTokens((prev) => prev + estimatedInputTokens + estimatedOutputTokens);

      // Save to DB with token estimates
      await trpc.chat.saveMessage.mutate({
        conversationId: convId,
        role: "assistant",
        content: fullContent,
        model: selectedModel(),
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stream failed";
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

  const currentModel = (): ModelInfo => {
    return MODELS.find((m) => m.id === selectedModel()) ?? MODELS[0] as ModelInfo;
  };

  return (
    <div class="flex h-screen" style={{ background: "var(--color-bg)" }}>
      <Title>Chat - Crontech</Title>

      {/* ── Left Sidebar: Conversations ─────────────────────────── */}
      <div
        class="flex w-72 shrink-0 flex-col"
        style={{ background: "var(--color-bg-subtle)", "border-right": "1px solid var(--color-border)" }}
      >
        {/* Header */}
        <div class="px-5 py-4" style={{ "border-bottom": "1px solid var(--color-border)" }}>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: "var(--color-bg-elevated)" }}
              >
                <span class="text-lg" style={{ color: "var(--color-primary-light)" }}>&#9889;</span>
              </div>
              <div>
                <h1 class="text-base font-bold" style={{ color: "var(--color-text)" }}>Claude Chat</h1>
                <p class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>Anthropic API Direct</p>
              </div>
            </div>
          </div>
        </div>

        {/* New Chat Button */}
        <div class="px-4 py-3" style={{ "border-bottom": "1px solid var(--color-border)" }}>
          <button
            type="button"
            onClick={() => void createConversation()}
            class="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all"
            style={{
              background: "var(--color-bg-inset)",
              color: "var(--color-text-secondary)",
              border: "1px dashed var(--color-border)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Conversation
          </button>
        </div>

        {/* Conversation List */}
        <div class="flex-1 overflow-y-auto px-3 py-2">
          <Show when={conversations().length > 0} fallback={
            <div class="flex flex-col items-center gap-2 py-12 text-center">
              <span class="text-2xl opacity-30">&#128172;</span>
              <span class="text-xs" style={{ color: "var(--color-text-faint)" }}>No conversations yet</span>
            </div>
          }>
            <div class="flex flex-col gap-0.5">
              <For each={conversations()}>
                {(conv) => (
                  <ConversationItem
                    conv={conv}
                    isActive={activeConvId() === conv.id}
                    onClick={() => void loadConversation(conv.id)}
                    onDelete={() => void deleteConversation(conv.id)}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Session Stats */}
        <div class="px-5 py-4" style={{ "border-top": "1px solid var(--color-border)" }}>
          <span class="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-faint)" }}>Session</span>
          <div class="mt-2 grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>Tokens</span>
              <span class="text-sm font-bold" style={{ color: "var(--color-primary-light)" }}>{sessionTokens().toLocaleString()}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px]" style={{ color: "var(--color-text-faint)" }}>Model</span>
              <span class="truncate text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>{currentModel().name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Center: Chat Interface ────────────────────────────── */}
      <div class="flex flex-1 flex-col overflow-hidden">
        {/* Chat Header */}
        <div
          class="flex items-center justify-between px-6 py-3"
          style={{ background: "var(--color-bg-subtle)", "border-bottom": "1px solid var(--color-border)" }}
        >
          <div class="flex items-center gap-3">
            <span class="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {activeConvId()
                ? conversations().find((c) => c.id === activeConvId())?.title ?? "Chat"
                : "New Chat"}
            </span>
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: "var(--color-bg-elevated)", color: "var(--color-primary-light)" }}
            >
              <span class="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-primary-light)" }} />
              Anthropic
            </span>
          </div>
          <div class="flex items-center gap-2">
            {/* Model Selector */}
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
              <For each={MODELS}>
                {(model) => (
                  <option value={model.id} style={{ background: "var(--color-bg-elevated)" }}>{model.name}</option>
                )}
              </For>
            </select>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings())}
              class="rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-200"
              style={{
                background: showSettings() ? "var(--color-bg-elevated)" : "var(--color-bg-inset)",
                border: showSettings() ? "1px solid var(--color-primary-light)" : "1px solid var(--color-border)",
                color: showSettings() ? "var(--color-primary-light)" : "var(--color-text-secondary)",
              }}
            >
              Settings
            </button>
          </div>
        </div>

        {/* API Key Warning */}
        <Show when={!hasApiKey()}>
          <div class="mx-6 mt-4 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <span class="text-amber-400">&#9888;</span>
            <div class="flex-1">
              <span class="text-xs font-medium text-amber-300">No Anthropic API key configured</span>
              <p class="text-[11px] text-amber-400/60">Go to Settings &gt; AI Provider Keys to add your key, or set ANTHROPIC_API_KEY in your environment.</p>
            </div>
          </div>
        </Show>

        {/* Error Banner */}
        <Show when={error()}>
          <div class="mx-6 mt-4 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
            <span class="text-red-400">&#10060;</span>
            <span class="flex-1 text-xs text-red-300">{error()}</span>
            <button type="button" onClick={() => setError(null)} class="text-xs text-red-500 hover:text-red-400">Dismiss</button>
          </div>
        </Show>

        {/* System Prompt Panel */}
        <Show when={showSettings()}>
          <div class="border-b border-white/[0.06] bg-[#08080c] px-6 py-4">
            <div class="flex flex-col gap-2">
              <label class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">System Prompt</label>
              <textarea
                value={systemPrompt()}
                onInput={(e) => setSystemPrompt(e.currentTarget.value)}
                rows={3}
                class="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs text-gray-200 placeholder-gray-600 outline-none transition-all focus:border-orange-500/30"
                placeholder="You are a helpful assistant specialized in..."
              />
            </div>
          </div>
        </Show>

        {/* Messages */}
        <div class="flex-1 overflow-y-auto px-6 py-6">
          <div class="mx-auto flex max-w-3xl flex-col gap-6">
            {/* Empty state */}
            <Show when={messages().length === 0 && !isStreaming()}>
              <div class="flex flex-col items-center gap-4 py-24">
                <div
                  class="flex h-20 w-20 items-center justify-center rounded-3xl"
                  style={{ background: "linear-gradient(135deg, #f9731620, #ef444420)" }}
                >
                  <span class="text-4xl" style={{ color: "#f97316" }}>&#9889;</span>
                </div>
                <h2 class="text-xl font-bold text-white">Claude Chat</h2>
                <p class="max-w-sm text-center text-sm text-gray-500">
                  Direct Anthropic API access. No subscriptions. Pay only for what you use. Your API key, your data, your control.
                </p>
                <div class="mt-4 flex flex-wrap justify-center gap-2">
                  {["Help me architect a microservice", "Review this code for security issues", "Write a database migration"].map((prompt) => (
                    <button
                      type="button"
                      onClick={() => {
                        setInput(prompt);
                        textareaRef?.focus();
                      }}
                      class="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-xs text-gray-400 transition-all hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-gray-200"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </Show>

            <For each={messages()}>
              {(msg) => <MessageBubble message={msg} />}
            </For>

            {/* Streaming indicator */}
            <Show when={isStreaming()}>
              <div class="flex gap-3">
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                  style={{ background: "linear-gradient(135deg, #f97316, #ef4444)" }}
                >
                  C
                </div>
                <div class="max-w-[80%] rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3">
                  <Show when={streamContent()} fallback={
                    <div class="flex items-center gap-1.5">
                      <div class="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
                      <div class="h-2 w-2 animate-pulse rounded-full bg-orange-400" style={{ "animation-delay": "0.2s" }} />
                      <div class="h-2 w-2 animate-pulse rounded-full bg-orange-400" style={{ "animation-delay": "0.4s" }} />
                    </div>
                  }>
                    <div class="text-sm leading-relaxed text-gray-300" innerHTML={renderContent(streamContent())} />
                  </Show>
                </div>
              </div>
            </Show>

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div class="border-t border-white/[0.06] bg-[#08080c] px-6 py-4">
          <div class="mx-auto max-w-3xl">
            <div class="flex items-end gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2 transition-all duration-200 focus-within:border-orange-500/30 focus-within:shadow-lg focus-within:shadow-orange-500/5">
              <textarea
                ref={textareaRef}
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Claude..."
                rows={1}
                class="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none"
                style={{ "max-height": "120px" }}
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!input().trim() || isStreaming()}
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-lg shadow-orange-500/20 transition-all duration-200 hover:shadow-orange-500/40 hover:brightness-110 disabled:opacity-30 disabled:shadow-none"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            </div>
            <div class="mt-2 flex items-center justify-between px-1">
              <span class="text-[10px] text-gray-700">
                Shift+Enter for new line
              </span>
              <span class="text-[10px] text-gray-700">
                {currentModel().name} via Anthropic API
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
