// ── Feature Flag tRPC Procedures ─────────────────────────────────
// Public procedures for querying feature flag values.
// Flags determine what features users can see and access.

import { z } from "zod";
import { router, publicProcedure } from "../init";
import {
  flagRegistry,
  type FlagContext,
  type FlagValue,
} from "@cronix/ai-core";

// ── Output Schemas ───────────────────────────────────────────────

const FlagValueOutputSchema = z.union([z.boolean(), z.string()]);

const AllFlagsOutputSchema = z.record(z.string(), FlagValueOutputSchema);

const SingleFlagOutputSchema = z.object({
  key: z.string(),
  value: FlagValueOutputSchema,
  description: z.string(),
});

// ── Helper: Build context from tRPC context ──────────────────────

function buildFlagContext(ctx: { userId?: string | null }): FlagContext {
  let environment: FlagContext["environment"];
  try {
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    const nodeEnv = proc?.env["NODE_ENV"];
    if (nodeEnv === "development" || nodeEnv === "staging" || nodeEnv === "production") {
      environment = nodeEnv;
    }
  } catch {
    // Default to undefined
  }

  return {
    userId: ctx.userId ?? undefined,
    environment,
  };
}

// ── Router ───────────────────────────────────────────────────────

export const flagsRouter = router({
  /**
   * Get all feature flag values for the current user context.
   * Returns a map of flag key -> resolved value.
   */
  getAll: publicProcedure
    .output(AllFlagsOutputSchema)
    .query(({ ctx }) => {
      const flagContext = buildFlagContext(ctx);
      return flagRegistry.evaluateAll(flagContext);
    }),

  /**
   * Get a single feature flag value by key.
   * Returns the flag key, resolved value, and description.
   */
  get: publicProcedure
    .input(z.object({ key: z.string().min(1) }))
    .output(SingleFlagOutputSchema)
    .query(({ ctx, input }) => {
      const flagContext = buildFlagContext(ctx);
      const flag = flagRegistry.getFlag(input.key);

      if (!flag) {
        // Return default false for unknown flags
        return {
          key: input.key,
          value: false as FlagValue,
          description: "Unknown flag",
        };
      }

      const value = flagRegistry.evaluate(input.key, flagContext);
      return {
        key: input.key,
        value,
        description: flag.description,
      };
    }),
});
