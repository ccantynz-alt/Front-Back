import { z } from "zod";
import { eq, desc, sql, and } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../init";
import { analyticsEvents } from "@back-to-the-future/db";

const AnalyticsEventInput = z.object({
  event: z.string().min(1),
  category: z.enum(["page_view", "feature_usage", "ai_generation", "time_on_page"]),
  properties: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().datetime(),
  sessionId: z.string().optional(),
});

const BatchTrackInput = z.object({
  events: z.array(AnalyticsEventInput).min(1).max(100),
});

export const analyticsRouter = router({
  track: publicProcedure
    .input(BatchTrackInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId ?? null;

      const rows = input.events.map((evt) => ({
        id: crypto.randomUUID(),
        userId,
        sessionId: evt.sessionId ?? null,
        event: evt.event,
        category: evt.category as "page_view" | "feature_usage" | "ai_generation" | "time_on_page",
        properties: evt.properties ? JSON.stringify(evt.properties) : null,
        timestamp: new Date(evt.timestamp),
      }));

      if (rows.length > 0) {
        await ctx.db.insert(analyticsEvents).values(rows);
      }

      return { recorded: rows.length };
    }),

  getUsageStats: protectedProcedure.query(async ({ ctx }) => {
    const pageViews = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, ctx.userId),
          eq(analyticsEvents.category, "page_view"),
        ),
      );

    const featureUses = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, ctx.userId),
          eq(analyticsEvents.category, "feature_usage"),
        ),
      );

    const aiGens = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.userId, ctx.userId),
          eq(analyticsEvents.category, "ai_generation"),
        ),
      );

    const recentEvents = await ctx.db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.userId, ctx.userId))
      .orderBy(desc(analyticsEvents.timestamp))
      .limit(10);

    return {
      pageViews: pageViews[0]?.count ?? 0,
      featureUsage: featureUses[0]?.count ?? 0,
      aiGenerations: aiGens[0]?.count ?? 0,
      recentEvents,
    };
  }),
});
