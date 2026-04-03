import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../init";
import { assets, projects } from "@cronix/db";
import { PaginationInput } from "@cronix/schemas";

const CreateAssetInput = z.object({
  projectId: z.string().uuid(),
  filename: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(127),
  sizeBytes: z.number().int().nonnegative(),
  storageKey: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const assetsRouter = router({
  list: protectedProcedure
    .input(
      PaginationInput.extend({
        projectId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { projectId, cursor, limit } = input;

      // Verify user owns the project
      const projectResult = await ctx.neonDb
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.userId, ctx.userId),
          ),
        )
        .limit(1);

      if (!projectResult[0]) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const conditions = [
        eq(assets.projectId, projectId),
        ...(cursor ? [sql`${assets.id} > ${cursor}`] : []),
      ];

      const items = await ctx.neonDb
        .select()
        .from(assets)
        .where(and(...conditions))
        .orderBy(desc(assets.createdAt))
        .limit(limit + 1);

      const hasMore = items.length > limit;
      const resultItems = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore
        ? (resultItems[resultItems.length - 1]?.id ?? null)
        : null;

      const totalResult = await ctx.neonDb
        .select({ count: sql<number>`count(*)` })
        .from(assets)
        .where(eq(assets.projectId, projectId));
      const total = totalResult[0]?.count ?? 0;

      return {
        items: resultItems,
        nextCursor,
        total,
      };
    }),

  create: protectedProcedure
    .input(CreateAssetInput)
    .mutation(async ({ ctx, input }) => {
      // Verify user owns the project
      const projectResult = await ctx.neonDb
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.userId, ctx.userId),
          ),
        )
        .limit(1);

      if (!projectResult[0]) {
        throw new Error(`Project not found: ${input.projectId}`);
      }

      const id = crypto.randomUUID();

      const result = await ctx.neonDb
        .insert(assets)
        .values({
          id,
          projectId: input.projectId,
          userId: ctx.userId,
          filename: input.filename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          storageKey: input.storageKey,
          metadata: input.metadata ?? {},
          createdAt: new Date(),
        })
        .returning();

      const created = result[0];
      if (!created) {
        throw new Error("Failed to create asset");
      }

      return created;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.neonDb
        .delete(assets)
        .where(
          and(eq(assets.id, input.id), eq(assets.userId, ctx.userId)),
        )
        .returning();

      if (!result[0]) {
        throw new Error(`Asset not found: ${input.id}`);
      }

      return { success: true as const, id: input.id, storageKey: result[0].storageKey };
    }),

  getUploadUrl: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        filename: z.string().min(1).max(512),
        mimeType: z.string().min(1).max(127),
        sizeBytes: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user owns the project
      const projectResult = await ctx.neonDb
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.userId, ctx.userId),
          ),
        )
        .limit(1);

      if (!projectResult[0]) {
        throw new Error(`Project not found: ${input.projectId}`);
      }

      // Generate a unique storage key for R2
      const storageKey = `projects/${input.projectId}/assets/${crypto.randomUUID()}/${input.filename}`;

      // In production, this would generate a presigned R2 upload URL.
      // For now, return the storage key and a placeholder URL.
      // Integration with Cloudflare R2 presigned URLs will use:
      //   const url = await r2Bucket.createMultipartUpload(storageKey);
      // or the S3-compatible presigned URL API.
      const uploadUrl = `https://r2.cronix.dev/upload/${storageKey}`;

      return {
        uploadUrl,
        storageKey,
        expiresIn: 3600,
      };
    }),
});
