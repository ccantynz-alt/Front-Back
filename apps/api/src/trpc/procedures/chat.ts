// ── Chat Procedures ──────────────────────────────────────────────────
// tRPC procedures for the internal Anthropic-powered chat interface.
// CRUD for conversations and messages, plus provider key management.
// Streaming is handled by the Hono route (/api/chat/stream) since
// tRPC is not ideal for long-lived SSE connections.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { router, protectedProcedure, adminProcedure } from "../init";
import {
  conversations,
  chatMessages,
  userProviderKeys,
} from "@back-to-the-future/db";
import { ANTHROPIC_MODELS, estimateCost } from "@back-to-the-future/ai-core";
import { emitDataChange } from "../../realtime/live-updates";

// ── IDs ────────────────────────────────────────────────────────────────

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

// ── Encryption helpers (AES-256-GCM) ──────────────────────────────────

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function getEncryptionKey(): Buffer {
  const secret = process.env["SESSION_SECRET"] ?? "crontech-default-key-change-me";
  return createHash("sha256").update(secret).digest();
}

function aesEncrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function aesDecrypt(encoded: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

// ── Input Schemas ──────────────────────────────────────────────────────

const CreateConversationInput = z.object({
  title: z.string().min(1).max(200),
  model: z.string().default("claude-sonnet-4-20250514"),
  systemPrompt: z.string().max(10_000).optional(),
});

const UpdateConversationInput = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  model: z.string().optional(),
  systemPrompt: z.string().max(10_000).optional(),
  archived: z.boolean().optional(),
});

const SaveProviderKeyInput = z.object({
  provider: z.enum(["anthropic", "openai", "github"]),
  apiKey: z.string().min(10).max(500),
});

// ── Conversation Router ──────────────────────────────────────────────

export const chatRouter = router({
  /** Create a new conversation. */
  createConversation: protectedProcedure
    .input(CreateConversationInput)
    .mutation(async ({ ctx, input }) => {
      const id = newId("conv");
      const now = new Date();
      await ctx.db.insert(conversations).values({
        id,
        userId: ctx.userId,
        title: input.title,
        model: input.model,
        systemPrompt: input.systemPrompt ?? null,
        totalTokens: 0,
        totalCost: 0,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
      emitDataChange("conversations", "conversation created");
      return { id, title: input.title };
    }),

  /** List all conversations for the current user, newest first. */
  listConversations: protectedProcedure
    .input(
      z.object({
        includeArchived: z.boolean().default(false),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(conversations.userId, ctx.userId)];
      if (!input?.includeArchived) {
        conditions.push(eq(conversations.archived, false));
      }
      return ctx.db
        .select()
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.updatedAt));
    }),

  /** Get a single conversation with its messages. */
  getConversation: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, ctx.userId),
          ),
        )
        .limit(1);
      const conv = rows[0];
      if (!conv) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }

      const msgs = await ctx.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, input.id))
        .orderBy(chatMessages.createdAt);

      return { conversation: conv, messages: msgs };
    }),

  /** Update conversation metadata (title, model, archive). */
  updateConversation: protectedProcedure
    .input(UpdateConversationInput)
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, ctx.userId),
          ),
        )
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) updates["title"] = input.title;
      if (input.model !== undefined) updates["model"] = input.model;
      if (input.systemPrompt !== undefined) updates["systemPrompt"] = input.systemPrompt;
      if (input.archived !== undefined) updates["archived"] = input.archived;

      await ctx.db
        .update(conversations)
        .set(updates)
        .where(eq(conversations.id, input.id));

      return { success: true };
    }),

  /** Delete a conversation and all its messages. */
  deleteConversation: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, ctx.userId),
          ),
        )
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }

      await ctx.db.delete(conversations).where(eq(conversations.id, input.id));
      return { success: true };
    }),

  /** Save a message to a conversation (called after streaming completes). */
  saveMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().min(1),
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1),
        model: z.string().optional(),
        inputTokens: z.number().int().optional(),
        outputTokens: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const convRows = await ctx.db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.conversationId),
            eq(conversations.userId, ctx.userId),
          ),
        )
        .limit(1);
      if (convRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }

      const id = newId("msg");
      await ctx.db.insert(chatMessages).values({
        id,
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        model: input.model ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        createdAt: new Date(),
      });

      // Update conversation token + cost totals.
      // Cost is stored in microdollars (1/1,000,000 of a dollar) for
      // precision — matches the estimateCost() return contract.
      const tokenDelta = (input.inputTokens ?? 0) + (input.outputTokens ?? 0);
      const costDelta = input.model
        ? estimateCost(
            input.model,
            input.inputTokens ?? 0,
            input.outputTokens ?? 0,
          )
        : 0;

      if (tokenDelta > 0 || costDelta > 0) {
        await ctx.db
          .update(conversations)
          .set({
            totalTokens: sql`${conversations.totalTokens} + ${tokenDelta}`,
            totalCost: sql`${conversations.totalCost} + ${costDelta}`,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, input.conversationId));
      } else {
        await ctx.db
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, input.conversationId));
      }

      return { id };
    }),

  /** List available Anthropic models with pricing info. */
  listModels: protectedProcedure.query(() => {
    return Object.entries(ANTHROPIC_MODELS).map(([id, info]) => ({
      id,
      ...info,
    }));
  }),

  /**
   * Returns current-month usage stats for the caller: total
   * conversations, total tokens, and cost in microdollars. The
   * "month" is the calendar month in UTC (first day 00:00).
   */
  getUsageStats: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );

    // All conversations for this user
    const allConvs = await ctx.db
      .select({
        id: conversations.id,
        updatedAt: conversations.updatedAt,
        totalTokens: conversations.totalTokens,
        totalCost: conversations.totalCost,
      })
      .from(conversations)
      .where(eq(conversations.userId, ctx.userId));

    // Month-bucketed: messages are the source of truth for "what
    // was spent this month" — conversations.totalCost is lifetime.
    // Sum cost of messages created in the current calendar month
    // that belong to this user's conversations.
    const monthlyRows = await ctx.db
      .select({
        conversationId: chatMessages.conversationId,
        model: chatMessages.model,
        inputTokens: chatMessages.inputTokens,
        outputTokens: chatMessages.outputTokens,
      })
      .from(chatMessages)
      .innerJoin(conversations, eq(chatMessages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.userId, ctx.userId),
          gte(chatMessages.createdAt, monthStart),
        ),
      );

    let monthTokens = 0;
    let monthCostMicro = 0;
    for (const row of monthlyRows) {
      const input = row.inputTokens ?? 0;
      const output = row.outputTokens ?? 0;
      monthTokens += input + output;
      if (row.model) {
        monthCostMicro += estimateCost(row.model, input, output);
      }
    }

    const lifetimeCostMicro = allConvs.reduce(
      (acc, c) => acc + (c.totalCost ?? 0),
      0,
    );
    const lifetimeTokens = allConvs.reduce(
      (acc, c) => acc + (c.totalTokens ?? 0),
      0,
    );

    return {
      conversationCount: allConvs.length,
      lifetimeTokens,
      lifetimeCostMicro,
      lifetimeCostDollars: lifetimeCostMicro / 1_000_000,
      monthTokens,
      monthCostMicro,
      monthCostDollars: monthCostMicro / 1_000_000,
      monthStart: monthStart.toISOString(),
    };
  }),

  // ── Provider Key Management (Admin Only) ─────────────────────────

  /** Save or update an API provider key. Admin only. */
  saveProviderKey: adminProcedure
    .input(SaveProviderKeyInput)
    .mutation(async ({ ctx, input }) => {
      const encrypted = aesEncrypt(input.apiKey);
      const prefix = `${input.apiKey.slice(0, 7)}...${input.apiKey.slice(-4)}`;

      // Deactivate existing keys for this provider
      await ctx.db
        .update(userProviderKeys)
        .set({ isActive: false })
        .where(
          and(
            eq(userProviderKeys.userId, ctx.userId),
            eq(userProviderKeys.provider, input.provider),
          ),
        );

      const id = newId("pk");
      await ctx.db.insert(userProviderKeys).values({
        id,
        userId: ctx.userId,
        provider: input.provider,
        encryptedKey: encrypted,
        keyPrefix: prefix,
        isActive: true,
        createdAt: new Date(),
      });

      emitDataChange("provider-keys", `${input.provider} key saved`);
      return { id, prefix };
    }),

  /** Get the active provider key info (prefix only, never the full key). Admin only. */
  getProviderKey: adminProcedure
    .input(z.object({ provider: z.enum(["anthropic", "openai", "github"]) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: userProviderKeys.id,
          prefix: userProviderKeys.keyPrefix,
          isActive: userProviderKeys.isActive,
          createdAt: userProviderKeys.createdAt,
          lastUsedAt: userProviderKeys.lastUsedAt,
        })
        .from(userProviderKeys)
        .where(
          and(
            eq(userProviderKeys.userId, ctx.userId),
            eq(userProviderKeys.provider, input.provider),
            eq(userProviderKeys.isActive, true),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    }),

  /** Delete a provider key. Admin only. */
  deleteProviderKey: adminProcedure
    .input(z.object({ provider: z.enum(["anthropic", "openai", "github"]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(userProviderKeys)
        .where(
          and(
            eq(userProviderKeys.userId, ctx.userId),
            eq(userProviderKeys.provider, input.provider),
          ),
        );
      emitDataChange("provider-keys", `${input.provider} key deleted`);
      return { success: true };
    }),

  /** Internal: decrypt the user's provider key for use by the streaming endpoint. */
  _getDecryptedKey: protectedProcedure
    .input(z.object({ provider: z.enum(["anthropic", "openai", "github"]) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(userProviderKeys)
        .where(
          and(
            eq(userProviderKeys.userId, ctx.userId),
            eq(userProviderKeys.provider, input.provider),
            eq(userProviderKeys.isActive, true),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) return null;

      const decrypted = aesDecrypt(row.encryptedKey);

      // Update last used timestamp
      await ctx.db
        .update(userProviderKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(userProviderKeys.id, row.id));

      return decrypted;
    }),
});
