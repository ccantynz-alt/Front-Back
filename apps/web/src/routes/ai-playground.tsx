import { Title } from "@solidjs/meta";
import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  model?: string;
  tier?: string;
  tokensPerSec?: number;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  tier: "client" | "edge" | "cloud";
  badge?: string;
}

// ── Mock Data ────────────────────────────────────────────────────────

const MODELS: ModelOption[] = [
  { id: "llama-3.1-8b", name: "Llama 3.1 8B", provider: "Meta", tier: "client", badge: "$0/token" },
  { id: "smollm2-360m", name: "SmolLM2 360M", provider: "Hugging Face", tier: "client", badge: "$0/token" },
  { id: "gemma-2b", name: "Gemma 2B", provider: "Google", tier: "client", badge: "$0/token" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", tier: "cloud" },
  { id: "claude-sonnet", name: "Claude 4 Sonnet", provider: "Anthropic", tier: "cloud" },
  { id: "workers-ai", name: "Workers AI", provider: "Cloudflare", tier: "edge" },
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content: "Welcome to the Crontech AI Playground. I am running directly in your browser via WebGPU -- zero server costs, zero latency.\n\nTry asking me to generate a landing page component, explain an architecture concept, or write optimized code. Switch models using the panel on the left.",
    timestamp: new Date(),
    model: "llama-3.1-8b",
    tier: "client",
  },
];

const SAMPLE_CODE = `// AI-generated SolidJS component
import { createSignal } from "solid-js";

interface HeroProps {
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCta: () => void;
}

export function Hero(props: HeroProps) {
  const [hovered, setHovered] = createSignal(false);

  return (
    <section class="relative overflow-hidden py-24">
      <div class="absolute inset-0 bg-gradient-to-br
        from-blue-600/20 via-transparent to-violet-600/20" />
      <div class="relative mx-auto max-w-4xl text-center">
        <h1 class="text-6xl font-bold text-white">
          {props.title}
        </h1>
        <p class="mt-6 text-xl text-gray-400">
          {props.subtitle}
        </p>
        <button
          onClick={props.onCta}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          class="mt-10 rounded-2xl bg-gradient-to-r
            from-blue-600 to-violet-600 px-8 py-4
            text-lg font-semibold text-white
            transition-all hover:shadow-2xl"
        >
          {props.ctaLabel}
        </button>
      </div>
    </section>
  );
}`;

// ── Tier Badge ───────────────────────────────────────────────────────

function TierBadge(props: { tier: "client" | "edge" | "cloud" }): JSX.Element {
  const config = (): { label: string; color: string; glow: string } => {
    switch (props.tier) {
      case "client":
        return { label: "Client GPU", color: "#10b981", glow: "#10b98140" };
      case "edge":
        return { label: "Edge", color: "#3b82f6", glow: "#3b82f640" };
      case "cloud":
        return { label: "Cloud", color: "#a78bfa", glow: "#a78bfa40" };
    }
  };

  return (
    <span
      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: `${config().color}15`, color: config().color }}
    >
      <span
        class="h-1.5 w-1.5 rounded-full"
        style={{ background: config().color, "box-shadow": `0 0 6px ${config().glow}` }}
      />
      {config().label}
    </span>
  );
}

// ── Chat Bubble ──────────────────────────────────────────────────────

function ChatBubble(props: { message: ChatMessage }): JSX.Element {
  const isUser = (): boolean => props.message.role === "user";

  return (
    <div class={`flex gap-3 ${isUser() ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
        style={{
          background: isUser()
            ? "linear-gradient(135deg, #3b82f6, #8b5cf6)"
            : "linear-gradient(135deg, #10b981, #06b6d4)",
        }}
      >
        {isUser() ? "Y" : "AI"}
      </div>

      {/* Content */}
      <div class={`flex max-w-[80%] flex-col gap-1.5 ${isUser() ? "items-end" : ""}`}>
        <div
          class={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser()
              ? "bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-blue-500/20 text-gray-200"
              : "bg-white/[0.04] border border-white/[0.06] text-gray-300"
          }`}
          style={{ "white-space": "pre-wrap" }}
        >
          {props.message.content}
        </div>
        <div class="flex items-center gap-2 px-1">
          <Show when={props.message.tier}>
            <TierBadge tier={props.message.tier as "client" | "edge" | "cloud"} />
          </Show>
          <Show when={props.message.tokensPerSec}>
            <span class="text-[10px] text-gray-600">{props.message.tokensPerSec} tok/s</span>
          </Show>
          <span class="text-[10px] text-gray-700">
            {props.message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── AI Playground Page ───────────────────────────────────────────────

export default function AIPlayground(): JSX.Element {
  const [messages, setMessages] = createSignal<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = createSignal("");
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [selectedModel, setSelectedModel] = createSignal("llama-3.1-8b");
  const [temperature, setTemperature] = createSignal(0.7);
  const [maxTokens, setMaxTokens] = createSignal(2048);
  const [showCodePanel, setShowCodePanel] = createSignal(true);
  const [codeCopied, setCodeCopied] = createSignal(false);
  const [codeInserted, setCodeInserted] = createSignal(false);

  // Performance stats
  const [tokensPerSec] = createSignal(41.2);
  const [totalTokens, setTotalTokens] = createSignal(1284);
  const [sessionCost] = createSignal("$0.00");

  const currentModel = (): ModelOption => {
    const found = MODELS.find((m) => m.id === selectedModel());
    return found ?? (MODELS[0] as ModelOption);
  };

  const handleSend = (): void => {
    if (!input().trim() || isGenerating()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input().trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsGenerating(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Here is a high-performance SolidJS component based on your request. The implementation uses signals for surgical DOM updates, zero virtual DOM overhead, and is fully type-safe.\n\nThe component is rendered using ${currentModel().name} running on the ${currentModel().tier === "client" ? "client GPU via WebGPU" : currentModel().tier === "edge" ? "Cloudflare Workers edge network" : "cloud GPU cluster"}. Check the code preview panel for the generated source.`,
        timestamp: new Date(),
        model: currentModel().name,
        tier: currentModel().tier,
        tokensPerSec: currentModel().tier === "client" ? 41 : currentModel().tier === "edge" ? 128 : 84,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsGenerating(false);
      setTotalTokens((prev) => prev + 247);
    }, 1500);
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div class="flex h-screen bg-[#050508]">
      <Title>AI Playground - Crontech</Title>

      {/* Left Panel - Controls */}
      <div
        class="flex w-72 shrink-0 flex-col border-r border-white/[0.06]"
        style={{ background: "linear-gradient(180deg, rgba(10,10,14,1) 0%, rgba(6,6,10,1) 100%)" }}
      >
        {/* Header */}
        <div class="border-b border-white/[0.06] px-5 py-4">
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg, #3b82f630, #8b5cf660)" }}
            >
              <span class="text-lg" style={{ color: "#a78bfa" }}>&#9889;</span>
            </div>
            <div>
              <h1 class="text-base font-bold text-white">AI Playground</h1>
              <p class="text-[10px] text-gray-600">Three-tier compute inference</p>
            </div>
          </div>
        </div>

        {/* Compute Tier Indicator */}
        <div class="border-b border-white/[0.06] px-5 py-4">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Active Compute Tier</span>
          <div class="mt-3 flex flex-col gap-2">
            <div class={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all ${currentModel().tier === "client" ? "bg-emerald-500/10 border border-emerald-500/20" : "opacity-40"}`}>
              <div class="h-2 w-2 rounded-full bg-emerald-400" style={{ "box-shadow": currentModel().tier === "client" ? "0 0 8px #10b98180" : "none" }} />
              <span class="text-xs text-emerald-400">Client GPU</span>
              <span class="ml-auto text-[10px] text-emerald-500/60">$0/token</span>
            </div>
            <div class={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all ${currentModel().tier === "edge" ? "bg-blue-500/10 border border-blue-500/20" : "opacity-40"}`}>
              <div class="h-2 w-2 rounded-full bg-blue-400" style={{ "box-shadow": currentModel().tier === "edge" ? "0 0 8px #3b82f680" : "none" }} />
              <span class="text-xs text-blue-400">Edge Network</span>
              <span class="ml-auto text-[10px] text-blue-500/60">sub-50ms</span>
            </div>
            <div class={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all ${currentModel().tier === "cloud" ? "bg-violet-500/10 border border-violet-500/20" : "opacity-40"}`}>
              <div class="h-2 w-2 rounded-full bg-violet-400" style={{ "box-shadow": currentModel().tier === "cloud" ? "0 0 8px #a78bfa80" : "none" }} />
              <span class="text-xs text-violet-400">Cloud GPU</span>
              <span class="ml-auto text-[10px] text-violet-500/60">H100</span>
            </div>
          </div>
        </div>

        {/* Model Selector */}
        <div class="border-b border-white/[0.06] px-5 py-4">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Model</span>
          <div class="mt-3 flex flex-col gap-1">
            <For each={MODELS}>
              {(model) => (
                <button
                  type="button"
                  onClick={() => setSelectedModel(model.id)}
                  class={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${
                    selectedModel() === model.id
                      ? "border border-white/[0.1] bg-white/[0.06] text-white"
                      : "border border-transparent text-gray-500 hover:bg-white/[0.03] hover:text-gray-300"
                  }`}
                >
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="text-xs font-medium">{model.name}</span>
                    <span class="text-[10px] text-gray-600">{model.provider}</span>
                  </div>
                  <Show when={model.badge}>
                    <span
                      class="rounded-full px-2 py-0.5 text-[9px] font-semibold"
                      style={{
                        background: model.tier === "client" ? "#10b98115" : model.tier === "edge" ? "#3b82f615" : "#a78bfa15",
                        color: model.tier === "client" ? "#10b981" : model.tier === "edge" ? "#3b82f6" : "#a78bfa",
                      }}
                    >
                      {model.badge}
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Parameters */}
        <div class="border-b border-white/[0.06] px-5 py-4">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Parameters</span>
          <div class="mt-3 flex flex-col gap-4">
            {/* Temperature */}
            <div>
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs text-gray-400">Temperature</span>
                <span class="rounded bg-white/[0.05] px-2 py-0.5 text-[11px] font-mono text-gray-400">{temperature().toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature()}
                onInput={(e) => setTemperature(parseFloat(e.currentTarget.value))}
                class="w-full accent-blue-500"
                style={{ height: "4px" }}
              />
            </div>
            {/* Max Tokens */}
            <div>
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs text-gray-400">Max Tokens</span>
                <span class="rounded bg-white/[0.05] px-2 py-0.5 text-[11px] font-mono text-gray-400">{maxTokens()}</span>
              </div>
              <input
                type="range"
                min="256"
                max="8192"
                step="256"
                value={maxTokens()}
                onInput={(e) => setMaxTokens(parseInt(e.currentTarget.value, 10))}
                class="w-full accent-blue-500"
                style={{ height: "4px" }}
              />
            </div>
          </div>
        </div>

        {/* Performance Stats */}
        <div class="mt-auto border-t border-white/[0.06] px-5 py-4">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Session Stats</span>
          <div class="mt-3 grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] text-gray-600">Tokens/sec</span>
              <span class="text-lg font-bold text-emerald-400">{tokensPerSec().toFixed(1)}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] text-gray-600">Total Tokens</span>
              <span class="text-lg font-bold text-blue-400">{totalTokens().toLocaleString()}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] text-gray-600">Session Cost</span>
              <span class="text-lg font-bold text-emerald-400">{sessionCost()}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class="text-[10px] text-gray-600">Model</span>
              <span class="truncate text-xs font-medium text-gray-400">{currentModel().name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Center - Chat Interface */}
      <div class="flex flex-1 flex-col overflow-hidden">
        {/* Chat Header */}
        <div class="flex items-center justify-between border-b border-white/[0.06] bg-[#08080c] px-6 py-3">
          <div class="flex items-center gap-3">
            <span class="text-sm font-semibold text-white">Chat</span>
            <TierBadge tier={currentModel().tier} />
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCodePanel(!showCodePanel())}
              class={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${
                showCodePanel()
                  ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
                  : "border-white/[0.06] bg-white/[0.03] text-gray-400 hover:text-white"
              }`}
            >
              Code Preview
            </button>
            <button
              type="button"
              onClick={() => { setMessages(INITIAL_MESSAGES); setTotalTokens(0); }}
              class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-gray-400 transition-all hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Messages */}
        <div class="flex-1 overflow-y-auto px-6 py-6">
          <div class="mx-auto flex max-w-3xl flex-col gap-6">
            <For each={messages()}>
              {(msg) => <ChatBubble message={msg} />}
            </For>

            {/* Generating indicator */}
            <Show when={isGenerating()}>
              <div class="flex gap-3">
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                  style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }}
                >
                  AI
                </div>
                <div class="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3">
                  <div class="flex items-center gap-1.5">
                    <div class="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                    <div class="h-2 w-2 animate-pulse rounded-full bg-blue-400" style={{ "animation-delay": "0.2s" }} />
                    <div class="h-2 w-2 animate-pulse rounded-full bg-blue-400" style={{ "animation-delay": "0.4s" }} />
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </div>

        {/* Input Area */}
        <div class="border-t border-white/[0.06] bg-[#08080c] px-6 py-4">
          <div class="mx-auto max-w-3xl">
            <div class="flex items-end gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2 transition-all duration-200 focus-within:border-blue-500/30 focus-within:shadow-lg focus-within:shadow-blue-500/5">
              <textarea
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you want to build..."
                rows={1}
                class="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none"
                style={{ "max-height": "120px" }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input().trim() || isGenerating()}
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:shadow-blue-500/40 hover:brightness-110 disabled:opacity-30 disabled:shadow-none"
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
                Powered by {currentModel().name} on {currentModel().tier === "client" ? "your GPU" : currentModel().tier === "edge" ? "edge network" : "cloud"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Code Preview */}
      <Show when={showCodePanel()}>
        <div
          class="flex w-96 shrink-0 flex-col border-l border-white/[0.06]"
          style={{ background: "linear-gradient(180deg, rgba(10,10,14,1) 0%, rgba(6,6,10,1) 100%)" }}
        >
          <div class="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-white">Code Preview</span>
              <span class="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase text-violet-400">Live</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(SAMPLE_CODE);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-gray-400 transition-all hover:text-white"
              >
                {codeCopied() ? "Copied!" : "Copy"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInput((prev) => prev + (prev ? "\n" : "") + SAMPLE_CODE);
                  setCodeInserted(true);
                  setTimeout(() => setCodeInserted(false), 2000);
                }}
                class="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-gray-400 transition-all hover:text-white"
              >
                {codeInserted() ? "Inserted!" : "Insert"}
              </button>
            </div>
          </div>

          {/* File Tab */}
          <div class="flex border-b border-white/[0.06]">
            <div class="flex items-center gap-2 border-b-2 border-blue-500 bg-white/[0.02] px-4 py-2.5">
              <span class="text-[10px] text-blue-400">&#128196;</span>
              <span class="text-[11px] font-medium text-gray-300">Hero.tsx</span>
            </div>
            <div class="flex items-center gap-2 px-4 py-2.5">
              <span class="text-[10px] text-gray-600">&#128196;</span>
              <span class="text-[11px] text-gray-600">styles.css</span>
            </div>
          </div>

          {/* Code Content */}
          <div class="flex-1 overflow-auto p-4">
            <pre class="text-xs leading-6" style={{ "tab-size": "2" }}>
              <code>
                <For each={SAMPLE_CODE.split("\n")}>
                  {(line, i) => (
                    <div class="flex">
                      <span class="mr-4 inline-block w-6 text-right text-gray-700 select-none">{i() + 1}</span>
                      <span class="text-gray-300" style={{ "white-space": "pre" }}>{line}</span>
                    </div>
                  )}
                </For>
              </code>
            </pre>
          </div>

          {/* Code Stats */}
          <div class="border-t border-white/[0.06] px-5 py-3">
            <div class="flex items-center justify-between text-[10px] text-gray-600">
              <span>TypeScript JSX</span>
              <span>{SAMPLE_CODE.split("\n").length} lines</span>
              <span>UTF-8</span>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
