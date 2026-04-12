import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure, middleware } from "../init";
import { users } from "@back-to-the-future/db";
import {
  getAllFlags,
  getFlag,
  isFeatureEnabled,
  updateFlagPersisted,
  type FeatureFlag,
} from "../../feature-flags";

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

export const featureFlagsRouter = router({
  getAll: publicProcedure.query(({ ctx }): Array<FeatureFlag & { evaluatedEnabled: boolean }> => {
    const flags = getAllFlags();
    const userId = ctx.userId ?? undefined;
    return flags.map((flag) => ({
      ...flag,
      evaluatedEnabled: isFeatureEnabled(flag.key, userId),
    }));
  }),

  isEnabled: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(({ input, ctx }): { key: string; enabled: boolean } => {
      const userId = ctx.userId ?? undefined;
      return {
        key: input.key,
        enabled: isFeatureEnabled(input.key, userId),
      };
    }),

  evaluate: publicProcedure
    .input(z.object({
      flagKey: z.string(),
      userId: z.string().optional(),
    }))
    .query(({ input }): { key: string; enabled: boolean; flag: FeatureFlag | null } => {
      const flag = getFlag(input.flagKey) ?? null;
      const enabled = isFeatureEnabled(input.flagKey, input.userId);
      return { key: input.flagKey, enabled, flag };
    }),

  /** Admin-only: update a feature flag at runtime (persisted to DB). */
  update: adminProcedure
    .input(
      z.object({
        key: z.string().min(1),
        enabled: z.boolean().optional(),
        rolloutPercentage: z.number().int().min(0).max(100).optional(),
        allowList: z.array(z.string()).optional(),
        denyList: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const updates: Partial<Omit<FeatureFlag, "key">> = {};
      if (input.enabled !== undefined) updates.enabled = input.enabled;
      if (input.rolloutPercentage !== undefined)
        updates.rolloutPercentage = input.rolloutPercentage;
      if (input.allowList !== undefined) updates.allowList = input.allowList;
      if (input.denyList !== undefined) updates.denyList = input.denyList;
      updates.updatedBy = ctx.userId ?? undefined;

      const updated = await updateFlagPersisted(input.key, updates);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Feature flag not found: ${input.key}`,
        });
      }

      return updated;
    }),
});
