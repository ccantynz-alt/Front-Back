// ── Analytics Procedures ─────────────────────────────────────────────
// Real aggregation queries for the dashboard. Every query is scoped to
// the authenticated user (multi-tenant safety) and defaults to a 30-day
// rolling window unless a custom `days` parameter is supplied.
//
// Tables touched:
//   - analytics_events  (page views, feature usage, ai generations)
//   - projects          (totalProjects)
//   - deployments       (activeDeployments, avgBuildTime)
//   - conversations     (monthlyAiCost — AI chat spend in cents)

import { z } from "zod";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../init";
import {
  analyticsEvents,
  projects,
  deployments,
  conversations,
} from "@back-to-the-future/db";

const AnalyticsEventInput = z.object({
  event: z.string().min(1),
  category: z.enum([
    "page_view",
    "feature_usage",
    "ai_generation",
    "time_on_page",
  ]),
  properties: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().datetime(),
  sessionId: z.string().optional(),
});

const BatchTrackInput = z.object({
  events: z.array(AnalyticsEventInput).min(1).max(100),
});

const UsageStatsInput = z
  .object({
    days: z.number().int().min(1).max(365).optional(),
  })
  .optional();

/** Compute a Date object `days` ago from now. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export interface UsageStats {
  pageViews: number;
  featureUsage: number;
  aiGenerations: number;
  recentEvents: Array<typeof analyticsEvents.$inferSelect>;
  totalProjects: number;
  activeDeployments: number;
  avgBuildTime: number;
  monthlyAiCost: number;
}

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
        category: evt.category as
          | "page_view"
          | "feature_usage"
          | "ai_generation"
          | "time_on_page",
        properties: evt.properties ? JSON.stringify(evt.properties) : null,
        timestamp: new Date(evt.timestamp),
      }));

      if (rows.length > 0) {
        await ctx.db.insert(analyticsEvents).values(rows);
      }

      return { recorded: rows.length };
    }),

  getUsageStats: protectedProcedure
    .input(UsageStatsInput)
    .query(async ({ ctx, input }): Promise<UsageStats> => {
      const days = input?.days ?? 30;
      const since = daysAgo(days);
      const userId = ctx.userId;

      // Analytics events by category (within window)
      const [pageViewsRow] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.userId, userId),
            eq(analyticsEvents.category, "page_view"),
            gte(analyticsEvents.timestamp, since),
          ),
        );

      const [featureUsageRow] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.userId, userId),
            eq(analyticsEvents.category, "feature_usage"),
            gte(analyticsEvents.timestamp, since),
          ),
        );

      const [aiGenerationsRow] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.userId, userId),
            eq(analyticsEvents.category, "ai_generation"),
            gte(analyticsEvents.timestamp, since),
          ),
        );

      // Recent events (latest 10, any category, any time)
      const recentEvents = await ctx.db
        .select()
        .from(analyticsEvents)
        .where(eq(analyticsEvents.userId, userId))
        .orderBy(desc(analyticsEvents.timestamp))
        .limit(10);

      // Total projects owned by the user
      const [totalProjectsRow] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(projects)
        .where(eq(projects.userId, userId));

      // Active deployments (currently live)
      const [activeDeploymentsRow] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(deployments)
        .where(
          and(
            eq(deployments.userId, userId),
            eq(deployments.status, "live"),
          ),
        );

      // Average build duration (seconds) across successful deploys in window
      const [avgBuildRow] = await ctx.db
        .select({
          avg: sql<number | null>`avg(${deployments.duration})`,
        })
        .from(deployments)
        .where(
          and(
            eq(deployments.userId, userId),
            eq(deployments.status, "live"),
            gte(deployments.createdAt, since),
          ),
        );

      // Monthly AI cost (sum of `total_cost` on conversations in window).
      // `total_cost` is stored as integer cents.
      const [aiCostRow] = await ctx.db
        .select({
          sum: sql<number | null>`sum(${conversations.totalCost})`,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.userId, userId),
            gte(conversations.updatedAt, since),
          ),
        );

      return {
        pageViews: Number(pageViewsRow?.count ?? 0),
        featureUsage: Number(featureUsageRow?.count ?? 0),
        aiGenerations: Number(aiGenerationsRow?.count ?? 0),
        recentEvents,
        totalProjects: Number(totalProjectsRow?.count ?? 0),
        activeDeployments: Number(activeDeploymentsRow?.count ?? 0),
        avgBuildTime: Number(avgBuildRow?.avg ?? 0),
        monthlyAiCost: Number(aiCostRow?.sum ?? 0),
      };
    }),
});
