// ── Support tRPC Procedures ─────────────────────────────────────
// Type-safe procedures for support conversation management.
// Authenticated users can view their past conversations,
// messages, and submit feedback on responses.

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  supportConversations,
  supportMessages,
  supportFeedback,
} from "@cronix/db";

// ---------------------------------------------------------------------------
// Support router
// ---------------------------------------------------------------------------

export const supportRouter = router({
  /**
   * List the authenticated user's past support conversations.
   * Returns conversations ordered by most recent first.
   */
  getConversations: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;

      const conversations = await ctx.db
        .select()
        .from(supportConversations)
        .where(eq(supportConversations.userId, ctx.userId))
        .orderBy(desc(supportConversations.updatedAt))
        .limit(limit)
        .offset(offset);

      return {
        conversations: conversations.map((c) => ({
          id: c.id,
          sessionId: c.sessionId,
          status: c.status,
          category: c.category,
          summary: c.summary,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      };
    }),

  /**
   * Get a single conversation with all its messages.
   * User must own the conversation.
   */
  getConversation: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.db
        .select()
        .from(supportConversations)
        .where(
          and(
            eq(supportConversations.id, input.conversationId),
            eq(supportConversations.userId, ctx.userId),
          ),
        )
        .limit(1);

      if (!conversation[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found.",
        });
      }

      const messages = await ctx.db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.conversationId, input.conversationId))
        .orderBy(supportMessages.createdAt);

      // Get feedback for all assistant messages
      const assistantMsgIds = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.id);

      let feedbackMap: Record<string, { rating: string; comment: string | null }> = {};

      if (assistantMsgIds.length > 0) {
        const feedbacks = await ctx.db
          .select()
          .from(supportFeedback)
          .where(eq(supportFeedback.messageId, assistantMsgIds[0]!));

        // For simplicity, fetch all feedback for this conversation's messages
        for (const msgId of assistantMsgIds) {
          const fb = await ctx.db
            .select()
            .from(supportFeedback)
            .where(eq(supportFeedback.messageId, msgId))
            .limit(1);

          if (fb[0]) {
            feedbackMap[msgId] = {
              rating: fb[0].rating,
              comment: fb[0].comment,
            };
          }
        }
      }

      return {
        conversation: {
          id: conversation[0].id,
          sessionId: conversation[0].sessionId,
          status: conversation[0].status,
          category: conversation[0].category,
          summary: conversation[0].summary,
          createdAt: conversation[0].createdAt,
          updatedAt: conversation[0].updatedAt,
        },
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
          feedback: feedbackMap[m.id] ?? null,
          createdAt: m.createdAt,
        })),
      };
    }),

  /**
   * Submit feedback (thumbs up/down) on a support response.
   * User must own the conversation the message belongs to.
   */
  submitFeedback: protectedProcedure
    .input(
      z.object({
        messageId: z.string().min(1),
        rating: z.enum(["positive", "negative"]),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify message exists and belongs to user's conversation
      const message = await ctx.db
        .select({
          id: supportMessages.id,
          conversationId: supportMessages.conversationId,
        })
        .from(supportMessages)
        .where(eq(supportMessages.id, input.messageId))
        .limit(1);

      if (!message[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Message not found.",
        });
      }

      const conversation = await ctx.db
        .select()
        .from(supportConversations)
        .where(
          and(
            eq(supportConversations.id, message[0].conversationId),
            eq(supportConversations.userId, ctx.userId),
          ),
        )
        .limit(1);

      if (!conversation[0]) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this conversation.",
        });
      }

      // Check for existing feedback
      const existing = await ctx.db
        .select()
        .from(supportFeedback)
        .where(eq(supportFeedback.messageId, input.messageId))
        .limit(1);

      if (existing[0]) {
        // Update existing feedback
        await ctx.db
          .update(supportFeedback)
          .set({
            rating: input.rating,
            comment: input.comment ?? null,
          })
          .where(eq(supportFeedback.id, existing[0].id));

        return {
          feedbackId: existing[0].id,
          updated: true,
          message: "Feedback updated. Thank you!",
        };
      }

      const feedbackId = crypto.randomUUID();

      await ctx.db.insert(supportFeedback).values({
        id: feedbackId,
        messageId: input.messageId,
        rating: input.rating,
        comment: input.comment ?? null,
        createdAt: new Date(),
      });

      return {
        feedbackId,
        updated: false,
        message: "Thank you for your feedback!",
      };
    }),
});
