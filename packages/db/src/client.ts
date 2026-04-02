import { createClient as createLibSQLClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Database = LibSQLDatabase<typeof schema>;

/**
 * Create a Drizzle database client for Turso/LibSQL.
 *
 * - Local development: pass `file:local.db` (or omit — it's the default)
 * - Production: pass the Turso HTTPS URL + auth token
 */
export function createClient(
  url: string = process.env["DATABASE_URL"] ?? "file:local.db",
  authToken: string | undefined = process.env["TURSO_AUTH_TOKEN"],
): Database {
  const client = createLibSQLClient({
    url,
    ...(authToken ? { authToken } : {}),
  });

  return drizzle(client, { schema });
}

/** Default client instance — configured via DATABASE_URL and TURSO_AUTH_TOKEN env vars. */
let _db: Database | undefined;

export function getDb(): Database {
  if (!_db) {
    _db = createClient();
  }
  return _db;
}

/**
 * Eager default instance for convenience imports.
 * Uses file:local.db when DATABASE_URL is not set.
 */
export const db: Database = createClient();
