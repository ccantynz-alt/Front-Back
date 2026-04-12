import type { Context } from "hono";
import { db, scopedDb, type ScopedQueryClient } from "@back-to-the-future/db";
import { getUserIdFromHeader } from "../auth/middleware";

type Database = typeof db;

export interface TRPCContext {
  db: Database;
  userId: string | null;
  sessionToken: string | null;
  csrfToken: string | null;
  /**
   * Tenant-scoped database client. Auto-injects userId filtering on
   * every SELECT, INSERT, UPDATE, DELETE. Only available when userId
   * is set (i.e., authenticated requests). For unauthenticated
   * requests, this is null — use `ctx.db` for public procedures.
   *
   * Admin procedures that need cross-tenant access should use `ctx.db`.
   */
  scopedDb: ScopedQueryClient | null;
}

export async function createContext(c: Context): Promise<TRPCContext> {
  const userId = await getUserIdFromHeader(c);

  const authHeader = c.req.header("Authorization");
  const sessionToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const csrfToken = c.req.header("X-CSRF-Token") ?? null;

  return {
    db,
    userId,
    sessionToken,
    csrfToken,
    scopedDb: userId ? scopedDb(db, userId) : null,
  };
}
