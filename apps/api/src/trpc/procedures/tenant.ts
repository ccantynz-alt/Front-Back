import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  provisionTenantDB,
  checkTenantHealth,
  getTenantProjectInfo,
} from "@back-to-the-future/db/tenant-manager";
import { createProjectBranch } from "@back-to-the-future/db/neon-provisioning";

export const tenantRouter = router({
  /**
   * Get the current user's tenant database project info.
   */
  getProject: protectedProcedure.query(async ({ ctx }) => {
    const project = await getTenantProjectInfo(ctx.userId);
    if (!project) {
      return null;
    }

    // Mask the connection URI for security -- only show partial info
    const maskedUri = project.connectionUri
      ? `${project.connectionUri.slice(0, 25)}...`
      : "";

    return {
      id: project.id,
      neonProjectId: project.neonProjectId,
      region: project.region,
      status: project.status,
      plan: project.plan,
      connectionUri: maskedUri,
      fullConnectionUri: project.connectionUri,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }),

  /**
   * Provision a new tenant database.
   * Called when a user upgrades to Pro or Enterprise.
   */
  provision: protectedProcedure
    .input(
      z.object({
        plan: z.enum(["pro", "enterprise"]),
        region: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const project = await provisionTenantDB(
          ctx.userId,
          input.plan,
          input.region,
        );
        return {
          id: project.id,
          neonProjectId: project.neonProjectId,
          region: project.region,
          status: project.status,
          plan: project.plan,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Provisioning failed";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message,
        });
      }
    }),

  /**
   * Check the health of the tenant's database.
   */
  health: protectedProcedure.query(async ({ ctx }) => {
    const result = await checkTenantHealth(ctx.userId);
    return result;
  }),

  /**
   * Create a branch on the tenant's Neon project.
   * Branches are copy-on-write snapshots -- great for staging/testing.
   */
  createBranch: protectedProcedure
    .input(
      z.object({
        branchName: z.string().min(1).max(63),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await getTenantProjectInfo(ctx.userId);
      if (!project || project.status !== "active") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No active tenant database found.",
        });
      }

      if (!project.neonProjectId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Tenant database is still provisioning.",
        });
      }

      try {
        const branch = await createProjectBranch(
          project.neonProjectId,
          input.branchName,
        );
        return branch;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Branch creation failed";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message,
        });
      }
    }),
});
