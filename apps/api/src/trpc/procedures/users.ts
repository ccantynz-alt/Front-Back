import { z } from "zod";
import { eq, desc, gt, sql } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../init";
import { users } from "@back-to-the-future/db";
import {
  CreateUserInput,
  PaginationInput,
} from "@back-to-the-future/schemas";

const UpdateUserInput = z.object({
  id: z.string().uuid(),
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(100).optional(),
  role: z.enum(["admin", "editor", "viewer"]).optional(),
});

export const usersRouter = router({
  list: publicProcedure.input(PaginationInput).query(async ({ ctx, input }) => {
    const { cursor, limit } = input;

    const conditions = cursor ? gt(users.id, cursor) : undefined;

    const items = await ctx.db
      .select()
      .from(users)
      .where(conditions)
      .orderBy(desc(users.createdAt))
      .limit(limit + 1);

    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? resultItems[resultItems.length - 1]?.id ?? null : null;

    const totalResult = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(users);
    const total = totalResult[0]?.count ?? 0;

    return {
      items: resultItems,
      nextCursor,
      total,
    };
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);

      const user = result[0];
      if (!user) {
        throw new Error(`User not found: ${input.id}`);
      }

      return user;
    }),

  create: publicProcedure
    .input(CreateUserInput)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();

      const result = await ctx.db
        .insert(users)
        .values({
          id,
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const created = result[0];
      if (!created) {
        throw new Error("Failed to create user");
      }

      return created;
    }),

  update: publicProcedure
    .input(UpdateUserInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (fields.email !== undefined) updateData.email = fields.email;
      if (fields.displayName !== undefined) updateData.displayName = fields.displayName;
      if (fields.role !== undefined) updateData.role = fields.role;

      const result = await ctx.db
        .update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning();

      const updated = result[0];
      if (!updated) {
        throw new Error(`User not found: ${id}`);
      }

      return updated;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(users)
        .where(eq(users.id, input.id))
        .returning();

      const deleted = result[0];
      if (!deleted) {
        throw new Error(`User not found: ${input.id}`);
      }

      return { success: true as const, id: input.id };
    }),

  /**
   * Update the authenticated user's profile.
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.displayName !== undefined) {
        updateData.displayName = input.displayName;
      }

      const result = await ctx.db
        .update(users)
        .set(updateData)
        .where(eq(users.id, ctx.userId))
        .returning();

      const updated = result[0];
      if (!updated) {
        throw new Error(`User not found: ${ctx.userId}`);
      }

      return updated;
    }),
});
