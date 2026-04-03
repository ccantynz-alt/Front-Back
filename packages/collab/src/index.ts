// ── @cronix/collab — Real-Time Collaboration Engine ─────────────
//
// Re-exports everything for clean consumption:
//   import { CronixDocument, AwarenessManager, CollabProvider, AICollaborator } from "@cronix/collab";

// Document
export { CronixDocument, DocumentChangeEvent } from "./document";

// Awareness
export {
  AwarenessManager,
  CursorPosition,
  SelectionRange,
  UserAwareness,
  type AwarenessChangeEvent,
} from "./awareness";

// WebSocket Provider
export { CollabProvider, type CollabProviderOptions, type CollabConnectionStatus } from "./provider";

// AI Participant
export { AICollaborator, type AICollaboratorOptions } from "./ai-participant";

// Utilities
export {
  generateColor,
  encodeState,
  decodeState,
  mergeUpdates,
  encodeStateVector,
  encodeStateAsUpdate,
  MessageType,
  createEncoder,
  createDecoder,
  toUint8Array,
} from "./utils";
