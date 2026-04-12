import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure, middleware } from "../init";
import {
  tenants,
  users,
} from "@back-to-the-future/db";
import {
  provisionTenantDB,
  checkTenantHealth,
  getTenantProjectInfo,
} from "@back-to-the-future/db/tenant-manager";
import { createProjectBranch } from "@back-to-the-future/db/neon-provisioning";
import { fileExists } from "@back-to-the-future/storage/client";
import { enqueueTenantProvision } from "@back-to-the-future/queue";
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

export const tenantRouter = router({
  // ── New: Provision a tenant (admin-only) ───────────────────────────

  provision: adminProcedure
    .use(auditMiddleware("tenant.provision"))
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .min(3)
          .max(50),
        plan: z.enum(["free", "starter", "pro", "enterprise"]),
        ownerEmail: z.string().email(),
        customDomain: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Check slug uniqueness
      const existing = await ctx.db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, input.slug))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Slug "${input.slug}" is already taken.`,
        });
      }

      // 2. Insert into tenants table
      const tenantId = crypto.randomUUID();
      await ctx.db.insert(tenants).values({
        id: tenantId,
        name: input.name,
        slug: input.slug,
        plan: input.plan,
        ownerEmail: input.ownerEmail,
        customDomain: input.customDomain ?? null,
        status: "provisioning",
        createdAt: new Date(),
      });

      // 3. R2 storage prefix verification (non-blocking)
      try {
        const exists = await fileExists(tenantId, ".keep");
        if (!exists) {
          console.warn(
            `[tenant.provision] R2 storage prefix not found for tenant ${tenantId}. Storage may not be configured.`,
          );
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown storage error";
        console.warn(
          `[tenant.provision] R2 storage check failed for tenant ${tenantId}: ${message}`,
        );
      }

      // 4. Enqueue provision_tenant job
      try {
        await enqueueTenantProvision({
          tenantId,
          plan: input.plan,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Queue enqueue failed";
        console.warn(
          `[tenant.provision] Failed to enqueue provision job for ${tenantId}: ${message}`,
        );
      }

      // 5. Update tenant status to active
      await ctx.db
        .update(tenants)
        .set({ status: "active" })
        .where(eq(tenants.id, tenantId));

      // 6. Return result
      return {
        tenantId,
        slug: input.slug,
        status: "active" as const,
      };
    }),

  // ── New: List all tenants (admin-only) ─────────────────────────────

  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        plan: tenants.plan,
        status: tenants.status,
        createdAt: tenants.createdAt,
        customDomain: tenants.customDomain,
      })
      .from(tenants);

    return rows;
  }),

  // ── New: Get tenant by slug (public) ───────────────────────────────

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          plan: tenants.plan,
          status: tenants.status,
          customDomain: tenants.customDomain,
        })
        .from(tenants)
        .where(eq(tenants.slug, input.slug))
        .limit(1);

      const tenant = rows[0];
      if (!tenant) {
        return null;
      }

      return tenant;
    }),

  // ── Existing: Get project ──────────────────────────────────────────

  getProject: protectedProcedure.query(async ({ ctx }) => {
    const project = await getTenantProjectInfo(ctx.userId);
    if (!project) {
      return null;
    }

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

  // ── Existing: Provision tenant DB ──────────────────────────────────

  provisionDB: protectedProcedure
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

  // ── Existing: Health check ─────────────────────────────────────────

  health: protectedProcedure.query(async ({ ctx }) => {
    const result = await checkTenantHealth(ctx.userId);
    return result;
  }),

  // ── Existing: Create branch ────────────────────────────────────────

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
