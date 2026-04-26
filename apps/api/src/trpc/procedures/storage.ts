/**
 * tRPC procedures for file storage (presigned URLs + deletion).
 *
 * All operations are tenant-scoped via the authenticated user's ID.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../init";
import {
  generateUploadUrl,
  generateDownloadUrl,
  deleteFile,
} from "@back-to-the-future/storage";
import { createClientFromEnv } from "@back-to-the-future/object-storage/client";

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

  /**
   * BLK-018 — Admin-only signed PUT URL for the self-hosted object
   * storage backend (services/object-storage). Returns `{ url, key,
   * expiresAt }` so the admin caller can hand the URL to a single
   * trusted uploader (e.g. an internal asset migration script). Public
   * customer presigns continue to flow through `getUploadUrl` above.
   *
   * Returns PRECONDITION_FAILED when the self-hosted backend is not
   * configured — the admin should set OBJECT_STORAGE_ENDPOINT,
   * OBJECT_STORAGE_ACCESS_KEY_ID, and OBJECT_STORAGE_SECRET_ACCESS_KEY
   * (or MINIO_ROOT_USER + MINIO_ROOT_PASSWORD) on the API server.
   */
  getSignedUploadUrl: adminProcedure
    .input(
      z.object({
        key: z.string().min(1),
        contentType: z.string().min(1).optional(),
        expiresIn: z.number().int().min(60).max(3600).optional(),
      }),
    )
    .mutation(({ input }) => {
      const client = createClientFromEnv();
      if (!client) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Self-hosted object storage is not configured. " +
            "Set OBJECT_STORAGE_ENDPOINT and credentials on the API server.",
        });
      }
      const presignInput: {
        key: string;
        expiresIn: number;
        contentType?: string;
      } = {
        key: input.key,
        expiresIn: input.expiresIn ?? 900,
      };
      if (input.contentType) presignInput.contentType = input.contentType;
      const presigned = client.presignPut(presignInput);
      return {
        url: presigned.url,
        key: presigned.key,
        expiresAt: presigned.expiresAt,
      };
    }),
});
