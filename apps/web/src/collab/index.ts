// ── Collaboration Module ─────────────────────────────────────────────
// Re-exports all collaboration primitives for convenient imports.

export { createCollabSession, destroyCollabSession } from "./yjs-provider";
export type { CollabSession } from "./yjs-provider";

export { useCollab } from "./use-collab";
export type { AwarenessUser } from "./use-collab";
