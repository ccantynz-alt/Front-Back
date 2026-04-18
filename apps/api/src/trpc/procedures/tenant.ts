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
import { orchestratorFetch } from "../../deploy/orchestrator-client";

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
      const tenantValues: Record<string, unknown> = {
        id: tenantId,
        name: input.name,
        slug: input.slug,
        plan: input.plan,
        ownerEmail: input.ownerEmail,
        status: "provisioning",
        createdAt: new Date(),
      };
      if (input.customDomain !== undefined) {
        tenantValues["customDomain"] = input.customDomain;
      }
      await ctx.db.insert(tenants).values(tenantValues as typeof tenants.$inferInsert);

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

  // ── Deploy: trigger app deployment via orchestrator ────────────────

  deploy: adminProcedure
    .use(auditMiddleware("tenant.deploy"))
    .input(
      z.object({
        appName: z.string().min(1).max(100),
        repoUrl: z.string().url(),
        branch: z.string().min(1).default("main"),
        domain: z.string().min(1),
        subdomain: z.string().optional(),
        port: z.number().int().min(1024).max(65535),
        runtime: z.enum(["nextjs", "bun"]),
        envVars: z.record(z.string(), z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return orchestratorFetch<{
        containerId: string;
        appName: string;
        domain: string;
        url: string;
        status: string;
        healthCheck: string;
      }>("/deploy", {
        method: "POST",
        body: JSON.stringify(input),
      });
    }),

  // ── App Status: get container status + health ─────────────────────

  appStatus: adminProcedure
    .input(z.object({ appName: z.string().min(1) }))
    .query(async ({ input }) => {
      return orchestratorFetch<{
        name: string;
        containerId: string;
        image: string;
        status: string;
        port: number;
        domain: string;
        healthUrl: string | null;
        uptime: string;
        createdAt: string;
      }>(`/status/${encodeURIComponent(input.appName)}`);
    }),

  // ── App Logs: get recent container logs ───────────────────────────

  appLogs: adminProcedure
    .input(
      z.object({
        appName: z.string().min(1),
        tail: z.number().int().min(1).max(1000).default(100),
      }),
    )
    .query(async ({ input }) => {
      return orchestratorFetch<{ appName: string; logs: string }>(
        `/logs/${encodeURIComponent(input.appName)}?tail=${input.tail}`,
      );
    }),

  // ── Rollback: revert to previous image ────────────────────────────

  appRollback: adminProcedure
    .use(auditMiddleware("tenant.rollback"))
    .input(z.object({ appName: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return orchestratorFetch<{ status: string; appName: string }>(
        "/rollback",
        {
          method: "POST",
          body: JSON.stringify({ appName: input.appName }),
        },
      );
    }),

  // ── Undeploy: stop and remove an app ──────────────────────────────

  appUndeploy: adminProcedure
    .use(auditMiddleware("tenant.undeploy"))
    .input(z.object({ appName: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return orchestratorFetch<{ status: string; appName: string }>(
        "/undeploy",
        {
          method: "POST",
          body: JSON.stringify({ appName: input.appName }),
        },
      );
    }),

  // ── List All Deployed Apps ────────────────────────────────────────

  appList: adminProcedure.query(async () => {
    return orchestratorFetch<{
      apps: Array<{
        name: string;
        containerId: string;
        image: string;
        status: string;
        port: number;
        domain: string;
      }>;
    }>("/apps");
  }),
});
