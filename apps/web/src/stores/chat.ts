// ── Chat Store ───────────────────────────────────────────────────────
// Signal-based chat state for the AI builder page.
// Uses module-level signals (no context provider needed) following
// the SolidJS pattern for global reactive state.

import { type Accessor, createSignal } from "solid-js";
import {
  streamSiteBuilder,
  type AIClientError,
  type ChatMessage as APIChatMessage,
} from "../lib/ai-client";

// ── Types ────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface GeneratedUIConfig {
  layout: Array<Record<string, unknown>>;
  reasoning: string;
}

// ── Signals ──────────────────────────────────────────────────────────

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Welcome to the AI Website Builder. Describe the website you want to create, and I will build it for you in real time. You can ask for changes, add pages, or adjust styling at any point.",
  timestamp: Date.now(),
};

const [messages, setMessages] = createSignal<ChatMessage[]>([WELCOME_MESSAGE]);
const [isStreaming, setIsStreaming] = createSignal<boolean>(false);
const [error, setError] = createSignal<string | null>(null);
const [generatedUI, setGeneratedUI] = createSignal<GeneratedUIConfig | null>(
  null,
);

// ── Actions ──────────────────────────────────────────────────────────

function sendMessage(content: string): void {
  const text = content.trim();
  if (!text || isStreaming()) return;

  // Clear any previous error
  setError(null);

  // Add user message
  const userMessage: ChatMessage = {
    id: `user-${Date.now()}`,
    role: "user",
    content: text,
    timestamp: Date.now(),
  };
  setMessages((prev) => [...prev, userMessage]);

  // Prepare streaming
  setIsStreaming(true);

  // Build message history for the API (role + content only, no id/timestamp)
  const apiMessages: APIChatMessage[] = messages().map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Create a placeholder assistant message that we will accumulate into
  const assistantId = `assistant-${Date.now()}`;
  const assistantMessage: ChatMessage = {
    id: assistantId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
  };
  setMessages((prev) => [...prev, assistantMessage]);

  // Stream the response
  streamSiteBuilder(
    apiMessages,
    (chunk: string): void => {
      // Accumulate text chunks into the assistant message
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: msg.content + chunk }
            : msg,
        ),
      );
    },
    (): void => {
      // Done streaming
      setIsStreaming(false);
    },
    (err: AIClientError): void => {
      setIsStreaming(false);
      setError(err.message);

      // Update the assistant message to show the error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content:
                  msg.content ||
                  `Failed to get response: ${err.message}. Please try again.`,
              }
            : msg,
        ),
      );
    },
  );
}

function clearMessages(): void {
  setMessages([WELCOME_MESSAGE]);
  setError(null);
  setGeneratedUI(null);
}

function updateGeneratedUI(config: GeneratedUIConfig): void {
  setGeneratedUI(config);
}

// ── Exported Store ───────────────────────────────────────────────────

export interface ChatStore {
  messages: Accessor<ChatMessage[]>;
  isStreaming: Accessor<boolean>;
  error: Accessor<string | null>;
  generatedUI: Accessor<GeneratedUIConfig | null>;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
  updateGeneratedUI: (config: GeneratedUIConfig) => void;
}

export const chatStore: ChatStore = {
  messages,
  isStreaming,
  error,
  generatedUI,
  sendMessage,
  clearMessages,
  updateGeneratedUI,
};

export function useChat(): ChatStore {
  return chatStore;
}
