// ── Deployments Procedures (BLK-009) ────────────────────────────────
// tRPC procedures for the push-to-deploy pipeline: create a deployment,
// list them for a project, poll status, fetch with logs, cancel a running
// build. All mutations verify project ownership before acting.
//
// This is the BACKEND half of BLK-009; the GitHub webhook receiver
// (apps/api/src/github/webhook.ts) calls into `enqueueBuild` directly
// after creating the deployment row, so the webhook path does not depend
// on a logged-in user.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  deployments,
  deploymentLogs,
  projects,
} from "@back-to-the-future/db";
import { router, protectedProcedure } from "../init";
import { emitDataChange } from "../../realtime/live-updates";
import { enqueueBuild } from "../../automation/build-runner";
import type { TRPCContext } from "../context";

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const DEFAULT_LOG_LIMIT = 1_000;
const MAX_LOG_LIMIT = 10_000;

// ── Helpers ──────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

type Database = TRPCContext["db"];

/** Verify the authenticated user owns the project, else throw NOT_FOUND. */
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

/** Load a deployment and verify the authenticated user owns its project. */
async function requireDeploymentAccess(
  db: Database,
  deploymentId: string,
  userId: string,
): Promise<typeof deployments.$inferSelect> {
  const rows = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);
  const deployment = rows[0];
  if (!deployment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deployment not found.",
    });
  }
  // Verify ownership through the parent project
  await requireProjectOwnership(db, deployment.projectId, userId);
  return deployment;
}

// ── Input schemas ────────────────────────────────────────────────────

const createInput = z.object({
  projectId: z.string().uuid(),
  commitSha: z
    .string()
    .min(7)
    .max(40)
    .regex(/^[0-9a-f]+$/i, "commitSha must be hex")
    .optional(),
  commitMessage: z.string().max(500).optional(),
  commitAuthor: z.string().max(200).optional(),
  branch: z.string().min(1).max(255).optional(),
  triggeredBy: z
    .enum(["manual", "webhook", "api", "scheduled"])
    .optional(),
});

const listInput = z.object({
  projectId: z.string().uuid(),
  limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
  status: z
    .enum([
      "queued",
      "building",
      "deploying",
      "live",
      "failed",
      "rolled_back",
      "cancelled",
    ])
    .optional(),
});

const getByIdInput = z.object({
  deploymentId: z.string().uuid(),
  logLimit: z.number().int().min(1).max(MAX_LOG_LIMIT).optional(),
});

const getStatusInput = z.object({
  deploymentId: z.string().uuid(),
});

const cancelInput = z.object({
  deploymentId: z.string().uuid(),
});

// ── Router ───────────────────────────────────────────────────────────

export const deploymentsRouter = router({
  /** Create a deployment record (status=queued) and enqueue the build. */
  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      const project = await requireProjectOwnership(
        ctx.db,
        input.projectId,
        ctx.userId,
      );

      const id = generateId();
      const now = new Date();
      const values: typeof deployments.$inferInsert = {
        id,
        projectId: project.id,
        userId: ctx.userId,
        commitSha: input.commitSha ?? null,
        commitMessage: input.commitMessage ?? null,
        commitAuthor: input.commitAuthor ?? null,
        branch: input.branch ?? project.repoBranch ?? "main",
        status: "queued",
        triggeredBy: input.triggeredBy ?? "manual",
        isCurrent: false,
        createdAt: now,
      };
      await ctx.db.insert(deployments).values(values);

      // Fire-and-forget: the build runner drains its own queue on a
      // long-lived Bun process. On Workers this is a no-op because the
      // queue module is only booted when `typeof Bun !== "undefined"`.
      try {
        enqueueBuild(id);
      } catch (err) {
        console.warn(
          `[deployments.create] enqueueBuild failed for ${id}:`,
          err instanceof Error ? err.message : String(err),
        );
      }

      emitDataChange(["projects", "deployments"], "deployment created");

      return {
        id,
        projectId: project.id,
        status: "queued" as const,
        branch: values.branch ?? "main",
        commitSha: values.commitSha,
        createdAt: now,
      };
    }),

  /** List deployments for a project (newest first). */
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    await requireProjectOwnership(ctx.db, input.projectId, ctx.userId);

    const limit = input.limit ?? DEFAULT_LIST_LIMIT;
    const where = input.status
      ? and(
          eq(deployments.projectId, input.projectId),
          eq(deployments.status, input.status),
        )
      : eq(deployments.projectId, input.projectId);

    const rows = await ctx.db
      .select({
        id: deployments.id,
        projectId: deployments.projectId,
        commitSha: deployments.commitSha,
        commitMessage: deployments.commitMessage,
        commitAuthor: deployments.commitAuthor,
        branch: deployments.branch,
        status: deployments.status,
        triggeredBy: deployments.triggeredBy,
        deployUrl: deployments.deployUrl,
        url: deployments.url,
        duration: deployments.duration,
        buildDuration: deployments.buildDuration,
        errorMessage: deployments.errorMessage,
        isCurrent: deployments.isCurrent,
        startedAt: deployments.startedAt,
        completedAt: deployments.completedAt,
        createdAt: deployments.createdAt,
      })
      .from(deployments)
      .where(where)
      .orderBy(desc(deployments.createdAt))
      .limit(limit);

    return rows;
  }),

  /** Get a single deployment including its log lines. */
  getById: protectedProcedure
    .input(getByIdInput)
    .query(async ({ ctx, input }) => {
      const deployment = await requireDeploymentAccess(
        ctx.db,
        input.deploymentId,
        ctx.userId,
      );

      const logLimit = input.logLimit ?? DEFAULT_LOG_LIMIT;
      const logs = await ctx.db
        .select({
          id: deploymentLogs.id,
          stream: deploymentLogs.stream,
          line: deploymentLogs.line,
          timestamp: deploymentLogs.timestamp,
        })
        .from(deploymentLogs)
        .where(eq(deploymentLogs.deploymentId, deployment.id))
        .orderBy(asc(deploymentLogs.timestamp))
        .limit(logLimit);

      return {
        id: deployment.id,
        projectId: deployment.projectId,
        commitSha: deployment.commitSha,
        commitMessage: deployment.commitMessage,
        commitAuthor: deployment.commitAuthor,
        branch: deployment.branch,
        status: deployment.status,
        triggeredBy: deployment.triggeredBy,
        deployUrl: deployment.deployUrl,
        url: deployment.url,
        duration: deployment.duration,
        buildDuration: deployment.buildDuration,
        errorMessage: deployment.errorMessage,
        isCurrent: deployment.isCurrent,
        startedAt: deployment.startedAt,
        completedAt: deployment.completedAt,
        cancelRequestedAt: deployment.cancelRequestedAt,
        createdAt: deployment.createdAt,
        finishedAt: deployment.finishedAt,
        logs,
      };
    }),

  /** Lightweight poll endpoint — just the status fields, no logs. */
  getStatus: protectedProcedure
    .input(getStatusInput)
    .query(async ({ ctx, input }) => {
      const deployment = await requireDeploymentAccess(
        ctx.db,
        input.deploymentId,
        ctx.userId,
      );
      return {
        id: deployment.id,
        status: deployment.status,
        startedAt: deployment.startedAt,
        completedAt: deployment.completedAt,
        deployUrl: deployment.deployUrl ?? deployment.url ?? null,
        errorMessage: deployment.errorMessage,
        buildDuration: deployment.buildDuration,
      };
    }),

  /**
   * Cancel a queued or running deployment. Sets `cancelRequestedAt` so the
   * build runner's cancellation checkpoints will flip the status to
   * `cancelled` at the next step boundary. Returns 409 if the deployment is
   * already in a terminal state.
   */
  cancel: protectedProcedure
    .input(cancelInput)
    .mutation(async ({ ctx, input }) => {
      const deployment = await requireDeploymentAccess(
        ctx.db,
        input.deploymentId,
        ctx.userId,
      );

      const terminal = new Set([
        "live",
        "failed",
        "rolled_back",
        "cancelled",
      ]);
      if (terminal.has(deployment.status)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Deployment is already in a terminal state: ${deployment.status}`,
        });
      }

      const now = new Date();
      // If still queued, flip straight to cancelled — no runner has started.
      // If building/deploying, mark a cancel request so the runner notices
      // between steps and transitions the row itself.
      if (deployment.status === "queued") {
        await ctx.db
          .update(deployments)
          .set({
            status: "cancelled",
            cancelRequestedAt: now,
            completedAt: now,
            finishedAt: now,
          })
          .where(eq(deployments.id, deployment.id));
      } else {
        await ctx.db
          .update(deployments)
          .set({ cancelRequestedAt: now })
          .where(eq(deployments.id, deployment.id));
      }

      emitDataChange(["deployments"], "deployment cancelled");

      return {
        id: deployment.id,
        status: deployment.status === "queued"
          ? ("cancelled" as const)
          : (deployment.status as
              | "building"
              | "deploying"),
        cancelRequestedAt: now,
      };
    }),
});
