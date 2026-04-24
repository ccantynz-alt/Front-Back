// ── Projects Procedures ──────────────────────────────────────────────
// tRPC procedures for project management: CRUD, domains, env vars,
// and deployments. All mutations verify ownership before acting.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { resolve4 } from "node:dns/promises";
import { router, protectedProcedure } from "../init";
import {
  projects,
  projectDomains,
  projectEnvVars,
  deployments,
} from "@back-to-the-future/db";
import { emitDataChange } from "../../realtime/live-updates";
import { orchestratorDeploy } from "../../deploy/orchestrator-client";
import type { TRPCContext } from "../context";

// ── Constants ────────────────────────────────────────────────────────

const EXPECTED_A_RECORD = "204.168.251.243";

// ── Helpers ──────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

type Database = TRPCContext["db"];

/** Verify the authenticated user owns the project. Returns the project row or throws. */
async function requireProjectOwnership(
  db: Database,
  projectId: string,
  userId: string,
): Promise<typeof projects.$inferSelect> {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  const project = rows[0];
  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found or you do not have access.",
    });
  }

  return project;
}

/** Generate a unique slug, appending a suffix if the base slug is taken. */
async function generateUniqueSlug(
  db: Database,
  baseName: string,
): Promise<string> {
  const base = slugify(baseName);
  if (base.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Project name must contain at least one alphanumeric character.",
    });
  }

  // Try the base slug first
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, base))
    .limit(1);

  if (existing.length === 0) {
    return base;
  }

  // Append random suffix until unique
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = crypto.randomUUID().slice(0, 6);
    const candidate = `${base}-${suffix}`;
    const check = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, candidate))
      .limit(1);

    if (check.length === 0) {
      return candidate;
    }
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "Could not generate a unique slug. Try a different project name.",
  });
}

// ── Input Schemas ────────────────────────────────────────────────────

const frameworkEnum = z.enum([
  "solidstart",
  "nextjs",
  "remix",
  "astro",
  "hono",
  "other",
]);

const runtimeEnum = z.enum(["bun", "node", "deno"]);

const environmentEnum = z.enum(["production", "preview", "development"]);

const createProjectInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  repoUrl: z.string().url().optional(),
  framework: frameworkEnum.optional(),
  buildCommand: z.string().max(500).optional(),
  runtime: runtimeEnum.optional(),
  port: z.number().int().min(1).max(65535).optional(),
});

const updateProjectInput = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  repoUrl: z.string().url().optional(),
  framework: frameworkEnum.optional(),
  buildCommand: z.string().max(500).optional(),
  runtime: runtimeEnum.optional(),
  port: z.number().int().min(1).max(65535).optional(),
  status: z.enum(["creating", "active", "building", "deploying", "stopped", "error"]).optional(),
});

// ── Router ───────────────────────────────────────────────────────────

export const projectsRouter = router({
  /** List all projects for the authenticated user. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        description: projects.description,
        framework: projects.framework,
        runtime: projects.runtime,
        status: projects.status,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.userId, ctx.userId))
      .orderBy(desc(projects.updatedAt));

    return rows;
  }),

  /** Get a single project by ID, including its domains and latest deployment. */
  getById: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await requireProjectOwnership(
        ctx.db,
        input.projectId,
        ctx.userId,
      );

      const domains = await ctx.db
        .select({
          id: projectDomains.id,
          domain: projectDomains.domain,
          isPrimary: projectDomains.isPrimary,
          dnsVerified: projectDomains.dnsVerified,
          dnsVerifiedAt: projectDomains.dnsVerifiedAt,
          createdAt: projectDomains.createdAt,
        })
        .from(projectDomains)
        .where(eq(projectDomains.projectId, project.id));

      const latestDeploymentRows = await ctx.db
        .select({
          id: deployments.id,
          commitSha: deployments.commitSha,
          commitMessage: deployments.commitMessage,
          branch: deployments.branch,
          status: deployments.status,
          url: deployments.url,
          duration: deployments.duration,
          createdAt: deployments.createdAt,
        })
        .from(deployments)
        .where(eq(deployments.projectId, project.id))
        .orderBy(desc(deployments.createdAt))
        .limit(1);

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        repoUrl: project.repoUrl,
        framework: project.framework,
        buildCommand: project.buildCommand,
        runtime: project.runtime,
        port: project.port,
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        domains,
        latestDeployment: latestDeploymentRows[0] ?? null,
      };
    }),

  /** Create a new project. */
  create: protectedProcedure
    .input(createProjectInput)
    .mutation(async ({ ctx, input }) => {
      const id = generateId();
      const slug = await generateUniqueSlug(ctx.db, input.name);
      const now = new Date();

      const values: typeof projects.$inferInsert = {
        id,
        userId: ctx.userId,
        name: input.name,
        slug,
        description: input.description ?? null,
        repoUrl: input.repoUrl ?? null,
        framework: input.framework ?? null,
        buildCommand: input.buildCommand ?? null,
        runtime: input.runtime ?? null,
        port: input.port ?? null,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };

      await ctx.db.insert(projects).values(values);

      emitDataChange("projects", "project created");
      return {
        id,
        slug,
        name: input.name,
        status: "pending" as const,
        createdAt: now,
      };
    }),

  /** Update project settings. */
  update: protectedProcedure
    .input(updateProjectInput)
    .mutation(async ({ ctx, input }) => {
      await requireProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updates["name"] = input.name;
      if (input.description !== undefined)
        updates["description"] = input.description;
      if (input.repoUrl !== undefined) updates["repoUrl"] = input.repoUrl;
      if (input.framework !== undefined) updates["framework"] = input.framework;
      if (input.buildCommand !== undefined)
        updates["buildCommand"] = input.buildCommand;
      if (input.runtime !== undefined) updates["runtime"] = input.runtime;
      if (input.port !== undefined) updates["port"] = input.port;
      if (input.status !== undefined) updates["status"] = input.status;

      await ctx.db
        .update(projects)
        .set(updates)
        .where(eq(projects.id, input.projectId));

      emitDataChange("projects", "project updated");
      return { success: true, projectId: input.projectId };
    }),

  /** Delete a project. */
  delete: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireProjectOwnership(ctx.db, input.projectId, ctx.userId);

      await ctx.db
        .delete(projects)
        .where(eq(projects.id, input.projectId));

      emitDataChange("projects", "project deleted");
      return { success: true, projectId: input.projectId };
    }),

  /** Add a custom domain to a project. */
  addDomain: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        domain: z
          .string()
          .min(1)
          .max(253)
          .regex(
            /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i,
            "Invalid domain format",
          ),
        isPrimary: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireProjectOwnership(ctx.db, input.projectId, ctx.userId);

      // Check if domain already exists globally
      const existing = await ctx.db
        .select({ id: projectDomains.id })
        .from(projectDomains)
        .where(eq(projectDomains.domain, input.domain))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Domain "${input.domain}" is already in use.`,
        });
      }

      const id = generateId();
      const values: typeof projectDomains.$inferInsert = {
        id,
        projectId: input.projectId,
        domain: input.domain,
        isPrimary: input.isPrimary ?? false,
        dnsVerified: false,
        dnsVerifiedAt: null,
        createdAt: new Date(),
      };

      await ctx.db.insert(projectDomains).values(values);

      return {
        id,
        domain: input.domain,
        dnsVerified: false,
      };
    }),

  /** Remove a domain from a project. */
  removeDomain: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        domainId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const domainRows = await ctx.db
        .select({ id: projectDomains.id })
        .from(projectDomains)
        .where(
          and(
            eq(projectDomains.id, input.domainId),
            eq(projectDomains.projectId, input.projectId),
          ),
        )
        .limit(1);

      if (domainRows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Domain not found for this project.",
        });
      }

      await ctx.db
        .delete(projectDomains)
        .where(eq(projectDomains.id, input.domainId));

      return { success: true, domainId: input.domainId };
    }),

  /** Verify a domain by checking its DNS A record. */
  verifyDomain: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        domainId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const domainRows = await ctx.db
        .select({
          id: projectDomains.id,
          domain: projectDomains.domain,
        })
        .from(projectDomains)
        .where(
          and(
            eq(projectDomains.id, input.domainId),
            eq(projectDomains.projectId, input.projectId),
          ),
        )
        .limit(1);

      const domainRow = domainRows[0];
      if (!domainRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Domain not found for this project.",
        });
      }

      let verified = false;
      let dnsRecords: string[] = [];
      try {
        dnsRecords = await resolve4(domainRow.domain);
        verified = dnsRecords.includes(EXPECTED_A_RECORD);
      } catch (_dnsError: unknown) {
        // DNS lookup failed — domain not configured yet
        verified = false;
      }

      if (verified) {
        await ctx.db
          .update(projectDomains)
          .set({ dnsVerified: true, dnsVerifiedAt: new Date() })
          .where(eq(projectDomains.id, input.domainId));
      }

      return {
        domainId: input.domainId,
        domain: domainRow.domain,
        verified,
        dnsRecords,
        expectedRecord: EXPECTED_A_RECORD,
      };
    }),

  /** Set an environment variable for a project. Upserts by key + environment. */
  setEnvVar: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        key: z
          .string()
          .min(1)
          .max(256)
          .regex(/^[A-Z_][A-Z0-9_]*$/, "Env var key must be UPPER_SNAKE_CASE"),
        value: z.string().max(10_000),
        environment: environmentEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const env = input.environment ?? "production";

      // Check for existing key in the same environment
      const existing = await ctx.db
        .select({ id: projectEnvVars.id })
        .from(projectEnvVars)
        .where(
          and(
            eq(projectEnvVars.projectId, input.projectId),
            eq(projectEnvVars.key, input.key),
            eq(projectEnvVars.environment, env),
          ),
        )
        .limit(1);

      const existingRow = existing[0];
      const now = new Date();

      if (existingRow) {
        // Update existing
        await ctx.db
          .update(projectEnvVars)
          .set({ encryptedValue: input.value, updatedAt: now })
          .where(eq(projectEnvVars.id, existingRow.id));

        return { id: existingRow.id, key: input.key, environment: env, action: "updated" as const };
      }

      // Create new
      const id = generateId();
      const values: typeof projectEnvVars.$inferInsert = {
        id,
        projectId: input.projectId,
        key: input.key,
        encryptedValue: input.value,
        environment: env,
        createdAt: now,
        updatedAt: now,
      };

      await ctx.db.insert(projectEnvVars).values(values);

      return { id, key: input.key, environment: env, action: "created" as const };
    }),

  /** Delete an environment variable. */
  deleteEnvVar: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        envVarId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const existing = await ctx.db
        .select({ id: projectEnvVars.id })
        .from(projectEnvVars)
        .where(
          and(
            eq(projectEnvVars.id, input.envVarId),
            eq(projectEnvVars.projectId, input.projectId),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environment variable not found for this project.",
        });
      }

      await ctx.db
        .delete(projectEnvVars)
        .where(eq(projectEnvVars.id, input.envVarId));

      return { success: true, envVarId: input.envVarId };
    }),

  /** List environment variables for a project (keys only, not values). */
  listEnvVars: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireProjectOwnership(ctx.db, input.projectId, ctx.userId);

      const rows = await ctx.db
        .select({
          id: projectEnvVars.id,
          key: projectEnvVars.key,
          environment: projectEnvVars.environment,
          createdAt: projectEnvVars.createdAt,
          updatedAt: projectEnvVars.updatedAt,
        })
        .from(projectEnvVars)
        .where(eq(projectEnvVars.projectId, input.projectId));

      return rows;
    }),

  /**
   * Trigger a new deployment. Synchronously calls the orchestrator and records
   * the real outcome — no background queue, no polling. "Live" means live.
   */
  deploy: protectedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        commitSha: z.string().max(40).optional(),
        commitMessage: z.string().max(500).optional(),
        branch: z.string().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await requireProjectOwnership(
        ctx.db,
        input.projectId,
        ctx.userId,
      );

      // Allow deploying any project the user owns EXCEPT ones mid-build or
      // already-being-torn-down. "pending" and "active" are both valid entry
      // points (first deploy and redeploy respectively).
      if (project.status === "building" || project.status === "deploying") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A deployment is already in progress for this project.",
        });
      }

      const branch = input.branch ?? "main";
      const id = generateId();
      const now = new Date();

      // ── Step 1: Insert the deployment row as "building" ──
      const values: typeof deployments.$inferInsert = {
        id,
        projectId: input.projectId,
        userId: ctx.userId,
        commitSha: input.commitSha ?? null,
        commitMessage: input.commitMessage ?? null,
        branch,
        status: "building",
        url: null,
        duration: null,
        createdAt: now,
      };

      await ctx.db.insert(deployments).values(values);
      emitDataChange(["projects", "deployments"], "deployment started");

      // ── Step 2: Synchronously call the orchestrator ──
      const orchestratorUrl = process.env["ORCHESTRATOR_URL"];
      if (!orchestratorUrl) {
        const errMsg = "ORCHESTRATOR_URL is not configured";
        await ctx.db
          .update(deployments)
          .set({
            status: "failed",
            errorMessage: errMsg,
            completedAt: new Date(),
          })
          .where(eq(deployments.id, id));
        emitDataChange(["projects", "deployments"], "deployment failed");
        return {
          id,
          projectId: input.projectId,
          status: "failed" as const,
          branch,
          createdAt: now,
          error: errMsg,
          url: null,
        };
      }

      try {
        const result = await orchestratorDeploy({
          appName: project.slug,
          repoUrl: project.repoUrl ?? "",
          branch,
          domain: `${project.slug}.crontech.ai`,
          port: project.port ?? 3000,
          runtime: project.runtime === "node" ? "nextjs" : "bun",
        });

        // ── Step 3a: Success — mark deployment + parent project as active ──
        const completedAt = new Date();
        await ctx.db
          .update(deployments)
          .set({
            status: "active",
            url: result.url,
            deployUrl: result.url,
            completedAt,
          })
          .where(eq(deployments.id, id));

        await ctx.db
          .update(projects)
          .set({ status: "active", updatedAt: completedAt })
          .where(eq(projects.id, input.projectId));

        emitDataChange(["projects", "deployments"], "deployment live");
        return {
          id,
          projectId: input.projectId,
          status: "active" as const,
          branch,
          createdAt: now,
          url: result.url,
          error: null,
        };
      } catch (err: unknown) {
        // ── Step 3b: Failure — mark deployment failed, leave project pending ──
        const errMsg =
          err instanceof Error ? err.message : "Orchestrator unreachable";
        await ctx.db
          .update(deployments)
          .set({
            status: "failed",
            errorMessage: errMsg,
            completedAt: new Date(),
          })
          .where(eq(deployments.id, id));

        emitDataChange(["projects", "deployments"], "deployment failed");
        return {
          id,
          projectId: input.projectId,
          status: "failed" as const,
          branch,
          createdAt: now,
          url: null,
          error: errMsg,
        };
      }
    }),
});
