// ── Embedding Generation ─────────────────────────────────────────
// Generates vector embeddings using the AI SDK's embed/embedMany.
// Default: OpenAI text-embedding-3-small (1536 dimensions).
// Supports chunking long texts before embedding.

import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { chunkText, type ChunkOptions } from "./chunker";

export interface EmbeddingConfig {
  /** OpenAI API key. Falls back to OPENAI_API_KEY env var. */
  apiKey?: string;
  /** Base URL for the embedding API. */
  baseURL?: string;
  /** Embedding model name. Default: text-embedding-3-small */
  model?: string;
}

const DEFAULT_MODEL = "text-embedding-3-small";

/** Read an environment variable safely across runtimes (Bun, Node, Workers). */
function env(key: string): string | undefined {
  try {
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    return proc?.env[key] ?? undefined;
  } catch {
    return undefined;
  }
}

function getEmbeddingModel(config?: EmbeddingConfig): ReturnType<ReturnType<typeof createOpenAI>["embedding"]> {
  const apiKey = config?.apiKey ?? env("OPENAI_API_KEY") ?? "";
  const modelName = config?.model ?? DEFAULT_MODEL;

  const settings: Parameters<typeof createOpenAI>[0] = { apiKey };
  if (config?.baseURL !== undefined) {
    settings.baseURL = config.baseURL;
  }

  const provider = createOpenAI(settings);
  return provider.embedding(modelName);
}

/**
 * Generate a single embedding vector for the given text.
 */
export async function generateEmbedding(
  text: string,
  config?: EmbeddingConfig,
): Promise<number[]> {
  const model = getEmbeddingModel(config);
  const result = await embed({ model, value: text });
  return result.embedding;
}

/**
 * Generate embeddings for multiple texts in a single batch call.
 */
export async function generateEmbeddings(
  texts: string[],
  config?: EmbeddingConfig,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const model = getEmbeddingModel(config);
  const result = await embedMany({ model, values: texts });
  return result.embeddings;
}

/**
 * Chunk a long text and generate embeddings for each chunk.
 * Returns parallel arrays of chunks and their embeddings.
 */
export async function chunkAndEmbed(
  text: string,
  options?: {
    chunkOptions?: ChunkOptions;
    embeddingConfig?: EmbeddingConfig;
  },
): Promise<{ chunks: string[]; embeddings: number[][] }> {
  const chunks = chunkText(text, options?.chunkOptions);
  if (chunks.length === 0) {
    return { chunks: [], embeddings: [] };
  }

  const embeddings = await generateEmbeddings(chunks, options?.embeddingConfig);
  return { chunks, embeddings };
}
