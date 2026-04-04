// ── Chat Widget ─────────────────────────────────────────────────────
// Floating support chat bubble (bottom-right) that expands into a
// 400x600 chat panel. Full-screen on mobile. Persists across
// page navigations via the support store + sessionStorage.

import {
  type JSX,
  For,
  Show,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
} from "solid-js";
import { Button, Badge } from "@cronix/ui";
import { useSupport } from "../../stores/support";
import { MessageBubble, TypingIndicator } from "./MessageBubble";

// ── Quick Action Buttons ────────────────────────────────────────────

interface QuickAction {
  label: string;
  message: string;
  icon: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Billing help", message: "I need help with billing", icon: "\uD83D\uDCB3" },
  { label: "Technical issue", message: "I'm experiencing a technical issue", icon: "\uD83D\uDD27" },
  { label: "Feature request", message: "I have a feature request", icon: "\u2728" },
  { label: "Talk to a human", message: "", icon: "\uD83D\uDC64" },
];

// ── Chat Widget Component ───────────────────────────────────────────

export function ChatWidget(): JSX.Element {
  const support = useSupport();
  const [inputText, setInputText] = createSignal("");
  const [isMobile, setIsMobile] = createSignal(false);

  let messagesEndRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  // Detect mobile viewport
  function checkMobile(): void {
    setIsMobile(window.innerWidth < 640);
  }

  onMount(() => {
    checkMobile();
    window.addEventListener("resize", checkMobile);
  });

  onCleanup(() => {
    window.removeEventListener("resize", checkMobile);
  });

  // Auto-scroll on new messages
  createEffect((): void => {
    support.messages();
    support.isStreaming();
    requestAnimationFrame(() => {
      messagesEndRef?.scrollIntoView({ behavior: "smooth" });
    });
  });

  // Focus textarea when widget opens
  createEffect((): void => {
    if (support.isOpen()) {
      requestAnimationFrame(() => {
        textareaRef?.focus();
      });
    }
  });

  // Auto-resize textarea
  function autoResize(): void {
    if (textareaRef) {
      textareaRef.style.height = "auto";
      textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 120)}px`;
    }
  }

  function handleSend(): void {
    const text = inputText().trim();
    if (!text || support.isStreaming()) return;
    support.sendMessage(text);
    setInputText("");
    if (textareaRef) {
      textareaRef.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleQuickAction(action: QuickAction): void {
    if (action.label === "Talk to a human") {
      support.escalateToHuman();
    } else {
      support.sendMessage(action.message);
    }
  }

  const hasMessages = (): boolean => support.messages().length > 0;

  // ── Panel classes ─────────────────────────────────────────────────

  const panelClasses = (): string => {
    if (isMobile()) {
      return "fixed inset-0 z-50 flex flex-col bg-white";
    }
    return "fixed bottom-20 right-4 z-50 w-[400px] h-[600px] flex flex-col bg-white rounded-2xl shadow-2xl shadow-gray-900/20 border border-gray-200 overflow-hidden";
  };

  return (
    <>
      {/* Chat Panel */}
      <Show when={support.isOpen()}>
        <div
          class={panelClasses()}
          role="dialog"
          aria-label="Support chat"
          style={{
            animation: "supportFadeSlideIn 200ms ease-out",
          }}
        >
          {/* Header */}
          <div class="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white shrink-0">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
              </div>
              <div>
                <div class="font-semibold text-sm">Cronix Support</div>
                <div class="flex items-center gap-1.5">
                  <div class={`w-2 h-2 rounded-full ${support.agentMode() === "ai" ? "bg-green-400" : "bg-amber-400"}`} />
                  <span class="text-[11px] text-blue-100">
                    {support.agentMode() === "ai" ? "AI Assistant" : "Human Agent"}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1">
              {/* Clear conversation */}
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                onClick={() => support.clearConversation()}
                aria-label="Clear conversation"
                title="New conversation"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
                </svg>
              </button>
              {/* Minimize */}
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                onClick={() => support.close()}
                aria-label="Minimize chat"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {/* Close */}
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                onClick={() => support.close()}
                aria-label="Close chat"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {/* Welcome state with quick actions */}
            <Show when={!hasMessages()}>
              <div class="flex flex-col items-center justify-center h-full gap-4 py-8">
                <div class="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                  <svg class="w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z" />
                  </svg>
                </div>
                <div class="text-center">
                  <p class="font-semibold text-gray-900 text-sm">How can we help?</p>
                  <p class="text-xs text-gray-500 mt-1">Choose a topic or type your question below.</p>
                </div>
                <div class="grid grid-cols-2 gap-2 w-full max-w-[300px]">
                  <For each={QUICK_ACTIONS}>
                    {(action) => (
                      <button
                        type="button"
                        class="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 hover:border-gray-300 transition-all"
                        onClick={() => handleQuickAction(action)}
                      >
                        <span>{action.icon}</span>
                        <span>{action.label}</span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Message list */}
            <Show when={hasMessages()}>
              <For each={support.messages()}>
                {(msg) => (
                  <MessageBubble
                    message={msg}
                    onFeedback={support.submitFeedback}
                  />
                )}
              </For>

              {/* Streaming indicator when pending message has no content yet */}
              <Show when={support.isStreaming() && !support.messages().at(-1)?.content && support.messages().at(-1)?.pending}>
                <TypingIndicator />
              </Show>
            </Show>

            <div ref={messagesEndRef} />
          </div>

          {/* Error display */}
          <Show when={support.error()}>
            {(err) => (
              <div class="px-4 py-2 bg-red-50 border-t border-red-200 shrink-0">
                <p class="text-xs text-red-600">{err()}</p>
              </div>
            )}
          </Show>

          {/* Streaming cancel bar */}
          <Show when={support.isStreaming()}>
            <div class="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between shrink-0">
              <span class="text-xs text-blue-700 font-medium">AI is responding...</span>
              <button
                type="button"
                class="text-xs text-red-600 hover:text-red-800 font-semibold transition-colors"
                onClick={() => support.cancelStream()}
              >
                Stop
              </button>
            </div>
          </Show>

          {/* Input Area */}
          <div class="px-4 py-3 border-t border-gray-200 shrink-0">
            <div class="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={inputText()}
                onInput={(e) => {
                  setInputText(e.currentTarget.value);
                  autoResize();
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Ctrl+Enter to send)"
                disabled={support.isStreaming()}
                rows={1}
                class="flex-1 resize-none min-h-[40px] max-h-[120px] px-3 py-2.5 text-sm border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 placeholder:text-gray-400"
              />
              <button
                type="button"
                class="h-10 w-10 flex items-center justify-center bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 transition-colors"
                disabled={!inputText().trim() || support.isStreaming()}
                onClick={handleSend}
                aria-label="Send message"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Powered by Claude footer */}
          <div class="px-4 py-2 bg-gray-50 border-t border-gray-100 shrink-0">
            <div class="flex items-center justify-center gap-1.5">
              <span class="text-[10px] text-gray-400">Powered by</span>
              <span class="text-[10px] font-semibold text-gray-500">Claude</span>
            </div>
          </div>
        </div>
      </Show>

      {/* Floating Chat Bubble */}
      <Show when={!support.isOpen()}>
        <button
          type="button"
          class="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/40 transition-all flex items-center justify-center group"
          onClick={() => support.toggleOpen()}
          aria-label="Open support chat"
          style={{
            animation: "supportBubblePop 300ms ease-out",
          }}
        >
          <svg class="w-6 h-6 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
          </svg>

          {/* Unread badge */}
          <Show when={support.unreadCount() > 0}>
            <span class="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center px-1.5 bg-red-500 text-white text-[11px] font-bold rounded-full ring-2 ring-white">
              {support.unreadCount() > 9 ? "9+" : support.unreadCount()}
            </span>
          </Show>
        </button>
      </Show>

      {/* CSS Animations (injected via style tag) */}
      <style>{`
        @keyframes supportFadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes supportBubblePop {
          from {
            opacity: 0;
            transform: scale(0.5);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </>
  );
}
