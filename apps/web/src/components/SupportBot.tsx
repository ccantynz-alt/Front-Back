// ── SupportBot ──────────────────────────────────────────────────────
// Floating AI helper available on every page. Demo-mode aware.

import { useLocation, useNavigate } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal, onMount } from "solid-js";
import { streamChat } from "../lib/ai-client";

type Role = "user" | "assistant" | "system";

interface ChatMessage {
  readonly id: string;
  readonly role: Role;
  content: string;
}

const STORAGE_KEY = "btf-support-bot-history-v1";
const MINIMIZED_KEY = "btf-support-bot-minimized-v1";

interface PageHints {
  readonly title: string;
  readonly suggestions: ReadonlyArray<string>;
}

const PAGE_HINTS: Record<string, PageHints> = {
  "/": {
    title: "Welcome",
    suggestions: ["What is this?", "How do I get started?", "Is there a free plan?"],
  },
  "/dashboard": {
    title: "Dashboard",
    suggestions: ["Create my first website", "Invite a teammate", "Where do I edit videos?"],
  },
  "/builder": {
    title: "Composer",
    suggestions: ["How do I create a landing page?", "Can I change colors?", "How do I publish?"],
  },
  "/chat": {
    title: "Claude Chat",
    suggestions: ["How do I add my API key?", "What models are available?", "How does billing work?"],
  },
  "/billing": {
    title: "Billing",
    suggestions: ["How do I upgrade?", "What's in Pro?", "How do I cancel?"],
  },
  "/settings": {
    title: "Settings",
    suggestions: ["Invite a teammate", "Change my email", "Sign out"],
  },
  "/collab": {
    title: "Collaboration",
    suggestions: ["How do I start a room?", "How do I invite people?", "What can we do together?"],
  },
  "/register": {
    title: "Sign Up",
    suggestions: ["Do I need an email?", "Is it really free?", "How long does it take?"],
  },
  "/login": {
    title: "Sign In",
    suggestions: ["I forgot my login", "How do I sign in?", "Can I sign up instead?"],
  },
};

interface QuickAction {
  readonly label: string;
  readonly action: () => void;
}

const KEYWORD_ANSWERS: ReadonlyArray<{ keys: string[]; answer: string }> = [
  {
    keys: ["website", "site", "landing", "page", "build"],
    answer:
      "Easy! Click 'Builder' in the menu, then type what you want — like 'a landing page for my coffee shop'. Your site appears instantly. Want me to take you there?",
  },
  {
    keys: ["video", "clip", "edit", "trim"],
    answer:
      "Open the 'Video' page, drop in a clip (or pick a sample), then ask the assistant to trim, caption, or restyle it. Want me to open it for you?",
  },
  {
    keys: ["invite", "team", "teammate", "collaborator"],
    answer:
      "Go to Settings, then click 'Invite' under Team. Add their email and we'll send a friendly link. They can join even on the free plan.",
  },
  {
    keys: ["upgrade", "plan", "pro", "subscribe", "billing", "pay"],
    answer:
      "Open the Billing page from the menu, pick a plan, and you're upgraded instantly. Cancel anytime, no strings.",
  },
  {
    keys: ["trial", "free", "cost", "price"],
    answer:
      "You're already on the free tier! Click 'Try for Free' to start a 14-day Pro trial — no credit card needed.",
  },
  {
    keys: ["save", "lose", "auto"],
    answer:
      "Don't worry — everything saves automatically as you go. Add an email in Settings if you want it on every device.",
  },
  {
    keys: ["export", "download", "publish", "deploy"],
    answer:
      "In the Builder, hit 'Export' in the top right. You can download a ZIP or publish your site live in one click.",
  },
  {
    keys: ["dashboard", "home", "projects"],
    answer: "Click 'Dashboard' in the top menu — it shows all your projects in one place.",
  },
  {
    keys: ["help", "stuck", "lost", "confused"],
    answer:
      "No worries! Tell me what you're trying to do and I'll walk you through it step by step.",
  },
  {
    keys: ["hello", "hi", "hey"],
    answer: "Hi there! I'm your built-in helper. What would you like to do today?",
  },
];

function findCannedAnswer(question: string): string | null {
  const q = question.toLowerCase();
  let best: { score: number; answer: string } | null = null;
  for (const entry of KEYWORD_ANSWERS) {
    let score = 0;
    for (const k of entry.keys) if (q.includes(k)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { score, answer: entry.answer };
  }
  return best?.answer ?? null;
}

const DEFAULT_GREETING: ChatMessage = {
  id: "greet",
  role: "assistant",
  content:
    "Hi! I'm your built-in helper. Ask me anything — how to build a website, edit a video, invite a teammate, or upgrade. I'll guide you step by step.",
};

function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [DEFAULT_GREETING];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [DEFAULT_GREETING];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [DEFAULT_GREETING];
  } catch {
    return [DEFAULT_GREETING];
  }
}

function saveHistory(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    /* quota — ignore */
  }
}

export function SupportBot(): ReturnType<typeof Show> {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = createSignal(false);
  const [minimized, setMinimized] = createSignal(false);
  const [messages, setMessages] = createSignal<ChatMessage[]>([DEFAULT_GREETING]);
  const [input, setInput] = createSignal("");
  const [thinking, setThinking] = createSignal(false);

  onMount(() => {
    setMessages(loadHistory());
    try {
      setMinimized(window.localStorage.getItem(MINIMIZED_KEY) === "1");
    } catch {
      /* noop */
    }
  });

  createEffect(() => {
    saveHistory(messages());
  });

  createEffect(() => {
    try {
      window.localStorage.setItem(MINIMIZED_KEY, minimized() ? "1" : "0");
    } catch {
      /* noop */
    }
  });

  const hints = createMemo<PageHints>(() => {
    const path = location.pathname;
    return (
      PAGE_HINTS[path] ?? {
        title: "Crontech",
        suggestions: ["How do I get started?", "Show me around", "How do I get help?"],
      }
    );
  });

  const quickActions = (): ReadonlyArray<QuickAction> => [
    { label: "Create a website", action: () => navigate("/builder") },
    { label: "Open chat", action: () => navigate("/chat") },
    { label: "Invite team", action: () => navigate("/settings") },
    { label: "Start trial", action: () => navigate("/billing") },
  ];

  function pushMessage(role: Role, content: string): string {
    const id = `${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;
    setMessages((prev) => [...prev, { id, role, content }]);
    return id;
  }

  function updateMessage(id: string, content: string): void {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content } : m)));
  }

  function maybeAutoNavigate(question: string): void {
    const q = question.toLowerCase();
    if (q.includes("take me") || q.includes("open ") || q.includes("go to ")) {
      if (q.includes("builder") || q.includes("website")) navigate("/builder");
      else if (q.includes("chat") || q.includes("ai")) navigate("/chat");
      else if (q.includes("billing") || q.includes("upgrade")) navigate("/billing");
      else if (q.includes("settings")) navigate("/settings");
      else if (q.includes("dashboard")) navigate("/dashboard");
    }
  }

  async function send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || thinking()) return;
    setInput("");
    pushMessage("user", trimmed);
    maybeAutoNavigate(trimmed);

    const canned = findCannedAnswer(trimmed);
    if (canned) {
      setThinking(true);
      window.setTimeout(() => {
        pushMessage("assistant", canned);
        setThinking(false);
      }, 250);
      return;
    }

    setThinking(true);
    const replyId = pushMessage("assistant", "");
    let buffer = "";
    try {
      await streamChat(
        [
          {
            role: "system",
            content:
              "You are a friendly built-in helper for an AI website and video builder. Use plain English. Be brief and warm. The user is on page: " +
              location.pathname,
          },
          { role: "user", content: trimmed },
        ],
        (token) => {
          buffer += token;
          updateMessage(replyId, buffer);
        },
        () => {
          if (!buffer) {
            updateMessage(
              replyId,
              "I'm not sure about that one — but I can help you create a website, edit a video, invite a teammate, or upgrade your plan. Which sounds good?",
            );
          }
          setThinking(false);
        },
        () => {
          updateMessage(
            replyId,
            "I couldn't reach the AI right now. Try one of the quick actions below — they always work.",
          );
          setThinking(false);
        },
      );
    } catch {
      updateMessage(
        replyId,
        "Something went sideways. Try a quick action below — those always work.",
      );
      setThinking(false);
    }
  }

  function clearChat(): void {
    setMessages([DEFAULT_GREETING]);
  }

  return (
    <Show when={true}>
      <div
        style={{
          position: "fixed",
          right: "1.25rem",
          bottom: "1.25rem",
          "z-index": "9999",
          "font-family": "system-ui, -apple-system, sans-serif",
        }}
      >
        <Show when={!open()}>
          <button
            type="button"
            aria-label="Open help"
            onClick={() => setOpen(true)}
            style={{
              "border-radius": "9999px",
              width: "56px",
              height: "56px",
              border: "none",
              background: "var(--color-primary)",
              color: "var(--color-text)",
              "font-size": "24px",
              "box-shadow": "0 8px 24px rgba(0,0,0,0.2)",
              cursor: "pointer",
            }}
          >
            ?
          </button>
        </Show>
        <Show when={open()}>
          <div
            style={{
              width: "360px",
              "max-width": "calc(100vw - 2rem)",
              height: minimized() ? "48px" : "520px",
              "max-height": "calc(100vh - 2rem)",
              background: "var(--color-bg-elevated)",
              color: "var(--color-text)",
              "border-radius": "16px",
              "box-shadow": "var(--shadow-xl)",
              display: "flex",
              "flex-direction": "column",
              overflow: "hidden",
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              tabindex="0"
              aria-expanded={!minimized()}
              aria-label={minimized() ? "Expand Help Panel" : "Minimize Help Panel"}
              style={{
                background: "var(--color-primary)",
                color: "var(--color-text)",
                padding: "0.75rem 1rem",
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                cursor: "pointer",
              }}
              onClick={() => setMinimized(!minimized())}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setMinimized(!minimized());
                }
              }}
            >
              <div style={{ "font-weight": "600", "font-size": "14px" }}>
                Help &mdash; {hints().title}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  aria-label={minimized() ? "Expand" : "Minimize"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMinimized(!minimized());
                  }}
                  style={{
                    background: "transparent",
                    color: "var(--color-text)",
                    border: "none",
                    cursor: "pointer",
                    "font-size": "18px",
                    "line-height": "1",
                  }}
                >
                  {minimized() ? "+" : "_"}
                </button>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                  }}
                  style={{
                    background: "transparent",
                    color: "var(--color-text)",
                    border: "none",
                    cursor: "pointer",
                    "font-size": "18px",
                    "line-height": "1",
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            <Show when={!minimized()}>
              <div
                style={{
                  flex: "1",
                  "overflow-y": "auto",
                  padding: "0.75rem 1rem",
                  background: "var(--color-bg-subtle)",
                  display: "flex",
                  "flex-direction": "column",
                  gap: "0.5rem",
                }}
              >
                <For each={messages()}>
                  {(msg) => (
                    <div
                      style={{
                        "align-self": msg.role === "user" ? "flex-end" : "flex-start",
                        background: msg.role === "user" ? "var(--color-primary)" : "var(--color-bg-elevated)",
                        color: msg.role === "user" ? "var(--color-text)" : "var(--color-text)",
                        padding: "0.5rem 0.75rem",
                        "border-radius": "12px",
                        "max-width": "85%",
                        "font-size": "14px",
                        "line-height": "1.4",
                        "box-shadow": "0 1px 2px rgba(0,0,0,0.06)",
                        "white-space": "pre-wrap",
                      }}
                    >
                      {msg.content || (thinking() ? "…" : "")}
                    </div>
                  )}
                </For>
                <Show when={thinking()}>
                  <div style={{ "font-size": "12px", color: "var(--color-text-muted)" }}>Thinking…</div>
                </Show>
              </div>
              <div
                style={{
                  padding: "0.5rem 1rem",
                  "border-top": "1px solid var(--color-border)",
                  background: "var(--color-bg-elevated)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    "flex-wrap": "wrap",
                    gap: "0.25rem",
                    "margin-bottom": "0.5rem",
                  }}
                >
                  <For each={hints().suggestions}>
                    {(s) => (
                      <button
                        type="button"
                        onClick={() => void send(s)}
                        style={{
                          "font-size": "12px",
                          padding: "0.25rem 0.5rem",
                          "border-radius": "9999px",
                          border: "1px solid var(--color-border)",
                          background: "var(--color-bg-muted)",
                          color: "var(--color-text-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        {s}
                      </button>
                    )}
                  </For>
                </div>
                <div
                  style={{
                    display: "flex",
                    "flex-wrap": "wrap",
                    gap: "0.25rem",
                    "margin-bottom": "0.5rem",
                  }}
                >
                  <For each={quickActions()}>
                    {(qa) => (
                      <button
                        type="button"
                        onClick={qa.action}
                        style={{
                          "font-size": "12px",
                          padding: "0.25rem 0.5rem",
                          "border-radius": "6px",
                          border: "none",
                          background: "var(--color-primary-light)",
                          color: "var(--color-primary-text)",
                          cursor: "pointer",
                          "font-weight": "500",
                        }}
                      >
                        {qa.label}
                      </button>
                    )}
                  </For>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(input());
                  }}
                  style={{ display: "flex", gap: "0.5rem" }}
                >
                  <input
                    type="text"
                    value={input()}
                    onInput={(e) => setInput(e.currentTarget.value)}
                    placeholder="Ask me anything..."
                    aria-label="Ask the support bot"
                    style={{
                      flex: "1",
                      padding: "0.5rem 0.75rem",
                      "border-radius": "8px",
                      border: "1px solid var(--color-border)",
                      "font-size": "14px",
                      outline: "none",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={thinking() || !input().trim()}
                    style={{
                      padding: "0.5rem 0.875rem",
                      "border-radius": "8px",
                      border: "none",
                      background: "var(--color-primary)",
                      color: "var(--color-text)",
                      cursor: "pointer",
                      "font-weight": "500",
                      "font-size": "14px",
                      opacity: thinking() || !input().trim() ? "0.5" : "1",
                    }}
                  >
                    Send
                  </button>
                </form>
                <button
                  type="button"
                  onClick={clearChat}
                  style={{
                    "margin-top": "0.5rem",
                    "font-size": "11px",
                    background: "transparent",
                    border: "none",
                    color: "var(--color-text-faint)",
                    cursor: "pointer",
                  }}
                >
                  Clear conversation
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}

export default SupportBot;
