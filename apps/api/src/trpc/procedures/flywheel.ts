// BLK-017 Flywheel-3 — tRPC surface for the flywheel memory system.
// Exposes read-only access to ingested Claude Code transcript history so
// the /flywheel UI (and the session-start hook) can search past work and
// surface prior-session context to the current agent.
//
// Writes (ingest) are handled by the CLI + theatre emitter, not tRPC.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  searchMemory,
  getSession,
  listRecentSessions,
  buildSessionBrief,
  getTopLessons,
} from "@back-to-the-future/flywheel";
import { router, protectedProcedure } from "../init";

export const flywheelRouter = router({
  /** List the most recent ingested sessions, optionally filtered by branch. */
  recentSessions: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(25),
        gitBranch: z.string().min(1).max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sessions = await listRecentSessions(ctx.db, {
        limit: input.limit,
        ...(input.gitBranch ? { gitBranch: input.gitBranch } : {}),
      });
      return sessions;
    }),

  /** Search turn content + first-user-messages across every ingested session. */
  searchMemory: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(500),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const hits = await searchMemory(ctx.db, input.query, {
        limit: input.limit,
      });
      return hits;
    }),

  /** Full detail for one session: metadata + ordered turns. */
  getSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        turnLimit: z.number().int().min(1).max(1000).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const detail = await getSession(ctx.db, input.sessionId, {
        turnLimit: input.turnLimit,
      });
      if (!detail) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found.",
        });
      }
      return detail;
    }),

  /** Compact brief of the last N sessions — used by session-start hook. */
  brief: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(10).default(3) }))
    .query(async ({ ctx, input }) => {
      const entries = await buildSessionBrief(ctx.db, { limit: input.limit });
      return entries;
    }),

  /** Highest-confidence lessons distilled from prior sessions. */
  getLessons: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(5) }))
    .query(async ({ ctx, input }) => {
      const lessons = await getTopLessons(ctx.db, { limit: input.limit });
      return lessons;
    }),
});
