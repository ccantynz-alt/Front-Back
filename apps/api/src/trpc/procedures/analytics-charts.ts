// ── Analytics Charts Procedures ──────────────────────────────────────
// Time-series aggregations for the dashboard charts. Each query buckets
// rows by UTC calendar day (YYYY-MM-DD) and is scoped to the
// authenticated user for multi-tenant safety.
//
// SQLite stores our `timestamp` columns as integer Unix epochs (in
// seconds — Drizzle's `integer("...", { mode: "timestamp" })` default).
// We convert back to a date string with:
//     strftime('%Y-%m-%d', <col>, 'unixepoch')

import { z } from "zod";
import { and, eq, gte, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../init";
import {
  analyticsEvents,
  deployments,
  conversations,
  chatMessages,
} from "@back-to-the-future/db";

const DaysInput = z
  .object({
    days: z.number().int().min(1).max(365).optional(),
  })
  .optional();

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export interface DailyPageView {
  date: string;
  count: number;
}

export interface DeploymentDay {
  date: string;
  successful: number;
  failed: number;
}

export interface AiTokenUsageDay {
  date: string;
  tokens: number;
  cost: number;
}

export const analyticsChartsRouter = router({
  /**
   * Daily page-view counts for the authenticated user over the last N
   * days (default 30). Returns one entry per day that recorded activity.
   * Empty array if no data.
   */
  getDailyPageViews: protectedProcedure
    .input(DaysInput)
    .query(async ({ ctx, input }): Promise<DailyPageView[]> => {
      const days = input?.days ?? 30;
      const since = daysAgo(days);
      const userId = ctx.userId;

      const dateExpr = sql<string>`strftime('%Y-%m-%d', ${analyticsEvents.timestamp}, 'unixepoch')`;

      const rows = await ctx.db
        .select({
          date: dateExpr,
          count: sql<number>`count(*)`,
        })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.userId, userId),
            eq(analyticsEvents.category, "page_view"),
            gte(analyticsEvents.timestamp, since),
          ),
        )
        .groupBy(dateExpr)
        .orderBy(dateExpr);

      return rows.map((r) => ({
        date: r.date,
        count: Number(r.count ?? 0),
      }));
    }),

  /**
   * Daily deployment history (successful vs failed) for the user's
   * projects over the last N days.
   */
  getDeploymentHistory: protectedProcedure
    .input(DaysInput)
    .query(async ({ ctx, input }): Promise<DeploymentDay[]> => {
      const days = input?.days ?? 30;
      const since = daysAgo(days);
      const userId = ctx.userId;

      const dateExpr = sql<string>`strftime('%Y-%m-%d', ${deployments.createdAt}, 'unixepoch')`;

      const rows = await ctx.db
        .select({
          date: dateExpr,
          successful: sql<number>`sum(case when ${deployments.status} = 'live' then 1 else 0 end)`,
          failed: sql<number>`sum(case when ${deployments.status} = 'failed' then 1 else 0 end)`,
        })
        .from(deployments)
        .where(
          and(
            eq(deployments.userId, userId),
            gte(deployments.createdAt, since),
          ),
        )
        .groupBy(dateExpr)
        .orderBy(dateExpr);

      return rows.map((r) => ({
        date: r.date,
        successful: Number(r.successful ?? 0),
        failed: Number(r.failed ?? 0),
      }));
    }),

  /**
   * Daily AI token usage and cost (cents) for the authenticated user
   * over the last N days. Aggregates per-message token counts from
   * chat_messages joined to conversations (owner filter) and sums the
   * conversation-level cost stamped on the day the message landed.
   *
   * Cost is attributed proportionally using the conversation's
   * total_cost — we bucket by message day and sum input+output tokens.
   * For cost we prorate: sum(totalCost) on conversations whose
   * updated_at falls in that day.
   */
  getAiTokenUsage: protectedProcedure
    .input(DaysInput)
    .query(async ({ ctx, input }): Promise<AiTokenUsageDay[]> => {
      const days = input?.days ?? 30;
      const since = daysAgo(days);
      const userId = ctx.userId;

      // Tokens per day from chat_messages (requires joining conversations
      // to scope by userId — chat_messages itself has no userId column).
      const msgDateExpr = sql<string>`strftime('%Y-%m-%d', ${chatMessages.createdAt}, 'unixepoch')`;

      const tokenRows = await ctx.db
        .select({
          date: msgDateExpr,
          tokens: sql<number>`coalesce(sum(coalesce(${chatMessages.inputTokens}, 0) + coalesce(${chatMessages.outputTokens}, 0)), 0)`,
        })
        .from(chatMessages)
        .innerJoin(
          conversations,
          eq(chatMessages.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversations.userId, userId),
            gte(chatMessages.createdAt, since),
          ),
        )
        .groupBy(msgDateExpr)
        .orderBy(msgDateExpr);

      // Cost per day from conversations.updatedAt bucket.
      const convDateExpr = sql<string>`strftime('%Y-%m-%d', ${conversations.updatedAt}, 'unixepoch')`;

      const costRows = await ctx.db
        .select({
          date: convDateExpr,
          cost: sql<number>`coalesce(sum(${conversations.totalCost}), 0)`,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.userId, userId),
            gte(conversations.updatedAt, since),
          ),
        )
        .groupBy(convDateExpr)
        .orderBy(convDateExpr);

      // Merge the two bucketed series on `date`.
      const byDate = new Map<string, { tokens: number; cost: number }>();
      for (const row of tokenRows) {
        byDate.set(row.date, {
          tokens: Number(row.tokens ?? 0),
          cost: 0,
        });
      }
      for (const row of costRows) {
        const existing = byDate.get(row.date);
        if (existing) {
          existing.cost = Number(row.cost ?? 0);
        } else {
          byDate.set(row.date, {
            tokens: 0,
            cost: Number(row.cost ?? 0),
          });
        }
      }

      return Array.from(byDate.entries())
        .map(([date, v]) => ({ date, tokens: v.tokens, cost: v.cost }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }),
});
