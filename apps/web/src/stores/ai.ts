// ── AI State Store ───────────────────────────────────────────────────
// Reactive AI state: conversations, streaming, compute tier detection,
// model availability, token usage, and agent task queue.
// Uses module-level signals for global reactive state.

import { type Accessor, createSignal } from "solid-js";
import { isServer } from "solid-js/web";

// ── Types ────────────────────────────────────────────────────────────

export type ComputeTier = "client" | "edge" | "cloud";
export type ConversationStatus = "idle" | "streaming" | "error" | "complete";
export type AgentTaskStatus = "queued" | "running" | "complete" | "failed" | "cancelled";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationState {
  id: string;
  messages: ConversationMessage[];
  status: ConversationStatus;
  currentStreamText: string;
  model: string;
  tier: ComputeTier;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClientGPUCapabilities {
  webgpuAvailable: boolean;
  estimatedVRAM: number;
  maxModelParams: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  params: string;
  loaded: boolean;
  tier: ComputeTier;
  capabilities: string[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  periodStart: number;
}

export interface AgentTask {
  id: string;
  agentId: string;
  description: string;
  status: AgentTaskStatus;
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AIStore {
  /** All active conversations keyed by id */
  conversations: Accessor<ReadonlyMap<string, ConversationState>>;
  /** Currently focused conversation id */
  activeConversationId: Accessor<string | null>;
  /** Active conversation (derived) */
  activeConversation: Accessor<ConversationState | null>;
  /** Client GPU capabilities */
  clientGPU: Accessor<ClientGPUCapabilities>;
  /** Available models across all tiers */
  availableModels: Accessor<readonly ModelInfo[]>;
  /** Token usage for current billing period */
  tokenUsage: Accessor<TokenUsage>;
  /** Agent task queue */
  agentTasks: Accessor<readonly AgentTask[]>;
  /** Number of active streaming conversations */
  activeStreamCount: Accessor<number>;
  /** Create a new conversation */
  createConversation: (model?: string) => string;
  /** Set the active conversation */
  setActiveConversation: (id: string | null) => void;
  /** Add a message to a conversation */
  addMessage: (conversationId: string, message: Omit<ConversationMessage, "id" | "timestamp">) => void;
  /** Start streaming for a conversation */
  startStreaming: (conversationId: string) => void;
  /** Append streamed text to current conversation */
  appendStreamText: (conversationId: string, chunk: string) => void;
  /** Complete streaming for a conversation */
  completeStreaming: (conversationId: string) => void;
  /** Set error on a conversation */
  setConversationError: (conversationId: string, error: string) => void;
  /** Delete a conversation */
  deleteConversation: (conversationId: string) => void;
  /** Clear all conversations */
  clearAllConversations: () => void;
  /** Update client GPU capabilities */
  setClientGPU: (capabilities: ClientGPUCapabilities) => void;
  /** Register an available model */
  registerModel: (model: ModelInfo) => void;
  /** Mark a model as loaded */
  setModelLoaded: (modelId: string, loaded: boolean) => void;
  /** Add token usage */
  addTokenUsage: (prompt: number, completion: number, cost: number) => void;
  /** Reset token usage (new billing period) */
  resetTokenUsage: () => void;
  /** Queue an agent task */
  queueAgentTask: (task: Omit<AgentTask, "id" | "status" | "progress" | "createdAt" | "updatedAt">) => string;
  /** Update agent task status */
  updateAgentTask: (taskId: string, updates: Partial<Pick<AgentTask, "status" | "progress" | "result" | "error">>) => void;
  /** Remove completed/failed tasks */
  clearCompletedTasks: () => void;
  /** Determine best compute tier for a model */
  recommendTier: (modelParams: number) => ComputeTier;
}

// ── Helpers ──────────────────────────────────────────────────────────

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

// ── Signals ──────────────────────────────────────────────────────────

const [conversations, setConversations] = createSignal<ReadonlyMap<string, ConversationState>>(
  new Map(),
);
const [activeConversationId, setActiveConversationId] = createSignal<string | null>(null);

const [clientGPU, setClientGPU] = createSignal<ClientGPUCapabilities>({
  webgpuAvailable: false,
  estimatedVRAM: 0,
  maxModelParams: 0,
});

const [availableModels, setAvailableModels] = createSignal<readonly ModelInfo[]>([]);

const [tokenUsage, setTokenUsage] = createSignal<TokenUsage>({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCost: 0,
  periodStart: Date.now(),
});

const [agentTasks, setAgentTasks] = createSignal<readonly AgentTask[]>([]);

// ── Derived Signals ──────────────────────────────────────────────────

const activeConversation: Accessor<ConversationState | null> = (): ConversationState | null => {
  const id = activeConversationId();
  if (!id) return null;
  return conversations().get(id) ?? null;
};

const activeStreamCount: Accessor<number> = (): number => {
  let count = 0;
  for (const [, conv] of conversations()) {
    if (conv.status === "streaming") count += 1;
  }
  return count;
};

// ── Conversation Actions ─────────────────────────────────────────────

function createConversation(model?: string): string {
  const id = nextId("conv");
  const conversation: ConversationState = {
    id,
    messages: [],
    status: "idle",
    currentStreamText: "",
    model: model ?? "auto",
    tier: "edge",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  setConversations((prev) => {
    const next = new Map(prev);
    next.set(id, conversation);
    return next;
  });

  setActiveConversationId(id);
  return id;
}

function setActiveConversation(id: string | null): void {
  setActiveConversationId(id);
}

function updateConversation(
  conversationId: string,
  updater: (conv: ConversationState) => ConversationState,
): void {
  setConversations((prev) => {
    const existing = prev.get(conversationId);
    if (!existing) return prev;
    const next = new Map(prev);
    next.set(conversationId, updater(existing));
    return next;
  });
}

function addMessage(
  conversationId: string,
  message: Omit<ConversationMessage, "id" | "timestamp">,
): void {
  const msg: ConversationMessage = {
    ...message,
    id: nextId("msg"),
    timestamp: Date.now(),
  };

  updateConversation(conversationId, (conv) => ({
    ...conv,
    messages: [...conv.messages, msg],
    updatedAt: Date.now(),
  }));
}

function startStreaming(conversationId: string): void {
  updateConversation(conversationId, (conv) => ({
    ...conv,
    status: "streaming",
    currentStreamText: "",
    error: undefined,
    updatedAt: Date.now(),
  }));
}

function appendStreamText(conversationId: string, chunk: string): void {
  updateConversation(conversationId, (conv) => ({
    ...conv,
    currentStreamText: conv.currentStreamText + chunk,
    updatedAt: Date.now(),
  }));
}

function completeStreaming(conversationId: string): void {
  updateConversation(conversationId, (conv) => {
    // Move streamed text into a message
    const assistantMessage: ConversationMessage = {
      id: nextId("msg"),
      role: "assistant",
      content: conv.currentStreamText,
      timestamp: Date.now(),
    };
    return {
      ...conv,
      messages: [...conv.messages, assistantMessage],
      status: "complete",
      currentStreamText: "",
      updatedAt: Date.now(),
    };
  });
}

function setConversationError(conversationId: string, error: string): void {
  updateConversation(conversationId, (conv) => ({
    ...conv,
    status: "error",
    error,
    updatedAt: Date.now(),
  }));
}

function deleteConversation(conversationId: string): void {
  setConversations((prev) => {
    const next = new Map(prev);
    next.delete(conversationId);
    return next;
  });
  if (activeConversationId() === conversationId) {
    setActiveConversationId(null);
  }
}

function clearAllConversations(): void {
  setConversations(new Map());
  setActiveConversationId(null);
}

// ── Model & GPU Actions ──────────────────────────────────────────────

function setClientGPUCapabilities(capabilities: ClientGPUCapabilities): void {
  setClientGPU(capabilities);
}

function registerModel(model: ModelInfo): void {
  setAvailableModels((prev) => {
    const filtered = prev.filter((m) => m.id !== model.id);
    return [...filtered, model];
  });
}

function setModelLoaded(modelId: string, loaded: boolean): void {
  setAvailableModels((prev) =>
    prev.map((m) => (m.id === modelId ? { ...m, loaded } : m)),
  );
}

function recommendTier(modelParams: number): ComputeTier {
  const gpu = clientGPU();
  // Client can handle models if GPU available and model fits in VRAM
  if (gpu.webgpuAvailable && modelParams <= gpu.maxModelParams) {
    return "client";
  }
  // Edge handles mid-range models (up to ~7B equivalent)
  if (modelParams <= 7_000_000_000) {
    return "edge";
  }
  // Everything else goes to cloud
  return "cloud";
}

// ── Token Usage Actions ──────────────────────────────────────────────

function addTokenUsage(prompt: number, completion: number, cost: number): void {
  setTokenUsage((prev) => ({
    ...prev,
    promptTokens: prev.promptTokens + prompt,
    completionTokens: prev.completionTokens + completion,
    totalTokens: prev.totalTokens + prompt + completion,
    estimatedCost: prev.estimatedCost + cost,
  }));
}

function resetTokenUsage(): void {
  setTokenUsage({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
    periodStart: Date.now(),
  });
}

// ── Agent Task Actions ───────────────────────────────────────────────

function queueAgentTask(
  task: Omit<AgentTask, "id" | "status" | "progress" | "createdAt" | "updatedAt">,
): string {
  const id = nextId("task");
  const entry: AgentTask = {
    ...task,
    id,
    status: "queued",
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  setAgentTasks((prev) => [...prev, entry]);
  return id;
}

function updateAgentTask(
  taskId: string,
  updates: Partial<Pick<AgentTask, "status" | "progress" | "result" | "error">>,
): void {
  setAgentTasks((prev) =>
    prev.map((t) =>
      t.id === taskId ? { ...t, ...updates, updatedAt: Date.now() } : t,
    ),
  );
}

function clearCompletedTasks(): void {
  setAgentTasks((prev) =>
    prev.filter((t) => t.status !== "complete" && t.status !== "failed" && t.status !== "cancelled"),
  );
}

// ── Exported Store ───────────────────────────────────────────────────

export const aiStore: AIStore = {
  conversations,
  activeConversationId,
  activeConversation,
  clientGPU,
  availableModels,
  tokenUsage,
  agentTasks,
  activeStreamCount,
  createConversation,
  setActiveConversation,
  addMessage,
  startStreaming,
  appendStreamText,
  completeStreaming,
  setConversationError,
  deleteConversation,
  clearAllConversations,
  setClientGPU: setClientGPUCapabilities,
  registerModel,
  setModelLoaded,
  addTokenUsage,
  resetTokenUsage,
  queueAgentTask,
  updateAgentTask,
  clearCompletedTasks,
  recommendTier,
};

export function useAI(): AIStore {
  return aiStore;
}
