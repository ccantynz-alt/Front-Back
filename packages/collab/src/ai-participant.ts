import * as Y from "yjs";
import { CronixDocument } from "./document";
import { AwarenessManager } from "./awareness";
import { generateColor } from "./utils";

// ── Types ───────────────────────────────────────────────────────

export interface AICollaboratorOptions {
  /** Unique ID for this AI agent */
  agentId: string;
  /** Display name shown in the collaboration UI */
  displayName: string;
  /** The CronixDocument this agent participates in */
  document: CronixDocument;
  /** The AwarenessManager to register presence with */
  awareness: AwarenessManager;
  /** Optional hex color override (auto-assigned if omitted) */
  color?: string;
}

// ── AICollaborator ──────────────────────────────────────────────

/**
 * Represents an AI agent participating in a real-time collaboration session
 * as a first-class peer.
 *
 * The AI collaborator:
 * - Registers in the awareness system with isAI=true
 * - Can read and write to any shared type in the document
 * - All edits flow through CRDTs so they merge cleanly with human edits
 * - Appears in the peer list with a cursor, selection, and display name
 *
 * Usage:
 * ```ts
 * const ai = new AICollaborator({
 *   agentId: "builder-agent-1",
 *   displayName: "Cronix Builder",
 *   document: cronixDoc,
 *   awareness: awarenessManager,
 * });
 *
 * ai.insertText("content", 0, "Hello from AI!");
 * ai.updateMap("settings", "theme", "dark");
 * ```
 */
export class AICollaborator {
  readonly agentId: string;
  readonly displayName: string;
  readonly color: string;
  readonly document: CronixDocument;
  readonly awareness: AwarenessManager;

  private destroyed = false;

  constructor(options: AICollaboratorOptions) {
    this.agentId = options.agentId;
    this.displayName = options.displayName;
    this.document = options.document;
    this.awareness = options.awareness;
    this.color = options.color ?? generateColor(hashString(options.agentId));

    // Register as an awareness participant with isAI=true
    this.awareness.setLocalState({
      userId: this.agentId,
      displayName: this.displayName,
      color: this.color,
      cursor: null,
      selection: null,
      isAI: true,
    });
  }

  // ── Text Operations ─────────────────────────────────────────

  /**
   * Inserts text into a named Y.Text at the given index.
   */
  insertText(name: string, index: number, content: string): void {
    this.assertNotDestroyed();
    const text = this.document.getText(name);
    this.document.transact(() => {
      text.insert(index, content);
    }, this.agentId);
  }

  /**
   * Deletes characters from a named Y.Text starting at the given index.
   */
  deleteText(name: string, index: number, length: number): void {
    this.assertNotDestroyed();
    const text = this.document.getText(name);
    this.document.transact(() => {
      text.delete(index, length);
    }, this.agentId);
  }

  /**
   * Replaces a range of text in a named Y.Text.
   */
  replaceText(name: string, index: number, length: number, content: string): void {
    this.assertNotDestroyed();
    const text = this.document.getText(name);
    this.document.transact(() => {
      text.delete(index, length);
      text.insert(index, content);
    }, this.agentId);
  }

  /**
   * Formats a range of text in a named Y.Text with attributes.
   */
  formatText(
    name: string,
    index: number,
    length: number,
    attributes: Record<string, unknown>,
  ): void {
    this.assertNotDestroyed();
    const text = this.document.getText(name);
    this.document.transact(() => {
      text.format(index, length, attributes);
    }, this.agentId);
  }

  // ── Map Operations ──────────────────────────────────────────

  /**
   * Sets a key-value pair in a named Y.Map.
   */
  updateMap<T>(name: string, key: string, value: T): void {
    this.assertNotDestroyed();
    const map = this.document.getMap(name);
    this.document.transact(() => {
      map.set(key, value as Record<string, unknown>[keyof Record<string, unknown>]);
    }, this.agentId);
  }

  /**
   * Deletes a key from a named Y.Map.
   */
  deleteMapKey(name: string, key: string): void {
    this.assertNotDestroyed();
    const map = this.document.getMap(name);
    this.document.transact(() => {
      map.delete(key);
    }, this.agentId);
  }

  /**
   * Gets a value from a named Y.Map.
   */
  getMapValue<T>(name: string, key: string): T | undefined {
    this.assertNotDestroyed();
    const map = this.document.getMap(name);
    return map.get(key) as T | undefined;
  }

  // ── Array Operations ────────────────────────────────────────

  /**
   * Inserts items into a named Y.Array at the given index.
   */
  insertArray<T>(name: string, index: number, items: T[]): void {
    this.assertNotDestroyed();
    const array = this.document.getArray<T>(name);
    this.document.transact(() => {
      array.insert(index, items);
    }, this.agentId);
  }

  /**
   * Pushes items to the end of a named Y.Array.
   */
  pushArray<T>(name: string, items: T[]): void {
    this.assertNotDestroyed();
    const array = this.document.getArray<T>(name);
    this.document.transact(() => {
      array.push(items);
    }, this.agentId);
  }

  /**
   * Deletes items from a named Y.Array.
   */
  deleteArray(name: string, index: number, length: number): void {
    this.assertNotDestroyed();
    const array = this.document.getArray(name);
    this.document.transact(() => {
      array.delete(index, length);
    }, this.agentId);
  }

  /**
   * Gets an item from a named Y.Array.
   */
  getArrayItem<T>(name: string, index: number): T {
    this.assertNotDestroyed();
    const array = this.document.getArray<T>(name);
    return array.get(index);
  }

  // ── Generic Edit ────────────────────────────────────────────

  /**
   * Applies an arbitrary edit within a transaction.
   * The callback receives the Y.Doc for direct manipulation.
   */
  applyEdit(fn: (doc: Y.Doc) => void): void {
    this.assertNotDestroyed();
    this.document.transact(() => {
      fn(this.document.ydoc);
    }, this.agentId);
  }

  // ── Awareness / Cursor ──────────────────────────────────────

  /**
   * Updates the AI agent's cursor position.
   */
  setCursor(x: number, y: number, target?: string): void {
    this.assertNotDestroyed();
    this.awareness.updateLocalField("cursor", { x, y, target });
  }

  /**
   * Updates the AI agent's text selection.
   */
  setSelection(anchor: number, head: number, target?: string): void {
    this.assertNotDestroyed();
    this.awareness.updateLocalField("selection", { anchor, head, target });
  }

  /**
   * Clears the AI agent's cursor and selection.
   */
  clearPresence(): void {
    this.assertNotDestroyed();
    this.awareness.updateLocalField("cursor", null);
    this.awareness.updateLocalField("selection", null);
  }

  // ── Lifecycle ───────────────────────────────────────────────

  /**
   * Returns whether this collaborator has been destroyed.
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Destroys the AI collaborator, removing it from awareness.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.awareness.removeState(this.awareness.getLocalClientId());
  }

  // ── Internal ────────────────────────────────────────────────

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`AICollaborator "${this.agentId}" has been destroyed`);
    }
  }
}

/**
 * Simple string hash for deterministic color assignment.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}
