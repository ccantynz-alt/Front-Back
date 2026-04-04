import { z } from "zod";
import { eq, and, desc, gt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../init";
import { sites, deployments } from "@back-to-the-future/db";
import { PaginationInput } from "@back-to-the-future/schemas";
import {
  generateSiteFiles,
  bundleSite,
  deployToCloudflarePages,
  getDeploymentStatus,
  createProject,
} from "@back-to-the-future/ai-core";
import {
  checkSiteLimit,
  checkDeploymentLimit,
} from "../../billing/plan-limits";

// ── Input Schemas ──────────────────────────────────────────────────

const CreateSiteInput = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
      message:
        "Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen",
    }),
  description: z.string().max(2000).optional(),
  pageLayout: z.string().optional(), // JSON stored as text
});

const UpdateSiteInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  pageLayout: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

const DeploySiteInput = z.object({
  siteId: z.string().uuid(),
});

// ── Router ─────────────────────────────────────────────────────────

export const sitesRouter = router({
  /**
   * List current user's sites with cursor-based pagination.
   */
  list: protectedProcedure
    .input(PaginationInput)
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;

      const conditions = cursor
        ? and(eq(sites.userId, ctx.userId), gt(sites.id, cursor))
        : eq(sites.userId, ctx.userId);

      const items = await ctx.db
        .select()
        .from(sites)
        .where(conditions)
        .orderBy(desc(sites.createdAt))
        .limit(limit + 1);

      const hasMore = items.length > limit;
      const resultItems = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore
        ? (resultItems[resultItems.length - 1]?.id ?? null)
        : null;

      const totalResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(sites)
        .where(eq(sites.userId, ctx.userId));
      const total = totalResult[0]?.count ?? 0;

      return {
        items: resultItems,
        nextCursor,
        total,
      };
    }),

  /**
   * Get a site by ID. Must belong to the authenticated user.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select()
        .from(sites)
        .where(and(eq(sites.id, input.id), eq(sites.userId, ctx.userId)))
        .limit(1);

      const site = result[0];
      if (!site) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Site not found: ${input.id}`,
        });
      }

      return site;
    }),

  /**
   * Get a site by slug. Public access (no auth required).
   */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select()
        .from(sites)
        .where(eq(sites.slug, input.slug))
        .limit(1);

      const site = result[0];
      if (!site) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Site not found with slug: ${input.slug}`,
        });
      }

      return site;
    }),

  /**
   * Create a new site for the authenticated user.
   */
  create: protectedProcedure
    .input(CreateSiteInput)
    .mutation(async ({ ctx, input }) => {
      // Enforce plan site limit
      const siteLimit = await checkSiteLimit(ctx.db, ctx.userId);
      if (!siteLimit.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Site limit reached (${siteLimit.current}/${siteLimit.limit}). Upgrade your plan to create more sites.`,
        });
      }

      // Check slug uniqueness
      const existing = await ctx.db
        .select({ id: sites.id })
        .from(sites)
        .where(eq(sites.slug, input.slug))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A site with slug "${input.slug}" already exists.`,
        });
      }

      const id = crypto.randomUUID();
      const now = new Date();

      const result = await ctx.db
        .insert(sites)
        .values({
          id,
          userId: ctx.userId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          pageLayout: input.pageLayout ?? null,
          status: "draft",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const created = result[0];
      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create site.",
        });
      }

      return created;
    }),

  /**
   * Update an existing site. Must belong to the authenticated user.
   */
  update: protectedProcedure
    .input(UpdateSiteInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (fields.name !== undefined) updateData.name = fields.name;
      if (fields.description !== undefined)
        updateData.description = fields.description;
      if (fields.pageLayout !== undefined)
        updateData.pageLayout = fields.pageLayout;
      if (fields.status !== undefined) updateData.status = fields.status;

      const result = await ctx.db
        .update(sites)
        .set(updateData)
        .where(and(eq(sites.id, id), eq(sites.userId, ctx.userId)))
        .returning();

      const updated = result[0];
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Site not found: ${id}`,
        });
      }

      return updated;
    }),

  /**
   * Delete a site. Must belong to the authenticated user.
   * Cascade deletes associated deployments (handled by DB FK constraint).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(sites)
        .where(and(eq(sites.id, input.id), eq(sites.userId, ctx.userId)))
        .returning();

      const deleted = result[0];
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Site not found: ${input.id}`,
        });
      }

      return { success: true as const, id: input.id };
    }),

  /**
   * Trigger a deployment for a site.
   * 1. Validates the site belongs to the user and has a pageLayout.
   * 2. Creates a Cloudflare Pages project if one doesn't exist.
   * 3. Generates site files from the pageLayout.
   * 4. Bundles the site into deployable assets.
   * 5. Deploys to Cloudflare Pages.
   * 6. Creates a deployment record in the database.
   */
  deploy: protectedProcedure
    .input(DeploySiteInput)
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch and validate the site
      const siteResult = await ctx.db
        .select()
        .from(sites)
        .where(and(eq(sites.id, input.siteId), eq(sites.userId, ctx.userId)))
        .limit(1);

      const site = siteResult[0];
      if (!site) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Site not found: ${input.siteId}`,
        });
      }

      // Enforce plan deployment limit
      const deployLimit = await checkDeploymentLimit(ctx.db, ctx.userId);
      if (!deployLimit.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Monthly deployment limit reached (${deployLimit.current}/${deployLimit.limit}). Upgrade your plan for more deployments.`,
        });
      }

      if (!site.pageLayout) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Site has no page layout. Generate or set a page layout before deploying.",
        });
      }

      let pageLayout: unknown;
      try {
        pageLayout = JSON.parse(site.pageLayout);
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Site pageLayout is not valid JSON.",
        });
      }

      // Create a pending deployment record
      const deploymentId = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(deployments).values({
        id: deploymentId,
        siteId: site.id,
        userId: ctx.userId,
        status: "pending",
        createdAt: now,
      });

      try {
        // 2. Create Cloudflare project if needed
        let projectName = site.cloudflareProjectId;
        if (!projectName) {
          const project = await createProject(site.slug);
          projectName = project.projectName;

          await ctx.db
            .update(sites)
            .set({
              cloudflareProjectId: project.projectName,
              subdomain: project.subdomain,
              updatedAt: new Date(),
            })
            .where(eq(sites.id, site.id));
        }

        // 3. Update deployment status to building
        await ctx.db
          .update(deployments)
          .set({ status: "building" })
          .where(eq(deployments.id, deploymentId));

        // 4. Generate site files from the page layout
        const siteFiles = generateSiteFiles(
          pageLayout as Parameters<typeof generateSiteFiles>[0],
        );

        // 5. Bundle the site
        const bundled = await bundleSite(siteFiles);

        // 6. Deploy to Cloudflare Pages
        const deployResult = await deployToCloudflarePages({
          projectName,
          files: bundled.files,
        });

        // 7. Update deployment record with success
        await ctx.db
          .update(deployments)
          .set({
            status: "success",
            cloudflareDeploymentId: deployResult.id,
            url: deployResult.url,
          })
          .where(eq(deployments.id, deploymentId));

        // 8. Update site status to published
        await ctx.db
          .update(sites)
          .set({ status: "published", updatedAt: new Date() })
          .where(eq(sites.id, site.id));

        return {
          deploymentId,
          url: deployResult.url,
          cloudflareDeploymentId: deployResult.id,
          status: "success" as const,
        };
      } catch (error) {
        // Mark deployment as failed
        await ctx.db
          .update(deployments)
          .set({ status: "failed" })
          .where(eq(deployments.id, deploymentId));

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? `Deployment failed: ${error.message}`
              : "Deployment failed due to an unknown error.",
        });
      }
    }),

  /**
   * List deployments for a site. Must belong to the authenticated user.
   */
  deployments: protectedProcedure
    .input(
      z.object({
        siteId: z.string().uuid(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify the site belongs to the user
      const siteResult = await ctx.db
        .select({ id: sites.id })
        .from(sites)
        .where(and(eq(sites.id, input.siteId), eq(sites.userId, ctx.userId)))
        .limit(1);

      if (siteResult.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Site not found: ${input.siteId}`,
        });
      }

      const conditions = input.cursor
        ? and(
            eq(deployments.siteId, input.siteId),
            gt(deployments.id, input.cursor),
          )
        : eq(deployments.siteId, input.siteId);

      const items = await ctx.db
        .select()
        .from(deployments)
        .where(conditions)
        .orderBy(desc(deployments.createdAt))
        .limit(input.limit + 1);

      const hasMore = items.length > input.limit;
      const resultItems = hasMore ? items.slice(0, input.limit) : items;
      const nextCursor = hasMore
        ? (resultItems[resultItems.length - 1]?.id ?? null)
        : null;

      return {
        items: resultItems,
        nextCursor,
      };
    }),

  /**
   * Get the status of a specific deployment, including live Cloudflare status.
   */
  deploymentStatus: protectedProcedure
    .input(z.object({ deploymentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Fetch the deployment record
      const result = await ctx.db
        .select()
        .from(deployments)
        .where(eq(deployments.id, input.deploymentId))
        .limit(1);

      const deployment = result[0];
      if (!deployment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Deployment not found: ${input.deploymentId}`,
        });
      }

      // Verify the deployment belongs to the user
      if (deployment.userId !== ctx.userId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Deployment not found: ${input.deploymentId}`,
        });
      }

      // If the deployment has a Cloudflare ID and isn't in a terminal state,
      // fetch live status from Cloudflare
      if (
        deployment.cloudflareDeploymentId &&
        deployment.status !== "success" &&
        deployment.status !== "failed" &&
        deployment.status !== "cancelled"
      ) {
        // Look up the site to get the project name
        const siteResult = await ctx.db
          .select({ cloudflareProjectId: sites.cloudflareProjectId })
          .from(sites)
          .where(eq(sites.id, deployment.siteId))
          .limit(1);

        const projectName = siteResult[0]?.cloudflareProjectId;
        if (projectName) {
          try {
            const liveStatus = await getDeploymentStatus(
              deployment.cloudflareDeploymentId,
              projectName,
            );

            return {
              ...deployment,
              liveStatus,
            };
          } catch {
            // If we can't reach Cloudflare, return the DB record as-is
          }
        }
      }

      return {
        ...deployment,
        liveStatus: null,
      };
    }),
});
