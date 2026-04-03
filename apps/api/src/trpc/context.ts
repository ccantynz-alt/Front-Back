import type { Context } from "hono";
import { db } from "@back-to-the-future/db";
import { getUserIdFromHeader } from "../auth/middleware";

type Database = typeof db;

export interface TRPCContext {
  db: Database;
  userId: string | null;
  sessionToken: string | null;
}

export async function createContext(c: Context): Promise<TRPCContext> {
  const userId = await getUserIdFromHeader(c);

  const authHeader = c.req.header("Authorization");
  const sessionToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  return {
    db,
    userId,
    sessionToken,
  };
}
