// ── RAG Pipeline ─────────────────────────────────────────────────────
// Retrieval-Augmented Generation as a first-class primitive.
// Auto-indexes content → embeds → stores in Qdrant → retrieves for AI.

import { z } from "zod";
import {
  createQdrantClient,
  ensureCollection,
  upsertVectors,
  searchSimilar,
  type SearchHit,
} from "../vector/qdrant";

// ── Schemas ──────────────────────────────────────────────────────────

export const ContentDocumentSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.object({
    title: z.string().optional(),
    source: z.string(), // e.g., "page", "document", "component", "user-content"
    type: z.string(), // MIME type or content category
    url: z.string().optional(),
    createdAt: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export type ContentDocument = z.infer<typeof ContentDocumentSchema>;

export const RAGQuerySchema = z.object({
  query: z.string(),
  maxResults: z.number().int().min(1).max(50).default(5),
  scoreThreshold: z.number().min(0).max(1).default(0.7),
  filter: z.record(z.unknown()).optional(),
});

export type RAGQuery = z.infer<typeof RAGQuerySchema>;

export interface RAGResult {
  context: string;
  sources: Array<{
    id: string | number;
    score: number;
    title?: string;
    source?: string;
    snippet: string;
  }>;
  totalTokensEstimate: number;
}

// ── Embedding Function Type ──────────────────────────────────────────

export type EmbedFunction = (text: string) => Promise<number[]>;

// ── RAG Pipeline Class ───────────────────────────────────────────────

export class RAGPipeline {
  private embedFn: EmbedFunction;
  private collection: string;
  private qdrantUrl?: string;
  private qdrantApiKey?: string;

  constructor(config: {
    embedFn: EmbedFunction;
    collection?: string;
    qdrantUrl?: string;
    qdrantApiKey?: string;
  }) {
    this.embedFn = config.embedFn;
    this.collection = config.collection ?? "rag_content";
    this.qdrantUrl = config.qdrantUrl;
    this.qdrantApiKey = config.qdrantApiKey;
  }

  private getClient() {
    return createQdrantClient({
      url: this.qdrantUrl,
      apiKey: this.qdrantApiKey,
    });
  }

  /**
   * Initialize the collection if it doesn't exist.
   */
  async initialize(vectorSize: number = 1536): Promise<void> {
    const client = this.getClient();
    await ensureCollection(client, this.collection, vectorSize);
  }

  /**
   * Index a document: embed its content and store in vector DB.
   */
  async indexDocument(doc: ContentDocument): Promise<void> {
    const parsed = ContentDocumentSchema.parse(doc);
    const vector = await this.embedFn(parsed.content);
    const client = this.getClient();

    await upsertVectors(
      client,
      [
        {
          id: parsed.id,
          vector,
          payload: {
            content: parsed.content,
            ...parsed.metadata,
          },
        },
      ],
      this.collection,
    );
  }

  /**
   * Index multiple documents in batch.
   */
  async indexBatch(docs: ContentDocument[]): Promise<void> {
    const parsed = docs.map((d) => ContentDocumentSchema.parse(d));

    // Embed all documents
    const embeddings = await Promise.all(
      parsed.map((d) => this.embedFn(d.content)),
    );

    const client = this.getClient();
    await upsertVectors(
      client,
      parsed.map((doc, i) => ({
        id: doc.id,
        vector: embeddings[i]!,
        payload: {
          content: doc.content,
          ...doc.metadata,
        },
      })),
      this.collection,
    );
  }

  /**
   * Query the RAG pipeline: embed query → search vectors → return context.
   */
  async query(input: RAGQuery): Promise<RAGResult> {
    const parsed = RAGQuerySchema.parse(input);
    const queryVector = await this.embedFn(parsed.query);
    const client = this.getClient();

    const hits = await searchSimilar(client, queryVector, {
      collection: this.collection,
      limit: parsed.maxResults,
      scoreThreshold: parsed.scoreThreshold,
      filter: parsed.filter,
    });

    return this.buildResult(hits);
  }

  /**
   * Build a RAG result from search hits, assembling context for the LLM.
   */
  private buildResult(hits: SearchHit[]): RAGResult {
    const sources = hits.map((hit) => ({
      id: hit.id,
      score: hit.score,
      title: hit.payload["title"] as string | undefined,
      source: hit.payload["source"] as string | undefined,
      snippet: truncate(hit.payload["content"] as string ?? "", 500),
    }));

    // Assemble context string for LLM injection
    const contextParts = sources.map(
      (s, i) =>
        `[Source ${i + 1}${s.title ? `: ${s.title}` : ""}]\n${s.snippet}`,
    );
    const context = contextParts.join("\n\n---\n\n");

    // Rough token estimate (~4 chars per token)
    const totalTokensEstimate = Math.ceil(context.length / 4);

    return { context, sources, totalTokensEstimate };
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

// ── Factory ──────────────────────────────────────────────────────────

export function createRAGPipeline(config: {
  embedFn: EmbedFunction;
  collection?: string;
  qdrantUrl?: string;
  qdrantApiKey?: string;
}): RAGPipeline {
  return new RAGPipeline(config);
}
