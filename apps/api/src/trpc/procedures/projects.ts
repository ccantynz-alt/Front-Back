import { z } from "zod";
import { eq, and, desc, gt, sql, asc } from "drizzle-orm";
import { router, protectedProcedure } from "../init";
import { projects, pages } from "@cronix/db";
import { PaginationInput } from "@cronix/schemas";

const ProjectTypeEnum = z.enum(["website", "video"]);

const CreateProjectInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  type: ProjectTypeEnum,
  settings: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const UpdateProjectInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  type: ProjectTypeEnum.optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const projectsRouter = router({
  list: protectedProcedure
    .input(
      PaginationInput.extend({
        type: ProjectTypeEnum.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit, type } = input;

      const conditions = [
        eq(projects.userId, ctx.userId),
        eq(projects.isDeleted, false),
        ...(cursor ? [gt(projects.id, cursor)] : []),
        ...(type ? [eq(projects.type, type)] : []),
      ];

      const items = await ctx.neonDb
        .select()
        .from(projects)
        .where(and(...conditions))
        .orderBy(desc(projects.createdAt))
        .limit(limit + 1);

      const hasMore = items.length > limit;
      const resultItems = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore
        ? (resultItems[resultItems.length - 1]?.id ?? null)
        : null;

      const totalResult = await ctx.neonDb
        .select({ count: sql<number>`count(*)` })
        .from(projects)
        .where(
          and(
            eq(projects.userId, ctx.userId),
            eq(projects.isDeleted, false),
            ...(type ? [eq(projects.type, type)] : []),
          ),
        );
      const total = totalResult[0]?.count ?? 0;

      return {
        items: resultItems,
        nextCursor,
        total,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projectResult = await ctx.neonDb
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.id),
            eq(projects.userId, ctx.userId),
            eq(projects.isDeleted, false),
          ),
        )
        .limit(1);

      const project = projectResult[0];
      if (!project) {
        throw new Error(`Project not found: ${input.id}`);
      }

      const projectPages = await ctx.neonDb
        .select()
        .from(pages)
        .where(eq(pages.projectId, input.id))
        .orderBy(asc(pages.order));

      return {
        ...project,
        pages: projectPages,
      };
    }),

  create: protectedProcedure
    .input(CreateProjectInput)
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const now = new Date();

      const result = await ctx.neonDb
        .insert(projects)
        .values({
          id,
          userId: ctx.userId,
          name: input.name,
          description: input.description ?? null,
          type: input.type,
          settings: input.settings ?? {},
          metadata: input.metadata ?? {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const created = result[0];
      if (!created) {
        throw new Error("Failed to create project");
      }

      return created;
    }),

  update: protectedProcedure
    .input(UpdateProjectInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (fields.name !== undefined) updateData.name = fields.name;
      if (fields.description !== undefined)
        updateData.description = fields.description;
      if (fields.type !== undefined) updateData.type = fields.type;
      if (fields.settings !== undefined) updateData.settings = fields.settings;
      if (fields.metadata !== undefined) updateData.metadata = fields.metadata;

      const result = await ctx.neonDb
        .update(projects)
        .set(updateData)
        .where(
          and(
            eq(projects.id, id),
            eq(projects.userId, ctx.userId),
            eq(projects.isDeleted, false),
          ),
        )
        .returning();

      const updated = result[0];
      if (!updated) {
        throw new Error(`Project not found: ${id}`);
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        hard: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.hard) {
        const result = await ctx.neonDb
          .delete(projects)
          .where(
            and(eq(projects.id, input.id), eq(projects.userId, ctx.userId)),
          )
          .returning();

        if (!result[0]) {
          throw new Error(`Project not found: ${input.id}`);
        }
      } else {
        const result = await ctx.neonDb
          .update(projects)
          .set({
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(projects.id, input.id),
              eq(projects.userId, ctx.userId),
              eq(projects.isDeleted, false),
            ),
          )
          .returning();

        if (!result[0]) {
          throw new Error(`Project not found: ${input.id}`);
        }
      }

      return { success: true as const, id: input.id };
    }),

  publish: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        isPublished: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.neonDb
        .update(projects)
        .set({
          isPublished: input.isPublished,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projects.id, input.id),
            eq(projects.userId, ctx.userId),
            eq(projects.isDeleted, false),
          ),
        )
        .returning();

      const updated = result[0];
      if (!updated) {
        throw new Error(`Project not found: ${input.id}`);
      }

      return updated;
    }),
});
