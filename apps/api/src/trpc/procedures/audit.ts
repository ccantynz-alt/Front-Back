import { z } from "zod";
import { eq, and, desc, gt, sql } from "drizzle-orm";
import { router, adminProcedure } from "../init";
import { auditLogs } from "@back-to-the-future/db";
import { PaginationInput } from "@back-to-the-future/schemas";

export const auditRouter = router({
  list: adminProcedure.input(PaginationInput).query(async ({ ctx, input }) => {
    const { cursor, limit } = input;

    const conditions = cursor ? gt(auditLogs.id, cursor) : undefined;

    const items = await ctx.db
      .select()
      .from(auditLogs)
      .where(conditions)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit + 1);

    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? resultItems[resultItems.length - 1]?.id ?? null : null;

    const totalResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs);
    const total = totalResult[0]?.count ?? 0;

    return {
      items: resultItems,
      nextCursor,
      total,
    };
  }),

  getByResource: adminProcedure
    .input(
      z.object({
        resourceType: z.string().min(1),
        resourceId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.resourceType, input.resourceType),
            eq(auditLogs.resourceId, input.resourceId),
          ),
        )
        .orderBy(desc(auditLogs.timestamp));

      return items;
    }),
});
