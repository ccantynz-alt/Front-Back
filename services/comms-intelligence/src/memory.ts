// ── Conversational Memory ─────────────────────────────────────────────
// Per-conversationId rolling-window store + RAG retrieval against a
// pluggable vector-search backend (Qdrant in prod, mocked in tests).

import { z } from "zod";

export const memoryRoleSchema = z.enum(["user", "assistant", "system", "tool"]);
export type MemoryRole = z.infer<typeof memoryRoleSchema>;

export const memoryAppendSchema = z.object({
  role: memoryRoleSchema,
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type MemoryAppend = z.infer<typeof memoryAppendSchema>;

export const memoryRagSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(50).optional(),
});

export type MemoryRagQuery = z.infer<typeof memoryRagSchema>;

export interface MemoryMessage {
  role: MemoryRole;
  content: string;
  metadata?: Record<string, unknown> | undefined;
  /** Server-assigned monotonic timestamp (ms since epoch). */
  at: number;
  /** Server-assigned sequence number within the conversation. */
  seq: number;
}

export interface RagDocument {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Pluggable vector-search interface. Production wires up a Qdrant client.
 * Tests inject a deterministic stub.
 */
export interface VectorSearch {
  search(args: {
    tenantId: string;
    query: string;
    topK: number;
  }): Promise<RagDocument[]>;
}

export class StubVectorSearch implements VectorSearch {
  public callLog: Array<{ tenantId: string; query: string; topK: number }> = [];
  private readonly canned: Map<string, RagDocument[]>;

  constructor(canned?: Record<string, RagDocument[]>) {
    this.canned = new Map(Object.entries(canned ?? {}));
  }

  // biome-ignore lint/suspicious/useAwait: implements async interface
  async search(args: {
    tenantId: string;
    query: string;
    topK: number;
  }): Promise<RagDocument[]> {
    this.callLog.push(args);
    const hit = this.canned.get(args.query) ?? this.canned.get(args.tenantId) ?? [];
    return hit.slice(0, args.topK);
  }
}

export interface ConversationMemoryOptions {
  /** Max messages retained per conversation. Older ones are dropped. */
  maxWindow?: number;
  /** Vector backend for {@link ConversationMemory.getRagContext}. */
  vector?: VectorSearch;
  /** Default tenant id when caller doesn't supply one. */
  defaultTenantId?: string;
}

/**
 * In-memory conversational store. v1 is a single-process map; horizontal
 * deployments swap this for a Redis-backed implementation behind the same
 * interface — call sites do not change.
 */
export class ConversationMemory {
  private readonly store = new Map<string, MemoryMessage[]>();
  private readonly seq = new Map<string, number>();
  private readonly maxWindow: number;
  private readonly vector: VectorSearch | undefined;
  private readonly defaultTenantId: string;

  constructor(opts: ConversationMemoryOptions = {}) {
    this.maxWindow = opts.maxWindow ?? 50;
    this.vector = opts.vector;
    this.defaultTenantId = opts.defaultTenantId ?? "default";
  }

  appendMessage(conversationId: string, msg: MemoryAppend): MemoryMessage {
    if (!conversationId) {
      throw new Error("conversationId required");
    }
    const list = this.store.get(conversationId) ?? [];
    const nextSeq = (this.seq.get(conversationId) ?? 0) + 1;
    const stored: MemoryMessage = {
      role: msg.role,
      content: msg.content,
      ...(msg.metadata !== undefined && { metadata: msg.metadata }),
      at: Date.now(),
      seq: nextSeq,
    };
    list.push(stored);
    if (list.length > this.maxWindow) {
      list.splice(0, list.length - this.maxWindow);
    }
    this.store.set(conversationId, list);
    this.seq.set(conversationId, nextSeq);
    return stored;
  }

  getRecentMessages(conversationId: string, limit = 20): MemoryMessage[] {
    const list = this.store.get(conversationId) ?? [];
    if (limit >= list.length) return [...list];
    return list.slice(list.length - limit);
  }

  async getRagContext(
    conversationId: string,
    query: MemoryRagQuery,
    tenantId?: string,
  ): Promise<{
    matches: RagDocument[];
    conversationId: string;
    query: string;
  }> {
    const topK = query.topK ?? 5;
    if (!this.vector) {
      return { matches: [], conversationId, query: query.query };
    }
    const matches = await this.vector.search({
      tenantId: tenantId ?? this.defaultTenantId,
      query: query.query,
      topK,
    });
    return { matches, conversationId, query: query.query };
  }

  /** Wipe a single conversation. Used for GDPR delete + tests. */
  forget(conversationId: string): void {
    this.store.delete(conversationId);
    this.seq.delete(conversationId);
  }

  /** Wipe everything. Tests only. */
  clear(): void {
    this.store.clear();
    this.seq.clear();
  }
}
