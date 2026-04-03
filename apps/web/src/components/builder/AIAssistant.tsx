// ── AI Assistant Panel ───────────────────────────────────────────────
// Chat interface for the AI site builder agent. Supports streaming
// responses via SSE, preview overlays, and accept/reject workflows.

import { type JSX, For, Show, createSignal, createEffect, createMemo } from "solid-js";
import { useEditor, type ComponentNode } from "../../stores/editor";

// ── Types ────────────────────────────────────────────────────────────

interface AIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  pending?: boolean;
  componentTree?: ComponentNode[];
}

type AIAssistantStatus = "idle" | "streaming" | "error";

// ── Component ────────────────────────────────────────────────────────

export function AIAssistant(): JSX.Element {
  const editor = useEditor();
  const [messages, setMessages] = createSignal<AIMessage[]>([
    {
      id: "welcome",
      role: "system",
      content: "I can help you build your page. Describe what you want, or ask me to modify the current layout.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = createSignal("");
  const [status, setStatus] = createSignal<AIAssistantStatus>("idle");
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [pendingTree, setPendingTree] = createSignal<ComponentNode[] | null>(null);

  let messagesEndRef: HTMLDivElement | undefined;
  let abortController: AbortController | null = null;

  // Auto-scroll on new messages
  createEffect((): void => {
    messages();
    messagesEndRef?.scrollIntoView({ behavior: "smooth" });
  });

  const isStreaming = (): boolean => status() === "streaming";

  async function sendMessage(): Promise<void> {
    const text = input().trim();
    if (!text || isStreaming()) return;

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStatus("streaming");
    setErrorMessage(null);

    const assistantMsg: AIMessage = {
      id: `msg-${Date.now()}-assistant`,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      pending: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      abortController = new AbortController();

      // Current component tree context
      const context = {
        prompt: text,
        currentTree: editor.componentTree(),
      };

      const response = await fetch("/api/ai/site-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data) as { type: string; content?: string; tree?: ComponentNode[] };

              if (parsed.type === "text" && parsed.content) {
                accumulated += parsed.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: accumulated, pending: true }
                      : m,
                  ),
                );
              }

              if (parsed.type === "component_tree" && parsed.tree) {
                setPendingTree(parsed.tree);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, componentTree: parsed.tree, pending: true }
                      : m,
                  ),
                );
              }
            } catch {
              // Non-JSON SSE line, accumulate as text
              accumulated += data;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: accumulated, pending: true }
                    : m,
                ),
              );
            }
          }
        }
      }

      // Finalize message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, pending: false } : m,
        ),
      );
      setStatus("idle");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMessage(msg);
      setStatus("error");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `Error: ${msg}`, pending: false }
            : m,
        ),
      );
    }
  }

  function cancelStream(): void {
    abortController?.abort();
    abortController = null;
    setStatus("idle");
  }

  function acceptAIChanges(): void {
    const tree = pendingTree();
    if (tree) {
      editor.pushHistory("Accept AI changes");
      editor.setComponentTree(tree);
      setPendingTree(null);
    }
  }

  function rejectAIChanges(): void {
    setPendingTree(null);
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  // Quick prompts
  const quickPrompts = [
    "Generate a landing page",
    "Add a hero section",
    "Create a contact form",
    "Add a navigation bar",
  ];

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-purple-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
          </svg>
          <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Assistant</span>
        </div>
        <Show when={isStreaming()}>
          <button
            type="button"
            class="text-xs text-red-500 hover:text-red-700 font-medium"
            onClick={cancelStream}
          >
            Stop
          </button>
        </Show>
      </div>

      {/* Messages */}
      <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <For each={messages()}>
          {(msg) => (
            <div
              class={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                class={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : msg.role === "system"
                      ? "bg-purple-50 text-purple-800 border border-purple-200"
                      : "bg-gray-100 text-gray-800"
                } ${msg.pending ? "opacity-75" : ""}`}
              >
                <p class="whitespace-pre-wrap break-words">{msg.content}</p>

                {/* AI-generated component tree preview */}
                <Show when={msg.componentTree}>
                  <div class="mt-2 p-2 bg-white/50 rounded border border-gray-200 text-xs">
                    <span class="font-medium text-gray-600">Generated {msg.componentTree?.length ?? 0} components</span>
                  </div>
                </Show>

                {/* Streaming indicator */}
                <Show when={msg.pending && msg.role === "assistant"}>
                  <div class="flex items-center gap-1 mt-1">
                    <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                    <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ "animation-delay": "0.2s" }} />
                    <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ "animation-delay": "0.4s" }} />
                  </div>
                </Show>
              </div>
            </div>
          )}
        </For>
        <div ref={messagesEndRef} />
      </div>

      {/* Accept/Reject bar for pending AI changes */}
      <Show when={pendingTree()}>
        <div class="px-3 py-2 bg-purple-50 border-t border-purple-200 flex items-center justify-between">
          <span class="text-xs font-medium text-purple-700">AI generated a new layout</span>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
              onClick={acceptAIChanges}
            >
              Accept
            </button>
            <button
              type="button"
              class="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              onClick={rejectAIChanges}
            >
              Reject
            </button>
          </div>
        </div>
      </Show>

      {/* Error display */}
      <Show when={errorMessage()}>
        {(err) => (
          <div class="px-3 py-1.5 bg-red-50 border-t border-red-200">
            <span class="text-xs text-red-600">{err()}</span>
          </div>
        )}
      </Show>

      {/* Quick prompts */}
      <Show when={messages().length <= 1}>
        <div class="px-3 py-2 border-t border-gray-100">
          <div class="flex flex-wrap gap-1.5">
            <For each={quickPrompts}>
              {(prompt) => (
                <button
                  type="button"
                  class="px-2 py-1 text-[11px] bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
                  onClick={() => {
                    setInput(prompt);
                    void sendMessage();
                  }}
                >
                  {prompt}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Input */}
      <div class="px-3 py-2 border-t border-gray-200">
        <div class="flex items-end gap-2">
          <textarea
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what to build..."
            disabled={isStreaming()}
            rows={1}
            class="flex-1 resize-none min-h-[36px] max-h-[120px] px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="button"
            class="h-9 w-9 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            disabled={!input().trim() || isStreaming()}
            onClick={() => void sendMessage()}
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
