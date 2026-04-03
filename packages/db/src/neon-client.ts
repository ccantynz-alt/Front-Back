import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type NeonDb = NeonHttpDatabase<typeof schema>;

/**
 * Create a Neon serverless PostgreSQL client with Drizzle ORM.
 * Uses HTTP-based queries (stateless, ideal for serverless/edge).
 */
export function createNeonClient(connectionString: string): NeonDb {
  const sql: NeonQueryFunction<false, false> = neon(connectionString);
  return drizzle(sql, { schema });
}

// Default Neon client - configured via NEON_DATABASE_URL environment variable
const neonUrl = process.env["NEON_DATABASE_URL"];

export const neonDb: NeonDb | null = neonUrl
  ? createNeonClient(neonUrl)
  : null;
