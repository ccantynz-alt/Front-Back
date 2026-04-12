import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, sql, eq } from "drizzle-orm";
import { router, protectedProcedure, middleware } from "../init";
import {
  users,
  subscriptions,
  payments,
  analyticsEvents,
} from "@back-to-the-future/db";
import {
  getAllFlags,
  persistFlag,
  isFeatureEnabled,
} from "../../feature-flags";
import { auditMiddleware } from "../../middleware/audit";

// ── Admin Middleware ──────────────────────────────────────────────────

const enforceAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }

  const result = await ctx.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);

  const user = result[0];
  if (!user || user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin role required.",
    });
  }

  return next({ ctx });
});

const adminProcedure = protectedProcedure.use(enforceAdmin);

// ── Admin Router ─────────────────────────────────────────────────────

export const adminRouter = router({
  getStats: adminProcedure.query(async ({ ctx }) => {
    const totalUsersResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(users);
    const totalUsers = totalUsersResult[0]?.count ?? 0;

    const activeSubsResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));
    const activeSubscriptions = activeSubsResult[0]?.count ?? 0;

    const revenueResult = await ctx.db
      .select({ total: sql<number>`coalesce(sum(amount), 0)` })
      .from(payments)
      .where(eq(payments.status, "succeeded"));
    const totalRevenue = revenueResult[0]?.total ?? 0;

    const aiGenResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.category, "ai_generation"));
    const aiGenerations = aiGenResult[0]?.count ?? 0;

    return {
      totalUsers,
      activeSubscriptions,
      totalRevenue,
      aiGenerations,
    };
  }),

  getRecentUsers: adminProcedure.query(async ({ ctx }) => {
    const items = await ctx.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(20);

    return items;
  }),

  getRecentPayments: adminProcedure.query(async ({ ctx }) => {
    const items = await ctx.db
      .select({
        id: payments.id,
        userId: payments.userId,
        amount: payments.amount,
        currency: payments.currency,
        status: payments.status,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .orderBy(desc(payments.createdAt))
      .limit(20);

    return items;
  }),

  toggleFeatureFlag: adminProcedure
    .use(auditMiddleware("admin.toggleFeatureFlag"))
    .input(
      z.object({
        key: z.string().min(1),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const updated = await persistFlag(input.key, { enabled: input.enabled });
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Feature flag not found: ${input.key}`,
        });
      }
      return updated;
    }),

  getSystemHealth: adminProcedure.query(async ({ ctx }) => {
    // Database health check
    let dbStatus: "ok" | "error" = "ok";
    try {
      await ctx.db.select({ one: sql<number>`1` }).from(users).limit(1);
    } catch {
      dbStatus = "error";
    }

    // Feature flags loaded
    const flagCount = getAllFlags().length;

    return {
      api: "ok" as const,
      database: dbStatus,
      sentinel: flagCount > 0 && isFeatureEnabled("sentinel.monitoring")
        ? ("active" as const)
        : ("inactive" as const),
      websocket: "ok" as const,
      flagsLoaded: flagCount,
      timestamp: new Date().toISOString(),
    };
  }),
});
