// ── Text Chunker ─────────────────────────────────────────────────
// Splits text into overlapping chunks for embedding and RAG.
// Uses sentence-boundary splitting to keep chunks meaningful.

export interface ChunkOptions {
  /** Maximum tokens per chunk (approximate -- uses char/4 heuristic). Default 512. */
  maxChunkSize?: number;
  /** Number of overlapping tokens between consecutive chunks. Default 50. */
  overlap?: number;
}

const DEFAULT_MAX_CHUNK_SIZE = 512;
const DEFAULT_OVERLAP = 50;

/** Rough token estimate: ~4 characters per token for English text. */
const CHARS_PER_TOKEN = 4;

/**
 * Splits text on sentence boundaries: `. `, `? `, `! `, or double newlines.
 * Keeps the delimiter attached to the preceding sentence.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space, or double newlines
  const parts = text.split(/(?<=\.)\s+|(?<=\?)\s+|(?<=!)\s+|\n\n+/);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Chunk text into overlapping pieces suitable for embedding.
 *
 * Strategy:
 * 1. Split into sentences.
 * 2. Accumulate sentences until hitting maxChunkSize.
 * 3. Emit chunk, then back up by `overlap` tokens worth of sentences for the next chunk.
 */
export function chunkText(text: string, options?: ChunkOptions): string[] {
  const maxChunkSize = options?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;

  const maxChars = maxChunkSize * CHARS_PER_TOKEN;
  const overlapChars = overlap * CHARS_PER_TOKEN;

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  // If the whole text fits in one chunk, return it directly
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  const sentences = splitSentences(trimmed);
  if (sentences.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let currentChunkSentences: string[] = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;

    // If adding this sentence would exceed the max, emit current chunk
    if (currentLength + sentenceLength > maxChars && currentChunkSentences.length > 0) {
      chunks.push(currentChunkSentences.join(" "));

      // Build overlap: walk backwards through sentences until we hit overlap size
      const overlapSentences: string[] = [];
      let overlapLen = 0;
      for (let i = currentChunkSentences.length - 1; i >= 0; i--) {
        const s = currentChunkSentences[i] ?? "";
        if (overlapLen + s.length > overlapChars && overlapSentences.length > 0) {
          break;
        }
        overlapSentences.unshift(s);
        overlapLen += s.length;
      }

      currentChunkSentences = overlapSentences;
      currentLength = overlapLen;
    }

    currentChunkSentences.push(sentence);
    currentLength += sentenceLength;
  }

  // Emit remaining sentences
  if (currentChunkSentences.length > 0) {
    const lastChunk = currentChunkSentences.join(" ");
    // Avoid emitting a duplicate of the last chunk
    if (chunks.length === 0 || chunks[chunks.length - 1] !== lastChunk) {
      chunks.push(lastChunk);
    }
  }

  return chunks;
}
