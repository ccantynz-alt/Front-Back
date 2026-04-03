import { z } from "zod";
import { generateColor } from "./utils";

// ── Awareness Schemas ────────────────────────────────────────────

export const CursorPosition = z.object({
  /** X coordinate relative to the editing container */
  x: z.number(),
  /** Y coordinate relative to the editing container */
  y: z.number(),
  /** Optional element path or identifier the cursor is within */
  target: z.string().optional(),
});

export type CursorPosition = z.infer<typeof CursorPosition>;

export const SelectionRange = z.object({
  /** Anchor position (where the selection started) */
  anchor: z.number(),
  /** Head position (where the selection ends) */
  head: z.number(),
  /** Optional identifier for which shared type the selection is in */
  target: z.string().optional(),
});

export type SelectionRange = z.infer<typeof SelectionRange>;

export const UserAwareness = z.object({
  /** Unique user ID */
  userId: z.string(),
  /** Human-readable display name */
  displayName: z.string(),
  /** Hex color assigned for this user's cursor/highlights */
  color: z.string(),
  /** Current cursor position (null when not actively pointing) */
  cursor: CursorPosition.nullable().optional(),
  /** Current text selection (null when nothing selected) */
  selection: SelectionRange.nullable().optional(),
  /** Whether this participant is an AI agent */
  isAI: z.boolean().default(false),
});

export type UserAwareness = z.infer<typeof UserAwareness>;

// ── Awareness State Manager ──────────────────────────────────────

/**
 * Manages awareness state for a Yjs collaboration session.
 *
 * Awareness tracks ephemeral information about connected peers:
 * cursor positions, selections, user identity, and AI participant status.
 * This data is NOT persisted — it exists only while connections are live.
 *
 * This is a lightweight in-memory implementation that works alongside
 * the y-protocols awareness protocol over WebSocket.
 */
export class AwarenessManager {
  private states: Map<number, UserAwareness> = new Map();
  private listeners: Set<(states: Map<number, UserAwareness>, event: AwarenessChangeEvent) => void> =
    new Set();
  private localClientId: number;
  private colorIndex = 0;

  constructor(localClientId: number) {
    this.localClientId = localClientId;
  }

  /**
   * Sets the local user's awareness state.
   * Broadcasts to all listeners.
   */
  setLocalState(state: Omit<UserAwareness, "color"> & { color?: string }): void {
    const color = state.color ?? generateColor(this.localClientId);
    const validated = UserAwareness.parse({ ...state, color });
    this.states.set(this.localClientId, validated);
    this.notifyListeners({
      added: [],
      updated: [this.localClientId],
      removed: [],
    });
  }

  /**
   * Updates a specific field of the local awareness state.
   */
  updateLocalField<K extends keyof UserAwareness>(field: K, value: UserAwareness[K]): void {
    const current = this.states.get(this.localClientId);
    if (!current) return;
    const updated = { ...current, [field]: value };
    this.states.set(this.localClientId, updated);
    this.notifyListeners({
      added: [],
      updated: [this.localClientId],
      removed: [],
    });
  }

  /**
   * Sets a remote user's awareness state (called when receiving awareness messages).
   */
  setRemoteState(clientId: number, state: UserAwareness): void {
    const isNew = !this.states.has(clientId);
    this.states.set(clientId, state);
    this.notifyListeners({
      added: isNew ? [clientId] : [],
      updated: isNew ? [] : [clientId],
      removed: [],
    });
  }

  /**
   * Removes a remote user's awareness state (called on disconnect).
   */
  removeState(clientId: number): void {
    if (this.states.has(clientId)) {
      this.states.delete(clientId);
      this.notifyListeners({
        added: [],
        updated: [],
        removed: [clientId],
      });
    }
  }

  /**
   * Returns the awareness state for all connected users.
   */
  getStates(): Map<number, UserAwareness> {
    return new Map(this.states);
  }

  /**
   * Returns the local user's awareness state, if set.
   */
  getLocalState(): UserAwareness | undefined {
    return this.states.get(this.localClientId);
  }

  /**
   * Returns the local client ID.
   */
  getLocalClientId(): number {
    return this.localClientId;
  }

  /**
   * Assigns a color from the palette. Used for auto-assigning colors
   * to new participants.
   */
  assignColor(): string {
    const color = generateColor(this.colorIndex);
    this.colorIndex += 1;
    return color;
  }

  /**
   * Registers a callback that fires whenever any awareness state changes.
   * Returns an unsubscribe function.
   */
  onAwarenessChange(
    callback: (states: Map<number, UserAwareness>, event: AwarenessChangeEvent) => void,
  ): () => void {
    this.listeners.add(callback);
    return (): void => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Clears all state and listeners.
   */
  destroy(): void {
    this.states.clear();
    this.listeners.clear();
  }

  private notifyListeners(event: AwarenessChangeEvent): void {
    const snapshot = this.getStates();
    for (const listener of this.listeners) {
      listener(snapshot, event);
    }
  }
}

// ── Event Types ──────────────────────────────────────────────────

export interface AwarenessChangeEvent {
  /** Client IDs that were newly added */
  added: number[];
  /** Client IDs whose state was updated */
  updated: number[];
  /** Client IDs that were removed */
  removed: number[];
}
