// ── RAG Pipeline ─────────────────────────────────────────────────
// Full Retrieval-Augmented Generation pipeline: index, retrieve,
// augment, and generate answers from indexed documents.

import { generateText } from "ai";
import { getDefaultModel, readProviderEnv } from "../providers";
import { generateEmbedding, generateEmbeddings, type EmbeddingConfig } from "../embeddings";
import { chunkText, type ChunkOptions } from "../chunker";
import { VectorStore, type SearchResult } from "./vector-store";

export interface RAGDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RAGQueryOptions {
  /** Number of top results to retrieve. Default 5. */
  topK?: number;
  /** Metadata filter for retrieval. */
  filter?: Record<string, unknown>;
  /** Maximum tokens for the AI response. Default 2048. */
  maxTokens?: number;
  /** Temperature for generation. Default 0.3 (factual). */
  temperature?: number;
}

export interface RAGQueryResult {
  answer: string;
  sources: SearchResult[];
}

export interface RAGPipelineConfig {
  /** Embedding model configuration. */
  embeddingConfig?: EmbeddingConfig;
  /** Text chunking options. */
  chunkOptions?: ChunkOptions;
}

/**
 * Full RAG pipeline: chunk -> embed -> store -> retrieve -> augment -> generate.
 *
 * Orchestrates the entire retrieval-augmented generation flow:
 * 1. Index: chunk documents, generate embeddings, store in vector store
 * 2. Retrieve: embed query, search for similar chunks
 * 3. Augment: build a prompt with retrieved context
 * 4. Generate: produce an AI answer grounded in retrieved sources
 */
export class RAGPipeline {
  private store: VectorStore;
  private config: RAGPipelineConfig;

  constructor(config?: RAGPipelineConfig) {
    this.store = new VectorStore();
    this.config = config ?? {};
  }

  /**
   * Index documents: chunk, embed, and store them.
   * Each document may produce multiple chunks (stored as separate vectors).
   */
  async index(documents: RAGDocument[]): Promise<{ indexed: number; chunks: number }> {
    let totalChunks = 0;

    for (const doc of documents) {
      const chunks = chunkText(doc.content, this.config.chunkOptions);
      if (chunks.length === 0) continue;

      const embeddings = await generateEmbeddings(chunks, this.config.embeddingConfig);

      for (let i = 0; i < chunks.length; i++) {
        const chunkId = chunks.length === 1 ? doc.id : `${doc.id}::chunk-${String(i)}`;
        const chunkContent = chunks[i] ?? "";
        const chunkEmbedding = embeddings[i] ?? [];
        this.store.add(chunkId, chunkContent, chunkEmbedding, {
          ...doc.metadata,
          sourceDocumentId: doc.id,
          chunkIndex: i,
          totalChunks: chunks.length,
        });
        totalChunks++;
      }
    }

    return { indexed: documents.length, chunks: totalChunks };
  }

  /**
   * Retrieve the most relevant chunks for a query.
   */
  async retrieve(
    query: string,
    topK: number = 5,
    filter?: Record<string, unknown>,
  ): Promise<SearchResult[]> {
    const queryEmbedding = await generateEmbedding(query, this.config.embeddingConfig);
    return this.store.search(queryEmbedding, topK, filter);
  }

  /**
   * Build an augmented prompt with retrieved context injected.
   */
  augment(query: string, context: SearchResult[]): string {
    if (context.length === 0) {
      return `Answer the following question. If you don't have enough information, say so.\n\nQuestion: ${query}`;
    }

    const contextBlock = context
      .map(
        (result, index) =>
          `[Source ${String(index + 1)}] (score: ${result.score.toFixed(3)})\n${result.content}`,
      )
      .join("\n\n");

    return `Answer the following question based on the provided context. Cite source numbers when using information from the context. If the context doesn't contain enough information, say so.

Context:
${contextBlock}

Question: ${query}

Answer:`;
  }

  /**
   * Full RAG query: retrieve relevant context, augment the prompt, generate an answer.
   */
  async query(question: string, options?: RAGQueryOptions): Promise<RAGQueryResult> {
    const topK = options?.topK ?? 5;
    const maxTokens = options?.maxTokens ?? 2048;
    const temperature = options?.temperature ?? 0.3;

    // Retrieve relevant chunks
    const sources = await this.retrieve(question, topK, options?.filter);

    // Build augmented prompt
    const augmentedPrompt = this.augment(question, sources);

    // Generate answer
    const providerEnv = readProviderEnv();
    const model = getDefaultModel(providerEnv);

    const result = await generateText({
      model,
      prompt: augmentedPrompt,
      maxOutputTokens: maxTokens,
      temperature,
    });

    return {
      answer: result.text,
      sources,
    };
  }

  /** Access the underlying vector store (for testing or advanced use). */
  getStore(): VectorStore {
    return this.store;
  }

  /** Clear all indexed documents. */
  clear(): void {
    this.store.clear();
  }

  /** Number of indexed chunks. */
  get size(): number {
    return this.store.size;
  }
}
