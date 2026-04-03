// ── Stores Barrel Export ─────────────────────────────────────────────
// Re-exports all store hooks, providers, and types from a single entry point.

// Auth (context provider pattern)
export { AuthProvider, useAuth } from "./auth";

// Theme (context provider pattern)
export { ThemeProvider, useTheme } from "./theme";

// Realtime (context provider pattern)
export { RealtimeProvider, useRealtime } from "./realtime";

// Chat (module-level signals)
export { chatStore, useChat } from "./chat";
export type { ChatMessage, ChatStore, GeneratedUIConfig } from "./chat";

// GPU (module-level signals)
export { useGPU } from "./gpu";
export type { GPUStore } from "./gpu";

// Offline (module-level signals + component)
export { useOffline, OfflineIndicator, isOnline, pendingActions } from "./offline";
export type { OfflineState, OfflineIndicatorProps } from "./offline";

// Collab (factory pattern)
export { createCollabStore } from "./collab";

// UI (module-level signals)
export { uiStore, useUI } from "./ui";
export type {
  UIStore,
  ThemePreference,
  ResolvedTheme,
  Breakpoint,
  ModalEntry,
  Toast,
  ToastVariant,
} from "./ui";

// Projects (module-level signals + createResource)
export { projectsStore, useProjects } from "./projects";
export type {
  ProjectsStore,
  Project,
  ProjectDetail,
  ProjectPage,
  ProjectSettings,
} from "./projects";

// AI (module-level signals)
export { aiStore, useAI } from "./ai";
export type {
  AIStore,
  ComputeTier,
  ConversationMessage,
  ConversationState,
  ConversationStatus,
  ClientGPUCapabilities,
  ModelInfo,
  TokenUsage,
  AgentTask,
  AgentTaskStatus,
} from "./ai";

// Billing (module-level signals + createResource)
export { billingStore, useBilling } from "./billing";
export type {
  BillingStore,
  Plan,
  PlanTier,
  UsageStats,
  SubscriptionInfo,
  SubscriptionStatus,
  FeatureLimits,
} from "./billing";

// Editor (module-level signals)
export { editorStore, useEditor } from "./editor";
export type {
  EditorStore,
  ComponentNode,
  CanvasTransform,
  DragState,
  DragOperation,
  HistoryEntry,
  SelectionRect,
} from "./editor";

// Feature Flags (module-level signals + createResource)
export { flagsStore, useFlags } from "./flags";
export type {
  FlagsStore,
  FlagValue,
  FlagDefinition,
} from "./flags";
