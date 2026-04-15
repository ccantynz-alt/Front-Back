import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { TRPCContext } from "./context";
import { validateSession } from "../auth/session";
import { users } from "@back-to-the-future/db";

import type * as _schema from "@back-to-the-future/db";

export type { TRPCContext };

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

/**
 * Middleware that enforces authentication on every call.
 * Re-validates the session token against the DB to ensure:
 * - The session has not been revoked (logout)
 * - The session has not expired (expiresAt check)
 */
const enforceAuth = middleware(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.sessionToken) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action.",
    });
  }

  // Re-validate session on every protected call (defense in depth)
  const validUserId = await validateSession(ctx.sessionToken, ctx.db);
  if (!validUserId || validUserId !== ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Session expired or invalid. Please log in again.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);

/**
 * Middleware that enforces admin role on every call.
 * Must be chained after enforceAuth (protectedProcedure).
 */
const enforceAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }

  const userId: string = ctx.userId;

  const result = await ctx.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = result[0];
  if (!user || user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin role required.",
    });
  }

  return next({ ctx: { ...ctx, userId } });
});

export const adminProcedure = protectedProcedure.use(enforceAdmin);
