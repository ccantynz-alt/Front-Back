// ── AI Deploy Procedures ──────────────────────────────────────────
// tRPC procedures for the AI-powered deploy flow. Users paste a
// GitHub repo URL and the system auto-detects the framework,
// configures the build, creates the project, and kicks off a deploy.
// Zero manual config. "Deploy anything in 30 seconds."

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, protectedProcedure } from "../init";
import { projects, deployments } from "@back-to-the-future/db";
import {
  detectFramework,
  parseGitHubUrl,
  DetectedConfigSchema,
  GitHubRepoUrlSchema,
} from "../../deploy/framework-detector";

// ── Helpers ─────────────────────────────────────────────────────────

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

const DB_FRAMEWORKS = [
  "solidstart", "nextjs", "remix", "astro", "hono", "static", "docker", "other",
] as const;
type DbFramework = (typeof DB_FRAMEWORKS)[number];

function mapDetectedFramework(detected: string): DbFramework {
  if (DB_FRAMEWORKS.includes(detected as DbFramework)) return detected as DbFramework;
  return "other";
}

const DB_RUNTIMES = ["bun", "node", "deno", "static"] as const;
type DbRuntime = (typeof DB_RUNTIMES)[number];

function mapDetectedRuntime(detected: string): DbRuntime {
  if (DB_RUNTIMES.includes(detected as DbRuntime)) return detected as DbRuntime;
  return "bun";
}

// ── Input Schemas ───────────────────────────────────────────────────

const DetectFrameworkInput = z.object({
  repoUrl: GitHubRepoUrlSchema,
});

const QuickDeployInput = z.object({
  repoUrl: GitHubRepoUrlSchema,
  projectName: z.string().min(1).max(200).optional(),
  // Optional overrides for the auto-detected config
  buildCommand: z.string().max(500).optional(),
  installCommand: z.string().max(500).optional(),
  runtime: z.enum(["bun", "node", "deno", "static"]).optional(),
  port: z.number().int().min(1).max(65535).optional(),
});

// ── Router ──────────────────────────────────────────────────────────

export const aiDeployRouter = router({
  /**
   * Detect the framework of a public GitHub repo. Returns the
   * auto-detected configuration without creating anything in the DB.
   * Use this for the preview step before deploying.
   */
  detectFramework: protectedProcedure
    .input(DetectFrameworkInput)
    .query(async ({ input }) => {
      try {
        const config = await detectFramework(input.repoUrl);
        const parsed = parseGitHubUrl(input.repoUrl);
        return {
          ...config,
          owner: parsed?.owner ?? "",
          repo: parsed?.repo ?? "",
        };
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.includes("not found")) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: err.message,
            });
          }
          if (err.message.includes("Access denied")) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: err.message,
            });
          }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Framework detection failed.",
        });
      }
    }),

  /**
   * Quick Deploy: detect framework, create project, create initial
   * deployment record — all in one call. The fastest path from repo
   * URL to deployed project.
   */
  quickDeploy: protectedProcedure
    .input(QuickDeployInput)
    .mutation(async ({ ctx, input }) => {
      // 1. Detect framework
      let config: z.infer<typeof DetectedConfigSchema>;
      try {
        config = await detectFramework(input.repoUrl);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Framework detection failed.";
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Detection failed: ${message}`,
        });
      }

      const parsed = parseGitHubUrl(input.repoUrl);
      if (!parsed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid GitHub URL.",
        });
      }

      // 2. Derive project name
      const projectName = input.projectName ?? parsed.repo;

      // 3. Check for duplicate repo URL
      const existing = await ctx.db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.repoUrl, input.repoUrl))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A project with this repository URL already exists.",
        });
      }

      // 4. Apply overrides
      const finalBuild = input.buildCommand ?? config.buildCommand;
      const finalInstall = input.installCommand ?? config.installCommand;
      const finalRuntime = input.runtime ?? mapDetectedRuntime(config.runtime);
      const finalPort = input.port ?? config.port;
      const finalFramework = mapDetectedFramework(config.framework);

      // 5. Create project
      const now = new Date();
      const projectId = generateId();

      await ctx.db.insert(projects).values({
        id: projectId,
        userId: ctx.userId,
        name: projectName,
        slug: slugify(projectName),
        repoUrl: input.repoUrl,
        framework: finalFramework,
        buildCommand: finalBuild,
        installCommand: finalInstall,
        runtime: finalRuntime,
        port: finalPort,
        outputDir: config.outputDir,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      // 6. Create initial deployment record
      const deployId = generateId();

      await ctx.db.insert(deployments).values({
        id: deployId,
        projectId,
        userId: ctx.userId,
        branch: "main",
        status: "queued",
        createdAt: now,
      });

      return {
        project: {
          id: projectId,
          name: projectName,
          repoUrl: input.repoUrl,
          framework: finalFramework,
          buildCommand: finalBuild,
          installCommand: finalInstall,
          runtime: finalRuntime,
          port: finalPort,
          outputDir: config.outputDir,
        },
        deployment: {
          id: deployId,
          status: "queued" as const,
        },
        detectedConfig: config,
      };
    }),
});
