// BLK-019 Build Theatre — Vercel-style live visibility into every
// long-running platform operation. Read-only tRPC surface; the actual
// emitter lives in @back-to-the-future/theatre and is called from
// producers (ingest, voice, deploy, migration).

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  listRuns as listTheatreRuns,
  getRun as getTheatreRun,
  tailLogs as tailTheatreLogs,
  requestCancel,
} from "@back-to-the-future/theatre";
import { router, protectedProcedure, adminProcedure } from "../init";

export const theatreRouter = router({
  /** Recent runs across all kinds (deploy, ingest, voice, etc.). */
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const runs = await listTheatreRuns(ctx.db, { limit: input.limit });
      return runs;
    }),

  /** Full detail for one run: run metadata + all steps. */
  get: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const detail = await getTheatreRun(ctx.db, input.runId);
      if (!detail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found." });
      }
      return detail;
    }),

  /** Tail of log lines since a given seq — polled by the /ops UI. */
  tail: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        sinceSeq: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const logs = await tailTheatreLogs(
        ctx.db,
        input.runId,
        input.sinceSeq,
        input.limit,
      );
      return logs;
    }),

  /**
   * Request cancellation of a running op. The producer is expected to
   * poll `isCancelRequested()` at safe checkpoints and exit cleanly.
   * Admin-only: cancelling a deploy or migration mid-flight is a
   * destructive operation.
   */
  cancel: adminProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requestCancel(ctx.db, input.runId);
      return { ok: true as const };
    }),
});
