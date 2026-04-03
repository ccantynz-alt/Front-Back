import * as Y from "yjs";
import { z } from "zod";

// ── Document Change Event Schema ─────────────────────────────────

export const DocumentChangeEvent = z.object({
  /** The Y.Doc transaction origin (identifies who/what made the change) */
  origin: z.unknown(),
  /** Whether this update came from a local operation */
  isLocal: z.boolean(),
});

export type DocumentChangeEvent = z.infer<typeof DocumentChangeEvent>;

// ── CronixDocument ───────────────────────────────────────────────

/**
 * CronixDocument wraps a Yjs Y.Doc with typed access patterns and
 * lifecycle management.
 *
 * It provides a clean API for accessing shared types (text, maps, arrays,
 * XML fragments) and observing deep changes across the entire document.
 *
 * Every collaborative editing session operates on a CronixDocument.
 * The document is synced between peers via the WebSocket provider.
 */
export class CronixDocument {
  /** The underlying Yjs document */
  readonly ydoc: Y.Doc;

  /** Unique client ID assigned to this document instance */
  readonly clientId: number;

  private changeListeners: Set<
    (update: Uint8Array, origin: unknown, doc: Y.Doc) => void
  > = new Set();

  private deepObservers: Set<
    (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) => void
  > = new Set();

  private destroyed = false;

  constructor(options?: { clientId?: number; gc?: boolean }) {
    this.ydoc = new Y.Doc({
      gc: options?.gc ?? true,
    });
    if (options?.clientId !== undefined) {
      this.ydoc.clientID = options.clientId;
    }
    this.clientId = this.ydoc.clientID;
  }

  // ── Shared Type Accessors ────────────────────────────────────

  /**
   * Returns a shared Y.Text instance by name.
   * Used for collaborative rich text editing.
   */
  getText(name: string): Y.Text {
    return this.ydoc.getText(name);
  }

  /**
   * Returns a shared Y.Map instance by name.
   * Used for collaborative key-value data (component props, settings, etc.)
   */
  getMap<T extends Record<string, unknown> = Record<string, unknown>>(name: string): Y.Map<T[keyof T]> {
    return this.ydoc.getMap<T[keyof T]>(name);
  }

  /**
   * Returns a shared Y.Array instance by name.
   * Used for collaborative ordered lists (layers, timeline items, etc.)
   */
  getArray<T = unknown>(name: string): Y.Array<T> {
    return this.ydoc.getArray<T>(name);
  }

  /**
   * Returns a shared Y.XmlFragment instance by name.
   * Used for collaborative structured document editing (ProseMirror/Tiptap).
   */
  getXmlFragment(name: string): Y.XmlFragment {
    return this.ydoc.getXmlFragment(name);
  }

  // ── Observation ──────────────────────────────────────────────

  /**
   * Registers a callback that fires on every document update.
   * The callback receives the binary update, the origin, and the doc.
   * Returns an unsubscribe function.
   */
  onChange(
    callback: (update: Uint8Array, origin: unknown, doc: Y.Doc) => void,
  ): () => void {
    this.changeListeners.add(callback);

    // If this is the first listener, attach the Yjs observer
    if (this.changeListeners.size === 1) {
      this.ydoc.on("update", this.handleUpdate);
    }

    return (): void => {
      this.changeListeners.delete(callback);
      if (this.changeListeners.size === 0) {
        this.ydoc.off("update", this.handleUpdate);
      }
    };
  }

  /**
   * Registers a deep observer on a named shared type.
   * Fires whenever any nested change occurs within that type.
   * Returns an unsubscribe function.
   */
  onDeepObserve(
    typeName: string,
    callback: (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) => void,
  ): () => void {
    const sharedType = this.ydoc.get(typeName);
    this.deepObservers.add(callback);
    sharedType.observeDeep(callback);

    return (): void => {
      this.deepObservers.delete(callback);
      sharedType.unobserveDeep(callback);
    };
  }

  // ── Transactions ─────────────────────────────────────────────

  /**
   * Executes a function within a single Yjs transaction.
   * All changes within the function are batched into one update.
   */
  transact(fn: () => void, origin?: unknown): void {
    this.ydoc.transact(fn, origin);
  }

  // ── Serialization ────────────────────────────────────────────

  /**
   * Returns a JSON snapshot of all shared types in the document.
   * Useful for debugging and persistence.
   */
  toJSON(): Record<string, unknown> {
    return this.ydoc.toJSON() as Record<string, unknown>;
  }

  /**
   * Encodes the full document state as a binary Uint8Array.
   * Used for persistence and initial sync.
   */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.ydoc);
  }

  /**
   * Encodes the document's state vector.
   * Used during sync to determine which updates a peer needs.
   */
  encodeStateVector(): Uint8Array {
    return Y.encodeStateVector(this.ydoc);
  }

  /**
   * Applies a binary update to this document.
   * Used when receiving updates from peers or loading persisted state.
   */
  applyUpdate(update: Uint8Array, origin?: unknown): void {
    Y.applyUpdate(this.ydoc, update, origin);
  }

  // ── Lifecycle ────────────────────────────────────────────────

  /**
   * Returns whether this document has been destroyed.
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Destroys the document, releasing all resources and listeners.
   * After calling destroy(), the document must not be used.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Remove update listener
    this.ydoc.off("update", this.handleUpdate);
    this.changeListeners.clear();
    this.deepObservers.clear();

    // Destroy the underlying Yjs doc
    this.ydoc.destroy();
  }

  // ── Internal ─────────────────────────────────────────────────

  private handleUpdate = (update: Uint8Array, origin: unknown, doc: Y.Doc): void => {
    for (const listener of this.changeListeners) {
      listener(update, origin, doc);
    }
  };
}
