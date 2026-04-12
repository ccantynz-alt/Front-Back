/**
 * tRPC procedures for file storage (presigned URLs + deletion).
 *
 * All operations are tenant-scoped via the authenticated user's ID.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  generateUploadUrl,
  generateDownloadUrl,
  deleteFile,
} from "@back-to-the-future/storage";

export const storageRouter = router({
  /**
   * Returns a presigned PUT URL for direct-to-R2 upload.
   */
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().min(1),
        expiresIn: z.number().int().min(60).max(3600).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = `uploads/${Date.now()}-${crypto.randomUUID()}-${input.filename}`;
      const result = await generateUploadUrl(
        ctx.userId,
        key,
        input.contentType,
        input.expiresIn,
      );

      if (!result) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "File storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
        });
      }

      return {
        uploadUrl: result.url,
        key: result.key,
        expiresIn: result.expiresIn,
      };
    }),

  /**
   * Returns a presigned GET URL for downloading a file.
   */
  getDownloadUrl: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1),
        expiresIn: z.number().int().min(60).max(3600).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Ensure the key belongs to this tenant (starts with userId/)
      if (!input.key.startsWith(`${ctx.userId}/`)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this file.",
        });
      }

      // Strip the tenantId prefix since generateDownloadUrl re-adds it
      const rawKey = input.key.slice(ctx.userId.length + 1);
      const result = await generateDownloadUrl(
        ctx.userId,
        rawKey,
        input.expiresIn,
      );

      if (!result) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "File storage is not configured.",
        });
      }

      return {
        downloadUrl: result.url,
        key: result.key,
        expiresIn: result.expiresIn,
      };
    }),

  /**
   * Deletes a file by key. Tenant-scoped: only the owner can delete.
   */
  delete: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ensure the key belongs to this tenant
      if (!input.key.startsWith(`${ctx.userId}/`)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this file.",
        });
      }

      const rawKey = input.key.slice(ctx.userId.length + 1);
      const deleted = await deleteFile(ctx.userId, rawKey);

      return { deleted, key: input.key };
    }),
});
