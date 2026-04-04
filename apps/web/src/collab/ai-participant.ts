// ── AI Agent as Collaboration Participant ────────────────────────────
// AI agents participate in real-time editing sessions as first-class
// collaborators. They hold cursors, make selections, and edit alongside
// human users via the same Yjs CRDT primitives.

import * as Y from "yjs";
import type { CollabRoom, CollabUser } from "./yjs-provider";
import {
  getSharedText,
  getSharedMap,
  updateCursorPosition,
} from "./yjs-provider";

// ── Types ────────────────────────────────────────────────────────────

export interface AIParticipantConfig {
  /** AI agent identity */
  agent: CollabUser;
  /** The collaboration room to join */
  room: CollabRoom;
  /** Callback to generate AI content based on current state */
  onGenerateContent?: (context: AIEditContext) => Promise<string>;
}

export interface AIEditContext {
  /** Current full text of the shared document */
  currentText: string;
  /** The specific section the AI is editing */
  editRange?: { start: number; end: number };
  /** Instruction from a human collaborator */
  instruction?: string;
}

export interface AIParticipant {
  /** Insert text at a position in the shared document */
  insertText(text: string, position: number, field?: string): void;
  /** Delete text in the shared document */
  deleteText(position: number, length: number, field?: string): void;
  /** Replace a range of text */
  replaceText(start: number, end: number, newText: string, field?: string): void;
  /** Set a value in the shared state map */
  setState(key: string, value: unknown): void;
  /** Move the AI cursor to simulate presence */
  moveCursor(x: number, y: number): void;
  /** Process an instruction from a human collaborator */
  processInstruction(instruction: string, field?: string): Promise<string>;
  /** Disconnect the AI agent */
  disconnect(): void;
}

// ── AI Participant Factory ───────────────────────────────────────────

export function createAIParticipant(config: AIParticipantConfig): AIParticipant {
  const { room, agent } = config;
  const { doc, awareness } = room;

  // Set AI presence in awareness
  awareness.setLocalStateField("user", {
    ...agent,
    isAI: true,
  });

  return {
    insertText(text: string, position: number, field: string = "content") {
      const yText = getSharedText(doc, field);
      yText.insert(position, text);
    },

    deleteText(position: number, length: number, field: string = "content") {
      const yText = getSharedText(doc, field);
      yText.delete(position, length);
    },

    replaceText(start: number, end: number, newText: string, field: string = "content") {
      const yText = getSharedText(doc, field);
      doc.transact(() => {
        yText.delete(start, end - start);
        yText.insert(start, newText);
      });
    },

    setState(key: string, value: unknown) {
      const yMap = getSharedMap(doc, "state");
      yMap.set(key, value);
    },

    moveCursor(x: number, y: number) {
      updateCursorPosition(awareness, { x, y });
    },

    async processInstruction(instruction: string, field: string = "content") {
      const yText = getSharedText(doc, field);
      const currentText = yText.toString();

      if (config.onGenerateContent) {
        const generated = await config.onGenerateContent({
          currentText,
          instruction,
        });

        // Apply the AI's edit as a transaction
        doc.transact(() => {
          // Append generated content at the end
          yText.insert(yText.length, generated);
        });

        return generated;
      }

      return "";
    },

    disconnect() {
      awareness.setLocalState(null);
    },
  };
}
