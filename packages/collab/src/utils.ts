import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

// ── Color Palette ────────────────────────────────────────────────

/**
 * 16 visually distinct, accessible collaboration colors.
 * Each color has sufficient contrast against both light and dark backgrounds.
 */
const COLLAB_COLORS: readonly string[] = [
  "#E57373", // red
  "#64B5F6", // blue
  "#81C784", // green
  "#FFB74D", // orange
  "#BA68C8", // purple
  "#4DD0E1", // cyan
  "#FFD54F", // yellow
  "#F06292", // pink
  "#A1887F", // brown
  "#90A4AE", // blue-grey
  "#AED581", // light green
  "#7986CB", // indigo
  "#FF8A65", // deep orange
  "#4DB6AC", // teal
  "#DCE775", // lime
  "#9575CD", // deep purple
] as const;

/**
 * Returns a consistent color for a given index.
 * Wraps around the palette for indices exceeding the palette size.
 */
export function generateColor(index: number): string {
  const safeIndex = Math.abs(index) % COLLAB_COLORS.length;
  return COLLAB_COLORS[safeIndex] as string;
}

// ── Binary Encoding Helpers ──────────────────────────────────────

/**
 * Encodes the full state of a Y.Doc as a Uint8Array.
 * This captures all content — suitable for persistence or initial sync.
 */
export function encodeState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Applies a binary state update to a Y.Doc.
 * Used when loading persisted state or receiving sync messages.
 */
export function decodeState(doc: Y.Doc, state: Uint8Array): void {
  Y.applyUpdate(doc, state);
}

/**
 * Merges multiple Y.Doc updates into a single compressed update.
 * Useful for compacting stored updates before persistence.
 */
export function mergeUpdates(updates: Uint8Array[]): Uint8Array {
  return Y.mergeUpdates(updates);
}

/**
 * Encodes a state vector from a Y.Doc.
 * State vectors are used during sync to determine what updates are needed.
 */
export function encodeStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc);
}

/**
 * Computes a diff — the updates needed to bring a doc with the given
 * state vector up to date with the source doc.
 */
export function encodeStateAsUpdate(doc: Y.Doc, targetStateVector?: Uint8Array): Uint8Array {
  return Y.encodeStateAsUpdate(doc, targetStateVector);
}

// ── Message Protocol Constants ───────────────────────────────────

/** Message types for the Yjs binary sync protocol over WebSocket. */
export const MessageType = {
  /** Yjs sync step 1: state vector exchange */
  SYNC_STEP_1: 0,
  /** Yjs sync step 2: state diff */
  SYNC_STEP_2: 1,
  /** Yjs incremental update */
  SYNC_UPDATE: 2,
  /** Awareness update */
  AWARENESS: 3,
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/**
 * Creates a lib0 encoder — a utility for building binary messages.
 */
export function createEncoder(): encoding.Encoder {
  return encoding.createEncoder();
}

/**
 * Creates a lib0 decoder for reading binary messages.
 */
export function createDecoder(buf: Uint8Array): decoding.Decoder {
  return decoding.createDecoder(buf);
}

/**
 * Converts an encoder to a Uint8Array.
 */
export function toUint8Array(encoder: encoding.Encoder): Uint8Array {
  return encoding.toUint8Array(encoder);
}
